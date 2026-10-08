/**
 * Schedule Calendar — month view of shoot days and their units (one card per shoot_day_unit).
 *
 * Drag a day's header to move the whole shoot day (swap offered when the date is taken). Drag a
 * unit card to another date to move just that unit (it takes the next free rank there), or onto
 * another unit on the same day to swap their ranks. Mouse drags start after 8px; touch drags start
 * after a short press. Day Summary Drawer on click.
 */
import { PageHeader } from '@/components/page-header'
import { RequireProduction } from '@/components/require-production'
import { toast } from '@/components/ui/sonner'
import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { usePlatformDragSensors } from '@/lib/dnd/usePlatformDragSensors'
import { useCurrentProduction } from '@/features/productions/context'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { getDb } from '@/lib/db/client'
import { listCalendarShootDayEvents } from '@/lib/db/repositories/calendar'
import {
  moveShootDayToDate,
  swapShootDays,
  updateShootDay,
  listScenesByProduction,
  listShotsByProduction,
  listShootDaysByProduction,
  ensureCallWrapStripsForProduction,
} from '@/lib/db/repositories/schedule'
import {
  moveShootDayUnitToDate,
  swapShootDayUnitRanks,
  type EmptiedSourceDayAction,
  type MoveShootDayUnitResult,
} from '@/lib/db/repositories/shoot-day-unit-ranks'
import {
  CALENDAR_DATE_DROP_PREFIX,
  CALENDAR_DAY_DRAG_PREFIX,
  CALENDAR_UNIT_DRAG_PREFIX,
  CALENDAR_UNIT_DROP_PREFIX,
  resolveCalendarDrop,
  type CalendarDragItem,
  type CalendarDropTarget,
} from '@/lib/schedule/calendarDrop'
import { MAX_UNITS_PER_DAY, unitColorVars } from '@/lib/schedule/unitKey'
import { invalidateStripboardCaches, stripboardQueryKeys } from '@/features/schedule/stripboard-hooks'
import { ShootDayScriptSectionsPanel } from '@/features/schedule/shoot-day-script-sections-panel'
import { SidesBuilderSheet } from '@/features/schedule/sides-builder-sheet'
import { listSidesExportsByShootDay } from '@/lib/db/repositories/sidesExports'
import { getDocumentById } from '@/lib/db/repositories/document'
import { getFileUrl, openInSystem } from '@/lib/files'
import type { CalendarShootDayEvent } from '@/lib/db/types'
import { normalizeScheduleTimeInput } from '@/lib/schedule/time'
import { listStripsByProduction } from '@/lib/db/repositories/stripboard-strips'
import { listBookingsByProduction } from '@/lib/db/repositories/booking'
import { listCast, listCrew } from '@/lib/db/repositories/person'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import {
  getOrderedLocationStackForDayUnit,
  type OrderedLocationStackEntry,
} from '@/lib/schedule/orderedLocationStack'
import { getSetting } from '@/lib/db/repositories/settings'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import { listShootingBlocsByProduction } from '@/lib/db/repositories/shootingBlocs'
import {
  calendarShootingBlocDisplay,
  orderedDistinctEpisodeNames,
  type ShootingBlocViewFilter,
} from '@/lib/schedule/episodicScheduleDisplay'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import { getCastIdsByShotIds } from '@/lib/db/repositories/shot-cast'
import {
  ensureCallWrapStripsForProductionForActor,
  getCastIdsBySceneIdsForActor,
  getCastIdsByShotIdsForActor,
  listBookingsByProductionForActor,
  listCalendarShootDayEventsForActor,
  listCastForActor,
  listEpisodesByProductionForActor,
  listLocationsByProductionForActor,
  listScenesByProductionForActor,
  listShootDaysByProductionForActor,
  listShotsByProductionForActor,
  listShootingBlocsByProductionForActor,
  listStripsByProductionForActor,
  listCrewForActor,
  moveShootDayToDateForActor,
  moveShootDayUnitToDateForActor,
  swapShootDayUnitRanksForActor,
  swapShootDaysForActor,
  updateShootDayForActor,
} from '@/lib/access/projectDomainService'
import { getCallSheetCastRequirements } from '@/lib/call-sheets/castRequirements'
import { getCallSheetCrewRequirements } from '@/lib/call-sheets/crewRequirements'
import {
  getEffectiveCrewHierarchyOrDefault,
  getDefaultCrewHierarchyConfig,
} from '@/lib/people/crewHierarchyResolver'
import {
  getTravelSegmentsForDayUnit,
  type DayTravelSegment,
} from '@/lib/logistics/dayTravel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { AlertTriangle, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { usePhoneWidth } from '@/hooks/use-is-phone'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function toYyyyMmDd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getMonthGrid(year: number, month: number) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return {
    leadingBlanks: start.getDay(),
    daysInMonth: end.getDate(),
  }
}

/** Format call–wrap range; omit missing parts. */
function formatCallWrap(callTime: string | null, wrapTime: string | null): string {
  if (callTime && wrapTime) return `${callTime} – ${wrapTime}`
  if (callTime) return `Call ${callTime}`
  if (wrapTime) return `Wrap ${wrapTime}`
  return '—'
}

/** Format estimated runtime (minutes). */
function formatRuntime(minutes: number): string {
  if (minutes <= 0) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** Format date YYYY-MM-DD for display. */
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('default', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Format date YYYY-MM-DD as e.g. "Tue 14 Oct". */
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('default', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTravelMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const RUNTIME_WARNING_THRESHOLD_MINUTES = 630 // 10.5h
const LONG_MOVE_WARNING_THRESHOLD_MINUTES = 60
const OPENROUTESERVICE_API_KEY_SETTING = 'openrouteservice_api_key'
const defaultCrewHierarchy = getDefaultCrewHierarchyConfig()

type DaySummaryStats = {
  scenesScheduled: number
  pagesEighths: number
  shots: number
  castCalled: number
  crewBooked: number
}

type DaySummaryLocationStackEntry = OrderedLocationStackEntry

type DaySummaryLocationStack = {
  orderedLocations: DaySummaryLocationStackEntry[]
  missingLocationSceneCount: number
}

type DaySummaryWarning = {
  id: string
  message: string
}

type DayTurnaroundSummary = {
  available: boolean
  durationMinutes: number | null
  formattedDuration: string | null
  affectedCrewCount: number
  affectedCrewNames: string[]
  allCastCrewAffected: boolean
  belowThreshold: boolean
  reasonUnavailable?: string
}

function formatNamesSummary(names: string[]): string {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (unique.length === 0) return ''
  if (unique.length <= 2) return unique.join(', ')
  return `${unique.slice(0, 2).join(', ')}, +${unique.length - 2} more`
}

function getDaySummaryWarnings(args: {
  callTime: string | null
  wrapTime: string | null
  requiredButNotBookedNames: string[]
  bookedButNotRequiredNames: string[]
  missingLocationSceneCount: number
}): DaySummaryWarning[] {
  const warnings: DaySummaryWarning[] = []
  const callTime = args.callTime?.trim() ?? ''
  const wrapTime = args.wrapTime?.trim() ?? ''

  if (!callTime) warnings.push({ id: 'missing-call-time', message: 'Missing call time' })
  if (!wrapTime) warnings.push({ id: 'missing-wrap-time', message: 'Missing wrap time' })

  if (args.requiredButNotBookedNames.length > 0) {
    const names = formatNamesSummary(args.requiredButNotBookedNames)
    warnings.push({
      id: 'required-cast-not-booked',
      message: `${args.requiredButNotBookedNames.length} required cast not booked${names ? `: ${names}` : ''}`,
    })
  }

  if (args.bookedButNotRequiredNames.length > 0) {
    const names = formatNamesSummary(args.bookedButNotRequiredNames)
    warnings.push({
      id: 'booked-cast-not-required',
      message: `${args.bookedButNotRequiredNames.length} booked cast not required${names ? `: ${names}` : ''}`,
    })
  }

  if (args.missingLocationSceneCount > 0) {
    const noun = args.missingLocationSceneCount === 1 ? 'scene has' : 'scenes have'
    warnings.push({
      id: 'scheduled-scenes-missing-location',
      message: `${args.missingLocationSceneCount} scheduled ${noun} no location assigned`,
    })
  }

  return warnings
}

function formatDurationMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/**
 * Baseline turnaround model (DS5):
 * selected-day call minus previous shoot-day wrap, with 10h threshold.
 */
function getDayTurnaroundSummary(args: {
  selectedDate: string
  selectedCallTime: string | null
  previousDate: string | null
  previousWrapTime: string | null
  selectedCrewBookedIds: string[]
  previousCrewBookedIds: string[]
  selectedBookedPersonIds: string[]
  previousBookedPersonIds: string[]
  crewById: Map<string, { name: string }>
  thresholdMinutes: number
}): DayTurnaroundSummary {
  const callTime = args.selectedCallTime?.trim() ?? ''
  if (!callTime) {
    return {
      available: false,
      durationMinutes: null,
      formattedDuration: null,
      affectedCrewCount: 0,
      affectedCrewNames: [],
      allCastCrewAffected: false,
      belowThreshold: false,
      reasonUnavailable: 'Turnaround unavailable: missing call time.',
    }
  }

  if (!args.previousDate) {
    return {
      available: false,
      durationMinutes: null,
      formattedDuration: null,
      affectedCrewCount: 0,
      affectedCrewNames: [],
      allCastCrewAffected: false,
      belowThreshold: false,
      reasonUnavailable: 'Turnaround unavailable for this day.',
    }
  }

  const wrapTime = args.previousWrapTime?.trim() ?? ''
  if (!wrapTime) {
    return {
      available: false,
      durationMinutes: null,
      formattedDuration: null,
      affectedCrewCount: 0,
      affectedCrewNames: [],
      allCastCrewAffected: false,
      belowThreshold: false,
      reasonUnavailable: 'Turnaround unavailable: missing previous wrap time.',
    }
  }

  const prevWrap = new Date(`${args.previousDate}T${wrapTime}:00`)
  const selectedCall = new Date(`${args.selectedDate}T${callTime}:00`)
  const diffMinutes = Math.round((selectedCall.getTime() - prevWrap.getTime()) / 60000)
  if (!Number.isFinite(diffMinutes) || diffMinutes < 0) {
    return {
      available: false,
      durationMinutes: null,
      formattedDuration: null,
      affectedCrewCount: 0,
      affectedCrewNames: [],
      allCastCrewAffected: false,
      belowThreshold: false,
      reasonUnavailable: 'Turnaround unavailable for this day.',
    }
  }

  const prevSet = new Set(args.previousCrewBookedIds)
  const overlapIds = [...new Set(args.selectedCrewBookedIds)].filter((id) => prevSet.has(id))
  const affectedCrewNames = overlapIds
    .map((id) => args.crewById.get(id)?.name?.trim() ?? '')
    .filter(Boolean)
  const selectedBooked = [...new Set(args.selectedBookedPersonIds)]
  const previousBookedSet = new Set(args.previousBookedPersonIds)
  const allBookedOverlapCount = selectedBooked.filter((id) => previousBookedSet.has(id)).length
  const allCastCrewAffected = selectedBooked.length > 0 && allBookedOverlapCount === selectedBooked.length

  return {
    available: true,
    durationMinutes: diffMinutes,
    formattedDuration: formatDurationMinutes(diffMinutes),
    affectedCrewCount: overlapIds.length,
    affectedCrewNames,
    allCastCrewAffected,
    belowThreshold: diffMinutes < args.thresholdMinutes,
  }
}

/** Exported for episodic schedule UI tests. */
export function CalendarEventCardBody({
  event,
  onClick,
  isOverlay,
  isEpisodic,
}: {
  event: CalendarShootDayEvent
  onClick: () => void
  isOverlay?: boolean
  isEpisodic?: boolean
}) {
  const colors = unitColorVars(event.unitKey)

  return (
    <div
      data-slot="calendar-event"
      role={isOverlay ? undefined : 'button'}
      tabIndex={isOverlay ? undefined : 0}
      onClick={onClick}
      onKeyDown={(e) => !isOverlay && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      className={cn(
        'rounded-md px-1.5 py-1 text-left text-xs transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
        !isOverlay && 'cursor-pointer flex-1 min-w-0'
      )}
      style={{
        backgroundColor: colors.background,
        color: colors.foreground,
      }}
    >
      <div className="font-medium">{event.unitName}</div>
      {isEpisodic && (
        <div className="mt-0.5 text-[10px] font-medium opacity-95 truncate" title={calendarShootingBlocDisplay(event.shootingBlocId, event.shootingBlocName)}>
          {calendarShootingBlocDisplay(event.shootingBlocId, event.shootingBlocName)}
        </div>
      )}
      <div className="mt-0.5 opacity-90">
        {formatCallWrap(event.callTime, event.wrapTime)}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 opacity-90">
        <span>{formatRuntime(event.estMinutes)}</span>
        <span>{event.primaryLocationName ?? '—'}</span>
        <span>{event.shotCount} shots</span>
      </div>
    </div>
  )
}

function DraggableUnitCard({
  event,
  onClick,
  isEpisodic,
  isMoving,
}: {
  event: CalendarShootDayEvent
  onClick: () => void
  isEpisodic?: boolean
  isMoving?: boolean
}) {
  const dragItem: CalendarDragItem = {
    kind: 'unit',
    shootDayUnitId: event.shootDayUnitId,
    shootDayId: event.shootDayId,
    date: event.date,
  }
  const { listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `${CALENDAR_UNIT_DRAG_PREFIX}${event.shootDayUnitId}`,
    data: dragItem,
  })
  const dropTarget: CalendarDropTarget = {
    kind: 'unit',
    shootDayUnitId: event.shootDayUnitId,
    shootDayId: event.shootDayId,
    date: event.date,
  }
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${CALENDAR_UNIT_DROP_PREFIX}${event.shootDayUnitId}`,
    data: dropTarget,
  })
  return (
    <div
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      {...listeners}
      data-calendar-unit={event.shootDayUnitId}
      className={cn(
        'flex items-stretch gap-0.5 rounded-md cursor-grab active:cursor-grabbing select-none [-webkit-touch-callout:none]',
        isDragging && 'opacity-40',
        isMoving && 'animate-pulse',
        isOver && !isDragging && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
      )}
      title="Drag to another date to move this unit, or onto another unit on this day to swap"
    >
      <div
        className="flex items-center shrink-0 px-0.5 text-muted-foreground"
        aria-hidden
      >
        <GripVertical className="size-3.5" />
      </div>
      <CalendarEventCardBody event={event} onClick={onClick} isOverlay={false} isEpisodic={isEpisodic} />
    </div>
  )
}

/** One shoot day in a date cell: a draggable header (moves the whole day) above its unit cards. */
function ShootDayBlock({
  shootDayId,
  date,
  dayNumber,
  unitCount,
  children,
}: {
  shootDayId: string
  date: string
  dayNumber: number | null
  unitCount: number
  children: ReactNode
}) {
  const dragItem: CalendarDragItem = { kind: 'day', shootDayId, date }
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `${CALENDAR_DAY_DRAG_PREFIX}${shootDayId}`,
    data: dragItem,
  })
  const label = dayNumber != null ? `Day ${dayNumber}` : 'Shoot day'
  return (
    <div
      data-calendar-day={shootDayId}
      className={cn(
        'mt-1 space-y-1 rounded-md border border-dashed border-border/70 p-1',
        isDragging && 'opacity-40'
      )}
    >
      <div
        ref={setNodeRef}
        {...listeners}
        className="flex items-center gap-1 rounded px-0.5 text-[11px] font-medium text-muted-foreground cursor-grab active:cursor-grabbing select-none hover:text-foreground [-webkit-touch-callout:none]"
        title="Drag to move the whole shoot day"
        aria-label={`${label}: drag to move the whole shoot day`}
      >
        <GripVertical className="size-3.5 shrink-0" aria-hidden />
        <span>{label}</span>
        <span className="ml-auto opacity-80">
          {unitCount}/{MAX_UNITS_PER_DAY}
        </span>
      </div>
      {children}
    </div>
  )
}

function DroppableDayCell({
  dateStr,
  children,
}: {
  dateStr: string
  children: ReactNode
}) {
  const dropTarget: CalendarDropTarget = { kind: 'date', date: dateStr }
  const { setNodeRef, isOver } = useDroppable({ id: `${CALENDAR_DATE_DROP_PREFIX}${dateStr}`, data: dropTarget })
  return (
    <div
      ref={setNodeRef}
      data-calendar-date={dateStr}
      className={cn(
        'min-h-[100px] rounded border border-border bg-card/30 p-2 text-left',
        isOver && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background'
      )}
    >
      {children}
    </div>
  )
}

/** Short weekday initials for the phone month grid. */
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

/**
 * Phone month grid cell: the date and a dot per unit shooting that day. It is a drop target like the
 * desktop cell, so a card dragged from the list below can be rescheduled onto it.
 */
function CompactDayCell({
  dateStr,
  day,
  events,
  isToday,
  onSelect,
}: {
  dateStr: string
  day: number
  events: CalendarShootDayEvent[]
  isToday: boolean
  onSelect: () => void
}) {
  const dropTarget: CalendarDropTarget = { kind: 'date', date: dateStr }
  const { setNodeRef, isOver } = useDroppable({ id: `${CALENDAR_DATE_DROP_PREFIX}${dateStr}`, data: dropTarget })
  const label = events.length > 0 ? `${day}, ${events.length} shoot ${events.length === 1 ? 'unit' : 'units'}` : `${day}`
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={label}
      disabled={events.length === 0}
      onClick={onSelect}
      className={cn(
        'flex h-12 flex-col items-center justify-center gap-1 rounded-md border text-sm',
        events.length > 0 ? 'border-border bg-card font-semibold text-foreground' : 'border-transparent text-muted-foreground',
        isToday && 'ring-1 ring-primary',
        isOver && 'ring-2 ring-primary/60'
      )}
    >
      {day}
      <span className="flex h-1.5 gap-0.5" aria-hidden>
        {events.map((e) => (
          <span
            key={e.shootDayUnitId}
            className="size-1.5 rounded-full"
            style={{ backgroundColor: unitColorVars(e.unitKey).background }}
          />
        ))}
      </span>
    </button>
  )
}

/**
 * Calendar on a phone. Seven ~55pt columns are too narrow for event cards, so the month is a compact
 * grid of dates with unit dots (tap a date to jump to it), and the month's shoot days are listed
 * underneath at full width, as the same day blocks the desktop grid uses: drag a day's header or a unit
 * onto a date in the grid to move it, or a unit onto another unit of its day to swap them.
 */
function PhoneMonthCalendar({
  year,
  month,
  leadingBlanks,
  daysInMonth,
  monthLabel,
  eventsByDate,
  renderShootDays,
}: {
  year: number
  month: number
  leadingBlanks: number
  daysInMonth: number
  monthLabel: string
  eventsByDate: Map<string, CalendarShootDayEvent[]>
  /** The date's shoot day blocks (draggable header plus unit cards), shared with the desktop grid. */
  renderShootDays: (dateStr: string) => ReactNode
}) {
  const now = new Date()
  const todayStr = toYyyyMmDd(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const datesWithEvents = days
    .map((day) => toYyyyMmDd(year, month, day))
    .filter((dateStr) => (eventsByDate.get(dateStr)?.length ?? 0) > 0)

  const jumpTo = (dateStr: string) => {
    document.getElementById(`calendar-agenda-${dateStr}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-4" data-slot="phone-calendar">
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_INITIALS.map((label, i) => (
          <div key={i} className="py-1 text-xs font-medium text-muted-foreground" aria-hidden>
            {label}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((day) => {
          const dateStr = toYyyyMmDd(year, month, day)
          return (
            <CompactDayCell
              key={day}
              dateStr={dateStr}
              day={day}
              events={eventsByDate.get(dateStr) ?? []}
              isToday={dateStr === todayStr}
              onSelect={() => jumpTo(dateStr)}
            />
          )
        })}
      </div>

      <section aria-label={`Shoot days in ${monthLabel}`} className="space-y-4">
        {datesWithEvents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No shoot days in {monthLabel}.
          </p>
        ) : (
          datesWithEvents.map((dateStr) => {
            const [y, m, d] = dateStr.split('-').map(Number)
            const heading = new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
            })
            return (
              <div key={dateStr} id={`calendar-agenda-${dateStr}`} className="scroll-mt-4 space-y-1.5">
                <h3 className={cn('text-sm font-semibold', dateStr === todayStr ? 'text-primary' : 'text-foreground')}>
                  {heading}
                  {dateStr === todayStr && <span className="ml-2 text-xs font-medium">Today</span>}
                </h3>
                <div className="space-y-1.5 [&_[data-slot=calendar-event]]:px-3 [&_[data-slot=calendar-event]]:py-2 [&_[data-slot=calendar-event]]:text-sm">
                  {renderShootDays(dateStr)}
                </div>
              </div>
            )
          })
        )}
      </section>
    </div>
  )
}

/**
 * Prefer the unit card under the pointer (swap within a day), then the date cell under it. A day
 * drag only targets date cells, and a unit is never its own target. Falls back to rectangle
 * overlap when the pointer is between cells.
 */
const calendarCollisionDetection: CollisionDetection = (args) => {
  const item = args.active.data.current as CalendarDragItem | undefined
  const droppableContainers = args.droppableContainers.filter((container) => {
    const target = container.data.current as CalendarDropTarget | undefined
    if (!target) return false
    if (target.kind === 'date') return true
    return item?.kind === 'unit' && target.shootDayUnitId !== item.shootDayUnitId
  })
  const pointerHits = pointerWithin({ ...args, droppableContainers })
  if (pointerHits.length > 0) {
    const unitHit = pointerHits.find((hit) => String(hit.id).startsWith(CALENDAR_UNIT_DROP_PREFIX))
    return [unitHit ?? pointerHits[0]!]
  }
  return rectIntersection({
    ...args,
    droppableContainers: droppableContainers.filter((c) => String(c.id).startsWith(CALENDAR_DATE_DROP_PREFIX)),
  })
}

function ShootDaySidesExportsList({ shootDayId }: { shootDayId: string }) {
  const { data: exports = [] } = useQuery({
    queryKey: ['sides-exports', shootDayId],
    queryFn: () => listSidesExportsByShootDay(shootDayId),
    enabled: !!shootDayId,
  })

  if (exports.length === 0) return null

  const openPdf = async (documentId: string | null) => {
    if (!documentId) return
    const doc = await getDocumentById(documentId)
    if (!doc?.file_path) return
    const url = await getFileUrl(doc.file_path)
    await openInSystem(url)
  }

  return (
    <ul className="mt-2 space-y-1">
      {exports.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{row.export_label ?? 'Sides export'}</span>
          {row.document_id && (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openPdf(row.document_id)}>
              Open PDF
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function DaySummaryDrawer({
  event,
  open,
  onOpenChange,
  onSaveEdits,
  isSaving,
  stats,
  locationStack,
  warnings,
  turnaround,
  orsApiKeySetting,
  isEpisodic,
  shootingBlocDisplay,
  episodesOnUnitSummary,
  unitsOnDay,
  isUnitActionPending,
  onSwapWithUnit,
  onMoveUnitToDate,
}: {
  event: CalendarShootDayEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveEdits: (payload: {
    shootDayId: string
    callTime: string | null
    wrapTime: string | null
    notes: string | null
  }) => Promise<void>
  isSaving: boolean
  stats: DaySummaryStats
  locationStack: DaySummaryLocationStack
  warnings: DaySummaryWarning[]
  turnaround: DayTurnaroundSummary
  orsApiKeySetting: string
  isEpisodic?: boolean
  shootingBlocDisplay?: string | null
  /** Comma-separated episode names for scheduled material on this unit, or "—". */
  episodesOnUnitSummary?: string | null
  /** Every unit on the selected event's shoot day, Main Unit first (the selected one included). */
  unitsOnDay: CalendarShootDayEvent[]
  isUnitActionPending: boolean
  /** Swap ranks with another unit on the same day. */
  onSwapWithUnit: (otherShootDayUnitId: string) => void
  onMoveUnitToDate: (targetDate: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [sidesBuilderOpen, setSidesBuilderOpen] = useState(false)
  const [callTimeInput, setCallTimeInput] = useState('')
  const [wrapTimeInput, setWrapTimeInput] = useState('')
  const [notesInput, setNotesInput] = useState('')
  const [callTimeError, setCallTimeError] = useState<string | null>(null)
  const [wrapTimeError, setWrapTimeError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [travelSegments, setTravelSegments] = useState<DayTravelSegment[]>([])
  const [isTravelLoading, setIsTravelLoading] = useState(false)
  const [travelRefreshTick, setTravelRefreshTick] = useState(0)
  const [moveUnitDate, setMoveUnitDate] = useState('')

  useEffect(() => {
    if (!event) return
    queueMicrotask(() => {
      setCallTimeInput(event.callTime ?? '')
      setWrapTimeInput(event.wrapTime ?? '')
      setNotesInput(event.notes ?? '')
      setCallTimeError(null)
      setWrapTimeError(null)
      setSaveError(null)
      setIsEditing(false)
      setMoveUnitDate('')
    })
  }, [event?.shootDayUnitId, open])

  useEffect(() => {
    let cancelled = false
    const orderedLocations = locationStack.orderedLocations
    if (!event || orderedLocations.length < 2) {
      queueMicrotask(() => {
        setTravelSegments([])
        setIsTravelLoading(false)
      })
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => setIsTravelLoading(true))
    void getTravelSegmentsForDayUnit(
      orderedLocations.map((location) => ({
        id: location.locationId,
        name: location.name,
        address: location.address,
        lat: location.lat,
        lng: location.lng,
      })),
      { orsApiKey: orsApiKeySetting }
    )
      .then((segments) => {
        if (cancelled) return
        setTravelSegments(segments)
      })
      .catch(() => {
        if (cancelled) return
        setTravelSegments([])
      })
      .finally(() => {
        if (cancelled) return
        setIsTravelLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [event?.shootDayUnitId, locationStack.orderedLocations, travelRefreshTick, orsApiKeySetting])

  const totalTravelMinutes = useMemo(() => {
    const valid = travelSegments
      .map((segment) => segment.travelMinutes)
      .filter((minutes): minutes is number => minutes != null)
    if (valid.length === 0) return null
    return valid.reduce((sum, minutes) => sum + minutes, 0)
  }, [travelSegments])

  const hasLongMove = useMemo(
    () =>
      travelSegments.some(
        (segment) =>
          typeof segment.travelMinutes === 'number' &&
          segment.travelMinutes >= LONG_MOVE_WARNING_THRESHOLD_MINUTES
      ),
    [travelSegments]
  )

  if (!event) return null

  const runtimeWarning = event.estMinutes > RUNTIME_WARNING_THRESHOLD_MINUTES
  const unitColor = unitColorVars(event.unitKey).background

  const resetEdits = () => {
    setCallTimeInput(event.callTime ?? '')
    setWrapTimeInput(event.wrapTime ?? '')
    setNotesInput(event.notes ?? '')
    setCallTimeError(null)
    setWrapTimeError(null)
    setSaveError(null)
    setIsEditing(false)
  }

  const canRefreshTravel = locationStack.orderedLocations.length >= 2

  const handleSave = async () => {
    setCallTimeError(null)
    setWrapTimeError(null)
    setSaveError(null)

    const rawCall = callTimeInput.trim()
    const rawWrap = wrapTimeInput.trim()
    const normalizedCall = normalizeScheduleTimeInput(rawCall)
    const normalizedWrap = normalizeScheduleTimeInput(rawWrap)

    let hasError = false
    if (rawCall && !normalizedCall) {
      setCallTimeError('Enter time as HH:MM')
      hasError = true
    }
    if (rawWrap && !normalizedWrap) {
      setWrapTimeError('Enter time as HH:MM')
      hasError = true
    }
    if (hasError) return

    try {
      await onSaveEdits({
        shootDayId: event.shootDayId,
        callTime: normalizedCall,
        wrapTime: normalizedWrap,
        notes: notesInput.trim() ? notesInput.trim() : null,
      })
      setIsEditing(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed. Try again.'
      setSaveError(message)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        variant="floating"
        className="w-[420px]"
      >
        <SheetHeader className="px-7 pt-6 pb-3">
          <div className="pr-8">
            <SheetTitle className="text-foreground text-lg font-semibold leading-tight">
              {formatDateLabel(event.date)}
            </SheetTitle>
            <p
              className="mt-2 font-medium text-sm"
              style={{ color: unitColor }}
            >
              {event.unitName}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span data-slot="calendar-tag" className="rounded-md bg-muted/80 px-2 py-0.5 text-muted-foreground text-xs">
                {event.shotCount} shots
              </span>
              <span data-slot="calendar-tag" className="rounded-md bg-muted/80 px-2 py-0.5 text-muted-foreground text-xs">
                {formatRuntime(event.estMinutes)}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {!isEditing ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                    Edit day details
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTravelRefreshTick((tick) => tick + 1)}
                    disabled={!canRefreshTravel || isTravelLoading}
                  >
                    {isTravelLoading ? 'Refreshing travel…' : 'Refresh travel times'}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetEdits} disabled={isSaving}>
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-7 py-4">
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 p-3" data-slot="calendar-unit-controls">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Unit
              </p>
              {unitsOnDay.length > 1 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Make this unit the</span>
                  <Select
                    value={event.shootDayUnitId}
                    onValueChange={(shootDayUnitId) => {
                      if (shootDayUnitId !== event.shootDayUnitId) onSwapWithUnit(shootDayUnitId)
                    }}
                    disabled={isUnitActionPending}
                  >
                    <SelectTrigger className="h-8 w-[160px]" aria-label="Unit rank on this day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitsOnDay.map((unit) => (
                        <SelectItem key={unit.shootDayUnitId} value={unit.shootDayUnitId}>
                          {unit.unitName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={moveUnitDate}
                  onChange={(e) => setMoveUnitDate(e.target.value)}
                  className="h-8 w-[170px]"
                  aria-label="Move this unit to date"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!moveUnitDate || moveUnitDate === event.date || isUnitActionPending}
                  onClick={() => onMoveUnitToDate(moveUnitDate)}
                >
                  Move unit to date
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A unit moved onto a day that already has a Main Unit becomes its next unit (Second, Third…), up to{' '}
                {MAX_UNITS_PER_DAY} per day.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {isEpisodic && (
                <>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Shooting bloc
                    </p>
                    <p className="text-foreground mt-0.5 text-sm">
                      {shootingBlocDisplay ?? '—'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      Episodes (this unit)
                    </p>
                    <p className="text-foreground mt-0.5 text-sm">
                      {episodesOnUnitSummary ?? '—'}
                    </p>
                  </div>
                </>
              )}
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Call time
                </p>
                {isEditing ? (
                  <>
                    <Input
                      value={callTimeInput}
                      onChange={(e) => {
                        setCallTimeInput(e.target.value)
                        if (callTimeError) setCallTimeError(null)
                      }}
                      placeholder="HH:MM"
                      className="mt-1 h-8"
                    />
                    {callTimeError && <p className="mt-1 text-xs text-destructive">{callTimeError}</p>}
                  </>
                ) : (
                  <p className="text-foreground mt-0.5 text-sm">
                    {event.callTime ?? '—'}
                  </p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Lunch
                </p>
                <p className="text-foreground mt-0.5 text-sm">
                  {event.lunchTime ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Wrap time
                </p>
                {isEditing ? (
                  <>
                    <Input
                      value={wrapTimeInput}
                      onChange={(e) => {
                        setWrapTimeInput(e.target.value)
                        if (wrapTimeError) setWrapTimeError(null)
                      }}
                      placeholder="HH:MM"
                      className="mt-1 h-8"
                    />
                    {wrapTimeError && <p className="mt-1 text-xs text-destructive">{wrapTimeError}</p>}
                  </>
                ) : (
                  <p className="text-foreground mt-0.5 text-sm">
                    {event.wrapTime ?? '—'}
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Notes
                </p>
                {isEditing ? (
                  <Textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Add notes"
                    className="mt-1 min-h-[84px] resize-y"
                  />
                ) : (
                  <p className="text-foreground mt-0.5 text-sm whitespace-pre-wrap">
                    {event.notes?.trim() ? event.notes : '—'}
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Location
                </p>
                <p className="text-foreground mt-0.5 text-sm">
                  {event.primaryLocationName ?? '—'}
                </p>
              </div>
            </div>

            {saveError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {saveError}
              </p>
            )}

            {runtimeWarning && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400 text-xs">
                Estimated runtime over 10h 30min. Consider splitting the day.
              </p>
            )}

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Work Summary
              </p>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Scenes scheduled</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">{stats.scenesScheduled}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Pages</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">{stats.pagesEighths}/8</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Shots</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">{stats.shots}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                People Summary
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Cast called</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">{stats.castCalled}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Crew booked</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">{stats.crewBooked}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Location Stack
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Locations</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">
                    {locationStack.orderedLocations.length}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Moves</p>
                  <p className="text-foreground mt-0.5 text-sm font-medium">
                    {Math.max(locationStack.orderedLocations.length - 1, 0)}
                  </p>
                </div>
              </div>
              {locationStack.orderedLocations.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  No locations are associated with the scheduled material for this day.
                </p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {locationStack.orderedLocations.map((location, index) => (
                    <li key={location.locationId} className="space-y-2">
                      <div className="rounded-md border border-border/50 px-2.5 py-2">
                        <p className="text-foreground text-sm font-medium">
                          {index + 1}. {location.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {location.address?.trim() ? location.address : 'Address missing'}
                        </p>
                      </div>
                      {index < locationStack.orderedLocations.length - 1 && (
                        <p className="px-1 text-xs text-muted-foreground">
                          {isTravelLoading
                            ? '↓ Loading travel time…'
                            : travelSegments[index]?.travelMinutes != null
                              ? `↓ ${formatTravelMinutes(travelSegments[index]!.travelMinutes!)} drive`
                              : '↓ Travel time unavailable'}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {locationStack.orderedLocations.length > 1 && !isTravelLoading && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {totalTravelMinutes != null
                    ? `Total travel time: ${formatTravelMinutes(totalTravelMinutes)}`
                    : 'Total travel time unavailable'}
                </p>
              )}
              {locationStack.orderedLocations.length > 1 && isTravelLoading && (
                <p className="mt-2 text-xs text-muted-foreground">Total travel time: loading…</p>
              )}
              {!isTravelLoading && hasLongMove && (
                <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-medium">Long move between locations</span> (1h+)
                </p>
              )}
              {locationStack.missingLocationSceneCount > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Some scheduled material has no location assigned.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Warnings
              </p>
              {warnings.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No schedule warnings for this day.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {warnings.map((warning) => (
                    <li
                      key={warning.id}
                      className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {warning.message}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Turnaround
              </p>
              {!turnaround.available ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {turnaround.reasonUnavailable ?? 'Turnaround unavailable for this day.'}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-muted-foreground text-xs">Shortest turnaround</p>
                    <p className="text-foreground mt-0.5 text-sm font-medium">
                      {turnaround.formattedDuration}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Affected crew</p>
                    <p className="text-foreground mt-0.5 text-sm font-medium">
                      {turnaround.allCastCrewAffected
                        ? 'All Cast/Crew'
                        : `${turnaround.affectedCrewCount}${turnaround.affectedCrewNames.length > 0
                        ? `: ${formatNamesSummary(turnaround.affectedCrewNames)}`
                        : ''}`}
                    </p>
                  </div>
                  {turnaround.belowThreshold && (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                      Below 10h recommended turnaround
                    </p>
                  )}
                </div>
              )}
            </div>

            <ShootDayScriptSectionsPanel
              shootDayId={event.shootDayId}
              shootDayUnitId={event.shootDayUnitId}
            />

            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Sides
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSidesBuilderOpen(true)}
                >
                  Open Sides Builder
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Assemble, filter, and review script sections for this day before export.
              </p>
              <ShootDaySidesExportsList shootDayId={event.shootDayId} />
            </div>

            <SidesBuilderSheet
              open={sidesBuilderOpen}
              onOpenChange={setSidesBuilderOpen}
              shootDayId={event.shootDayId}
              shootDayUnitId={event.shootDayUnitId}
              shootDate={event.date}
              unitName={event.unitName}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ScheduleCalendarPage() {
  const queryClient = useQueryClient()
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const authSession = useAuthSession()
  const isEpisodicProduction = currentProduction?.is_episodic === true
  const [viewDate, setViewDate] = useState(() => new Date())
  // iPhone held upright: compact month grid plus a list of the month's shoot days (see PhoneMonthCalendar).
  const phoneWidth = usePhoneWidth()
  const [calendarBlocFilter, setCalendarBlocFilter] = useState<ShootingBlocViewFilter>('all')
  const [selectedEvent, setSelectedEvent] = useState<CalendarShootDayEvent | null>(null)

  useEffect(() => {
    setCalendarBlocFilter('all')
  }, [currentProductionId])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [activeDrag, setActiveDrag] = useState<
    | { kind: 'unit'; event: CalendarShootDayEvent }
    | { kind: 'day'; shootDayId: string; events: CalendarShootDayEvent[] }
    | null
  >(null)
  const [conflictModal, setConflictModal] = useState<{
    sourceShootDayId: string
    existingShootDayId: string
  } | null>(null)
  /** A unit drop that would leave its shoot day with no units: ask what happens to that day. */
  const [emptySourceModal, setEmptySourceModal] = useState<{
    shootDayUnitId: string
    targetDate: string
    unitName: string
    sourceDate: string
    sourceDayLabel: string
    closeDrawerOnSuccess: boolean
  } | null>(null)


  const invalidateScheduleQueries = () => {
    void invalidateStripboardCaches(queryClient, currentProductionId)
  }

  // Mouse: drag after moving 8px so a click still opens the Day Summary. Touch: press briefly, then
  // drag, so a tap opens the Day Summary and a quick swipe still scrolls the page.
  const sensors = useSensors(
    ...usePlatformDragSensors(8)
  )

  const moveMutation = useMutation({
    mutationFn: async (vars: { shootDayId: string; newDate: string }) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return moveShootDayToDateForActor({
          db,
          actor: authSession.currentUser,
          shootDayId: vars.shootDayId,
          newDate: vars.newDate,
        })
      }
      return moveShootDayToDate(vars.shootDayId, vars.newDate)
    },
  })
  const moveUnitMutation = useMutation({
    mutationFn: async (vars: {
      shootDayUnitId: string
      targetDate: string
      emptiedSourceDay?: EmptiedSourceDayAction
    }): Promise<MoveShootDayUnitResult> => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return moveShootDayUnitToDateForActor({ db, actor: authSession.currentUser, data: vars })
      }
      return moveShootDayUnitToDate(vars)
    },
  })
  const swapUnitsMutation = useMutation({
    mutationFn: async (vars: { shootDayUnitIdA: string; shootDayUnitIdB: string }) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return swapShootDayUnitRanksForActor({ db, actor: authSession.currentUser, ...vars })
      }
      return swapShootDayUnitRanks(vars.shootDayUnitIdA, vars.shootDayUnitIdB)
    },
  })
  const isUnitActionPending = moveUnitMutation.isPending || swapUnitsMutation.isPending
  const ensureCallWrapStripsMutation = useMutation({
    mutationFn: async (productionId: string) => {
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        await ensureCallWrapStripsForProductionForActor({ db, actor: authSession.currentUser, productionId })
      } else {
        await ensureCallWrapStripsForProduction(productionId)
      }
    },
    onSuccess: () => {
      invalidateScheduleQueries()
    },
    onError: () => {
      toast.error('Could not complete schedule migration check.')
    },
  })
  const updateDaySummaryMutation = useMutation({
    mutationFn: (vars: {
      shootDayId: string
      callTime: string | null
      wrapTime: string | null
      notes: string | null
    }) => {
      if (authSession.authSupported && authSession.currentUser) {
        return getDb().then((db) =>
          updateShootDayForActor({
            db,
            actor: authSession.currentUser!,
            shootDayId: vars.shootDayId,
            data: {
              call_time: vars.callTime,
              wrap_time: vars.wrapTime,
              notes: vars.notes,
            },
          })
        )
      }
      return updateShootDay(vars.shootDayId, {
        call_time: vars.callTime,
        wrap_time: vars.wrapTime,
        notes: vars.notes,
      })
    },
  })

  const unitMoveErrorMessage = (error: unknown): string => {
    const message = error instanceof Error ? error.message : ''
    if (message === 'TARGET_DAY_FULL') return `That shoot day already has ${MAX_UNITS_PER_DAY} units.`
    if (message === 'SHOOT_DAY_UNIT_NOT_FOUND') return 'That unit is no longer on the schedule.'
    return 'Move failed.'
  }

  const moveUnit = (
    vars: { shootDayUnitId: string; targetDate: string; emptiedSourceDay?: EmptiedSourceDayAction },
    options: { closeDrawerOnSuccess?: boolean } = {}
  ) => {
    if (isUnitActionPending) return
    const moving = events.find((e) => e.shootDayUnitId === vars.shootDayUnitId)
    moveUnitMutation
      .mutateAsync(vars)
      .then((result) => {
        if (result.status === 'unchanged') return
        if (result.status === 'needs_source_decision') {
          const dayNumber = shootDays.find((d) => d.id === result.sourceShootDayId)?.day_number ?? null
          setEmptySourceModal({
            shootDayUnitId: vars.shootDayUnitId,
            targetDate: vars.targetDate,
            unitName: moving?.unitName ?? 'This unit',
            sourceDate: moving?.date ?? '',
            sourceDayLabel: dayNumber != null ? `Day ${dayNumber}` : 'its shoot day',
            closeDrawerOnSuccess: options.closeDrawerOnSuccess === true,
          })
          return
        }
        invalidateScheduleQueries()
        if (options.closeDrawerOnSuccess) setDrawerOpen(false)
        const when = formatShortDate(vars.targetDate)
        toast.success(
          result.movedWholeDay
            ? `Shoot day moved to ${when}.`
            : `${moving?.unitName ?? 'Unit'} moved to ${when} as ${result.unitName}.`
        )
      })
      .catch((error) => toast.error(unitMoveErrorMessage(error)))
  }

  const swapUnits = (shootDayUnitIdA: string, shootDayUnitIdB: string) => {
    if (isUnitActionPending) return
    const a = events.find((e) => e.shootDayUnitId === shootDayUnitIdA)
    const b = events.find((e) => e.shootDayUnitId === shootDayUnitIdB)
    swapUnitsMutation
      .mutateAsync({ shootDayUnitIdA, shootDayUnitIdB })
      .then(() => {
        invalidateScheduleQueries()
        if (a && b) toast.success(`${a.unitName} is now ${b.unitName}.`)
      })
      .catch(() => toast.error('Could not swap units.'))
  }

  const moveDay = (shootDayId: string, targetDate: string) => {
    if (moveMutation.isPending) return
    const variables = { shootDayId, newDate: targetDate }
    moveMutation.mutateAsync(variables).then((result) => {
      if (result.success) {
        invalidateScheduleQueries()
      } else if ('existingShootDayId' in result && result.existingShootDayId) {
        setConflictModal({
          sourceShootDayId: variables.shootDayId,
          existingShootDayId: result.existingShootDayId,
        })
      } else {
        toast.error('A shoot already exists on that date.')
      }
    }).catch(() => toast.error('Move failed.'))
  }

  const handleDragStart = (ev: DragStartEvent) => {
    const item = ev.active.data.current as CalendarDragItem | undefined
    if (item?.kind === 'unit') {
      const found = events.find((e) => e.shootDayUnitId === item.shootDayUnitId)
      setActiveDrag(found ? { kind: 'unit', event: found } : null)
    } else if (item?.kind === 'day') {
      setActiveDrag({
        kind: 'day',
        shootDayId: item.shootDayId,
        events: events.filter((e) => e.shootDayId === item.shootDayId),
      })
    } else {
      setActiveDrag(null)
    }
  }

  const handleDragEnd = (ev: DragEndEvent) => {
    setActiveDrag(null)
    const item = ev.active.data.current as CalendarDragItem | undefined
    const target = ev.over?.data.current as CalendarDropTarget | undefined
    if (!item || !target) return
    const action = resolveCalendarDrop(item, target, (date) => eventsByDate.get(date)?.length ?? 0)
    switch (action.type) {
      case 'move-day':
        moveDay(action.shootDayId, action.targetDate)
        break
      case 'move-unit':
        moveUnit({ shootDayUnitId: action.shootDayUnitId, targetDate: action.targetDate })
        break
      case 'swap-units':
        swapUnits(action.shootDayUnitIdA, action.shootDayUnitIdB)
        break
      case 'reject':
        toast.error(`That shoot day already has ${MAX_UNITS_PER_DAY} units.`)
        break
      case 'none':
        break
    }
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  const dateRange = useMemo(() => {
    const start = toYyyyMmDd(year, month, 1)
    const end = toYyyyMmDd(year, month, new Date(year, month + 1, 0).getDate())
    return { start, end }
  }, [year, month])

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

  const { data: events = [] } = useQuery({
    queryKey: [
      'calendar-events',
      currentProductionId,
      dateRange.start,
      dateRange.end,
      isEpisodicProduction ? calendarBlocFilter : 'all',
    ],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCalendarShootDayEventsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          dateRange,
          filters: { shootingBlocFilter: isEpisodicProduction ? calendarBlocFilter : 'all' },
        })
      }
      return listCalendarShootDayEvents(currentProductionId, dateRange, {
        shootingBlocFilter: isEpisodicProduction ? calendarBlocFilter : 'all',
      })
    },
    enabled: !!currentProductionId,
  })
  const { data: strips = [] } = useQuery({
    queryKey: stripboardQueryKeys.strips(currentProductionId ?? ''),
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listStripsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listStripsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: scenes = [] } = useQuery({
    queryKey: stripboardQueryKeys.scenes(currentProductionId ?? ''),
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listScenesByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listScenesByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: shots = [] } = useQuery({
    queryKey: ['shots', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShotsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listShotsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listShootDaysByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listShootDaysByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listBookingsByProductionForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listBookingsByProduction(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: cast = [] } = useQuery({
    queryKey: ['cast', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCastForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listCast(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: crew = [] } = useQuery({
    queryKey: ['crew', currentProductionId ?? ''],
    queryFn: async () => {
      if (!currentProductionId) return []
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        return listCrewForActor({ db, actor: authSession.currentUser, productionId: currentProductionId })
      }
      return listCrew(currentProductionId)
    },
    enabled: !!currentProductionId,
  })
  const { data: hierarchyData } = useQuery({
    queryKey: ['crew-hierarchy', currentProductionId ?? ''],
    queryFn: () => getEffectiveCrewHierarchyOrDefault(currentProductionId),
    enabled: !!currentProductionId,
  })
  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId ?? ''],
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
  const { data: orsApiKeySetting = '' } = useQuery({
    queryKey: ['settings', OPENROUTESERVICE_API_KEY_SETTING],
    queryFn: async () => (await getSetting(OPENROUTESERVICE_API_KEY_SETTING)) ?? '',
  })
  const crewHierarchy = hierarchyData ?? defaultCrewHierarchy

  const dayNumberByShootDayId = useMemo(
    () => new Map(shootDays.map((d) => [d.id, d.day_number ?? null])),
    [shootDays]
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarShootDayEvent[]>()
    for (const e of events) {
      const list = map.get(e.date) ?? []
      list.push(e)
      map.set(e.date, list)
    }
    return map
  }, [events])

  const selectedUnitScheduledStrips = useMemo(() => {
    if (!selectedEvent) return []
    return strips.filter(
      (s) =>
        s.strip_status === 'SCHEDULED' &&
        s.shoot_day_id === selectedEvent.shootDayId &&
        s.shoot_day_unit_id === selectedEvent.shootDayUnitId
    )
  }, [strips, selectedEvent])

  const scheduledShotIdsForSelectedUnit = useMemo(() => {
    return [...new Set(selectedUnitScheduledStrips.filter((s) => s.strip_type === 'SHOT' && s.shot_id).map((s) => s.shot_id as string))]
  }, [selectedUnitScheduledStrips])

  const scheduledSceneIdsForSelectedUnit = useMemo(() => {
    const sceneIds = new Set<string>()
    const shotById = new Map(shots.map((shot) => [shot.id, shot]))
    for (const strip of selectedUnitScheduledStrips) {
      if (strip.scene_id) {
        sceneIds.add(strip.scene_id)
        continue
      }
      if (strip.shot_id) {
        const shot = shotById.get(strip.shot_id)
        if (shot?.scene_id) sceneIds.add(shot.scene_id)
      }
    }
    return [...sceneIds]
  }, [selectedUnitScheduledStrips, shots])

  const { data: castBySceneId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-scene-calendar-drawer', scheduledSceneIdsForSelectedUnit.join(',')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser && currentProductionId) {
        const db = await getDb()
        return getCastIdsBySceneIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          sceneIds: scheduledSceneIdsForSelectedUnit,
        })
      }
      return getCastIdsBySceneIds(scheduledSceneIdsForSelectedUnit)
    },
    enabled: scheduledSceneIdsForSelectedUnit.length > 0,
  })

  const { data: castByShotId = new Map<string, string[]>() } = useQuery({
    queryKey: ['cast-by-shot-calendar-drawer', scheduledShotIdsForSelectedUnit.join(',')],
    queryFn: async () => {
      if (authSession.authSupported && authSession.currentUser && currentProductionId) {
        const db = await getDb()
        return getCastIdsByShotIdsForActor({
          db,
          actor: authSession.currentUser,
          productionId: currentProductionId,
          shotIds: scheduledShotIdsForSelectedUnit,
        })
      }
      return getCastIdsByShotIds(scheduledShotIdsForSelectedUnit)
    },
    enabled: scheduledShotIdsForSelectedUnit.length > 0,
  })

  const bookingsForSelectedDay = useMemo(() => {
    if (!selectedEvent) return []
    return bookings.filter((b) => b.shoot_day_id === selectedEvent.shootDayId)
  }, [bookings, selectedEvent])

  const castResultForSelectedUnit = useMemo(() => {
    return getCallSheetCastRequirements({
      sceneIdsScheduled: scheduledSceneIdsForSelectedUnit,
      shotIdsScheduled: scheduledShotIdsForSelectedUnit,
      castBySceneId,
      castByShotId,
      bookedPersonIds: new Set(bookingsForSelectedDay.map((b) => b.person_id)),
      cast,
    })
  }, [
    scheduledSceneIdsForSelectedUnit,
    scheduledShotIdsForSelectedUnit,
    castBySceneId,
    castByShotId,
    bookingsForSelectedDay,
    cast,
  ])

  const episodeById = useMemo(() => new Map(episodes.map((e) => [e.id, e])), [episodes])

  const episodesOnUnitSummary = useMemo(() => {
    if (!isEpisodicProduction || !selectedEvent) return null
    const shotById = new Map(shots.map((s) => [s.id, s]))
    const sceneById = new Map(scenes.map((s) => [s.id, s]))
    const names = orderedDistinctEpisodeNames({
      strips: selectedUnitScheduledStrips,
      shotById,
      sceneById,
      episodeById,
    })
    return names.length > 0 ? names.join(', ') : '—'
  }, [
    isEpisodicProduction,
    selectedEvent,
    selectedUnitScheduledStrips,
    shots,
    scenes,
    episodeById,
  ])

  const daySummaryStats = useMemo<DaySummaryStats>(() => {
    if (!selectedEvent) {
      return { scenesScheduled: 0, pagesEighths: 0, shots: 0, castCalled: 0, crewBooked: 0 }
    }
    const sceneById = new Map(scenes.map((scene) => [scene.id, scene]))
    const pagesEighths = scheduledSceneIdsForSelectedUnit.reduce(
      (sum, sceneId) => sum + (sceneById.get(sceneId)?.page_eighths ?? 0),
      0
    )
    const crewGroups = getCallSheetCrewRequirements(crewHierarchy, bookingsForSelectedDay, crew)
    const crewBooked = crewGroups.reduce((sum, group) => sum + group.rows.length, 0)

    return {
      scenesScheduled: scheduledSceneIdsForSelectedUnit.length,
      pagesEighths,
      shots: scheduledShotIdsForSelectedUnit.length,
      castCalled: castResultForSelectedUnit.castRows.length,
      crewBooked,
    }
  }, [
    selectedEvent,
    scenes,
    scheduledSceneIdsForSelectedUnit,
    scheduledShotIdsForSelectedUnit,
    bookingsForSelectedDay,
    castResultForSelectedUnit,
    crewHierarchy,
    crew,
  ])

  const daySummaryLocationStack = useMemo<DaySummaryLocationStack>(() => {
    if (!selectedEvent) return { orderedLocations: [], missingLocationSceneCount: 0 }
    return getOrderedLocationStackForDayUnit({
      strips: selectedUnitScheduledStrips,
      scenes,
      shots,
      locations,
    })
  }, [selectedEvent, selectedUnitScheduledStrips, shots, scenes, locations])

  const daySummaryWarnings = useMemo<DaySummaryWarning[]>(() => {
    if (!selectedEvent) return []
    return getDaySummaryWarnings({
      callTime: selectedEvent.callTime,
      wrapTime: selectedEvent.wrapTime,
      requiredButNotBookedNames: castResultForSelectedUnit.requiredButNotBooked.map((p) => p.name),
      bookedButNotRequiredNames: castResultForSelectedUnit.bookedButNotRequired.map((p) => p.name),
      missingLocationSceneCount: daySummaryLocationStack.missingLocationSceneCount,
    })
  }, [selectedEvent, castResultForSelectedUnit, daySummaryLocationStack])

  const dayTurnaroundSummary = useMemo<DayTurnaroundSummary>(() => {
    if (!selectedEvent) {
      return {
        available: false,
        durationMinutes: null,
        formattedDuration: null,
        affectedCrewCount: 0,
        affectedCrewNames: [],
        allCastCrewAffected: false,
        belowThreshold: false,
        reasonUnavailable: 'Turnaround unavailable for this day.',
      }
    }

    const orderedShootDays = [...shootDays].sort((a, b) => a.shoot_date.localeCompare(b.shoot_date))
    const selectedIndex = orderedShootDays.findIndex((d) => d.id === selectedEvent.shootDayId)
    const previousDay = selectedIndex > 0 ? orderedShootDays[selectedIndex - 1] : null

    const crewById = new Map(crew.map((p) => [p.id, { name: p.name }]))
    const isCrewPerson = new Set(crew.map((p) => p.id))
    const selectedCrewBookedIds = bookings
      .filter((b) => b.shoot_day_id === selectedEvent.shootDayId && isCrewPerson.has(b.person_id))
      .map((b) => b.person_id)
    const selectedBookedPersonIds = bookings
      .filter((b) => b.shoot_day_id === selectedEvent.shootDayId)
      .map((b) => b.person_id)
    const previousCrewBookedIds = previousDay
      ? bookings
          .filter((b) => b.shoot_day_id === previousDay.id && isCrewPerson.has(b.person_id))
          .map((b) => b.person_id)
      : []
    const previousBookedPersonIds = previousDay
      ? bookings
          .filter((b) => b.shoot_day_id === previousDay.id)
          .map((b) => b.person_id)
      : []

    return getDayTurnaroundSummary({
      selectedDate: selectedEvent.date,
      selectedCallTime: selectedEvent.callTime,
      previousDate: previousDay?.shoot_date ?? null,
      previousWrapTime: previousDay?.wrap_time ?? null,
      selectedCrewBookedIds,
      previousCrewBookedIds,
      selectedBookedPersonIds,
      previousBookedPersonIds,
      crewById,
      thresholdMinutes: 600,
    })
  }, [selectedEvent, shootDays, bookings, crew])

  const { leadingBlanks, daysInMonth } = useMemo(
    () => getMonthGrid(year, month),
    [year, month]
  )

  const goPrevMonth = () =>
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))
  const goNextMonth = () =>
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))

  const openDrawer = (event: CalendarShootDayEvent) => {
    setSelectedEvent(event)
    setDrawerOpen(true)
  }
  const closeDrawer = () => setDrawerOpen(false)

  /** A date's shoot day blocks: a draggable "Day N" header above a draggable card per unit. */
  const renderShootDays = (dateStr: string) => {
    const dayEvents = eventsByDate.get(dateStr) ?? []
    const shootDayIdsOnDate = [...new Set(dayEvents.map((e) => e.shootDayId))]
    return shootDayIdsOnDate.map((shootDayId) => {
      const unitEvents = dayEvents.filter((e) => e.shootDayId === shootDayId)
      return (
        <ShootDayBlock
          key={shootDayId}
          shootDayId={shootDayId}
          date={dateStr}
          dayNumber={dayNumberByShootDayId.get(shootDayId) ?? null}
          unitCount={unitEvents.length}
        >
          {unitEvents.map((event) => (
            <DraggableUnitCard
              key={event.shootDayUnitId}
              event={event}
              onClick={() => openDrawer(event)}
              isEpisodic={isEpisodicProduction}
              isMoving={
                (moveUnitMutation.isPending && moveUnitMutation.variables?.shootDayUnitId === event.shootDayUnitId) ||
                (swapUnitsMutation.isPending &&
                  (swapUnitsMutation.variables?.shootDayUnitIdA === event.shootDayUnitId ||
                    swapUnitsMutation.variables?.shootDayUnitIdB === event.shootDayUnitId))
              }
            />
          ))}
        </ShootDayBlock>
      )
    })
  }

  useEffect(() => {
    if (!currentProductionId) return
    const migrationKey = `schedule-call-wrap-migration:${currentProductionId}`
    if (sessionStorage.getItem(migrationKey) === 'done') return
    if (ensureCallWrapStripsMutation.isPending) return
    ensureCallWrapStripsMutation.mutate(currentProductionId, {
      onSuccess: () => sessionStorage.setItem(migrationKey, 'done'),
    })
  }, [currentProductionId, ensureCallWrapStripsMutation])

  useEffect(() => {
    setSelectedEvent((prev) => {
      if (!prev) return prev
      const refreshed = events.find((e) => e.shootDayUnitId === prev.shootDayUnitId)
      return refreshed ?? prev
    })
  }, [events])

  useEffect(() => {
    if (!drawerOpen && selectedEvent) {
      const t = setTimeout(() => setSelectedEvent(null), 350)
      return () => clearTimeout(t)
    }
  }, [drawerOpen, selectedEvent])

  return (
    <>
      {!currentProductionId ? (
        <RequireProduction title="Calendar">{null}</RequireProduction>
      ) : (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PageHeader title="Calendar" />
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isEpisodicProduction && (
            <Select
              value={calendarBlocFilter}
              onValueChange={(v) => setCalendarBlocFilter(v as ShootingBlocViewFilter)}
            >
              <SelectTrigger className="h-9 w-[200px]" aria-label="Filter calendar by shooting bloc">
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
          {(moveMutation.isPending || isUnitActionPending) && (
            <span className="text-muted-foreground text-sm">Moving…</span>
          )}
          <Button variant="outline" size="icon" onClick={goPrevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className={cn('text-center font-medium', phoneWidth ? 'min-w-[9rem]' : 'min-w-[180px]')}>
            {monthLabel}
          </span>
          <Button variant="outline" size="icon" onClick={goNextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Drag a day&apos;s header to move the whole shoot day. Drag a unit to another date to move just that
        unit, or onto another unit on the same day to swap them (e.g. make the Second Unit the Main Unit).
        On touch screens, press and hold, then drag.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={calendarCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        {phoneWidth ? (
          <PhoneMonthCalendar
            year={year}
            month={month}
            leadingBlanks={leadingBlanks}
            daysInMonth={daysInMonth}
            monthLabel={monthLabel}
            eventsByDate={eventsByDate}
            renderShootDays={renderShootDays}
          />
        ) : (
        <div className="grid grid-cols-7 gap-1 text-center text-sm text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-2 font-medium">
              {label}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} className="min-h-[100px] rounded border border-border bg-card/30 p-2" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dateStr = toYyyyMmDd(year, month, day)
            return (
              <DroppableDayCell key={day} dateStr={dateStr}>
                <span className="text-foreground font-medium">{day}</span>
                {renderShootDays(dateStr)}
              </DroppableDayCell>
            )
          })}
        </div>
        )}

        <DragOverlay dropAnimation={null}>
          {activeDrag?.kind === 'unit' ? (
            <div className="w-[min(100%,220px)] rounded-md shadow-lg ring-1 ring-border opacity-95">
              <CalendarEventCardBody
                event={activeDrag.event}
                onClick={() => {}}
                isOverlay
                isEpisodic={isEpisodicProduction}
              />
            </div>
          ) : activeDrag?.kind === 'day' ? (
            <div className="w-[min(100%,220px)] space-y-1 rounded-md border border-border bg-card p-1.5 shadow-lg opacity-95">
              <p className="px-0.5 text-[11px] font-medium text-muted-foreground">
                {dayNumberByShootDayId.get(activeDrag.shootDayId) != null
                  ? `Day ${dayNumberByShootDayId.get(activeDrag.shootDayId)}`
                  : 'Shoot day'}
              </p>
              {activeDrag.events.map((event) => (
                <CalendarEventCardBody
                  key={event.shootDayUnitId}
                  event={event}
                  onClick={() => {}}
                  isOverlay
                  isEpisodic={isEpisodicProduction}
                />
              ))}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <DaySummaryDrawer
        event={selectedEvent}
        open={drawerOpen}
        onOpenChange={(open) => !open && closeDrawer()}
        isSaving={updateDaySummaryMutation.isPending}
        stats={daySummaryStats}
        locationStack={daySummaryLocationStack}
        warnings={daySummaryWarnings}
        turnaround={dayTurnaroundSummary}
        orsApiKeySetting={orsApiKeySetting}
        isEpisodic={isEpisodicProduction}
        shootingBlocDisplay={
          selectedEvent && isEpisodicProduction
            ? calendarShootingBlocDisplay(selectedEvent.shootingBlocId, selectedEvent.shootingBlocName)
            : undefined
        }
        episodesOnUnitSummary={episodesOnUnitSummary ?? undefined}
        unitsOnDay={selectedEvent ? events.filter((e) => e.shootDayId === selectedEvent.shootDayId) : []}
        isUnitActionPending={isUnitActionPending}
        onSwapWithUnit={(otherShootDayUnitId) => {
          if (selectedEvent) swapUnits(selectedEvent.shootDayUnitId, otherShootDayUnitId)
        }}
        onMoveUnitToDate={(targetDate) => {
          if (selectedEvent) {
            moveUnit({ shootDayUnitId: selectedEvent.shootDayUnitId, targetDate }, { closeDrawerOnSuccess: true })
          }
        }}
        onSaveEdits={async ({ shootDayId, callTime, wrapTime, notes }) => {
          await updateDaySummaryMutation.mutateAsync({
            shootDayId,
            callTime,
            wrapTime,
            notes,
          })
          if (selectedEvent && selectedEvent.shootDayId === shootDayId) {
            setSelectedEvent({
              ...selectedEvent,
              callTime,
              wrapTime,
              notes,
            })
          }
          invalidateScheduleQueries()
        }}
      />

    </div>
      )}

      <Dialog open={!!conflictModal} onOpenChange={(open) => !open && setConflictModal(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>That date already has a shoot day.</DialogTitle>
            <DialogDescription>
              Swap the two days so each shoot moves to the other&apos;s date?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!conflictModal) return
                ;(authSession.authSupported && authSession.currentUser
                  ? getDb().then((db) =>
                      swapShootDaysForActor({
                        db,
                        actor: authSession.currentUser!,
                        sourceShootDayId: conflictModal.sourceShootDayId,
                        targetShootDayId: conflictModal.existingShootDayId,
                      })
                    )
                  : swapShootDays(conflictModal.sourceShootDayId, conflictModal.existingShootDayId))
                  .then(() => {
                    invalidateScheduleQueries()
                    setConflictModal(null)
                  })
                  .catch(() => toast.error('Swap failed.'))
              }}
            >
              Swap
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConflictModal(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!emptySourceModal} onOpenChange={(open) => !open && setEmptySourceModal(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              Move {emptySourceModal?.unitName ?? 'unit'} to{' '}
              {emptySourceModal ? formatShortDate(emptySourceModal.targetDate) : ''}?
            </DialogTitle>
            <DialogDescription>
              It is the only unit on {emptySourceModal?.sourceDayLabel ?? 'its shoot day'}
              {emptySourceModal?.sourceDate ? ` (${formatShortDate(emptySourceModal.sourceDate)})` : ''}. It joins the
              shoot day already on that date, with its shots. Delete the day it leaves, or keep it with an empty Main Unit?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton={false} className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="destructive"
              disabled={isUnitActionPending}
              onClick={() => {
                if (!emptySourceModal) return
                const { shootDayUnitId, targetDate, closeDrawerOnSuccess } = emptySourceModal
                setEmptySourceModal(null)
                moveUnit({ shootDayUnitId, targetDate, emptiedSourceDay: 'delete' }, { closeDrawerOnSuccess })
              }}
            >
              Delete {emptySourceModal?.sourceDayLabel ?? 'day'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isUnitActionPending}
              onClick={() => {
                if (!emptySourceModal) return
                const { shootDayUnitId, targetDate, closeDrawerOnSuccess } = emptySourceModal
                setEmptySourceModal(null)
                moveUnit({ shootDayUnitId, targetDate, emptiedSourceDay: 'keep' }, { closeDrawerOnSuccess })
              }}
            >
              Keep {emptySourceModal?.sourceDayLabel ?? 'day'} empty
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEmptySourceModal(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}