/**
 * Stripboard page: Unscheduled Scenes panel + day/unit columns with DnD.
 * Reconstructed to match: graphite + mint, dnd-kit with DragOverlay, lock, totals, warnings.
 *
 * Files: stripboard-page.tsx, unscheduled-scenes-panel.tsx, stripboard-hooks.ts,
 * stripboard-day-column.tsx, strip-item.tsx, stripboard-strips repo, schedule listUnscheduledShots.
 * Test: DnD strips between columns, drag scene from unscheduled to column, Add dropdown,
 * multi-select Assign to Day, location/search filters, day totals & runtime warning (>10h), lock toggle.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useCurrentProduction } from '@/features/productions/context'
import {
  useStripboard,
  invalidateStripboardCaches,
  useUnscheduledShots,
  useBoneyardStrips,
} from './stripboard-hooks'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import {
  createShootDayWithDefaultMainUnitForActor,
  addSecondUnitToShootDaysForActor,
  getOrCreateShootDayUnitForActor,
  listEpisodesByProductionForActor,
  listLocationsByProductionForActor,
  listShootingBlocsByProductionForActor,
} from '@/lib/access/projectDomainService'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { getOrCreateShootDayUnit } from '@/lib/db/repositories/shoot-day-units'
import { SORT_GAP, type CreateStripData } from '@/lib/db/repositories/stripboard-strips'
import { useQueryClient } from '@tanstack/react-query'
import { UnscheduledShotsPanel } from './unscheduled-scenes-panel'
import { BoneyardPanel } from './boneyard-panel'
import { StripboardDayColumn, type ColumnFilter } from './stripboard-day-column'
import { StripItem } from './strip-item'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Layers2 } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StripboardStrip, StripType } from '@/lib/db/types'
import { createShootDayWithDefaultMainUnit, addSecondUnitToShootDays } from '@/lib/db/repositories/schedule'
import { listShootingBlocsByProduction } from '@/lib/db/repositories/shootingBlocs'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import {
  shootingBlocLabelFromAssociation,
  shootDayMatchesBlocFilter,
  type ShootingBlocViewFilter,
} from '@/lib/schedule/episodicScheduleDisplay'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { ShotWithScene } from '@/lib/db/repositories/stripboard-strips'
import { SmartSchedulingInsightsPanel } from './smart-scheduling-insights-panel'
import { normalizeScheduleTimeInput } from '@/lib/schedule/time'
import { unitNameToKey } from '@/lib/schedule/unitKey'

const STRIP_TYPES: { type: StripType; label: string }[] = [
  { type: 'MOVE', label: 'Move / Setup' },
  { type: 'CALL', label: 'Call' },
  { type: 'LUNCH', label: 'Lunch' },
  { type: 'WRAP', label: 'Wrap' },
  { type: 'NOTE', label: 'Note' },
]

const PAGE_EIGHTHS_TARGET = 48
const SELECT_NONE = '__none__'

function AddStripPopover({
  productionId,
  shootDays,
  dayUnits,
  units,
  locations,
  onCreate,
  stripsByDayUnitKey,
  isPending,
  open,
  onOpenChange,
}: {
  productionId: string
  shootDays: { id: string; shoot_date: string; day_number: number | null }[]
  dayUnits: { id: string; shoot_day_id: string; unit_id: string }[]
  units: { id: string; name: string }[]
  locations: { id: string; name: string }[]
  onCreate: (data: CreateStripData) => void
  stripsByDayUnitKey: Map<string, StripboardStrip[]>
  isPending: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [stripType, setStripType] = useState<StripType>('NOTE')
  const [shootDayId, setShootDayId] = useState<string>('')
  const [unitId, setUnitId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [originLocationId, setOriginLocationId] = useState(SELECT_NONE)
  const [destinationLocationId, setDestinationLocationId] = useState(SELECT_NONE)
  const [time, setTime] = useState('')
  const [timeError, setTimeError] = useState<string | null>(null)

  const dayUnitsForDay = shootDayId
    ? dayUnits.filter((du) => du.shoot_day_id === shootDayId)
    : []
  const shootDayUnitId = unitId
    ? dayUnitsForDay.find((du) => du.unit_id === unitId)?.id
    : null
  const selectedColumnStrips = shootDayUnitId
    ? stripsByDayUnitKey.get(`${shootDayId}:${shootDayUnitId}`) ?? []
    : []
  const hasExistingOfType =
    (stripType === 'CALL' || stripType === 'WRAP') &&
    selectedColumnStrips.some((s) => s.strip_type === stripType && s.strip_status === 'SCHEDULED')

  const handleCreate = () => {
    if (!shootDayUnitId) return
    if (hasExistingOfType) return
    if (stripType === 'CALL' || stripType === 'WRAP') {
      const normalized = normalizeScheduleTimeInput(time)
      if (!normalized) {
        setTimeError('Enter time as HH:MM')
        return
      }
      setTimeError(null)
      onCreate({
        production_id: productionId,
        shoot_day_id: shootDayId,
        shoot_day_unit_id: shootDayUnitId,
        strip_type: stripType,
        title: normalized,
        description: null,
      })
      setTime('')
      return
    }
    onCreate({
      production_id: productionId,
      shoot_day_id: shootDayId,
      shoot_day_unit_id: shootDayUnitId,
      strip_type: stripType,
      title: title.trim() || null,
      description: description.trim() || null,
      origin_location_id:
        stripType === 'MOVE' && originLocationId !== SELECT_NONE ? originLocationId : null,
      destination_location_id:
        stripType === 'MOVE' && destinationLocationId !== SELECT_NONE ? destinationLocationId : null,
    })
    setTitle('')
    setDescription('')
    setOriginLocationId(SELECT_NONE)
    setDestinationLocationId(SELECT_NONE)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="size-4" />
          Add strip
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <Label>Type</Label>
          <Select value={stripType} onValueChange={(v) => setStripType(v as StripType)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRIP_TYPES.map((t) => (
                <SelectItem key={t.type} value={t.type}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label>Shoot day</Label>
          <Select value={shootDayId} onValueChange={(v) => { setShootDayId(v); setUnitId('') }}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select day" />
            </SelectTrigger>
            <SelectContent>
              {shootDays.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.shoot_date} {d.day_number != null ? `(Day ${d.day_number})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label>Unit</Label>
          <Select value={unitId} onValueChange={setUnitId} disabled={!shootDayId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {dayUnitsForDay.map((du) => (
                <SelectItem key={du.id} value={du.unit_id}>
                  {units.find((u) => u.id === du.unit_id)?.name ?? du.unit_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(stripType === 'CALL' || stripType === 'WRAP') ? (
            <>
              <Label>Time</Label>
              <Input
                value={time}
                onChange={(e) => {
                  setTime(e.target.value)
                  if (timeError) setTimeError(null)
                }}
                placeholder="HH:MM"
                className="h-9"
              />
              {timeError && <p className="text-xs text-destructive">{timeError}</p>}
              {hasExistingOfType && (
                <p className="text-xs text-destructive">
                  This unit already has a {stripType} strip.
                </p>
              )}
            </>
          ) : (
            <>
              {stripType === 'MOVE' && (
                <>
                  <Label>Origin (optional)</Label>
                  <Select value={originLocationId} onValueChange={setOriginLocationId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_NONE}>None</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label>Destination (optional)</Label>
                  <Select value={destinationLocationId} onValueChange={setDestinationLocationId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_NONE}>None</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              <Label>Title (optional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Company move to location B"
                className="h-9"
              />
              <Label>Description (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes"
                className="h-9"
              />
            </>
          )}
          <Button
            className="w-full"
            size="sm"
            disabled={!shootDayUnitId || isPending || hasExistingOfType}
            onClick={handleCreate}
          >
            {isPending ? 'Adding…' : 'Add strip'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function StripboardPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const authSession = useAuthSession()
  const queryClient = useQueryClient()
  const isEpisodicProduction = currentProduction?.is_episodic === true

  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState<string | null | undefined>(undefined)
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(new Set())
  const [activeData, setActiveData] = useState<{ type: 'strip'; strip: StripboardStrip } | { type: 'unscheduled-shot'; item: ShotWithScene } | null>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({})
  const [unscheduleToast, setUnscheduleToast] = useState(false)
  const [boneyardToast, setBoneyardToast] = useState(false)
  const [newDayOpen, setNewDayOpen] = useState(false)
  const [newDayDate, setNewDayDate] = useState('')
  const [newDayError, setNewDayError] = useState<string | null>(null)
  const [newlyCreatedShootDayId, setNewlyCreatedShootDayId] = useState<string | null>(null)
  const [newDaySuccessToast, setNewDaySuccessToast] = useState(false)
  const [addSecondUnitOpen, setAddSecondUnitOpen] = useState(false)
  const [selectedSecondUnitDayIds, setSelectedSecondUnitDayIds] = useState<Set<string>>(new Set())
  const [addSecondUnitError, setAddSecondUnitError] = useState<string | null>(null)
  const [addSecondUnitSuccessToast, setAddSecondUnitSuccessToast] = useState<string | null>(null)
  const [deleteShootDayTarget, setDeleteShootDayTarget] = useState<{
    id: string
    shoot_date: string
    day_number: number | null
  } | null>(null)
  const [deleteShootDayDialogOpen, setDeleteShootDayDialogOpen] = useState(false)
  const [deleteShootDayError, setDeleteShootDayError] = useState<string | null>(null)
  const [removeSecondUnitTarget, setRemoveSecondUnitTarget] = useState<{
    shootDayUnitId: string
    shootDate: string
    dayNumber: number | null
    unitName: string
  } | null>(null)
  const [removeSecondUnitDialogOpen, setRemoveSecondUnitDialogOpen] = useState(false)
  const [removeSecondUnitError, setRemoveSecondUnitError] = useState<string | null>(null)
  const [removeSecondUnitSuccessToast, setRemoveSecondUnitSuccessToast] = useState(false)
  const newDayColumnRef = useRef<HTMLDivElement | null>(null)
  const columnsScrollRef = useRef<HTMLDivElement | null>(null)
  const [showColumnsLeftFeather, setShowColumnsLeftFeather] = useState(false)
  const [addStripOpen, setAddStripOpen] = useState(false)
  const [blocViewFilter, setBlocViewFilter] = useState<ShootingBlocViewFilter>('all')

  useEffect(() => {
    setBlocViewFilter('all')
  }, [currentProductionId])

  const stripboard = useStripboard(currentProductionId ?? null)
  const filters = { search: search || undefined, locationId }
  const unscheduled = useUnscheduledShots(currentProductionId, filters)
  const boneyard = useBoneyardStrips(currentProductionId)

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listLocationsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listLocationsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })

  const { data: shootingBlocs = [] } = useQuery({
    queryKey: ['shooting-blocs', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootingBlocsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listShootingBlocsByProduction(currentProductionId!)
    },
    enabled: !!currentProductionId && isEpisodicProduction,
  })

  const { data: episodes = [] } = useQuery({
    queryKey: ['episodes', currentProductionId],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listEpisodesByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId! })
      }
      return listEpisodesByProduction(currentProductionId!)
    },
    enabled: !!currentProductionId && isEpisodicProduction,
  })

  const blocById = useMemo(
    () => new Map(shootingBlocs.map((b) => [b.id, b])),
    [shootingBlocs]
  )

  const episodeById = useMemo(
    () => new Map(episodes.map((e) => [e.id, e])),
    [episodes]
  )

  const {
    shootDays,
    dayUnitsByDayId,
    stripsByDayUnit,
    strips,
    units,
    dayUnits,
    scenes,
    shots,
    estimatedShootMinutesByShotId,
    setLockedMutation,
    updateEstimatedMutation,
    updateCallWrapTimeMutation,
    updateStripMutation,
    moveToUnscheduledMutation,
    moveToBoneyardMutation,
    deleteStripMutation,
    deleteShootDayMutation,
    removeSecondUnitMutation,
    moveStripMutation,
    reorderStripMutation,
    createStripMutation,
    createShotStripMutation,
    isInsightsDataLoading,
    castPersonIdsByShotId,
  } = stripboard

  const visibleShootDays = useMemo(
    () =>
      !isEpisodicProduction
        ? shootDays
        : shootDays.filter((d) => shootDayMatchesBlocFilter(d.shooting_bloc_id, blocViewFilter)),
    [shootDays, blocViewFilter, isEpisodicProduction]
  )

  const mainUnit = units.find((u) => u.name === 'Main Unit') ?? units[0]

  const secondUnit = useMemo(
    () => units.find((u) => unitNameToKey(u.name) === 'second'),
    [units]
  )

  const shootDaysEligibleForSecond = useMemo(() => {
    const shootDayIdsWithSecond = new Set(
      dayUnits
        .filter((du) => du.unit_id === secondUnit?.id)
        .map((du) => du.shoot_day_id)
    )
    return shootDays.filter((d) => !shootDayIdsWithSecond.has(d.id))
  }, [shootDays, dayUnits, secondUnit?.id])

  const createShootDayMutation = useMutation({
    mutationFn: async () => {
      if (!currentProductionId) {
        throw new Error('No production selected')
      }
      const shootDate = newDayDate.trim()
      if (!shootDate) {
        throw new Error('Shoot date is required')
      }
      setNewDayError(null)
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return createShootDayWithDefaultMainUnitForActor({
          db,
          actor: authSession.currentUser,
          data: { productionId: currentProductionId, shootDate },
        })
      }
      return createShootDayWithDefaultMainUnit({ productionId: currentProductionId, shootDate })
    },
    onSuccess: (result) => {
      setNewDayOpen(false)
      setNewDayDate('')
      setNewDayError(null)
      setNewlyCreatedShootDayId(result.shootDay.id)
      setNewDaySuccessToast(true)
      void invalidateStripboardCaches(queryClient, currentProductionId)
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not create shoot day. Please try again.'
      if (message === 'Shoot date is required') {
        setNewDayError('Shoot date is required.')
      } else if (message === 'No production selected') {
        setNewDayError('Select a production before creating shoot days.')
      } else if (message === 'SHOOT_DATE_ALREADY_EXISTS') {
        setNewDayError('A shoot day already exists on this date.')
      } else {
        setNewDayError('Could not create shoot day. Please try again.')
      }
    },
  })

  const addSecondUnitMutation = useMutation({
    mutationFn: async (shootDayIds: string[]) => {
      if (!currentProductionId) {
        throw new Error('No production selected')
      }
      if (shootDayIds.length === 0) {
        throw new Error('Select at least one shoot day')
      }
      setAddSecondUnitError(null)
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return addSecondUnitToShootDaysForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          shootDayIds,
        })
      }
      return addSecondUnitToShootDays({
        productionId: currentProductionId,
        shootDayIds,
      })
    },
    onSuccess: (result, shootDayIds) => {
      setAddSecondUnitOpen(false)
      setSelectedSecondUnitDayIds(new Set())
      setAddSecondUnitError(null)
      const linkedCount = result.linkedShootDayUnitIds.length
      setAddSecondUnitSuccessToast(
        linkedCount === 1
          ? 'Second Unit added to 1 shoot day.'
          : `Second Unit added to ${linkedCount} shoot day(s).`
      )
      if (shootDayIds.length > 0) {
        setNewlyCreatedShootDayId(shootDayIds[0]!)
      }
      void invalidateStripboardCaches(queryClient, currentProductionId)
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not add Second Unit. Please try again.'
      if (message === 'No production selected') {
        setAddSecondUnitError('Select a production before adding Second Unit.')
      } else if (message === 'Select at least one shoot day') {
        setAddSecondUnitError('Select at least one shoot day.')
      } else if (message === 'INVALID_SHOOT_DAY') {
        setAddSecondUnitError('One or more selected shoot days are invalid.')
      } else {
        setAddSecondUnitError('Could not add Second Unit. Please try again.')
      }
    },
  })

  useEffect(() => {
    if (!currentProductionId || !mainUnit || shootDays.length === 0) return
    let cancelled = false
    const run = async () => {
      for (const day of shootDays) {
        if (cancelled) return
        if (authSession.authSupported && authSession.currentUser) {
          const db = await getDb()
          await getOrCreateShootDayUnitForActor({ db, actor: authSession.currentUser, shootDayId: day.id, unitId: mainUnit.id })
        } else {
          await getOrCreateShootDayUnit(day.id, mainUnit.id)
        }
      }
      if (!cancelled) void invalidateStripboardCaches(queryClient, currentProductionId)
    }
    run()
    return () => { cancelled = true }
  }, [authSession.authSupported, authSession.currentUser, currentProductionId, mainUnit?.id, shootDays.length, queryClient])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  const updateColumnsLeftFeather = useCallback(() => {
    const el = columnsScrollRef.current
    if (!el) {
      setShowColumnsLeftFeather(false)
      return
    }
    setShowColumnsLeftFeather(el.scrollLeft > 1)
  }, [])

  useLayoutEffect(() => {
    const el = columnsScrollRef.current
    const tick = () => updateColumnsLeftFeather()
    const rafId = requestAnimationFrame(tick)
    if (!el) {
      return () => cancelAnimationFrame(rafId)
    }
    const ro = new ResizeObserver(tick)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [shootDays.length, updateColumnsLeftFeather])

  const columnId = (shootDayId: string, shootDayUnitId: string) => `col:${shootDayId}:${shootDayUnitId}`
  const parseColumnId = (id: string): { shootDayId: string; shootDayUnitId: string } | null => {
    if (!id.startsWith('col:')) return null
    const [, shootDayId, shootDayUnitId] = id.split(':')
    if (!shootDayId || !shootDayUnitId) return null
    return { shootDayId, shootDayUnitId }
  }
  const getColumnStripsSorted = (shootDayId: string, shootDayUnitId: string, excludeStripId?: string) =>
    [...(stripsByDayUnit.get(`${shootDayId}:${shootDayUnitId}`) ?? [])]
      .filter((s) => (excludeStripId ? s.id !== excludeStripId : true))
      .sort((a, b) => a.sort_index - b.sort_index)
  const getDropSortIndex = ({
    shootDayId,
    shootDayUnitId,
    overStripId,
    activeStripId,
    placeAfter,
  }: {
    shootDayId: string
    shootDayUnitId: string
    overStripId?: string
    activeStripId?: string
    placeAfter?: boolean
  }): number => {
    const stripsInColumn = getColumnStripsSorted(shootDayId, shootDayUnitId, activeStripId)
    if (!overStripId) {
      const lastStrip = stripsInColumn[stripsInColumn.length - 1]
      return lastStrip ? lastStrip.sort_index + SORT_GAP : SORT_GAP
    }

    const overIdx = stripsInColumn.findIndex((s) => s.id === overStripId)
    if (overIdx < 0) {
      const lastStrip = stripsInColumn[stripsInColumn.length - 1]
      return lastStrip ? lastStrip.sort_index + SORT_GAP : SORT_GAP
    }

    const prevStrip = placeAfter ? stripsInColumn[overIdx] : stripsInColumn[overIdx - 1]
    const nextStrip = placeAfter ? stripsInColumn[overIdx + 1] : stripsInColumn[overIdx]
    if (prevStrip && nextStrip) return (prevStrip.sort_index + nextStrip.sort_index) / 2
    if (!prevStrip && nextStrip) return nextStrip.sort_index - SORT_GAP
    if (prevStrip && !nextStrip) return prevStrip.sort_index + SORT_GAP
    return SORT_GAP
  }
  const resolveDropTarget = (overId: string): { shootDayId: string; shootDayUnitId: string; overStripId?: string } | null => {
    const overStrip = strips.find((s) => s.id === overId)
    if (overStrip?.shoot_day_id && overStrip.shoot_day_unit_id) {
      return {
        shootDayId: overStrip.shoot_day_id,
        shootDayUnitId: overStrip.shoot_day_unit_id,
        overStripId: overStrip.id,
      }
    }
    const parsedCol = parseColumnId(overId)
    if (parsedCol) {
      return {
        shootDayId: parsedCol.shootDayId,
        shootDayUnitId: parsedCol.shootDayUnitId,
      }
    }
    return null
  }

  const handleDragStart = (event: DragStartEvent) => {
    const d = event.active.data.current
    if (d?.type === 'strip') setActiveData({ type: 'strip', strip: d.strip })
    else if (d?.type === 'unscheduled-shot') setActiveData({ type: 'unscheduled-shot', item: d.item })
    else if (d?.type === 'boneyard-strip') setActiveData({ type: 'strip', strip: d.strip })
    else setActiveData(null)
  }

  useEffect(() => {
    if (!unscheduleToast) return
    const t = setTimeout(() => setUnscheduleToast(false), 3000)
    return () => clearTimeout(t)
  }, [unscheduleToast])

  useEffect(() => {
    if (!boneyardToast) return
    const t = setTimeout(() => setBoneyardToast(false), 3000)
    return () => clearTimeout(t)
  }, [boneyardToast])

  useEffect(() => {
    if (!newDaySuccessToast) return
    const t = setTimeout(() => setNewDaySuccessToast(false), 3000)
    return () => clearTimeout(t)
  }, [newDaySuccessToast])

  useEffect(() => {
    if (!addSecondUnitSuccessToast) return
    const t = setTimeout(() => setAddSecondUnitSuccessToast(null), 3000)
    return () => clearTimeout(t)
  }, [addSecondUnitSuccessToast])

  useEffect(() => {
    if (!removeSecondUnitSuccessToast) return
    const t = setTimeout(() => setRemoveSecondUnitSuccessToast(false), 3000)
    return () => clearTimeout(t)
  }, [removeSecondUnitSuccessToast])

  useEffect(() => {
    const onMenuNewShootDay = () => {
      setNewDayError(null)
      setNewDayOpen(true)
    }
    const onMenuAddStrip = () => {
      setAddStripOpen(true)
    }
    window.addEventListener('albatross-menu-schedule-new-shoot-day', onMenuNewShootDay)
    window.addEventListener('albatross-menu-schedule-add-strip', onMenuAddStrip)
    return () => {
      window.removeEventListener('albatross-menu-schedule-new-shoot-day', onMenuNewShootDay)
      window.removeEventListener('albatross-menu-schedule-add-strip', onMenuAddStrip)
    }
  }, [])

  useEffect(() => {
    if (!newlyCreatedShootDayId || !shootDays.some((d) => d.id === newlyCreatedShootDayId)) return
    const el = newDayColumnRef.current
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      const t = setTimeout(() => setNewlyCreatedShootDayId(null), 800)
      return () => clearTimeout(t)
    }
  }, [newlyCreatedShootDayId, shootDays])

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveData(null)
    const { active, over } = event
    if (!over?.id || typeof over.id !== 'string') return

    const overStr = String(over.id)
    const data = active.data.current

    if (overStr === 'unscheduled-panel') {
      if (data?.type === 'strip') {
        await moveToUnscheduledMutation.mutateAsync(data.strip.id)
        setUnscheduleToast(true)
        return
      }
      if (data?.type === 'boneyard-strip') {
        await moveToUnscheduledMutation.mutateAsync(data.strip.id)
        return
      }
    }

    if (overStr === 'boneyard-panel' && (data?.type === 'strip' || data?.type === 'boneyard-strip')) {
      await moveToBoneyardMutation.mutateAsync(data.strip.id)
      setBoneyardToast(true)
      return
    }

    const target = resolveDropTarget(overStr)
    if (!target) return
    const { shootDayId, shootDayUnitId, overStripId } = target

    const dayUnit = dayUnits.find((du) => du.id === shootDayUnitId)
    if (!dayUnit || dayUnit.is_locked) return

    const activeStripId = data?.type === 'strip' || data?.type === 'boneyard-strip'
      ? data.strip.id
      : undefined
    const activeRect = active.rect.current.translated ?? active.rect.current.initial
    const overRect = over.rect
    const placeAfter =
      overStripId && activeRect && overRect
        ? activeRect.top + activeRect.height / 2 >= overRect.top + overRect.height / 2
        : true
    const toSortIndex = getDropSortIndex({
      shootDayId,
      shootDayUnitId,
      overStripId,
      activeStripId,
      placeAfter,
    })

    if (data?.type === 'unscheduled-shot' && currentProductionId) {
      await createShotStripMutation.mutateAsync({
        productionId: currentProductionId,
        shotId: data.item.shot.id,
        shootDayId,
        shootDayUnitId,
        toSortIndex,
      })
      return
    }

    if ((data?.type === 'strip' || data?.type === 'boneyard-strip') && data.strip) {
      const strip = data.strip
      const isSameColumn =
        strip.shoot_day_id != null &&
        strip.shoot_day_unit_id != null &&
        strip.shoot_day_id === shootDayId &&
        strip.shoot_day_unit_id === shootDayUnitId

      if (isSameColumn) {
        await reorderStripMutation.mutateAsync({ stripId: strip.id, toSortIndex })
      } else {
        await moveStripMutation.mutateAsync({
          stripId: strip.id,
          toShootDayId: shootDayId,
          toShootDayUnitId: shootDayUnitId,
          toSortIndex,
        })
      }
    }
  }

  const handleAssignToDay = (shotIds: string[], shootDayId: string, shootDayUnitId: string) => {
    unscheduled.bulkAssignMutation.mutate({ shotIds, shootDayId, shootDayUnitId })
  }

  const handleAddSingle = (shotId: string, shootDayId: string, shootDayUnitId: string) => {
    if (!currentProductionId) return
    createShotStripMutation.mutate({ productionId: currentProductionId, shotId, shootDayId, shootDayUnitId })
  }

  const getUnitName = (unitId: string) => units.find((u) => u.id === unitId)?.name ?? unitId

  return (
    <>
      {!currentProductionId ? (
        <div>
          <h1 className="text-2xl font-semibold">Schedule — Stripboard</h1>
          <p className="text-muted-foreground">Select a production first.</p>
        </div>
      ) : (
    <div className="flex h-full flex-col gap-4">
      {unscheduleToast && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary">
          Shot moved to Unscheduled.
        </div>
      )}
      {boneyardToast && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          Moved to Boneyard.
        </div>
      )}
      {newDaySuccessToast && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary">
          Shoot day created.
        </div>
      )}
      {addSecondUnitSuccessToast && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary">
          {addSecondUnitSuccessToast}
        </div>
      )}
      {removeSecondUnitSuccessToast && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary">
          Second Unit removed. Shots moved to Unscheduled.
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Schedule — Stripboard</h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isEpisodicProduction && (
            <Select
              value={blocViewFilter}
              onValueChange={(v) => setBlocViewFilter(v as ShootingBlocViewFilter)}
            >
              <SelectTrigger className="h-9 w-[200px]" aria-label="Filter stripboard by shooting bloc">
                <SelectValue placeholder="Bloc" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All blocs</SelectItem>
                <SelectItem value="unassigned">Outside blocs</SelectItem>
                {shootingBlocs.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => {
              setAddSecondUnitError(null)
              setSelectedSecondUnitDayIds(new Set())
              setAddSecondUnitOpen(true)
            }}
            disabled={
              !currentProductionId ||
              shootDays.length === 0 ||
              shootDaysEligibleForSecond.length === 0
            }
          >
            <Layers2 className="size-4" />
            Add Second Unit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => {
              setNewDayError(null)
              setNewDayOpen(true)
            }}
            disabled={!currentProductionId}
          >
            <Plus className="size-4" />
            New shoot day
          </Button>
          <AddStripPopover
            productionId={currentProductionId}
            shootDays={visibleShootDays}
            dayUnits={dayUnits}
            units={units}
            locations={locations}
            onCreate={(data) => createStripMutation.mutate(data)}
            stripsByDayUnitKey={stripsByDayUnit}
            isPending={createStripMutation.isPending}
            open={addStripOpen}
            onOpenChange={setAddStripOpen}
          />
        </div>
      </div>

      <SmartSchedulingInsightsPanel
        strips={strips}
        shots={shots}
        scenes={scenes}
        shootDays={shootDays}
        locations={locations}
        castPersonIdsByShotId={castPersonIdsByShotId}
        isLoading={isInsightsDataLoading}
      />

      {isEpisodicProduction && visibleShootDays.length === 0 && shootDays.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground shrink-0">
          No shoot days match this bloc filter. Choose &quot;All blocs&quot; to see every day.
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
          <UnscheduledShotsPanel
            droppableId="unscheduled-panel"
            unscheduledShots={unscheduled.unscheduledShots}
            locations={locations}
            shootDays={visibleShootDays}
            dayUnits={dayUnits}
            search={search}
            onSearchChange={setSearch}
            locationId={locationId}
            onLocationChange={setLocationId}
            selectedShotIds={selectedShotIds}
            onToggleShot={(id: string) =>
              setSelectedShotIds((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }
            onSelectAll={() =>
              setSelectedShotIds(new Set(unscheduled.unscheduledShots.map((x) => x.shot.id)))
            }
            onDeselectAll={() => setSelectedShotIds(new Set())}
            onAssignToDay={handleAssignToDay}
            onAddSingle={handleAddSingle}
            getUnitName={getUnitName}
            isAssigning={unscheduled.bulkAssignMutation.isPending}
          />

          {/* Scroll area: day columns + Boneyard column fixed at far right (you can chuck strips here whenever you want). */}
          <div className="relative flex-1 min-w-0">
            <div
              ref={columnsScrollRef}
              onScroll={updateColumnsLeftFeather}
              className="h-full overflow-auto"
            >
              <div className="flex gap-4 pb-4 min-h-full">
              {visibleShootDays.map((day) => {
                const dayUnitsList = dayUnitsByDayId.get(day.id) ?? []
                const stripsByUnit = dayUnitsList.map((shootDayUnit) => ({
                  shootDayUnit,
                  strips: (stripsByDayUnit.get(`${day.id}:${shootDayUnit.id}`) ?? []).sort(
                    (a, b) => a.sort_index - b.sort_index
                  ),
                }))
                return (
                  <div
                    key={day.id}
                    ref={day.id === newlyCreatedShootDayId ? newDayColumnRef : undefined}
                    className="shrink-0"
                  >
                    <StripboardDayColumn
                      day={day}
                      units={units}
                      dayUnits={dayUnitsList}
                      stripsByUnit={stripsByUnit}
                      scenes={scenes}
                      shots={shots}
                      onDeleteShootDay={(d) => {
                        setDeleteShootDayTarget({
                          id: d.id,
                          shoot_date: d.shoot_date,
                          day_number: d.day_number,
                        })
                        setDeleteShootDayError(null)
                        setDeleteShootDayDialogOpen(true)
                      }}
                      onRemoveSecondUnit={({ shootDay, shootDayUnit, unit }) => {
                        setRemoveSecondUnitTarget({
                          shootDayUnitId: shootDayUnit.id,
                          shootDate: shootDay.shoot_date,
                          dayNumber: shootDay.day_number,
                          unitName: unit.name,
                        })
                        setRemoveSecondUnitError(null)
                        setRemoveSecondUnitDialogOpen(true)
                      }}
                      estimatedShootMinutesByShotId={estimatedShootMinutesByShotId}
                      onUpdateStripEstimatedMinutes={(stripId, minutes) =>
                        updateEstimatedMutation.mutate({ stripId, minutes })
                      }
                      onUpdateCallWrapTime={(stripId, time) =>
                        updateCallWrapTimeMutation.mutate({ stripId, time })
                      }
                      onUpdateMoveStrip={(stripId, data) =>
                        updateStripMutation.mutate({ stripId, data })
                      }
                      locations={locations}
                      columnId={columnId}
                      isLocked={false}
                      pageEighthsTarget={PAGE_EIGHTHS_TARGET}
                      onSendToBoneyard={(strip) => {
                        moveToBoneyardMutation.mutate(strip.id)
                        setBoneyardToast(true)
                      }}
                      onDeleteStrip={(strip) => deleteStripMutation.mutate(strip.id)}
                      onToggleLock={(shootDayUnitId, isLocked) =>
                        setLockedMutation.mutate({ shootDayUnitId, isLocked })
                      }
                      columnFilters={columnFilters}
                      onColumnFilterChange={(colId, key, value) =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          [colId]: { ...(prev[colId] ?? { int: false, ext: false, day: false, night: false }), [key]: value },
                        }))
                      }
                      isEpisodic={isEpisodicProduction}
                      shootingBlocLabel={
                        isEpisodicProduction
                          ? shootingBlocLabelFromAssociation(day.shooting_bloc_id, blocById)
                          : undefined
                      }
                      episodeById={isEpisodicProduction ? episodeById : undefined}
                    />
                  </div>
                )
              })}
              {shootDays.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm shrink-0">
                  No shoot days. Add shoot days from the Schedule calendar or settings.
                </div>
              )}
              <BoneyardPanel
                droppableId="boneyard-panel"
                strips={boneyard.boneyardStrips}
                scenes={scenes}
                shots={shots}
                estimatedShootMinutesByShotId={estimatedShootMinutesByShotId}
                onDeleteStrip={(strip) => deleteStripMutation.mutate(strip.id)}
                isEpisodic={isEpisodicProduction}
                episodeById={isEpisodicProduction ? episodeById : undefined}
              />
              </div>
            </div>
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-linear-to-r from-background to-transparent transition-opacity duration-200 ${
                showColumnsLeftFeather ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>
        </div>

        <DragOverlay>
          {activeData?.type === 'strip' && (
            <div className="rounded-md border-2 border-primary bg-card px-4 py-3 shadow-lg min-w-[200px]">
              <StripItem
                strip={activeData.strip}
                scenes={scenes}
                shots={shots}
                locations={locations}
                estimatedMinutesDefault={
                  activeData.strip.strip_type === 'SHOT' && activeData.strip.shot_id
                    ? estimatedShootMinutesByShotId.get(activeData.strip.shot_id) ?? 0
                    : undefined
                }
                isOverlay
                disabled
                isEpisodic={isEpisodicProduction}
                episodeById={isEpisodicProduction ? episodeById : undefined}
              />
            </div>
          )}
          {activeData?.type === 'unscheduled-shot' && (
            <div className="rounded-md border-2 border-primary bg-card px-4 py-3 shadow-lg">
              <span className="font-medium">Scene {activeData.item.scene.scene_number} / Shot {activeData.item.shot.shot_number}</span>
              <span className="text-muted-foreground text-sm ml-2">
                {activeData.item.shot.shot_description ?? activeData.item.shot.subject ?? '(No shot description)'}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
      )}

      <Dialog
        open={newDayOpen}
        onOpenChange={(open) => {
          setNewDayOpen(open)
          if (!open) {
            setNewDayDate('')
            setNewDayError(null)
          }
        }}
      >
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-700">
          <h3 className="text-base font-semibold text-zinc-100">New shoot day</h3>
          <p className="text-sm text-zinc-400">
            Create an empty shoot day for this production. Main Unit will be added by default.
          </p>
          {newDayError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {newDayError}
            </p>
          )}
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="shoot-date" className="text-sm text-zinc-200">
                Shoot date<span className="text-destructive">*</span>
              </Label>
              <Input
                id="shoot-date"
                type="date"
                className="mt-1 h-9 bg-zinc-900 border-zinc-600 text-zinc-100"
                value={newDayDate}
                onChange={(e) => setNewDayDate(e.target.value)}
                disabled={createShootDayMutation.isPending}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setNewDayOpen(false)}
              disabled={createShootDayMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => createShootDayMutation.mutate()}
              disabled={createShootDayMutation.isPending}
            >
              {createShootDayMutation.isPending ? 'Creating…' : 'Create shoot day'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addSecondUnitOpen}
        onOpenChange={(open) => {
          setAddSecondUnitOpen(open)
          if (!open) {
            setSelectedSecondUnitDayIds(new Set())
            setAddSecondUnitError(null)
          }
        }}
      >
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-700">
          <h3 className="text-base font-semibold text-zinc-100">Add Second Unit</h3>
          <p className="text-sm text-zinc-400">
            Add a Second Unit column to selected shoot days. Main Unit columns are unchanged.
          </p>
          {addSecondUnitError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {addSecondUnitError}
            </p>
          )}
          <div className="mt-3 space-y-3">
            {shootDaysEligibleForSecond.length > 1 && (
              <div className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() =>
                    setSelectedSecondUnitDayIds(
                      new Set(shootDaysEligibleForSecond.map((d) => d.id))
                    )
                  }
                  disabled={addSecondUnitMutation.isPending}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-zinc-400 hover:underline"
                  onClick={() => setSelectedSecondUnitDayIds(new Set())}
                  disabled={addSecondUnitMutation.isPending}
                >
                  Clear
                </button>
              </div>
            )}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {shootDaysEligibleForSecond.map((day) => {
                const checked = selectedSecondUnitDayIds.has(day.id)
                const label =
                  day.day_number != null
                    ? `${day.shoot_date} (Day ${day.day_number})`
                    : day.shoot_date
                return (
                  <label
                    key={day.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-zinc-800/60"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        setSelectedSecondUnitDayIds((prev) => {
                          const next = new Set(prev)
                          if (value === true) next.add(day.id)
                          else next.delete(day.id)
                          return next
                        })
                      }}
                      disabled={addSecondUnitMutation.isPending}
                    />
                    <span className="text-sm text-zinc-200">{label}</span>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAddSecondUnitOpen(false)}
              disabled={addSecondUnitMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() =>
                addSecondUnitMutation.mutate([...selectedSecondUnitDayIds])
              }
              disabled={
                addSecondUnitMutation.isPending || selectedSecondUnitDayIds.size === 0
              }
            >
              {addSecondUnitMutation.isPending ? 'Adding…' : 'Add Second Unit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeSecondUnitDialogOpen}
        onOpenChange={(open) => {
          setRemoveSecondUnitDialogOpen(open)
          if (!open) {
            setRemoveSecondUnitTarget(null)
            setRemoveSecondUnitError(null)
          }
        }}
      >
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-700">
          <h3 className="text-base font-semibold text-zinc-100">Remove Second Unit</h3>
          {removeSecondUnitTarget && (
            <>
              <p className="text-sm text-zinc-300 mt-1">
                Remove Second Unit from shoot day{' '}
                <span className="font-medium text-zinc-100">{removeSecondUnitTarget.shootDate}</span>
                {removeSecondUnitTarget.dayNumber != null
                  ? ` (Day ${removeSecondUnitTarget.dayNumber})`
                  : ''}
                ?
              </p>
              <p className="text-sm text-zinc-400 mt-2">
                All shots scheduled on {removeSecondUnitTarget.unitName} for this day will move to
                Unscheduled. Main Unit is unchanged.
              </p>
            </>
          )}
          {removeSecondUnitError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive" role="alert">
              {removeSecondUnitError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRemoveSecondUnitDialogOpen(false)}
              disabled={removeSecondUnitMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removeSecondUnitMutation.isPending || !removeSecondUnitTarget}
              onClick={() => {
                if (!removeSecondUnitTarget) return
                setRemoveSecondUnitError(null)
                removeSecondUnitMutation.mutate(removeSecondUnitTarget.shootDayUnitId, {
                  onSuccess: () => {
                    setRemoveSecondUnitDialogOpen(false)
                    setRemoveSecondUnitTarget(null)
                    setRemoveSecondUnitSuccessToast(true)
                  },
                  onError: (error) => {
                    const message =
                      error instanceof Error ? error.message : 'Could not remove Second Unit.'
                    if (message === 'CANNOT_REMOVE_MAIN_UNIT') {
                      setRemoveSecondUnitError('Main Unit cannot be removed from a shoot day.')
                    } else if (message === 'SHOOT_DAY_UNIT_NOT_FOUND') {
                      setRemoveSecondUnitError('Second Unit is no longer on this shoot day.')
                    } else {
                      setRemoveSecondUnitError('Could not remove Second Unit. Please try again.')
                    }
                  },
                })
              }}
            >
              {removeSecondUnitMutation.isPending ? 'Removing…' : 'Remove Second Unit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteShootDayDialogOpen}
        onOpenChange={(open) => {
          setDeleteShootDayDialogOpen(open)
          if (!open) {
            setDeleteShootDayTarget(null)
            setDeleteShootDayError(null)
          }
        }}
      >
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-700">
          <h3 className="text-base font-semibold text-zinc-100">Delete shoot day</h3>
          {deleteShootDayTarget && (
            <>
              <p className="text-sm text-zinc-300 mt-1">
                Are you sure you want to delete shoot day{' '}
                <span className="font-medium text-zinc-100">{deleteShootDayTarget.shoot_date}</span>
                {deleteShootDayTarget.day_number != null
                  ? ` (Day ${deleteShootDayTarget.day_number})`
                  : ''}
                ?
              </p>
              <p className="text-sm text-zinc-400 mt-2">
                Scheduled shot and scene strips on this day will be moved to the Boneyard. This cannot
                be undone from this action alone.
              </p>
            </>
          )}
          {deleteShootDayError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive" role="alert">
              {deleteShootDayError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteShootDayDialogOpen(false)}
              disabled={deleteShootDayMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteShootDayMutation.isPending || !deleteShootDayTarget}
              onClick={() => {
                if (!deleteShootDayTarget) return
                setDeleteShootDayError(null)
                deleteShootDayMutation.mutate(deleteShootDayTarget.id, {
                  onSuccess: () => {
                    setDeleteShootDayDialogOpen(false)
                    setDeleteShootDayTarget(null)
                  },
                  onError: () => {
                    setDeleteShootDayError('Could not delete shoot day. Please try again.')
                  },
                })
              }}
            >
              {deleteShootDayMutation.isPending ? 'Deleting…' : 'Delete shoot day'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}