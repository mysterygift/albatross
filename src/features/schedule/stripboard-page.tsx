/**
 * Stripboard page: Unscheduled Scenes panel + day/unit columns with DnD.
 * Reconstructed to match: graphite + mint, dnd-kit with DragOverlay, lock, totals, warnings.
 *
 * Files: stripboard-page.tsx, unscheduled-scenes-panel.tsx, stripboard-hooks.ts,
 * stripboard-day-column.tsx, strip-item.tsx, stripboard-strips repo, schedule listUnscheduledShots.
 * Test: DnD strips between columns, drag scene from unscheduled to column, Add dropdown,
 * multi-select Assign to Day, location/search filters, day totals & runtime warning (>10h), lock toggle.
 */
import { useState, useEffect, useRef } from 'react'
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
import { useStripboard, stripboardQueryKeys, useUnscheduledShots, useBoneyardStrips } from './stripboard-hooks'
import { useMutation, useQuery } from '@tanstack/react-query'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { getOrCreateShootDayUnit } from '@/lib/db/repositories/shoot-day-units'
import { SORT_GAP, type CreateStripData } from '@/lib/db/repositories/stripboard-strips'
import { useQueryClient } from '@tanstack/react-query'
import { UnscheduledShotsPanel } from './unscheduled-scenes-panel'
import { BoneyardPanel } from './boneyard-panel'
import { StripboardDayColumn, type ColumnFilter } from './stripboard-day-column'
import { StripItem } from './strip-item'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
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
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { ShotWithScene } from '@/lib/db/repositories/stripboard-strips'

const STRIP_TYPES: { type: StripType; label: string }[] = [
  { type: 'MOVE', label: 'Move / Setup' },
  { type: 'CALL', label: 'Call' },
  { type: 'LUNCH', label: 'Lunch' },
  { type: 'WRAP', label: 'Wrap' },
  { type: 'NOTE', label: 'Note' },
]

const PAGE_EIGHTHS_TARGET = 48

function AddStripPopover({
  productionId,
  shootDays,
  dayUnits,
  units,
  onCreate,
  isPending,
}: {
  productionId: string
  shootDays: { id: string; shoot_date: string; day_number: number | null }[]
  dayUnits: { id: string; shoot_day_id: string; unit_id: string }[]
  units: { id: string; name: string }[]
  onCreate: (data: CreateStripData) => void
  isPending: boolean
}) {
  const [stripType, setStripType] = useState<StripType>('NOTE')
  const [shootDayId, setShootDayId] = useState<string>('')
  const [unitId, setUnitId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const dayUnitsForDay = shootDayId
    ? dayUnits.filter((du) => du.shoot_day_id === shootDayId)
    : []
  const shootDayUnitId = unitId
    ? dayUnitsForDay.find((du) => du.unit_id === unitId)?.id
    : null

  const handleCreate = () => {
    if (!shootDayUnitId) return
    onCreate({
      production_id: productionId,
      shoot_day_id: shootDayId,
      shoot_day_unit_id: shootDayUnitId,
      strip_type: stripType,
      title: title.trim() || null,
      description: description.trim() || null,
    })
    setTitle('')
    setDescription('')
  }

  return (
    <Popover>
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
          <Button
            className="w-full"
            size="sm"
            disabled={!shootDayUnitId || isPending}
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
  const { currentProductionId } = useCurrentProduction()
  const queryClient = useQueryClient()

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
  const newDayColumnRef = useRef<HTMLDivElement | null>(null)

  const stripboard = useStripboard(currentProductionId ?? null)
  const filters = { search: search || undefined, locationId }
  const unscheduled = useUnscheduledShots(currentProductionId, filters)
  const boneyard = useBoneyardStrips(currentProductionId)

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: () => listLocationsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

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
    moveToUnscheduledMutation,
    moveToBoneyardMutation,
    deleteStripMutation,
    moveStripMutation,
    reorderStripMutation,
    createStripMutation,
    createShotStripMutation,
  } = stripboard

  const mainUnit = units.find((u) => u.name === 'Main Unit') ?? units[0]

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
      return createShootDayWithDefaultMainUnit({
        productionId: currentProductionId,
        shootDate,
      })
    },
    onSuccess: (result) => {
      setNewDayOpen(false)
      setNewDayDate('')
      setNewDayError(null)
      setNewlyCreatedShootDayId(result.shootDay.id)
      setNewDaySuccessToast(true)
      queryClient.invalidateQueries({ queryKey: stripboardQueryKeys.all })
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Could not create shoot day. Please try again.'
      if (message === 'Shoot date is required') {
        setNewDayError('Shoot date is required.')
      } else if (message === 'No production selected') {
        setNewDayError('Select a production before creating shoot days.')
      } else {
        setNewDayError('Could not create shoot day. Please try again.')
      }
    },
  })

  useEffect(() => {
    if (!currentProductionId || !mainUnit || shootDays.length === 0) return
    let cancelled = false
    const run = async () => {
      for (const day of shootDays) {
        if (cancelled) return
        await getOrCreateShootDayUnit(day.id, mainUnit.id)
      }
      if (!cancelled) queryClient.invalidateQueries({ queryKey: stripboardQueryKeys.all })
    }
    run()
    return () => { cancelled = true }
  }, [currentProductionId, mainUnit?.id, shootDays.length, queryClient])

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

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Schedule — Stripboard</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Schedule — Stripboard</h1>
        <div className="flex items-center gap-2">
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
            shootDays={shootDays}
            dayUnits={dayUnits}
            units={units}
            onCreate={(data) => createStripMutation.mutate(data)}
            isPending={createStripMutation.isPending}
          />
        </div>
      </div>

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

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
          <UnscheduledShotsPanel
            droppableId="unscheduled-panel"
            unscheduledShots={unscheduled.unscheduledShots}
            locations={locations}
            shootDays={shootDays}
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
          <div className="flex-1 overflow-auto min-w-0">
            <div className="flex gap-4 pb-4 min-h-full">
              {shootDays.map((day) => {
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
                    estimatedShootMinutesByShotId={estimatedShootMinutesByShotId}
                    onUpdateStripEstimatedMinutes={(stripId, minutes) =>
                      updateEstimatedMutation.mutate({ stripId, minutes })
                    }
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
              />
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeData?.type === 'strip' && (
            <div className="rounded-md border-2 border-primary bg-card px-4 py-3 shadow-lg min-w-[200px]">
              <StripItem
                strip={activeData.strip}
                scenes={scenes}
                shots={shots}
                estimatedMinutesDefault={
                  activeData.strip.strip_type === 'SHOT' && activeData.strip.shot_id
                    ? estimatedShootMinutesByShotId.get(activeData.strip.shot_id) ?? 0
                    : undefined
                }
                isOverlay
                disabled
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
  )
}
