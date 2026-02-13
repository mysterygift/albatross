/**
 * Schedule Calendar — month view of shoot day events (one per shoot_day_unit).
 *
 * Uses listCalendarShootDayEvents(); events show unit, call–wrap, runtime, location, shot count.
 * Main Unit = mint (--unit-main), Second Unit = complementary (--unit-second).
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { listCalendarShootDayEvents } from '@/lib/db/repositories/calendar'
import type { CalendarShootDayEvent } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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

function CalendarEventCard({ event }: { event: CalendarShootDayEvent }) {
  const isMain = event.unitKey === 'main'
  const bgVar = isMain ? 'var(--unit-main)' : 'var(--unit-second)'
  const fgVar = isMain ? 'var(--unit-main-foreground)' : 'var(--unit-second-foreground)'

  return (
    <div
      className="rounded-md px-1.5 py-1 text-xs"
      style={{
        backgroundColor: bgVar,
        color: fgVar,
      }}
    >
      <div className="font-medium">{event.unitName}</div>
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

export function ScheduleCalendarPage() {
  const { currentProductionId } = useCurrentProduction()
  const [viewDate, setViewDate] = useState(() => new Date())

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

  const { data: events = [] } = useQuery({
    queryKey: ['calendar-events', currentProductionId, dateRange.start, dateRange.end],
    queryFn: () =>
      listCalendarShootDayEvents(currentProductionId ?? '', dateRange),
    enabled: !!currentProductionId,
  })

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarShootDayEvent[]>()
    for (const e of events) {
      const list = map.get(e.date) ?? []
      list.push(e)
      map.set(e.date, list)
    }
    return map
  }, [events])

  const { leadingBlanks, daysInMonth } = useMemo(
    () => getMonthGrid(year, month),
    [year, month]
  )

  const goPrevMonth = () =>
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))
  const goNextMonth = () =>
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))

  if (!currentProductionId) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Schedule — Calendar</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Schedule — Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[180px] text-center font-medium">
            {monthLabel}
          </span>
          <Button variant="outline" size="icon" onClick={goNextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

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
          const dayEvents = eventsByDate.get(dateStr) ?? []
          return (
            <div
              key={day}
              className="min-h-[100px] rounded border border-border bg-card/30 p-2 text-left"
            >
              <span className="text-foreground font-medium">{day}</span>
              <div className="mt-1 space-y-1">
                {dayEvents.map((event) => (
                  <CalendarEventCard key={event.shootDayUnitId} event={event} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
