import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Lock, Unlock, AlertTriangle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { StripItem } from './strip-item'
import type { ShootDay } from '@/lib/db/types'
import type { Unit } from '@/lib/db/types'
import type { ShootDayUnit } from '@/lib/db/types'
import type { StripboardStrip } from '@/lib/db/types'
import type { Scene } from '@/lib/db/types'

export type ColumnFilter = { int: boolean; ext: boolean; day: boolean; night: boolean }

const DEFAULT_COLUMN_FILTER: ColumnFilter = { int: false, ext: false, day: false, night: false }

export function StripboardDayColumn({
  day,
  units,
  stripsByUnit,
  scenes,
  estimatedShootMinutesBySceneId,
  onUpdateStripEstimatedMinutes,
  columnId,
  pageEighthsTarget,
  onRemoveStrip,
  onToggleLock,
  columnFilters,
  onColumnFilterChange,
}: {
  day: ShootDay
  units: Unit[]
  dayUnits: ShootDayUnit[]
  stripsByUnit: { shootDayUnit: ShootDayUnit; strips: StripboardStrip[] }[]
  scenes: Scene[]
  estimatedShootMinutesBySceneId: Map<string, number>
  onUpdateStripEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  columnId: (shootDayId: string, shootDayUnitId: string) => string
  isLocked: boolean
  pageEighthsTarget: number
  onRemoveStrip: (strip: StripboardStrip) => void
  onToggleLock?: (shootDayUnitId: string, isLocked: boolean) => void
  columnFilters?: Record<string, ColumnFilter>
  onColumnFilterChange?: (colId: string, key: keyof ColumnFilter, value: boolean) => void
}) {
  return (
    <Card className="w-64 shrink-0 flex flex-col bg-card border-border overflow-hidden">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>{day.shoot_date}</span>
          {day.day_number != null && (
            <Badge variant="secondary" className="text-xs">Day {day.day_number}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
        {stripsByUnit.map(({ shootDayUnit, strips: unitStrips }) => {
          const unit = units.find((u) => u.id === shootDayUnit.unit_id)
          if (!unit) return null
          return (
          <UnitColumn
            key={shootDayUnit.id}
            shootDayUnit={shootDayUnit}
            unit={unit}
            strips={unitStrips}
            scenes={scenes}
            estimatedShootMinutesBySceneId={estimatedShootMinutesBySceneId}
            onUpdateStripEstimatedMinutes={onUpdateStripEstimatedMinutes}
            columnId={columnId(day.id, shootDayUnit.id)}
            isLocked={shootDayUnit.is_locked !== 0}
            pageEighthsTarget={pageEighthsTarget}
            onRemoveStrip={onRemoveStrip}
            onToggleLock={onToggleLock}
            columnFilter={columnFilters?.[columnId(day.id, shootDayUnit.id)] ?? DEFAULT_COLUMN_FILTER}
            onColumnFilterChange={onColumnFilterChange ? (key, value) => onColumnFilterChange(columnId(day.id, shootDayUnit.id), key, value) : undefined}
          />
          )
        })}
        {stripsByUnit.length === 0 && (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No units. Add a unit to this day.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UnitColumn({
  shootDayUnit,
  unit,
  strips,
  scenes,
  estimatedShootMinutesBySceneId,
  onUpdateStripEstimatedMinutes,
  columnId: colId,
  isLocked,
  pageEighthsTarget,
  onRemoveStrip,
  onToggleLock,
  columnFilter,
  onColumnFilterChange,
}: {
  day?: ShootDay
  shootDayUnit: ShootDayUnit
  unit: Unit
  strips: StripboardStrip[]
  scenes: Scene[]
  estimatedShootMinutesBySceneId: Map<string, number>
  onUpdateStripEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  columnId: string
  isLocked: boolean
  pageEighthsTarget: number
  onRemoveStrip: (strip: StripboardStrip) => void
  onToggleLock?: (shootDayUnitId: string, isLocked: boolean) => void
  columnFilter: ColumnFilter
  onColumnFilterChange?: (key: keyof ColumnFilter, value: boolean) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId })

  const filtersActive = columnFilter.int || columnFilter.ext || columnFilter.day || columnFilter.night

  const displayStrips = strips.filter((strip) => {
    if (strip.strip_type !== 'SCENE') return true
    const scene = strip.scene_id ? scenes.find((s) => s.id === strip.scene_id) : null
    if (!scene) return true
    const intExtMatch =
      !columnFilter.int && !columnFilter.ext
        ? true
        : (columnFilter.int && scene.int_ext === 'INT') || (columnFilter.ext && scene.int_ext === 'EXT')
    const dayNightMatch =
      !columnFilter.day && !columnFilter.night
        ? true
        : (columnFilter.day && scene.day_night === 'DAY') || (columnFilter.night && scene.day_night === 'NIGHT')
    return intExtMatch && dayNightMatch
  })

  const sceneStrips = strips.filter((s) => s.strip_type === 'SCENE')
  // Estimated runtime: strip override (estimated_minutes) if set, else sum of shot estimated_shoot_minutes for that scene.
  const estimatedRuntimeMinutes = sceneStrips.reduce((sum, s) => {
    const override = s.estimated_minutes
    const fromShots = s.scene_id ? estimatedShootMinutesBySceneId.get(s.scene_id) ?? 0 : 0
    return sum + (override ?? fromShots)
  }, 0)
  const runtimeHours = Math.floor(estimatedRuntimeMinutes / 60)
  const runtimeMins = estimatedRuntimeMinutes % 60
  const runtimeLabel = `Estimated Runtime: ${runtimeHours}h ${runtimeMins}m`
  const over10h = estimatedRuntimeMinutes > 600
  const over10_5h = estimatedRuntimeMinutes > 630

  const totalEighths = sceneStrips.reduce((sum, s) => {
    const scene = s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null
    return sum + (scene?.page_eighths ?? 0)
  }, 0)
  const overPages = totalEighths > pageEighthsTarget
  const noLocation = sceneStrips.some((s) => {
    const scene = s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null
    return scene && !scene.location_id
  })

  const intCount = sceneStrips.filter((s) => {
    const scene = s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null
    return scene?.int_ext === 'INT'
  }).length
  const extCount = sceneStrips.filter((s) => {
    const scene = s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null
    return scene?.int_ext === 'EXT'
  }).length
  const dayCount = sceneStrips.filter((s) => {
    const scene = s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null
    return scene?.day_night === 'DAY'
  }).length
  const nightCount = sceneStrips.filter((s) => {
    const scene = s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null
    return scene?.day_night === 'NIGHT'
  }).length

  return (
    <div className="border-t border-border flex flex-col flex-1 min-h-0">
      <div className="px-3 py-2 flex flex-col gap-1.5 bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm flex items-center gap-1">
            {unit.name}
            {isLocked && <Lock className="size-3.5 text-muted-foreground" />}
          </span>
          {onToggleLock && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => onToggleLock(shootDayUnit.id, !isLocked)}
              title={isLocked ? 'Unlock' : 'Lock'}
            >
              {isLocked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
            </Button>
          )}
          <div className="flex gap-1 flex-wrap justify-end">
            <Badge variant="outline" className="text-[10px]">{sceneStrips.length} scenes</Badge>
            <Badge variant="outline" className="text-[10px]">{totalEighths}/8 pgs</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {over10_5h ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    {runtimeLabel}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px]">
                  Estimated day exceeds 10.5 hours (includes 30 min lunch allowance).
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : over10h ? (
            <span className="text-xs text-amber-600/90 dark:text-amber-400/90">{runtimeLabel}</span>
          ) : (
            <span className="text-xs text-muted-foreground">{runtimeLabel}</span>
          )}
        </div>
      </div>
      {(overPages || noLocation) && (
        <div className="px-3 py-1 flex flex-wrap gap-1 bg-destructive/10 border-b border-border">
          {noLocation && (
            <span className="text-destructive text-xs flex items-center gap-1">
              <AlertTriangle className="size-3" /> No location
            </span>
          )}
          {overPages && (
            <span className="text-destructive text-xs flex items-center gap-1">
              <AlertTriangle className="size-3" /> Over {pageEighthsTarget} eighths
            </span>
          )}
        </div>
      )}
      <div className="flex gap-1 px-2 py-1 flex-wrap">
        {intCount > 0 && <Badge variant="secondary" className="text-[10px]">INT {intCount}</Badge>}
        {extCount > 0 && <Badge variant="secondary" className="text-[10px]">EXT {extCount}</Badge>}
        {dayCount > 0 && <Badge variant="outline" className="text-[10px]">DAY {dayCount}</Badge>}
        {nightCount > 0 && <Badge variant="outline" className="text-[10px]">NIGHT {nightCount}</Badge>}
      </div>
      {onColumnFilterChange && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5 border-t border-border">
          {(['int', 'ext', 'day', 'night'] as const).map((key) => (
            <Button
              key={key}
              variant={columnFilter[key] ? 'default' : 'outline'}
              size="sm"
              className={`h-6 px-2 text-[10px] font-medium rounded-full ${columnFilter[key] ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
              onClick={() => onColumnFilterChange(key, !columnFilter[key])}
            >
              {key.toUpperCase()}
            </Button>
          ))}
        </div>
      )}
      <div
        ref={setNodeRef}
        data-dragging-over={isOver ? 'true' : undefined}
        className={`flex-1 overflow-auto p-2 rounded-md min-h-[120px] transition-colors ${isOver ? 'bg-primary/10 border border-primary/50' : ''}`}
      >
        <SortableContext
          items={displayStrips.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
          disabled={isLocked}
        >
          <ul className="space-y-2">
            {displayStrips.map((strip) => (
              <StripItem
                key={strip.id}
                strip={strip}
                scenes={scenes}
                estimatedMinutesDefault={
                  strip.strip_type === 'SCENE' && strip.scene_id
                    ? estimatedShootMinutesBySceneId.get(strip.scene_id) ?? 0
                    : undefined
                }
                onUpdateEstimatedMinutes={onUpdateStripEstimatedMinutes}
                onRemove={onRemoveStrip}
                disabled={isLocked}
                className={filtersActive && strip.strip_type !== 'SCENE' ? 'opacity-60' : undefined}
              />
            ))}
            {displayStrips.length === 0 && (
              <li
                className="rounded-md border border-dashed border-border py-6 text-center text-muted-foreground text-sm"
                data-droppable-placeholder
              >
                {strips.length === 0 ? 'Drop strips here' : 'No strips match filter'}
              </li>
            )}
          </ul>
        </SortableContext>
      </div>
    </div>
  )
}
