import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Booking, Person, ShootDay } from '@/lib/db/types'
import type { BookingSpan } from '@/features/people/lib/bookingSpans'
import {
  getContrastText,
  resolvePersonColor,
  type BookingColorConfig,
} from '@/features/people/lib/bookingCalendarColors'
import {
  buildTimelineGroups,
  getMonthTimelineSegment,
  personInitials,
} from '@/features/people/lib/bookingTimeline'
import { BookingSpanPill } from './BookingSpanPill'
import { SpanTooltip } from './SpanTooltip'
import { BOOKING_DATE_ATTR, spanKeyOf } from './bookingViewShared'

const LABEL_WIDTH = '13.5rem'
const DAY_WIDTH = '1.9rem'
const ROW_HEIGHT = '2.5rem'
const HEAD_HEIGHT = '2.9rem'
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const OFF_DAY_HATCH =
  'repeating-linear-gradient(135deg, color-mix(in srgb, var(--foreground) 6%, transparent) 0 6px, transparent 6px 12px)'

function localIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** One full-height column per day: draws the off-day / today shading and is the drop target for drags. */
function DayColumn({ dateStr, isShootDay, isToday, isMonday }: { dateStr: string; isShootDay: boolean; isToday: boolean; isMonday: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `date-${dateStr}` })
  return (
    <div
      ref={setNodeRef}
      {...{ [BOOKING_DATE_ATTR]: dateStr }}
      style={{ backgroundImage: isShootDay ? undefined : OFF_DAY_HATCH }}
      className={cn(
        'border-r border-foreground/10',
        isMonday && 'border-l border-l-foreground/30',
        !isShootDay && 'bg-muted/40',
        isToday && 'bg-primary/15',
        isOver && 'ring-2 ring-inset ring-mint-500/60'
      )}
    />
  )
}

function ColorSwatch({ colors }: { colors: string[] }) {
  const background = colors.length > 1 ? `linear-gradient(90deg, ${colors.join(', ')})` : colors[0]
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-[3px] border border-foreground/30"
      style={{ background }}
    />
  )
}

/**
 * Timeline View: one row per person (grouped by principal cast, supporting cast and
 * department), one column per day of the month. Every row is the same height and a person's
 * bookings share one line, so nothing stacks and empty rows look the same as busy ones.
 */
export function BookingsTimelineView({
  year,
  monthIndex,
  monthLabel,
  spans,
  people,
  bookingById,
  colorConfig,
  shootDays,
  hideUnbookedPeople,
  pending,
  onEditBooking,
}: {
  year: number
  monthIndex: number
  monthLabel: string
  spans: BookingSpan[]
  people: Person[]
  bookingById: Map<string, Booking>
  colorConfig: BookingColorConfig
  shootDays: ShootDay[]
  hideUnbookedPeople: boolean
  pending: boolean
  onEditBooking: (booking: Booking) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthPrefix = `${year}-${pad(monthIndex + 1)}-`
  const todayIso = localIso(new Date())

  const shootDates = useMemo(() => new Set(shootDays.map((d) => d.shoot_date)), [shootDays])
  const days = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const date = `${monthPrefix}${pad(i + 1)}`
        return { day: i + 1, date, weekday: new Date(year, monthIndex, i + 1).getDay() }
      }),
    [daysInMonth, monthPrefix, year, monthIndex]
  )

  const spansByPerson = useMemo(() => {
    const m = new Map<string, BookingSpan[]>()
    for (const span of spans) {
      if (!getMonthTimelineSegment(span, year, monthIndex)) continue
      m.set(span.personId, [...(m.get(span.personId) ?? []), span])
    }
    return m
  }, [spans, year, monthIndex])

  const groups = useMemo(() => {
    const all = buildTimelineGroups(people, colorConfig)
    if (!hideUnbookedPeople) return all
    return all
      .map((g) => ({ ...g, people: g.people.filter((p) => spansByPerson.has(p.id)) }))
      .filter((g) => g.people.length > 0)
  }, [people, colorConfig, hideUnbookedPeople, spansByPerson])

  const bookedDaysInMonth = (personId: string) =>
    (spansByPerson.get(personId) ?? []).reduce(
      (n, span) => n + span.days.filter((d) => d.date.startsWith(monthPrefix)).length,
      0
    )

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const gridColumns = `${LABEL_WIDTH} minmax(0, 1fr)`
  const dayColumns = `repeat(${daysInMonth}, minmax(0, 1fr))`

  return (
    <div data-slot="booking-frame" className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="max-h-[min(74vh,44rem)] overflow-auto">
        <div className="relative" style={{ minWidth: `calc(${LABEL_WIDTH} + ${daysInMonth} * ${DAY_WIDTH})` }}>
          <div
            className="absolute inset-y-0 grid"
            style={{ left: LABEL_WIDTH, right: 0, gridTemplateColumns: dayColumns }}
          >
            {days.map(({ date, weekday }) => (
              <DayColumn
                key={date}
                dateStr={date}
                isShootDay={shootDates.has(date)}
                isToday={date === todayIso}
                isMonday={weekday === 1}
              />
            ))}
          </div>

          <div className="sticky top-0 z-20 grid" style={{ gridTemplateColumns: gridColumns, height: HEAD_HEIGHT }}>
            <div
              data-slot="booking-head"
              className="sticky left-0 z-10 flex items-center justify-between border-b border-r border-border bg-muted px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <span>Person</span>
              <span>Days</span>
            </div>
            <div
              data-slot="booking-head"
              className="grid border-b border-border bg-muted text-muted-foreground"
              style={{ gridTemplateColumns: dayColumns }}
            >
              {days.map(({ day, date, weekday }) => {
                const isToday = date === todayIso
                return (
                  <div
                    key={date}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 tabular-nums',
                      !shootDates.has(date) && 'opacity-60'
                    )}
                  >
                    <span className="text-[9.5px] font-semibold leading-none">{WEEKDAY_LETTERS[weekday]}</span>
                    <span
                      className={cn(
                        'inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-[var(--ui-tag-radius,0.375rem)] px-0.5 text-xs font-semibold leading-none',
                        isToday && 'bg-primary text-primary-foreground opacity-100'
                      )}
                    >
                      {day}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {groups.length === 0 && (
            <div className="sticky left-0 px-4 py-10 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {hideUnbookedPeople ? `Nobody is booked in ${monthLabel}` : 'No people to show'}
              </p>
              <p className="mt-1 text-xs">
                {hideUnbookedPeople
                  ? 'Turn off "Hide people with no bookings" in Appearance Settings to see the full list.'
                  : 'Adjust the filters above, or add people from Cast or Crew.'}
              </p>
            </div>
          )}

          {groups.length > 0 && spansByPerson.size === 0 && (
            <div className="relative z-[1] border-b border-foreground/15">
              <p className="sticky left-0 w-fit px-3 py-2 text-xs text-muted-foreground">
                No bookings in {monthLabel}
              </p>
            </div>
          )}

          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key)
            const groupBooked = group.people.reduce((n, p) => n + bookedDaysInMonth(p.id), 0)
            return (
              <div key={group.key}>
                <div className="relative z-[1] grid" style={{ gridTemplateColumns: gridColumns, height: ROW_HEIGHT }}>
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleGroup(group.key)}
                    className="sticky left-0 z-10 flex items-center gap-2 border-b border-r border-foreground/15 bg-muted px-2.5 text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <ChevronDown className={cn('size-4 shrink-0 transition-transform', isCollapsed && '-rotate-90')} />
                    <ColorSwatch colors={group.colors} />
                    <span className="truncate">{group.label}</span>
                    <span className="ml-auto shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                      {group.people.length} | {groupBooked}d
                    </span>
                  </button>
                  <div className="border-b border-foreground/15 bg-muted/70" />
                </div>

                {!isCollapsed &&
                  group.people.map((person) => {
                    const color = resolvePersonColor(person, colorConfig)
                    const textColor = getContrastText(color)
                    const personSpans = spansByPerson.get(person.id) ?? []
                    const booked = bookedDaysInMonth(person.id)
                    return (
                      <div
                        key={person.id}
                        className="relative z-[1] grid"
                        style={{ gridTemplateColumns: gridColumns, height: ROW_HEIGHT }}
                      >
                        <div className="sticky left-0 z-10 flex items-center gap-2.5 border-b border-r border-foreground/15 bg-card px-2.5">
                          <span
                            aria-hidden="true"
                            className={cn(
                              'grid size-6 shrink-0 place-items-center rounded-[var(--ui-tag-radius,0.375rem)] text-[10px] font-bold ring-1 ring-inset ring-black/10',
                              personSpans.length === 0 && 'opacity-50'
                            )}
                            style={{ backgroundColor: color, color: textColor }}
                          >
                            {personInitials(person.name)}
                          </span>
                          <span className={cn('grid min-w-0 leading-tight', personSpans.length === 0 && 'opacity-60')}>
                            <span className="truncate text-sm font-medium text-foreground">{person.name}</span>
                            {person.role_name && (
                              <span className="truncate text-[11px] text-muted-foreground">{person.role_name}</span>
                            )}
                          </span>
                          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {booked > 0 ? `${booked}d` : '–'}
                          </span>
                        </div>

                        <div className="grid border-b border-foreground/15" style={{ gridTemplateColumns: dayColumns }}>
                          {personSpans.map((span) => {
                            const seg = getMonthTimelineSegment(span, year, monthIndex)
                            if (!seg) return null
                            const rep = bookingById.get(span.bookingIds[0])
                            const columns = seg.endDay - seg.startDay + 1
                            const dayCount = span.shootDayIds.length
                            const role = rep?.role?.trim() || (person.is_cast === 1 ? person.role_name?.trim() : '')
                            const label =
                              columns >= 3
                                ? `${dayCount}d${role ? ` | ${role}` : ''}`
                                : columns >= 2
                                  ? `${dayCount}d`
                                  : ''
                            return (
                              <div
                                key={spanKeyOf(span)}
                                className={cn('flex items-center px-px', seg.continuesLeft && 'pl-0', seg.continuesRight && 'pr-0')}
                                style={{ gridColumn: `${seg.startDay} / ${seg.endDay + 1}`, gridRow: 1 }}
                              >
                                <div className="h-[1.65rem] w-full">
                                  <BookingSpanPill
                                    spanKey={spanKeyOf(span)}
                                    weekIndex={0}
                                    label={label}
                                    color={color}
                                    textColor={textColor}
                                    continuesLeft={seg.continuesLeft}
                                    continuesRight={seg.continuesRight}
                                    tooltip={<SpanTooltip span={span} person={person} representative={rep} />}
                                    disabled={pending}
                                    onOpen={() => {
                                      if (rep) onEditBooking(rep)
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
