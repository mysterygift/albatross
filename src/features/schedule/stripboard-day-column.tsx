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
import type { Scene, Shot, Episode } from '@/lib/db/types'

export type ColumnFilter = { int: boolean; ext: boolean; day: boolean; night: boolean }

const DEFAULT_COLUMN_FILTER: ColumnFilter = { int: false, ext: false, day: false, night: false }

export function StripboardDayColumn({
  day,
  units,
  stripsByUnit,
  scenes,
  shots,
  estimatedShootMinutesByShotId,
  onUpdateStripEstimatedMinutes,
  onUpdateCallWrapTime,
  columnId,
  pageEighthsTarget,
  onSendToBoneyard,
  onDeleteStrip,
  onToggleLock,
  columnFilters,
  onColumnFilterChange,
  isEpisodic,
  shootingBlocLabel,
  episodeById,
}: {
  day: ShootDay
  units: Unit[]
  dayUnits: ShootDayUnit[]
  stripsByUnit: { shootDayUnit: ShootDayUnit; strips: StripboardStrip[] }[]
  scenes: Scene[]
  shots: Shot[]
  estimatedShootMinutesByShotId: Map<string, number>
  onUpdateStripEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  onUpdateCallWrapTime?: (stripId: string, time: string) => void
  columnId: (shootDayId: string, shootDayUnitId: string) => string
  isLocked: boolean
  pageEighthsTarget: number
  /** Send scheduled SHOT/SCENE strip to Boneyard (amber skull). */
  onSendToBoneyard: (strip: StripboardStrip) => void
  /** Delete scheduled MOVE/CALL/LUNCH/WRAP/NOTE strip (grey trash). */
  onDeleteStrip?: (strip: StripboardStrip) => void
  onToggleLock?: (shootDayUnitId: string, isLocked: boolean) => void
  columnFilters?: Record<string, ColumnFilter>
  onColumnFilterChange?: (colId: string, key: keyof ColumnFilter, value: boolean) => void
  isEpisodic?: boolean
  /** Day-level label from `shoot_days.shooting_bloc_id` + bloc catalog; episodic only. */
  shootingBlocLabel?: string
  episodeById?: Map<string, Episode>
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
        {isEpisodic && shootingBlocLabel != null && (
          <p
            className="text-muted-foreground text-xs mt-2 font-medium leading-snug truncate"
            title={shootingBlocLabel}
          >
            {shootingBlocLabel}
          </p>
        )}
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
            shots={shots}
            estimatedShootMinutesByShotId={estimatedShootMinutesByShotId}
            onUpdateStripEstimatedMinutes={onUpdateStripEstimatedMinutes}
            onUpdateCallWrapTime={onUpdateCallWrapTime}
            columnId={columnId(day.id, shootDayUnit.id)}
            isLocked={shootDayUnit.is_locked !== 0}
            pageEighthsTarget={pageEighthsTarget}
            onSendToBoneyard={onSendToBoneyard}
            onDeleteStrip={onDeleteStrip}
            onToggleLock={onToggleLock}
            columnFilter={columnFilters?.[columnId(day.id, shootDayUnit.id)] ?? DEFAULT_COLUMN_FILTER}
            onColumnFilterChange={onColumnFilterChange ? (key, value) => onColumnFilterChange(columnId(day.id, shootDayUnit.id), key, value) : undefined}
            isEpisodic={isEpisodic}
            episodeById={episodeById}
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
  shots,
  estimatedShootMinutesByShotId,
  onUpdateStripEstimatedMinutes,
  onUpdateCallWrapTime,
  columnId: colId,
  isLocked,
  pageEighthsTarget,
  onSendToBoneyard,
  onDeleteStrip,
  onToggleLock,
  columnFilter,
  onColumnFilterChange,
  isEpisodic,
  episodeById,
}: {
  day?: ShootDay
  shootDayUnit: ShootDayUnit
  unit: Unit
  strips: StripboardStrip[]
  scenes: Scene[]
  shots: Shot[]
  estimatedShootMinutesByShotId: Map<string, number>
  onUpdateStripEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  onUpdateCallWrapTime?: (stripId: string, time: string) => void
  columnId: string
  isLocked: boolean
  pageEighthsTarget: number
  onSendToBoneyard: (strip: StripboardStrip) => void
  onDeleteStrip?: (strip: StripboardStrip) => void
  onToggleLock?: (shootDayUnitId: string, isLocked: boolean) => void
  columnFilter: ColumnFilter
  onColumnFilterChange?: (key: keyof ColumnFilter, value: boolean) => void
  isEpisodic?: boolean
  episodeById?: Map<string, Episode>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId })

  const filtersActive = columnFilter.int || columnFilter.ext || columnFilter.day || columnFilter.night

  const displayStrips = strips.filter((strip) => {
    if (strip.strip_type !== 'SHOT') return true
    const shot = strip.shot_id ? shots.find((sh) => sh.id === strip.shot_id) : null
    const scene = shot ? scenes.find((s) => s.id === shot.scene_id) : (strip.scene_id ? scenes.find((s) => s.id === strip.scene_id) : null)
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

  const shotStrips = strips.filter((s) => s.strip_type === 'SHOT')
  const estimatedRuntimeMinutes = shotStrips.reduce((sum, s) => {
    const override = s.estimated_minutes
    const fromShot = s.shot_id ? estimatedShootMinutesByShotId.get(s.shot_id) ?? 0 : 0
    return sum + (override ?? fromShot)
  }, 0)
  const runtimeHours = Math.floor(estimatedRuntimeMinutes / 60)
  const runtimeMins = estimatedRuntimeMinutes % 60
  const runtimeLabel = `Estimated Runtime: ${runtimeHours}h ${runtimeMins}m`
  const over10h = estimatedRuntimeMinutes > 600
  const over10_5h = estimatedRuntimeMinutes > 630

  const totalEighths = shotStrips.reduce((sum, s) => {
    const shot = s.shot_id ? shots.find((sh) => sh.id === s.shot_id) : null
    const scene = shot ? scenes.find((c) => c.id === shot.scene_id) : (s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null)
    return sum + (scene?.page_eighths ?? 0)
  }, 0)
  const overPages = totalEighths > pageEighthsTarget
  const noLocation = shotStrips.some((s) => {
    const shot = s.shot_id ? shots.find((sh) => sh.id === s.shot_id) : null
    const scene = shot ? scenes.find((c) => c.id === shot.scene_id) : (s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null)
    return scene && !scene.location_id
  })

  const intCount = shotStrips.filter((s) => {
    const shot = s.shot_id ? shots.find((sh) => sh.id === s.shot_id) : null
    const scene = shot ? scenes.find((c) => c.id === shot.scene_id) : (s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null)
    return scene?.int_ext === 'INT'
  }).length
  const extCount = shotStrips.filter((s) => {
    const shot = s.shot_id ? shots.find((sh) => sh.id === s.shot_id) : null
    const scene = shot ? scenes.find((c) => c.id === shot.scene_id) : (s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null)
    return scene?.int_ext === 'EXT'
  }).length
  const dayCount = shotStrips.filter((s) => {
    const shot = s.shot_id ? shots.find((sh) => sh.id === s.shot_id) : null
    const scene = shot ? scenes.find((c) => c.id === shot.scene_id) : (s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null)
    return scene?.day_night === 'DAY'
  }).length
  const nightCount = shotStrips.filter((s) => {
    const shot = s.shot_id ? shots.find((sh) => sh.id === s.shot_id) : null
    const scene = shot ? scenes.find((c) => c.id === shot.scene_id) : (s.scene_id ? scenes.find((c) => c.id === s.scene_id) : null)
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
            <Badge variant="outline" className="text-[10px]">{shotStrips.length} shots</Badge>
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
                shots={shots}
                estimatedMinutesDefault={
                  strip.strip_type === 'SHOT' && strip.shot_id
                    ? estimatedShootMinutesByShotId.get(strip.shot_id) ?? 0
                    : undefined
                }
                onUpdateEstimatedMinutes={onUpdateStripEstimatedMinutes}
                onUpdateCallWrapTime={onUpdateCallWrapTime}
                onSendToBoneyard={onSendToBoneyard}
                onDeleteStrip={onDeleteStrip}
                disabled={isLocked}
                className={filtersActive && strip.strip_type !== 'SHOT' ? 'opacity-60' : undefined}
                isEpisodic={isEpisodic}
                episodeById={episodeById}
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
