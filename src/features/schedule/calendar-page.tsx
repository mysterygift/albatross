/**
 * Schedule Calendar — month view of shoot day events (one per shoot_day_unit).
 *
 * Uses listCalendarShootDayEvents(); events show unit, call–wrap, runtime, location, shot count.
 * Main Unit = mint (--unit-main), Second Unit = complementary (--unit-second).
 * Day Summary Drawer opens on event click; Open Stripboard / Generate Call Sheet (placeholder).
 */
import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { listCalendarShootDayEvents } from '@/lib/db/repositories/calendar'
import type { CalendarShootDayEvent } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, LayoutGrid, FileText } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'

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

const RUNTIME_WARNING_THRESHOLD_MINUTES = 630 // 10.5h

function CalendarEventCard({
  event,
  onClick,
}: {
  event: CalendarShootDayEvent
  onClick: () => void
}) {
  const isMain = event.unitKey === 'main'
  const bgVar = isMain ? 'var(--unit-main)' : 'var(--unit-second)'
  const fgVar = isMain ? 'var(--unit-main-foreground)' : 'var(--unit-second-foreground)'

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md px-1.5 py-1 text-left text-xs transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
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
    </button>
  )
}

function DaySummaryDrawer({
  event,
  open,
  onOpenChange,
  onOpenStripboard,
  onGenerateCallSheet,
}: {
  event: CalendarShootDayEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenStripboard: () => void
  onGenerateCallSheet: () => void
}) {
  if (!event) return null

  const runtimeWarning = event.estMinutes > RUNTIME_WARNING_THRESHOLD_MINUTES

  const row = (label: string, value: string | null | undefined) => (
    <div className="flex justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right">{value ?? '—'}</span>
    </div>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            {formatDateLabel(event.date)}
          </SheetTitle>
          <p className="text-muted-foreground text-sm">{event.unitName}</p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-1 py-2">
          {row('Call time', event.callTime)}
          {row('Lunch time', event.lunchTime)}
          {row('Wrap time', event.wrapTime)}
          {row('Location', event.primaryLocationName)}
          {row('Shot count', `${event.shotCount} shots`)}
          {row('Estimated runtime', formatRuntime(event.estMinutes))}
          {runtimeWarning && (
            <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-600 dark:text-amber-400 text-xs">
              Estimated runtime over 10h 30min. Consider splitting the day.
            </p>
          )}
        </div>
        <SheetFooter className="flex flex-col gap-2 sm:flex-col">
          <Button
            className="w-full gap-2"
            onClick={onOpenStripboard}
          >
            <LayoutGrid className="size-4" />
            Open Stripboard
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2 border-border bg-transparent text-foreground hover:bg-muted"
            onClick={onGenerateCallSheet}
          >
            <FileText className="size-4" />
            Generate Call Sheet
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function generateCallSheetPlaceholder(): void {
  // TODO: implement call sheet generation
}

export function ScheduleCalendarPage() {
  const navigate = useNavigate()
  const { currentProductionId } = useCurrentProduction()
  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectedEvent, setSelectedEvent] = useState<CalendarShootDayEvent | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

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

  const openDrawer = (event: CalendarShootDayEvent) => {
    setSelectedEvent(event)
    setDrawerOpen(true)
  }
  const closeDrawer = () => setDrawerOpen(false)

  useEffect(() => {
    if (!drawerOpen && selectedEvent) {
      const t = setTimeout(() => setSelectedEvent(null), 350)
      return () => clearTimeout(t)
    }
  }, [drawerOpen, selectedEvent])

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
                  <CalendarEventCard
                    key={event.shootDayUnitId}
                    event={event}
                    onClick={() => openDrawer(event)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <DaySummaryDrawer
        event={selectedEvent}
        open={drawerOpen}
        onOpenChange={(open) => !open && closeDrawer()}
        onOpenStripboard={() => navigate('/schedule/stripboard')}
        onGenerateCallSheet={generateCallSheetPlaceholder}
      />
    </div>
  )
}
