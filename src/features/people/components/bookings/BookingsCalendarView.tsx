import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Booking, Person, ShootDay, Unit } from '@/lib/db/types'
import type { BookingIntelligenceSummary } from '@/lib/people/bookingIntelligence'
import {
  assignLanes,
  buildBookingSpans,
  computeSpanMovePlan,
  computeSpanResizePlan,
  diffDaysIso,
  getMonthSpanSegments,
  type BookingSpan,
} from '@/features/people/lib/bookingSpans'
import {
  getContrastText,
  resolvePersonColor,
  type BookingColorConfig,
} from '@/features/people/lib/bookingCalendarColors'
import { BookingSpanPill, type SpanDragKind } from './BookingSpanPill'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HEADER_ROW = '1.9rem'
const LANE_HEIGHT = '1.55rem'

export type BookingChanges = {
  updates?: { bookingId: string; shootDayId: string }[]
  creates?: { personId: string; shootDayId: string; role: string | null; notes: string | null }[]
  deletes?: string[]
}

function spanKeyOf(span: BookingSpan): string {
  return `${span.personId}|${span.startDate}|${span.endDate}`
}

function formatDateRange(startDate: string, endDate: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('default', {
      day: 'numeric',
      month: 'short',
    })
  }
  return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} – ${fmt(endDate)}`
}

function DroppableDayCell({
  dateStr,
  col,
  isShootDay,
  children,
}: {
  dateStr: string
  col: number
  isShootDay: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `date-${dateStr}` })
  return (
    <div
      ref={setNodeRef}
      style={{ gridColumn: col + 1, gridRow: '1 / -1' }}
      className={cn(
        'min-h-[92px] border border-border p-1.5',
        isShootDay ? 'bg-card' : 'bg-muted/20',
        isOver && 'ring-2 ring-inset ring-mint-500/60'
      )}
    >
      {children}
    </div>
  )
}

export function BookingsCalendarView({
  bookings,
  allBookings,
  shootDays,
  people,
  personById,
  colorConfig,
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
  const [toast, setToast] = useState<string | null>(null)
  const [activeLabel, setActiveLabel] = useState<{ label: string; color: string; text: string } | null>(null)
  const [pending, setPending] = useState(false)

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7)

  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStrOf = (day: number) => `${year}-${pad(monthIndex + 1)}-${pad(day)}`

  const bookingById = useMemo(() => {
    const m = new Map<string, Booking>()
    for (const b of allBookings) m.set(b.id, b)
    return m
  }, [allBookings])

  const shootDayByDate = useMemo(() => {
    const m = new Map<string, ShootDay>()
    for (const d of shootDays) m.set(d.shoot_date, d)
    return m
  }, [shootDays])

  const shootDayIdByDate = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of shootDays) m.set(d.shoot_date, d.id)
    return m
  }, [shootDays])

  const spans = useMemo(() => buildBookingSpans(bookings, shootDays), [bookings, shootDays])
  const spanByKey = useMemo(() => {
    const m = new Map<string, BookingSpan>()
    for (const s of spans) m.set(spanKeyOf(s), s)
    return m
  }, [spans])

  // Per-week laned segments for the visible month.
  const weekLanes = useMemo(() => {
    const perWeek: {
      span: BookingSpan
      startCol: number
      endCol: number
      continuesLeft: boolean
      continuesRight: boolean
      lane: number
    }[][] = Array.from({ length: weekCount }, () => [])
    const rawByWeek: {
      span: BookingSpan
      startCol: number
      endCol: number
      continuesLeft: boolean
      continuesRight: boolean
    }[][] = Array.from({ length: weekCount }, () => [])

    for (const span of spans) {
      for (const seg of getMonthSpanSegments(span, year, monthIndex)) {
        if (seg.weekIndex < 0 || seg.weekIndex >= weekCount) continue
        rawByWeek[seg.weekIndex].push({ span, ...seg })
      }
    }
    rawByWeek.forEach((segs, w) => {
      for (const { segment, lane } of assignLanes(segs)) {
        perWeek[w].push({ ...segment, lane })
      }
    })
    return perWeek
  }, [spans, weekCount, year, monthIndex])

  const maxLanesByWeek = useMemo(
    () => weekLanes.map((segs) => segs.reduce((max, s) => Math.max(max, s.lane + 1), 0)),
    [weekLanes]
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const notify = (message: string) => setToast(message)

  const handleDragStart = (ev: DragStartEvent) => {
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
      const offset = diffDaysIso(span.startDate, targetDate)
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

  const monthLabel = month.toLocaleString('default', { month: 'long', year: 'numeric' })

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
      <Card className="rounded-lg border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
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
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <Button
          variant="outline"
          size="icon"
          className="focus-visible:ring-mint-500/50 focus-visible:border-mint-500"
          onClick={() => setMonth(new Date(year, monthIndex - 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-[180px] text-center font-medium text-foreground">{monthLabel}</span>
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
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveLabel(null)}
      >
        <div className="grid grid-cols-7 text-center text-sm text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 font-medium">
              {d}
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          {Array.from({ length: weekCount }, (_, week) => {
            const maxLanes = maxLanesByWeek[week]
            const gridTemplateRows = `${HEADER_ROW}${maxLanes > 0 ? ` repeat(${maxLanes}, ${LANE_HEIGHT})` : ''}`
            return (
              <div
                key={week}
                className="grid grid-cols-7 overflow-hidden rounded-md"
                style={{ gridTemplateRows }}
              >
                {Array.from({ length: 7 }, (_, col) => {
                  const day = week * 7 + col - firstWeekday + 1
                  const inMonth = day >= 1 && day <= daysInMonth
                  if (!inMonth) {
                    return (
                      <div
                        key={col}
                        style={{ gridColumn: col + 1, gridRow: '1 / -1' }}
                        className="min-h-[92px] border border-border bg-muted/10"
                      />
                    )
                  }
                  const dateStr = dateStrOf(day)
                  const shootDay = shootDayByDate.get(dateStr)
                  const coverage =
                    bookingIntelligence && shootDay
                      ? bookingIntelligence.byShootDay.get(shootDay.id)
                      : null
                  return (
                    <DroppableDayCell key={col} dateStr={dateStr} col={col} isShootDay={!!shootDay}>
                      <div className="flex items-start justify-between gap-1">
                        <span className={cn('text-sm font-medium', shootDay ? 'text-foreground' : 'text-muted-foreground')}>
                          {day}
                        </span>
                        {coverage && (coverage.missingCount > 0 || coverage.unnecessaryCount > 0) && (
                          <div className="flex flex-wrap justify-end gap-1">
                            {coverage.missingCount > 0 && (
                              <span
                                className="rounded border border-amber-500/60 bg-amber-500/10 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                                title={`${coverage.missingCount} needed but not booked`}
                              >
                                {coverage.missingCount}
                              </span>
                            )}
                            {coverage.unnecessaryCount > 0 && (
                              <span
                                className="rounded border border-border bg-muted/50 px-1 text-[10px] text-muted-foreground"
                                title={`${coverage.unnecessaryCount} booked but not needed`}
                              >
                                +{coverage.unnecessaryCount}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </DroppableDayCell>
                  )
                })}

                {weekLanes[week].map(({ span, startCol, endCol, continuesLeft, continuesRight, lane }) => {
                  const person = personById.get(span.personId)
                  const color = person ? resolvePersonColor(person, colorConfig) : colorConfig.crewFallbackColor
                  const textColor = getContrastText(color)
                  const rep = bookingById.get(span.bookingIds[0])
                  const tooltip = (
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-foreground">{person?.name ?? 'Unknown'}</p>
                      <p className="text-muted-foreground">
                        {person?.is_cast === 1 ? 'Cast' : 'Crew'}
                        {person?.department ? ` · ${person.department}` : ''}
                        {person?.role_name ? ` · ${person.role_name}` : ''}
                      </p>
                      <p className="text-foreground">
                        {formatDateRange(span.startDate, span.endDate)}
                        <span className="text-muted-foreground">
                          {' '}· {span.shootDayIds.length} {span.shootDayIds.length === 1 ? 'day' : 'days'}
                        </span>
                      </p>
                      {rep?.role && <p className="text-muted-foreground">Role: {rep.role}</p>}
                      {rep?.notes && <p className="text-muted-foreground">Notes: {rep.notes}</p>}
                    </div>
                  )
                  return (
                    <div
                      key={`${spanKeyOf(span)}-${lane}`}
                      className={cn('px-px pb-0.5', continuesLeft && 'pl-0', continuesRight && 'pr-0')}
                      style={{
                        gridColumn: `${startCol + 1} / ${endCol + 2}`,
                        gridRow: lane + 2,
                      }}
                    >
                      <BookingSpanPill
                        spanKey={spanKeyOf(span)}
                        weekIndex={week}
                        label={person?.name ?? '—'}
                        color={color}
                        textColor={textColor}
                        continuesLeft={continuesLeft}
                        continuesRight={continuesRight}
                        tooltip={tooltip}
                        disabled={pending}
                        onOpen={() => {
                          if (rep) onEditBooking(rep)
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeLabel ? (
            <div
              className="flex h-6 items-center overflow-hidden rounded-md px-2 text-xs font-medium shadow-lg ring-1 ring-border"
              style={{ backgroundColor: activeLabel.color, color: activeLabel.text }}
            >
              <span className="truncate">{activeLabel.label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {bookings.length === 0 && (
        <Card className="rounded-lg border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">No bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Add a booking above to assign people to shoot days.
            </p>
          </CardContent>
        </Card>
      )}

      {toast && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  )
}
