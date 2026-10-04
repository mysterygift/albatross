import { useMemo, useState, type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Booking, Person, ShootDay } from '@/lib/db/types'
import type { BookingIntelligenceSummary } from '@/lib/people/bookingIntelligence'
import {
  getMonthSpanSegments,
  layoutWeekLanes,
  type BookingSpan,
} from '@/features/people/lib/bookingSpans'
import {
  getContrastText,
  resolvePersonColor,
  type BookingColorConfig,
} from '@/features/people/lib/bookingCalendarColors'
import { BookingSpanPill } from './BookingSpanPill'
import { SpanTooltip } from './SpanTooltip'
import { BOOKING_DATE_ATTR, formatDateRange, personPriority, spanKeyOf } from './bookingViewShared'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HEADER_ROW = '1.9rem'
const LANE_HEIGHT = '1.55rem'
const BOTTOM_PADDING = '0.375rem'

/** Faint diagonal hatching marks days with no shoot day, so gaps read as intentional. */
const OFF_DAY_HATCH =
  'repeating-linear-gradient(135deg, color-mix(in srgb, var(--foreground) 6%, transparent) 0 6px, transparent 6px 12px)'

function localIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function DroppableDayCell({
  dateStr,
  col,
  isShootDay,
  isLastCol,
  children,
}: {
  dateStr: string
  col: number
  isShootDay: boolean
  isLastCol: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `date-${dateStr}` })
  return (
    <div
      ref={setNodeRef}
      {...{ [BOOKING_DATE_ATTR]: dateStr }}
      style={{
        gridColumn: col + 1,
        gridRow: '1 / -1',
        backgroundImage: isShootDay ? undefined : OFF_DAY_HATCH,
      }}
      className={cn(
        'border-foreground/15 px-1.5 pt-1',
        !isLastCol && 'border-r',
        !isShootDay && 'bg-muted/40',
        isOver && 'ring-2 ring-inset ring-mint-500/60'
      )}
    >
      {children}
    </div>
  )
}

/** "+n more" button for a day whose bookings do not all fit; opens the full list for that day. */
function MoreButton({
  count,
  date,
  daySpans,
  personById,
  colorConfig,
  col,
  row,
  onEditBooking,
  bookingById,
}: {
  count: number
  date: string
  daySpans: BookingSpan[]
  personById: Map<string, Person>
  colorConfig: BookingColorConfig
  col: number
  row: number
  bookingById: Map<string, Booking>
  onEditBooking: (booking: Booking) => void
}) {
  const [open, setOpen] = useState(false)
  const [y, m, d] = date.split('-').map(Number)
  const heading = new Date(y, m - 1, d).toLocaleDateString('default', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="booking-more"
          style={{ gridColumn: col + 1, gridRow: row }}
          className="mx-1 my-px self-center rounded-md border border-dashed border-foreground/40 text-[11px] font-medium leading-none text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          +{count} more
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <p className="px-2 pb-1.5 pt-1 text-xs font-semibold text-foreground">
          {heading} <span className="font-normal text-muted-foreground">| {daySpans.length} booked</span>
        </p>
        <ul className="max-h-60 space-y-0.5 overflow-y-auto">
          {daySpans.map((span) => {
            const person = personById.get(span.personId)
            const color = person ? resolvePersonColor(person, colorConfig) : colorConfig.crewFallbackColor
            const rep = bookingById.get(span.bookingIds[0])
            return (
              <li key={spanKeyOf(span)}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setOpen(false)
                    if (rep) onEditBooking(rep)
                  }}
                >
                  <span className="size-3 shrink-0 rounded-sm border border-foreground/30" style={{ backgroundColor: color }} />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{person?.name ?? 'Unknown'}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatDateRange(span.startDate, span.endDate)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Calendar View: a month grid where every week row is the same height. Each week reserves
 * `lanesPerWeek` lane slots; when a week needs more, the last slot becomes "+n more" buttons.
 */
export function BookingsCalendarView({
  year,
  monthIndex,
  monthLabel,
  spans,
  personById,
  bookingById,
  colorConfig,
  shootDays,
  bookingIntelligence,
  lanesPerWeek,
  pending,
  onEditBooking,
}: {
  year: number
  monthIndex: number
  monthLabel: string
  spans: BookingSpan[]
  personById: Map<string, Person>
  bookingById: Map<string, Booking>
  colorConfig: BookingColorConfig
  shootDays: ShootDay[]
  bookingIntelligence?: BookingIntelligenceSummary
  lanesPerWeek: number
  pending: boolean
  onEditBooking: (booking: Booking) => void
}) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7)
  const todayIso = localIso(new Date())

  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStrOf = (day: number) => `${year}-${pad(monthIndex + 1)}-${pad(day)}`

  const shootDayByDate = useMemo(() => {
    const m = new Map<string, ShootDay>()
    for (const d of shootDays) m.set(d.shoot_date, d)
    return m
  }, [shootDays])

  const weekLayouts = useMemo(() => {
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
    return rawByWeek.map((segs) =>
      layoutWeekLanes(segs, lanesPerWeek, (s) =>
        personPriority(personById.get(s.span.personId), colorConfig)
      )
    )
  }, [spans, weekCount, year, monthIndex, lanesPerWeek, personById, colorConfig])

  const hasAnyBooking = useMemo(
    () => spans.some((s) => getMonthSpanSegments(s, year, monthIndex).length > 0),
    [spans, year, monthIndex]
  )

  const spansOnDate = (date: string) =>
    spans
      .filter((s) => s.startDate <= date && date <= s.endDate)
      .sort(
        (a, b) =>
          personPriority(personById.get(a.personId), colorConfig) -
            personPriority(personById.get(b.personId), colorConfig) ||
          (personById.get(a.personId)?.name ?? '').localeCompare(personById.get(b.personId)?.name ?? '')
      )

  return (
    <div data-slot="booking-frame" className="overflow-hidden rounded-lg border border-border bg-card">
      <div
        data-slot="booking-head"
        className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="relative">
        {Array.from({ length: weekCount }, (_, week) => {
          const layout = weekLayouts[week]
          return (
            <div
              key={week}
              className="grid grid-cols-7 border-t border-foreground/15 first:border-t-0"
              style={{
                gridTemplateRows: `${HEADER_ROW} repeat(${lanesPerWeek}, ${LANE_HEIGHT}) ${BOTTOM_PADDING}`,
              }}
            >
              {Array.from({ length: 7 }, (_, col) => {
                const day = week * 7 + col - firstWeekday + 1
                const inMonth = day >= 1 && day <= daysInMonth
                if (!inMonth) {
                  return (
                    <div
                      key={col}
                      style={{ gridColumn: col + 1, gridRow: '1 / -1' }}
                      className={cn('bg-muted/20', col < 6 && 'border-r border-foreground/15')}
                    />
                  )
                }
                const dateStr = dateStrOf(day)
                const shootDay = shootDayByDate.get(dateStr)
                const coverage =
                  bookingIntelligence && shootDay ? bookingIntelligence.byShootDay.get(shootDay.id) : null
                const isToday = dateStr === todayIso
                return (
                  <DroppableDayCell
                    key={col}
                    dateStr={dateStr}
                    col={col}
                    isShootDay={!!shootDay}
                    isLastCol={col === 6}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span
                        className={cn(
                          'inline-flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-[var(--ui-tag-radius,0.375rem)] px-1 text-sm font-medium tabular-nums',
                          isToday
                            ? 'bg-primary font-bold text-primary-foreground'
                            : shootDay
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                        )}
                      >
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

              {layout.visible.map(({ segment, lane }) => {
                const { span, startCol, endCol, continuesLeft, continuesRight } = segment
                const person = personById.get(span.personId)
                const color = person ? resolvePersonColor(person, colorConfig) : colorConfig.crewFallbackColor
                const rep = bookingById.get(span.bookingIds[0])
                return (
                  <div
                    key={`${spanKeyOf(span)}-${lane}`}
                    className={cn('px-px pb-0.5', continuesLeft && 'pl-0', continuesRight && 'pr-0')}
                    style={{ gridColumn: `${startCol + 1} / ${endCol + 2}`, gridRow: lane + 2 }}
                  >
                    <BookingSpanPill
                      spanKey={spanKeyOf(span)}
                      weekIndex={week}
                      label={person?.name ?? '—'}
                      color={color}
                      textColor={getContrastText(color)}
                      continuesLeft={continuesLeft}
                      continuesRight={continuesRight}
                      tooltip={<SpanTooltip span={span} person={person} representative={rep} />}
                      disabled={pending}
                      onOpen={() => {
                        if (rep) onEditBooking(rep)
                      }}
                    />
                  </div>
                )
              })}

              {layout.hasOverflow &&
                layout.hiddenPerColumn.map((count, col) => {
                  const day = week * 7 + col - firstWeekday + 1
                  if (count === 0 || day < 1 || day > daysInMonth) return null
                  const date = dateStrOf(day)
                  return (
                    <MoreButton
                      key={`more-${col}`}
                      count={count}
                      date={date}
                      daySpans={spansOnDate(date)}
                      personById={personById}
                      bookingById={bookingById}
                      colorConfig={colorConfig}
                      col={col}
                      row={lanesPerWeek + 1}
                      onEditBooking={onEditBooking}
                    />
                  )
                })}
            </div>
          )
        })}

        {!hasAnyBooking && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="max-w-xs rounded-lg border border-border bg-popover px-5 py-4 text-center shadow-sm">
              <p className="text-sm font-semibold text-foreground">No bookings in {monthLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a booking, or use the arrows to find another month.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
