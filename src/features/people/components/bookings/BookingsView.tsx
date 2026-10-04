import { toast } from '@/components/ui/sonner'
import { useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Booking, Person, ShootDay, Unit } from '@/lib/db/types'
import type { BookingIntelligenceSummary } from '@/lib/people/bookingIntelligence'
import {
  buildBookingSpans,
  computeSpanMovePlan,
  computeSpanResizePlan,
  diffDaysIso,
} from '@/features/people/lib/bookingSpans'
import {
  getContrastText,
  resolvePersonColor,
  type BookingColorConfig,
} from '@/features/people/lib/bookingCalendarColors'
import type { BookingAppearanceConfig, BookingView } from '@/features/people/lib/bookingAppearance'
import { BookingPillDragPreview, type SpanDragKind } from './BookingSpanPill'
import { BookingsCalendarView } from './BookingsCalendarView'
import { BookingsTimelineView } from './BookingsTimelineView'
import { bookingDateAtPoint, spanKeyOf } from './bookingViewShared'

export type BookingChanges = {
  updates?: { bookingId: string; shootDayId: string }[]
  creates?: { personId: string; shootDayId: string; role: string | null; notes: string | null }[]
  deletes?: string[]
}

const VIEW_OPTIONS: { value: BookingView; label: string }[] = [
  { value: 'calendar', label: 'Calendar View' },
  { value: 'timeline', label: 'Timeline View' },
]

/**
 * The Bookings page body: filters, month navigation, the Calendar / Timeline switch, and the
 * drag-to-move / drag-to-resize handling that both views share.
 */
export function BookingsView({
  bookings,
  allBookings,
  shootDays,
  people,
  personById,
  colorConfig,
  appearance,
  onViewChange,
  bookingIntelligence,
  filterUnit,
  setFilterUnit,
  filterDepartment,
  setFilterDepartment,
  filterCastCrew,
  setFilterCastCrew,
  units,
  departments,
  onApplyChanges,
  onEditBooking,
}: {
  bookings: Booking[]
  allBookings: Booking[]
  shootDays: ShootDay[]
  people: Person[]
  personById: Map<string, Person>
  colorConfig: BookingColorConfig
  appearance: BookingAppearanceConfig
  onViewChange: (view: BookingView) => void
  bookingIntelligence?: BookingIntelligenceSummary
  filterUnit: string
  setFilterUnit: (v: string) => void
  filterDepartment: string
  setFilterDepartment: (v: string) => void
  filterCastCrew: string
  setFilterCastCrew: (v: string) => void
  units: Unit[]
  departments: string[]
  onApplyChanges: (changes: BookingChanges) => Promise<void>
  onEditBooking: (booking: Booking) => void
}) {
  const [month, setMonth] = useState(() => new Date())
  const [activeLabel, setActiveLabel] = useState<{ label: string; color: string; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  /** The date under the pointer when a move began, so a move shifts by how far the pointer travelled. */
  const grabDateRef = useRef<string | null>(null)

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const monthLabel = month.toLocaleString('default', { month: 'long', year: 'numeric' })

  const bookingById = useMemo(() => {
    const m = new Map<string, Booking>()
    for (const b of allBookings) m.set(b.id, b)
    return m
  }, [allBookings])

  const shootDayIdByDate = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of shootDays) m.set(d.shoot_date, d.id)
    return m
  }, [shootDays])

  const spans = useMemo(() => buildBookingSpans(bookings, shootDays), [bookings, shootDays])
  const spanByKey = useMemo(() => new Map(spans.map((s) => [spanKeyOf(s), s])), [spans])

  /** The Timeline lists people, so the department and cast/crew filters apply to them directly. */
  const timelinePeople = useMemo(
    () =>
      people.filter((p) => {
        if (filterDepartment !== 'all' && p.department !== filterDepartment) return false
        if (filterCastCrew === 'cast') return p.is_cast === 1
        if (filterCastCrew === 'crew') return p.is_cast !== 1
        return true
      }),
    [people, filterDepartment, filterCastCrew]
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const notify = (message: string) => toast.error(message)

  const handleDragStart = (ev: DragStartEvent) => {
    const act = ev.activatorEvent
    grabDateRef.current = act instanceof MouseEvent ? bookingDateAtPoint(act.clientX, act.clientY) : null
    const data = ev.active.data.current as { kind?: SpanDragKind; spanKey?: string } | undefined
    if (data?.kind === 'move' && data.spanKey) {
      const span = spanByKey.get(data.spanKey)
      const person = span && personById.get(span.personId)
      if (span && person) {
        const color = resolvePersonColor(person, colorConfig)
        setActiveLabel({ label: person.name, color, text: getContrastText(color) })
      }
    }
  }

  const runChanges = (changes: BookingChanges) => {
    setPending(true)
    onApplyChanges(changes)
      .catch(() => notify('Could not update booking.'))
      .finally(() => setPending(false))
  }

  const handleDragEnd = (ev: DragEndEvent) => {
    setActiveLabel(null)
    const { active, over } = ev
    const data = active.data.current as { kind?: SpanDragKind; spanKey?: string } | undefined
    if (!data?.kind || !data.spanKey) return
    const overId = over?.id
    if (typeof overId !== 'string' || !overId.startsWith('date-')) return
    const targetDate = overId.slice(5)
    if (targetDate.length !== 10) return
    const span = spanByKey.get(data.spanKey)
    if (!span || pending) return

    if (data.kind === 'move') {
      const offset = diffDaysIso(grabDateRef.current ?? span.startDate, targetDate)
      if (offset === 0) return
      const spanShootDays = new Set(span.shootDayIds)
      const blocked = new Set<string>()
      for (const b of allBookings) {
        if (b.person_id === span.personId && b.shoot_day_id && !spanShootDays.has(b.shoot_day_id)) {
          blocked.add(b.shoot_day_id)
        }
      }
      const plan = computeSpanMovePlan({
        span,
        offsetDays: offset,
        shootDayIdByDate,
        blockedShootDayIds: blocked,
      })
      if (!plan.ok) {
        notify(plan.reason)
        return
      }
      if (plan.updates.length > 0) runChanges({ updates: plan.updates })
      return
    }

    // Resize
    const newStartDate = data.kind === 'resize-left' ? targetDate : span.startDate
    const newEndDate = data.kind === 'resize-right' ? targetDate : span.endDate
    if (newStartDate > newEndDate) {
      notify('Start must be on or before the end day.')
      return
    }
    const shootDaysInRange = shootDays
      .filter((d) => d.shoot_date >= newStartDate && d.shoot_date <= newEndDate)
      .map((d) => ({ id: d.id, date: d.shoot_date }))
    if (shootDaysInRange.length === 0) {
      notify('No shoot days in that range.')
      return
    }
    const personBooked = new Set<string>()
    for (const b of allBookings) {
      if (b.person_id === span.personId && b.shoot_day_id) personBooked.add(b.shoot_day_id)
    }
    const rep = bookingById.get(span.bookingIds[0])
    const plan = computeSpanResizePlan({
      span,
      newStartDate,
      newEndDate,
      shootDaysInRange,
      personBookedShootDayIds: personBooked,
      role: rep?.role ?? null,
      notes: rep?.notes ?? null,
    })
    if (plan.creates.length === 0 && plan.deletes.length === 0) return
    runChanges({
      creates: plan.creates.map((c) => ({ personId: span.personId, ...c })),
      deletes: plan.deletes,
    })
  }

  const legendItems = useMemo(() => {
    const items: { key: string; label: string; color: string }[] = []
    for (const dept of departments) {
      items.push({ key: `dept-${dept}`, label: dept, color: colorConfig.departmentColors[dept] ?? colorConfig.crewFallbackColor })
    }
    const principals = people
      .filter((p) => p.is_cast === 1 && p.id in colorConfig.principalCastColors)
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const p of principals) {
      items.push({ key: `cast-${p.id}`, label: p.name, color: colorConfig.principalCastColors[p.id] })
    }
    const hasOtherCast = people.some((p) => p.is_cast === 1 && !(p.id in colorConfig.principalCastColors))
    if (hasOtherCast) {
      items.push({ key: 'supporting', label: 'Supporting cast', color: colorConfig.supportingCastColor })
    }
    return items
  }, [departments, people, colorConfig])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="focus-visible:ring-mint-500/50 focus-visible:border-mint-500"
            onClick={() => setMonth(new Date(year, monthIndex - 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[160px] text-center font-medium text-foreground">{monthLabel}</span>
          <Button
            variant="outline"
            size="icon"
            className="focus-visible:ring-mint-500/50 focus-visible:border-mint-500"
            onClick={() => setMonth(new Date(year, monthIndex + 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground text-sm whitespace-nowrap">Unit</Label>
            <Select value={filterUnit} onValueChange={setFilterUnit}>
              <SelectTrigger className="w-[140px] focus-visible:ring-mint-500/50 focus-visible:border-mint-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground text-sm whitespace-nowrap">Department</Label>
            <Select value={filterDepartment} onValueChange={setFilterDepartment}>
              <SelectTrigger className="w-[140px] focus-visible:ring-mint-500/50 focus-visible:border-mint-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground text-sm whitespace-nowrap">Cast/Crew</Label>
            <Select value={filterCastCrew} onValueChange={setFilterCastCrew}>
              <SelectTrigger className="w-[120px] focus-visible:ring-mint-500/50 focus-visible:border-mint-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="cast">Cast</SelectItem>
                <SelectItem value="crew">Crew</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <SegmentedControl
          ariaLabel="Bookings view"
          size="sm"
          className="w-[17rem]"
          value={appearance.view}
          onValueChange={onViewChange}
          options={VIEW_OPTIONS}
        />
      </div>

      {legendItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-muted-foreground">
          {legendItems.map((item) => (
            <span key={item.key} className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveLabel(null)}
      >
        {appearance.view === 'timeline' ? (
          <BookingsTimelineView
            year={year}
            monthIndex={monthIndex}
            monthLabel={monthLabel}
            spans={spans}
            people={timelinePeople}
            bookingById={bookingById}
            colorConfig={colorConfig}
            shootDays={shootDays}
            hideUnbookedPeople={appearance.hideUnbookedPeople}
            pending={pending}
            onEditBooking={onEditBooking}
          />
        ) : (
          <BookingsCalendarView
            year={year}
            monthIndex={monthIndex}
            monthLabel={monthLabel}
            spans={spans}
            personById={personById}
            bookingById={bookingById}
            colorConfig={colorConfig}
            shootDays={shootDays}
            bookingIntelligence={bookingIntelligence}
            lanesPerWeek={appearance.lanesPerWeek}
            pending={pending}
            onEditBooking={onEditBooking}
          />
        )}

        <DragOverlay dropAnimation={null}>
          {activeLabel ? (
            <BookingPillDragPreview label={activeLabel.label} color={activeLabel.color} textColor={activeLabel.text} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  )
}
