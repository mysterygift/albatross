/**
 * Stripboard page: one shoot day at a time as a table, with Unscheduled and Boneyard drawers and DnD.
 * Lock, totals, runtime warnings and the INT/EXT and DAY/NIGHT filters live in the day view.
 *
 * Files: stripboard-page.tsx, unscheduled-scenes-panel.tsx, stripboard-hooks.ts,
 * stripboard-day-view.tsx, stripboard-table-row.tsx, strip-item.tsx, stripboard-strips repo.
 */
import { PageHeader } from '@/components/page-header'
import { RequireProduction } from '@/components/require-production'
import { useSearchParams } from 'react-router-dom'
import { applyStripboardParams, parseStripboardParams, type StripboardUrlPatch } from './stripboardUrlState'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  addUnitToShootDaysForActor,
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
import { StripboardDayView, CollapsedPanelRail } from './stripboard-day-view'
import { measureStripTableRow, StripTableDragPreview, type DayTablePreviewSize } from './stripboard-table-row'
import type { ColumnFilter } from '@/lib/schedule/stripboardRows'
import { StripItem } from './strip-item'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Layers2, PanelLeftClose, PanelRightClose } from 'lucide-react'
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
import { createShootDayWithDefaultMainUnit } from '@/lib/db/repositories/schedule'
import { addUnitToShootDays } from '@/lib/db/repositories/shoot-day-unit-ranks'
import { listShootingBlocsByProduction } from '@/lib/db/repositories/shootingBlocs'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import {
  shootDayMatchesBlocFilter,
  type ShootingBlocViewFilter,
} from '@/lib/schedule/episodicScheduleDisplay'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { ShotWithScene } from '@/lib/db/repositories/stripboard-strips'
import { SmartSchedulingInsightsPanel } from './smart-scheduling-insights-panel'
import { normalizeScheduleTimeInput } from '@/lib/schedule/time'
import { MAX_UNITS_PER_DAY, UNIT_RANKS, unitNameToRank, unitRankToName } from '@/lib/schedule/unitKey'
import { resolveStripShotAndScene } from '@/lib/schedule/stripboardRows'

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
        <Button data-tutorial="stripboard-add-strip" variant="outline" size="sm" className="gap-1">
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

  const [searchParams, setSearchParams] = useSearchParams()
  const urlState = useMemo(() => parseStripboardParams(searchParams), [searchParams])
  const updateUrl = useCallback(
    (patch: StripboardUrlPatch, replace: boolean) => {
      setSearchParams((prev) => applyStripboardParams(prev, patch), { replace })
    },
    [setSearchParams]
  )
  const search = urlState.q
  const locationId = urlState.locationId
  const setSearch = useCallback((q: string) => updateUrl({ q }, true), [updateUrl])
  const setLocationId = useCallback(
    (id: string | null | undefined) => updateUrl({ locationId: id }, true),
    [updateUrl]
  )
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(new Set())
  const [activeData, setActiveData] = useState<{ type: 'strip'; strip: StripboardStrip; preview: DayTablePreviewSize | null } | { type: 'unscheduled-shot'; item: ShotWithScene } | null>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({})
  const [newDayOpen, setNewDayOpen] = useState(false)
  const [newDayDate, setNewDayDate] = useState('')
  const [newDayError, setNewDayError] = useState<string | null>(null)
  const [addUnitOpen, setAddUnitOpen] = useState(false)
  const [selectedAddUnitDayIds, setSelectedAddUnitDayIds] = useState<Set<string>>(new Set())
  const [addUnitError, setAddUnitError] = useState<string | null>(null)
  const [deleteShootDayTarget, setDeleteShootDayTarget] = useState<{
    id: string
    shoot_date: string
    day_number: number | null
  } | null>(null)
  const [deleteShootDayDialogOpen, setDeleteShootDayDialogOpen] = useState(false)
  const [deleteShootDayError, setDeleteShootDayError] = useState<string | null>(null)
  const [removeUnitTarget, setRemoveUnitTarget] = useState<{
    shootDayUnitId: string
    shootDate: string
    dayNumber: number | null
    unitName: string
  } | null>(null)
  const [removeUnitDialogOpen, setRemoveUnitDialogOpen] = useState(false)
  const [removeUnitError, setRemoveUnitError] = useState<string | null>(null)
  const [addStripOpen, setAddStripOpen] = useState(false)
  const blocViewFilter: ShootingBlocViewFilter = urlState.bloc
  const setBlocViewFilter = useCallback(
    (bloc: ShootingBlocViewFilter) => updateUrl({ bloc }, true),
    [updateUrl]
  )
  const activeDayId = urlState.day
  const setActiveDayId = useCallback(
    (day: string | null) => updateUrl({ day }, true),
    [updateUrl]
  )
  const [unscheduledOpen, setUnscheduledOpen] = useState(true)

  // The Board/Day choice used to be stored per viewer. Day is now the only view, so drop the stale key.
  useEffect(() => {
    try {
      window.localStorage.removeItem('albatross.stripboard.viewMode')
    } catch {
      /* storage unavailable: nothing to clean up */
    }
  }, [])
  const [boneyardOpen, setBoneyardOpen] = useState(false)

  // Reset the bloc filter when the user switches production (not on first load, which would
  // discard a deep-linked `bloc` param).
  const previousProductionIdRef = useRef(currentProductionId)
  useEffect(() => {
    const previous = previousProductionIdRef.current
    previousProductionIdRef.current = currentProductionId
    if (previous && currentProductionId && previous !== currentProductionId) {
      setBlocViewFilter('all')
    }
  }, [currentProductionId, setBlocViewFilter])

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
    removeUnitMutation,
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

  const activeDay =
    visibleShootDays.find((d) => d.id === activeDayId) ?? visibleShootDays[0] ?? null

  const mainUnit = units.find((u) => u.name === 'Main Unit') ?? units[0]

  /** Days that can take another unit, with the unit each would get (Second … Fifth). */
  const shootDaysEligibleForUnit = useMemo(() => {
    const unitNameById = new Map(units.map((u) => [u.id, u.name]))
    const rankedDayUnits = new Map<string, Set<number | null>>()
    for (const du of dayUnits) {
      const ranks = rankedDayUnits.get(du.shoot_day_id) ?? new Set<number | null>()
      ranks.add(unitNameToRank(unitNameById.get(du.unit_id) ?? ''))
      rankedDayUnits.set(du.shoot_day_id, ranks)
    }
    return shootDays.flatMap((day) => {
      const ranks = rankedDayUnits.get(day.id) ?? new Set<number | null>()
      const unitCount = dayUnits.filter((du) => du.shoot_day_id === day.id).length
      if (unitCount >= MAX_UNITS_PER_DAY) return []
      const nextRank = UNIT_RANKS.find((rank) => !ranks.has(rank))
      return nextRank ? [{ day, nextUnitName: unitRankToName(nextRank) }] : []
    })
  }, [shootDays, dayUnits, units])

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
      setActiveDayId(result.shootDay.id)
      toast.success('Shoot day created.')
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

  const addUnitMutation = useMutation({
    mutationFn: async (shootDayIds: string[]) => {
      if (!currentProductionId) {
        throw new Error('No production selected')
      }
      if (shootDayIds.length === 0) {
        throw new Error('Select at least one shoot day')
      }
      setAddUnitError(null)
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return addUnitToShootDaysForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          shootDayIds,
        })
      }
      return addUnitToShootDays({
        productionId: currentProductionId,
        shootDayIds,
      })
    },
    onSuccess: (result, shootDayIds) => {
      setAddUnitOpen(false)
      setSelectedAddUnitDayIds(new Set())
      setAddUnitError(null)
      const linkedCount = result.linkedShootDayUnitIds.length
      toast.success(
        linkedCount === 1 ? 'Unit added to 1 shoot day.' : `Unit added to ${linkedCount} shoot days.`
      )
      if (result.skippedFullShootDayIds.length > 0) {
        toast.warning(
          `${result.skippedFullShootDayIds.length} shoot day(s) already have ${MAX_UNITS_PER_DAY} units and were skipped.`
        )
      }
      if (shootDayIds.length > 0) {
        setActiveDayId(shootDayIds[0]!)
      }
      void invalidateStripboardCaches(queryClient, currentProductionId)
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not add unit. Please try again.'
      if (message === 'No production selected') {
        setAddUnitError('Select a production before adding a unit.')
      } else if (message === 'Select at least one shoot day') {
        setAddUnitError('Select at least one shoot day.')
      } else if (message === 'INVALID_SHOOT_DAY') {
        setAddUnitError('One or more selected shoot days are invalid.')
      } else {
        setAddUnitError('Could not add unit. Please try again.')
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
    // Day-table rows get a table-shaped preview sized to the row; boneyard cards keep the card preview.
    if (d?.type === 'strip') setActiveData({ type: 'strip', strip: d.strip, preview: measureStripTableRow(d.strip.id) })
    else if (d?.type === 'unscheduled-shot') setActiveData({ type: 'unscheduled-shot', item: d.item })
    else if (d?.type === 'boneyard-strip') setActiveData({ type: 'strip', strip: d.strip, preview: null })
    else setActiveData(null)
  }

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

  /** Sonner action that moves a strip back to its prior shoot day slot (single repository call). */
  const undoMoveAction = (prior: StripboardStrip) =>
    prior.shoot_day_id && prior.shoot_day_unit_id
      ? {
          label: 'Undo',
          onClick: () => {
            moveStripMutation.mutate(
              {
                stripId: prior.id,
                toShootDayId: prior.shoot_day_id!,
                toShootDayUnitId: prior.shoot_day_unit_id!,
                toSortIndex: prior.sort_index,
              },
              { onError: () => toast.error('Could not undo the move.') }
            )
          },
        }
      : undefined

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveData(null)
    const { active, over } = event
    if (!over?.id || typeof over.id !== 'string') return

    const overStr = String(over.id)
    const data = active.data.current

    if (overStr === 'unscheduled-panel') {
      if (data?.type === 'strip') {
        const prior = data.strip
        await moveToUnscheduledMutation.mutateAsync(prior.id)
        toast.success('Shot moved to Unscheduled.', { action: undoMoveAction(prior) })
        return
      }
      if (data?.type === 'boneyard-strip') {
        await moveToUnscheduledMutation.mutateAsync(data.strip.id)
        return
      }
    }

    if (overStr === 'boneyard-panel' && (data?.type === 'strip' || data?.type === 'boneyard-strip')) {
      const prior = data.strip
      await moveToBoneyardMutation.mutateAsync(prior.id)
      toast.success('Moved to Boneyard.', { action: undoMoveAction(prior) })
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

  const unscheduledPanel = (
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
  )

  return (
    <>
      {!currentProductionId ? (
        <RequireProduction title="Stripboard">{null}</RequireProduction>
      ) : (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Stripboard"
        actions={
          <>
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
                setAddUnitError(null)
                setSelectedAddUnitDayIds(new Set())
                setAddUnitOpen(true)
              }}
              disabled={
                !currentProductionId ||
                shootDays.length === 0 ||
                shootDaysEligibleForUnit.length === 0
              }
            >
              <Layers2 className="size-4" />
              Add unit
            </Button>
            <Button data-tutorial="stripboard-new-day"
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
          </>
        }
      />

      <SmartSchedulingInsightsPanel
        storageKey="albatross.stripboard.insightsOpen"
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
          {unscheduledOpen ? (
            <div className="relative flex shrink-0 min-h-0">
              {unscheduledPanel}
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 z-10 h-7 w-7"
                aria-label="Collapse Unscheduled"
                onClick={() => setUnscheduledOpen(false)}
              >
                <PanelLeftClose className="size-4" />
              </Button>
            </div>
          ) : (
            <CollapsedPanelRail
              droppableId="unscheduled-panel"
              label="Unscheduled"
              side="left"
              onExpand={() => setUnscheduledOpen(true)}
            />
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <StripboardDayView
              days={visibleShootDays}
              day={activeDay}
              onSelectDay={setActiveDayId}
              dayUnitsByDayId={dayUnitsByDayId}
              units={units}
              stripsByDayUnit={stripsByDayUnit}
              columnId={columnId}
              scenes={scenes}
              shots={shots}
              locations={locations}
              estimatedShootMinutesByShotId={estimatedShootMinutesByShotId}
              castPersonIdsByShotId={castPersonIdsByShotId}
              isEpisodic={isEpisodicProduction}
              blocById={blocById}
              episodeById={episodeById}
              pageEighthsTarget={PAGE_EIGHTHS_TARGET}
              columnFilters={columnFilters}
              onColumnFilterChange={(colId, key, value) =>
                setColumnFilters((prev) => ({
                  ...prev,
                  [colId]: { ...(prev[colId] ?? { int: false, ext: false, day: false, night: false }), [key]: value },
                }))
              }
              onToggleLock={(shootDayUnitId, isLocked) => setLockedMutation.mutate({ shootDayUnitId, isLocked })}
              onUpdateStripEstimatedMinutes={(stripId, minutes) => updateEstimatedMutation.mutate({ stripId, minutes })}
              onUpdateCallWrapTime={(stripId, time) => updateCallWrapTimeMutation.mutate({ stripId, time })}
              onUpdateMoveStrip={(stripId, data) => updateStripMutation.mutate({ stripId, data })}
              onSendToBoneyard={(strip) => {
                moveToBoneyardMutation.mutate(strip.id, {
                  onSuccess: () => toast.success('Moved to Boneyard.', { action: undoMoveAction(strip) }),
                })
              }}
              onDeleteStrip={(strip) => deleteStripMutation.mutate(strip.id)}
              onRequestDeleteDay={(d) => {
                setDeleteShootDayError(null)
                setDeleteShootDayTarget({ id: d.id, shoot_date: d.shoot_date, day_number: d.day_number })
                setDeleteShootDayDialogOpen(true)
              }}
              onRequestRemoveUnit={(sdu, unitName, d) => {
                setRemoveUnitError(null)
                setRemoveUnitTarget({
                  shootDayUnitId: sdu.id,
                  shootDate: d.shoot_date,
                  dayNumber: d.day_number,
                  unitName,
                })
                setRemoveUnitDialogOpen(true)
              }}
            />
          </div>

          {boneyardOpen ? (
            <div className="relative flex shrink-0 min-h-0">
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
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 z-10 h-7 w-7"
                aria-label="Collapse Boneyard"
                onClick={() => setBoneyardOpen(false)}
              >
                <PanelRightClose className="size-4" />
              </Button>
            </div>
          ) : (
            <CollapsedPanelRail
              droppableId="boneyard-panel"
              label="Boneyard"
              side="right"
              tone="amber"
              onExpand={() => setBoneyardOpen(true)}
            />
          )}
        </div>

        <DragOverlay>
          {activeData?.type === 'strip' && activeData.preview && (
            <StripTableDragPreview
              preview={activeData.preview}
              strip={activeData.strip}
              scene={resolveStripShotAndScene(activeData.strip, shots, scenes).scene}
              shot={resolveStripShotAndScene(activeData.strip, shots, scenes).shot}
              locations={locations}
              estimatedMinutesDefault={
                activeData.strip.strip_type === 'SHOT' && activeData.strip.shot_id
                  ? estimatedShootMinutesByShotId.get(activeData.strip.shot_id) ?? 0
                  : undefined
              }
              castCount={
                activeData.strip.shot_id ? castPersonIdsByShotId.get(activeData.strip.shot_id)?.length : undefined
              }
              isEpisodic={isEpisodicProduction}
              episodeById={isEpisodicProduction ? episodeById : undefined}
              columnCount={activeData.preview.columnWidths.length}
            />
          )}
          {activeData?.type === 'strip' && !activeData.preview && (
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
        <DialogContent className="max-w-md">
          <h3 className="text-base font-semibold text-foreground">New shoot day</h3>
          <p className="text-sm text-muted-foreground">
            Create an empty shoot day for this production. Main Unit will be added by default.
          </p>
          {newDayError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {newDayError}
            </p>
          )}
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="shoot-date" className="text-sm text-foreground">
                Shoot date<span className="text-destructive">*</span>
              </Label>
              <Input
                id="shoot-date"
                type="date"
                className="mt-1 h-9 bg-card border-border text-foreground"
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
        open={addUnitOpen}
        onOpenChange={(open) => {
          setAddUnitOpen(open)
          if (!open) {
            setSelectedAddUnitDayIds(new Set())
            setAddUnitError(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <h3 className="text-base font-semibold text-foreground">Add unit</h3>
          <p className="text-sm text-muted-foreground">
            Add the next unit (up to {MAX_UNITS_PER_DAY} per day) to the selected shoot days. Existing units are
            unchanged.
          </p>
          {addUnitError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {addUnitError}
            </p>
          )}
          <div className="mt-3 space-y-3">
            {shootDaysEligibleForUnit.length > 1 && (
              <div className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() =>
                    setSelectedAddUnitDayIds(
                      new Set(shootDaysEligibleForUnit.map(({ day }) => day.id))
                    )
                  }
                  disabled={addUnitMutation.isPending}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => setSelectedAddUnitDayIds(new Set())}
                  disabled={addUnitMutation.isPending}
                >
                  Clear
                </button>
              </div>
            )}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {shootDaysEligibleForUnit.map(({ day, nextUnitName }) => {
                const checked = selectedAddUnitDayIds.has(day.id)
                const label =
                  day.day_number != null
                    ? `${day.shoot_date} (Day ${day.day_number})`
                    : day.shoot_date
                return (
                  <label
                    key={day.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        setSelectedAddUnitDayIds((prev) => {
                          const next = new Set(prev)
                          if (value === true) next.add(day.id)
                          else next.delete(day.id)
                          return next
                        })
                      }}
                      disabled={addUnitMutation.isPending}
                    />
                    <span className="text-sm text-foreground">{label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">adds {nextUnitName}</span>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAddUnitOpen(false)}
              disabled={addUnitMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() =>
                addUnitMutation.mutate([...selectedAddUnitDayIds])
              }
              disabled={
                addUnitMutation.isPending || selectedAddUnitDayIds.size === 0
              }
            >
              {addUnitMutation.isPending ? 'Adding…' : 'Add unit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeUnitDialogOpen}
        onOpenChange={(open) => {
          setRemoveUnitDialogOpen(open)
          if (!open) {
            setRemoveUnitTarget(null)
            setRemoveUnitError(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <h3 className="text-base font-semibold text-foreground">
            Remove {removeUnitTarget?.unitName ?? 'unit'}
          </h3>
          {removeUnitTarget && (
            <>
              <p className="text-sm text-foreground mt-1">
                Remove {removeUnitTarget.unitName} from shoot day{' '}
                <span className="font-medium text-foreground">{removeUnitTarget.shootDate}</span>
                {removeUnitTarget.dayNumber != null
                  ? ` (Day ${removeUnitTarget.dayNumber})`
                  : ''}
                ?
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                All shots scheduled on {removeUnitTarget.unitName} for this day will move to
                Unscheduled. Any units after it move up a place; Main Unit is unchanged.
              </p>
            </>
          )}
          {removeUnitError && (
            <p className="mt-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive" role="alert">
              {removeUnitError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRemoveUnitDialogOpen(false)}
              disabled={removeUnitMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removeUnitMutation.isPending || !removeUnitTarget}
              onClick={() => {
                if (!removeUnitTarget) return
                const { unitName } = removeUnitTarget
                setRemoveUnitError(null)
                removeUnitMutation.mutate(removeUnitTarget.shootDayUnitId, {
                  onSuccess: () => {
                    setRemoveUnitDialogOpen(false)
                    setRemoveUnitTarget(null)
                    toast.success(`${unitName} removed. Shots moved to Unscheduled.`)
                  },
                  onError: (error) => {
                    const message =
                      error instanceof Error ? error.message : 'Could not remove unit.'
                    if (message === 'CANNOT_REMOVE_MAIN_UNIT') {
                      setRemoveUnitError('Main Unit cannot be removed from a shoot day.')
                    } else if (message === 'SHOOT_DAY_UNIT_NOT_FOUND') {
                      setRemoveUnitError(`${unitName} is no longer on this shoot day.`)
                    } else {
                      setRemoveUnitError(`Could not remove ${unitName}. Please try again.`)
                    }
                  },
                })
              }}
            >
              {removeUnitMutation.isPending ? 'Removing…' : `Remove ${removeUnitTarget?.unitName ?? 'unit'}`}
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
        <DialogContent className="max-w-md">
          <h3 className="text-base font-semibold text-foreground">Delete shoot day</h3>
          {deleteShootDayTarget && (
            <>
              <p className="text-sm text-foreground mt-1">
                Are you sure you want to delete shoot day{' '}
                <span className="font-medium text-foreground">{deleteShootDayTarget.shoot_date}</span>
                {deleteShootDayTarget.day_number != null
                  ? ` (Day ${deleteShootDayTarget.day_number})`
                  : ''}
                ?
              </p>
              <p className="text-sm text-muted-foreground mt-2">
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