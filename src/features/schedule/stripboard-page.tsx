/**
 * Stripboard page: Unscheduled Scenes panel + day/unit columns with DnD.
 * Reconstructed to match: graphite + mint, dnd-kit with DragOverlay, lock, totals, warnings.
 *
 * Files: stripboard-page.tsx, unscheduled-scenes-panel.tsx, stripboard-hooks.ts,
 * stripboard-day-column.tsx, strip-item.tsx, stripboard-strips repo, schedule listUnscheduledScenes.
 * Test: DnD strips between columns, drag scene from unscheduled to column, Add dropdown,
 * multi-select Assign to Day, location/search filters, day totals & runtime warning (>10h), lock toggle.
 */
import { useState, useEffect } from 'react'
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
import { useStripboard, stripboardQueryKeys, useUnscheduledScenes, useBoneyardStrips } from './stripboard-hooks'
import { useQuery } from '@tanstack/react-query'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { getOrCreateShootDayUnit } from '@/lib/db/repositories/shoot-day-units'
import { SORT_GAP, type CreateStripData } from '@/lib/db/repositories/stripboard-strips'
import { useQueryClient } from '@tanstack/react-query'
import { UnscheduledScenesPanel } from './unscheduled-scenes-panel'
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
import type { Scene } from '@/lib/db/types'

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
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set())
  const [activeData, setActiveData] = useState<{ type: 'strip'; strip: StripboardStrip } | { type: 'unscheduled-scene'; scene: Scene } | null>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({})
  const [unscheduleToast, setUnscheduleToast] = useState(false)

  const stripboard = useStripboard(currentProductionId ?? null)
  const filters = { search: search || undefined, locationId }
  const unscheduled = useUnscheduledScenes(currentProductionId, filters)
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
    estimatedShootMinutesBySceneId,
    setLockedMutation,
    updateEstimatedMutation,
    moveToUnscheduledMutation,
    moveToBoneyardMutation,
    deleteStripMutation,
    moveStripMutation,
    reorderStripMutation,
    createStripMutation,
    createSceneStripMutation,
  } = stripboard

  const mainUnit = units.find((u) => u.name === 'Main Unit') ?? units[0]

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

  const handleDragStart = (event: DragStartEvent) => {
    const d = event.active.data.current
    if (d?.type === 'strip') setActiveData({ type: 'strip', strip: d.strip })
    else if (d?.type === 'unscheduled-scene') setActiveData({ type: 'unscheduled-scene', scene: d.scene })
    else if (d?.type === 'boneyard-strip') setActiveData({ type: 'strip', strip: d.strip })
    else setActiveData(null)
  }

  useEffect(() => {
    if (!unscheduleToast) return
    const t = setTimeout(() => setUnscheduleToast(false), 3000)
    return () => clearTimeout(t)
  }, [unscheduleToast])

  // #region agent log
  useEffect(() => {
    const len = unscheduled.unscheduledScenes.length
    fetch('http://127.0.0.1:7243/ingest/76cef4f5-a1f0-453f-b82a-14d185be1b61',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stripboard-page.tsx:useEffect',message:'unscheduledScenes length',data:{length:len},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
  }, [unscheduled.unscheduledScenes])
  // #endregion

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
      if (data.strip.strip_type !== 'SCENE') return
      await moveToBoneyardMutation.mutateAsync(data.strip.id)
      return
    }

    const overStrip = strips.find((s) => s.id === overStr)
    if (overStrip) {
      const shootDayId = overStrip.shoot_day_id
      const shootDayUnitId = overStrip.shoot_day_unit_id
      if (!shootDayId || !shootDayUnitId) return
      const dayUnit = dayUnits.find((du) => du.id === shootDayUnitId)
      if (!dayUnit || dayUnit.is_locked) return
      const stripsInColumn = [...(stripsByDayUnit.get(`${shootDayId}:${shootDayUnitId}`) ?? [])].sort(
        (a, b) => a.sort_index - b.sort_index
      )
      const overIdx = stripsInColumn.findIndex((s) => s.id === overStrip.id)
      const nextStrip = overIdx >= 0 ? stripsInColumn[overIdx + 1] : undefined
      const toSortIndex = nextStrip
        ? (overStrip.sort_index + nextStrip.sort_index) / 2
        : overStrip.sort_index + SORT_GAP

      if (data?.type === 'unscheduled-scene' && currentProductionId) {
        await createSceneStripMutation.mutateAsync({
          productionId: currentProductionId,
          sceneId: data.scene.id,
          shootDayId,
          shootDayUnitId,
        })
        return
      }
      if ((data?.type === 'strip' || data?.type === 'boneyard-strip') && data.strip) {
        const strip = data.strip
        if (strip.shoot_day_id != null && strip.shoot_day_unit_id != null && strip.shoot_day_id === shootDayId && strip.shoot_day_unit_id === shootDayUnitId) {
          await reorderStripMutation.mutateAsync({ stripId: strip.id, toSortIndex })
        } else {
          await moveStripMutation.mutateAsync({
            stripId: strip.id,
            toShootDayId: shootDayId,
            toShootDayUnitId: shootDayUnitId,
            toSortIndex,
          })
        }
        return
      }
      return
    }

    const isColumn = overStr.startsWith('col:')
    if (!isColumn) return

    const [, shootDayId, shootDayUnitId] = overStr.split(':')
    if (!shootDayId || !shootDayUnitId) return

    const dayUnit = dayUnits.find((du) => du.id === shootDayUnitId)
    if (!dayUnit || dayUnit.is_locked) return

    const stripsInColumn = stripsByDayUnit.get(`${shootDayId}:${shootDayUnitId}`) ?? []
    const maxSort = stripsInColumn.length > 0
      ? Math.max(...stripsInColumn.map((s) => s.sort_index))
      : 0
    const toSortIndex = maxSort + SORT_GAP

    if (data?.type === 'unscheduled-scene' && currentProductionId) {
      await createSceneStripMutation.mutateAsync({
        productionId: currentProductionId,
        sceneId: data.scene.id,
        shootDayId,
        shootDayUnitId,
      })
      return
    }

    if ((data?.type === 'strip' || data?.type === 'boneyard-strip') && data.strip) {
      await moveStripMutation.mutateAsync({
        stripId: data.strip.id,
        toShootDayId: shootDayId,
        toShootDayUnitId: shootDayUnitId,
        toSortIndex,
      })
    }
  }

  const handleAssignToDay = (sceneIds: string[], shootDayId: string, shootDayUnitId: string) => {
    unscheduled.bulkAssignMutation.mutate({ sceneIds, shootDayId, shootDayUnitId })
  }

  const handleAddSingle = (sceneId: string, shootDayId: string, shootDayUnitId: string) => {
    if (!currentProductionId) return
    createSceneStripMutation.mutate({ productionId: currentProductionId, sceneId, shootDayId, shootDayUnitId })
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
          Scene moved to Unscheduled.
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Schedule — Stripboard</h1>
        <AddStripPopover
          productionId={currentProductionId}
          shootDays={shootDays}
          dayUnits={dayUnits}
          units={units}
          onCreate={(data) => createStripMutation.mutate(data)}
          isPending={createStripMutation.isPending}
        />
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
          <UnscheduledScenesPanel
            droppableId="unscheduled-panel"
            scenes={unscheduled.unscheduledScenes}
            locations={locations}
            shootDays={shootDays}
            dayUnits={dayUnits}
            search={search}
            onSearchChange={setSearch}
            locationId={locationId}
            onLocationChange={setLocationId}
            selectedSceneIds={selectedSceneIds}
            onToggleScene={(id) =>
              setSelectedSceneIds((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }
            onSelectAll={() =>
              setSelectedSceneIds(new Set(unscheduled.unscheduledScenes.map((s) => s.id)))
            }
            onDeselectAll={() => setSelectedSceneIds(new Set())}
            onAssignToDay={handleAssignToDay}
            onAddSingle={handleAddSingle}
            getUnitName={getUnitName}
            isAssigning={unscheduled.bulkAssignMutation.isPending}
          />

          <BoneyardPanel
            droppableId="boneyard-panel"
            strips={boneyard.boneyardStrips}
            scenes={scenes}
            estimatedShootMinutesBySceneId={estimatedShootMinutesBySceneId}
            onDeleteStrip={(strip) => deleteStripMutation.mutate(strip.id)}
          />

          <div className="flex-1 overflow-auto">
            <div className="flex gap-4 pb-4">
              {shootDays.map((day) => {
                const dayUnitsList = dayUnitsByDayId.get(day.id) ?? []
                const stripsByUnit = dayUnitsList.map((shootDayUnit) => ({
                  shootDayUnit,
                  strips: (stripsByDayUnit.get(`${day.id}:${shootDayUnit.id}`) ?? []).sort(
                    (a, b) => a.sort_index - b.sort_index
                  ),
                }))
                return (
                  <StripboardDayColumn
                    key={day.id}
                    day={day}
                    units={units}
                    dayUnits={dayUnitsList}
                    stripsByUnit={stripsByUnit}
                    scenes={scenes}
                    estimatedShootMinutesBySceneId={estimatedShootMinutesBySceneId}
                    onUpdateStripEstimatedMinutes={(stripId, minutes) =>
                      updateEstimatedMutation.mutate({ stripId, minutes })
                    }
                    columnId={columnId}
                    isLocked={false}
                    pageEighthsTarget={PAGE_EIGHTHS_TARGET}
                    onRemoveStrip={(strip) => {
                      moveToUnscheduledMutation.mutate(strip.id)
                      if (strip.strip_type === 'SCENE') setUnscheduleToast(true)
                    }}
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
                )
              })}
              {shootDays.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                  No shoot days. Add shoot days from the Schedule calendar or settings.
                </div>
              )}
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeData?.type === 'strip' && (
            <div className="rounded-md border-2 border-primary bg-card px-4 py-3 shadow-lg min-w-[200px]">
              <StripItem
                strip={activeData.strip}
                scenes={scenes}
                estimatedMinutesDefault={
                  activeData.strip.strip_type === 'SCENE' && activeData.strip.scene_id
                    ? estimatedShootMinutesBySceneId.get(activeData.strip.scene_id) ?? 0
                    : undefined
                }
                isOverlay
                disabled
              />
            </div>
          )}
          {activeData?.type === 'unscheduled-scene' && (
            <div className="rounded-md border-2 border-primary bg-card px-4 py-3 shadow-lg">
              <span className="font-medium">Scene {activeData.scene.scene_number}</span>
              <span className="text-muted-foreground text-sm ml-2">
                {activeData.scene.heading ?? activeData.scene.title ?? ''}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
