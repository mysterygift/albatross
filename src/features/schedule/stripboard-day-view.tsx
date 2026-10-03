/**
 * Day view: one shoot day at a time as a full-width, traditional stripboard table.
 * Each unit (Main, Second, …) gets its own table. Rows are sortable within a unit,
 * and day chips above the table are drop targets for moving rows to another day.
 */
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronLeft, ChevronRight, Lock, Unlock, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  Episode,
  Location,
  Scene,
  Shot,
  ShootDay,
  ShootDayUnit,
  StripboardStrip,
  Unit,
} from '@/lib/db/types'
import type { UpdateStripData } from '@/lib/db/repositories/stripboard-strips'
import {
  DEFAULT_COLUMN_FILTER,
  filterStripsByColumnFilter,
  isColumnFilterActive,
  resolveStripShotAndScene,
  sortStripsBySortIndex,
  type ColumnFilter,
} from '@/lib/schedule/stripboardRows'
import {
  computeStripboardTotals,
  formatRuntime,
  runtimeWarningLevel,
} from '@/lib/schedule/stripboardDayTotals'
import { shootingBlocLabelFromAssociation } from '@/lib/schedule/episodicScheduleDisplay'
import { StripTableRow } from './stripboard-table-row'

type BlocById = Parameters<typeof shootingBlocLabelFromAssociation>[1]

const COLUMN_FILTER_KEYS = ['int', 'ext', 'day', 'night'] as const

export type StripboardDayViewProps = {
  /** Visible shoot days (bloc filter applied), in calendar order. */
  days: ShootDay[]
  /** The day being shown. Null when no visible day exists. */
  day: ShootDay | null
  onSelectDay: (dayId: string) => void
  dayUnitsByDayId: Map<string, ShootDayUnit[]>
  units: Unit[]
  stripsByDayUnit: Map<string, StripboardStrip[]>
  columnId: (shootDayId: string, shootDayUnitId: string) => string
  scenes: Scene[]
  shots: Shot[]
  locations: Location[]
  estimatedShootMinutesByShotId: Map<string, number>
  castPersonIdsByShotId: Map<string, string[]>
  isEpisodic?: boolean
  blocById?: BlocById
  episodeById?: Map<string, Episode>
  pageEighthsTarget: number
  columnFilters: Record<string, ColumnFilter>
  onColumnFilterChange: (colId: string, key: keyof ColumnFilter, value: boolean) => void
  onToggleLock: (shootDayUnitId: string, isLocked: boolean) => void
  onUpdateStripEstimatedMinutes: (stripId: string, minutes: number | null) => void
  onUpdateCallWrapTime: (stripId: string, time: string) => void
  onUpdateMoveStrip: (stripId: string, data: UpdateStripData) => void
  onSendToBoneyard: (strip: StripboardStrip) => void
  onDeleteStrip: (strip: StripboardStrip) => void
}

const TABLE_HEADERS = ['', 'Sc', 'Shot', 'Description', 'INT/EXT', 'D/N', 'Location', 'Pages', 'Cast', 'Est. min']

export function StripboardDayView(props: StripboardDayViewProps) {
  const { days, day, dayUnitsByDayId, stripsByDayUnit, units, onSelectDay } = props

  if (!day) {
    return (
      <div data-tutorial="stripboard-day-view" className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No shoot days to show. Add shoot days or clear the bloc filter.
      </div>
    )
  }

  const dayUnits = dayUnitsByDayId.get(day.id) ?? []
  const unitById = new Map(units.map((u) => [u.id, u]))
  const dayStrips = dayUnits.flatMap((du) => stripsByDayUnit.get(`${day.id}:${du.id}`) ?? [])
  const dayTotals = computeStripboardTotals(dayStrips, props.shots, props.scenes, props.estimatedShootMinutesByShotId)
  const dayWarning = runtimeWarningLevel(dayTotals.runtimeMinutes)
  const scheduledCallCountOnDay = dayStrips.filter((s) => s.strip_type === 'CALL').length
  const scheduledWrapCountOnDay = dayStrips.filter((s) => s.strip_type === 'WRAP').length
  const blocLabel =
    props.isEpisodic && props.blocById
      ? shootingBlocLabelFromAssociation(day.shooting_bloc_id, props.blocById)
      : null
  const headers = props.isEpisodic ? [...TABLE_HEADERS, 'Episode', ''] : [...TABLE_HEADERS, '']

  const activeIndex = days.findIndex((d) => d.id === day.id)
  const prevDay = activeIndex > 0 ? days[activeIndex - 1] : null
  const nextDay = activeIndex >= 0 && activeIndex < days.length - 1 ? days[activeIndex + 1] : null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <DayNavigator
        days={days}
        activeDayId={day.id}
        onSelectDay={onSelectDay}
        prevDayId={prevDay?.id ?? null}
        nextDayId={nextDay?.id ?? null}
        dayUnitsByDayId={dayUnitsByDayId}
        units={units}
        columnId={props.columnId}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
        <h2 className="text-lg font-semibold">{day.shoot_date}</h2>
        {day.day_number != null && <Badge variant="secondary">Day {day.day_number}</Badge>}
        {blocLabel != null && <span className="text-sm text-muted-foreground">{blocLabel}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[11px]">{dayTotals.shotCount} shots</Badge>
          <Badge variant="outline" className="text-[11px]">{dayTotals.totalEighths}/8 pgs</Badge>
          {dayTotals.intCount > 0 && <Badge variant="secondary" className="text-[11px]">INT {dayTotals.intCount}</Badge>}
          {dayTotals.extCount > 0 && <Badge variant="secondary" className="text-[11px]">EXT {dayTotals.extCount}</Badge>}
          {dayTotals.dayCount > 0 && <Badge variant="outline" className="text-[11px]">DAY {dayTotals.dayCount}</Badge>}
          {dayTotals.nightCount > 0 && <Badge variant="outline" className="text-[11px]">NIGHT {dayTotals.nightCount}</Badge>}
          <RuntimeLabel minutes={dayTotals.runtimeMinutes} level={dayWarning} prefix="Day runtime" />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4">
        {dayUnits.map((shootDayUnit) => {
          const unit = unitById.get(shootDayUnit.unit_id)
          if (!unit) return null
          const colId = props.columnId(day.id, shootDayUnit.id)
          const strips = sortStripsBySortIndex(stripsByDayUnit.get(`${day.id}:${shootDayUnit.id}`) ?? [])
          return (
            <UnitTable
              key={shootDayUnit.id}
              unitName={unit.name}
              shootDayUnit={shootDayUnit}
              colId={colId}
              strips={strips}
              headers={headers}
              isEpisodic={props.isEpisodic === true}
              scenes={props.scenes}
              shots={props.shots}
              locations={props.locations}
              episodeById={props.episodeById}
              estimatedShootMinutesByShotId={props.estimatedShootMinutesByShotId}
              castPersonIdsByShotId={props.castPersonIdsByShotId}
              pageEighthsTarget={props.pageEighthsTarget}
              columnFilter={props.columnFilters[colId] ?? DEFAULT_COLUMN_FILTER}
              onColumnFilterChange={(key, value) => props.onColumnFilterChange(colId, key, value)}
              onToggleLock={props.onToggleLock}
              scheduledCallCountOnDay={scheduledCallCountOnDay}
              scheduledWrapCountOnDay={scheduledWrapCountOnDay}
              onUpdateEstimatedMinutes={props.onUpdateStripEstimatedMinutes}
              onUpdateCallWrapTime={props.onUpdateCallWrapTime}
              onUpdateMoveStrip={props.onUpdateMoveStrip}
              onSendToBoneyard={props.onSendToBoneyard}
              onDeleteStrip={props.onDeleteStrip}
            />
          )
        })}
        {dayUnits.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            This day has no units. Add a unit to this day from the board view.
          </div>
        )}
      </div>
    </div>
  )
}

function RuntimeLabel({
  minutes,
  level,
  prefix,
}: {
  minutes: number
  level: ReturnType<typeof runtimeWarningLevel>
  prefix: string
}) {
  const text = `${prefix}: ${formatRuntime(minutes)}`
  if (level === 'over10_5') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400" title="Exceeds 10.5 hours (includes 30 min lunch allowance)">
        <AlertTriangle className="size-3.5 shrink-0" />
        {text}
      </span>
    )
  }
  return (
    <span className={`text-xs ${level === 'over10' ? 'text-amber-600/90 dark:text-amber-400/90' : 'text-muted-foreground'}`}>
      {text}
    </span>
  )
}

function DayNavigator({
  days,
  activeDayId,
  onSelectDay,
  prevDayId,
  nextDayId,
  dayUnitsByDayId,
  units,
  columnId,
}: {
  days: ShootDay[]
  activeDayId: string
  onSelectDay: (dayId: string) => void
  prevDayId: string | null
  nextDayId: string | null
  dayUnitsByDayId: Map<string, ShootDayUnit[]>
  units: Unit[]
  columnId: (shootDayId: string, shootDayUnitId: string) => string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label="Previous shoot day"
        disabled={!prevDayId}
        onClick={() => prevDayId && onSelectDay(prevDayId)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Select value={activeDayId} onValueChange={onSelectDay}>
        <SelectTrigger className="h-8 w-[220px] shrink-0" aria-label="Choose shoot day">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {days.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.shoot_date} {d.day_number != null ? `(Day ${d.day_number})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label="Next shoot day"
        disabled={!nextDayId}
        onClick={() => nextDayId && onSelectDay(nextDayId)}
      >
        <ChevronRight className="size-4" />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Shoot days. Drag a row onto a day to move it there.">
        {days.map((d) => {
          const mainDayUnit = dayUnitsByDayId.get(d.id)?.find((du) => units.some((u) => u.id === du.unit_id))
          const dropId = mainDayUnit ? columnId(d.id, mainDayUnit.id) : null
          const label = `${d.shoot_date}${d.day_number != null ? ` · D${d.day_number}` : ''}`
          if (d.id === activeDayId) {
            return (
              <span
                key={d.id}
                aria-current="date"
                className="shrink-0 rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
              >
                {label}
              </span>
            )
          }
          return (
            <DayChip
              key={d.id}
              dropId={dropId}
              label={label}
              onClick={() => onSelectDay(d.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Non-active day chip. Dropping a row here appends it to that day's first unit column. */
function DayChip({ dropId, label, onClick }: { dropId: string | null; label: string; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId ?? `day-chip:${label}`, disabled: dropId == null })
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted ${
        isOver ? 'border-primary bg-primary/15 ring-2 ring-primary/50' : 'border-border bg-card text-muted-foreground'
      }`}
    >
      {label}
    </button>
  )
}

function UnitTable({
  unitName,
  shootDayUnit,
  colId,
  strips,
  headers,
  isEpisodic,
  scenes,
  shots,
  locations,
  episodeById,
  estimatedShootMinutesByShotId,
  castPersonIdsByShotId,
  pageEighthsTarget,
  columnFilter,
  onColumnFilterChange,
  onToggleLock,
  scheduledCallCountOnDay,
  scheduledWrapCountOnDay,
  onUpdateEstimatedMinutes,
  onUpdateCallWrapTime,
  onUpdateMoveStrip,
  onSendToBoneyard,
  onDeleteStrip,
}: {
  unitName: string
  shootDayUnit: ShootDayUnit
  colId: string
  strips: StripboardStrip[]
  headers: string[]
  isEpisodic: boolean
  scenes: Scene[]
  shots: Shot[]
  locations: Location[]
  episodeById?: Map<string, Episode>
  estimatedShootMinutesByShotId: Map<string, number>
  castPersonIdsByShotId: Map<string, string[]>
  pageEighthsTarget: number
  columnFilter: ColumnFilter
  onColumnFilterChange: (key: keyof ColumnFilter, value: boolean) => void
  onToggleLock: (shootDayUnitId: string, isLocked: boolean) => void
  scheduledCallCountOnDay: number
  scheduledWrapCountOnDay: number
  onUpdateEstimatedMinutes: (stripId: string, minutes: number | null) => void
  onUpdateCallWrapTime: (stripId: string, time: string) => void
  onUpdateMoveStrip: (stripId: string, data: UpdateStripData) => void
  onSendToBoneyard: (strip: StripboardStrip) => void
  onDeleteStrip: (strip: StripboardStrip) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId })
  const isLocked = shootDayUnit.is_locked !== 0
  const filtersActive = isColumnFilterActive(columnFilter)
  const displayStrips = filterStripsByColumnFilter(strips, shots, scenes, columnFilter)
  const totals = computeStripboardTotals(strips, shots, scenes, estimatedShootMinutesByShotId)
  const warningLevel = runtimeWarningLevel(totals.runtimeMinutes)
  const overPages = totals.totalEighths > pageEighthsTarget

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          {unitName}
          {isLocked && <Lock className="size-3.5 text-muted-foreground" aria-label="Locked" />}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={isLocked ? 'Unlock' : 'Lock'}
          aria-label={isLocked ? `Unlock ${unitName}` : `Lock ${unitName}`}
          onClick={() => onToggleLock(shootDayUnit.id, !isLocked)}
        >
          {isLocked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
        </Button>
        <div className="flex flex-wrap gap-1">
          {(COLUMN_FILTER_KEYS).map((key) => (
            <Button
              key={key}
              variant={columnFilter[key] ? 'default' : 'outline'}
              size="sm"
              aria-pressed={columnFilter[key]}
              className={`h-6 rounded-full px-2 text-[10px] font-medium ${columnFilter[key] ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
              onClick={() => onColumnFilterChange(key, !columnFilter[key])}
            >
              {key.toUpperCase()}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {overPages && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="size-3" /> Over {pageEighthsTarget} eighths
            </span>
          )}
          <Badge variant="outline" className="text-[10px]">{totals.shotCount} shots</Badge>
          <Badge variant="outline" className="text-[10px]">{totals.totalEighths}/8 pgs</Badge>
          <RuntimeLabel minutes={totals.runtimeMinutes} level={warningLevel} prefix="Unit runtime" />
        </div>
      </div>

      <div
        ref={setNodeRef}
        data-dragging-over={isOver ? 'true' : undefined}
        className={`overflow-x-auto rounded-lg border transition-colors ${
          isOver ? 'border-primary bg-primary/5 ring-2 ring-primary/40' : 'border-border'
        }`}
      >
        <SortableContext
          items={displayStrips.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
          disabled={isLocked}
        >
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {headers.map((h, i) => (
                  <th key={`${h}-${i}`} scope="col" className="px-2 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayStrips.map((strip) => {
                const { scene, shot } = resolveStripShotAndScene(strip, shots, scenes)
                return (
                  <StripTableRow
                    key={strip.id}
                    strip={strip}
                    scene={scene}
                    shot={shot}
                    locations={locations}
                    estimatedMinutesDefault={
                      strip.strip_type === 'SHOT' && strip.shot_id
                        ? estimatedShootMinutesByShotId.get(strip.shot_id) ?? 0
                        : undefined
                    }
                    castCount={shot ? castPersonIdsByShotId.get(shot.id)?.length : undefined}
                    isEpisodic={isEpisodic}
                    episodeById={episodeById}
                    disabled={isLocked}
                    columnCount={headers.length}
                    scheduledCallCountOnDay={scheduledCallCountOnDay}
                    scheduledWrapCountOnDay={scheduledWrapCountOnDay}
                    onUpdateEstimatedMinutes={onUpdateEstimatedMinutes}
                    onUpdateCallWrapTime={onUpdateCallWrapTime}
                    onUpdateMoveStrip={onUpdateMoveStrip}
                    onSendToBoneyard={onSendToBoneyard}
                    onDeleteStrip={onDeleteStrip}
                  />
                )
              })}
              {displayStrips.length === 0 && (
                <tr data-droppable-placeholder>
                  <td colSpan={headers.length} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {strips.length === 0
                      ? 'Drop strips here'
                      : filtersActive
                        ? 'No strips match filter'
                        : 'No strips'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </SortableContext>
      </div>
    </section>
  )
}

/**
 * Collapsed stand-in for the Unscheduled or Boneyard drawer. It stays registered as a
 * droppable under the panel's ID, so dropping a strip on it still unschedules or boneyards it.
 */
export function CollapsedPanelRail({
  droppableId,
  label,
  side,
  onExpand,
  tone = 'primary',
}: {
  droppableId: string
  label: string
  side: 'left' | 'right'
  onExpand: () => void
  tone?: 'primary' | 'amber'
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId })
  const Chevron = side === 'left' ? ChevronRight : ChevronLeft
  const ringClass = tone === 'amber' ? 'ring-amber-500/60 border-amber-500' : 'ring-primary/50 border-primary'
  return (
    <div
      ref={setNodeRef}
      className={`flex w-12 shrink-0 flex-col items-center gap-3 rounded-lg border bg-card py-3 transition-colors ${
        isOver ? `ring-2 ${ringClass}` : 'border-border'
      }`}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label={`Expand ${label}`}
        onClick={onExpand}
      >
        <Chevron className="size-4" />
      </Button>
      <span className="text-sm font-medium [writing-mode:vertical-rl]">{label}</span>
    </div>
  )
}
