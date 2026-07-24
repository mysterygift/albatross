/**
 * Booking span math for the People Bookings calendar.
 *
 * The data model stores one booking row per shoot day (`shoot_day_id`). For the
 * calendar we present a person's consecutive shoot-day bookings as a single
 * contiguous "span" (pillbox). A span breaks whenever there is an intervening
 * production shoot day for which the person has no booking. Adjacent booked
 * shoot days form one span even if non-shoot calendar days sit between them
 * (e.g. a Friday + Monday booking with no weekend shoot days is one span).
 *
 * All functions here are pure so they can be unit tested without React.
 */

import type { Booking, ShootDay } from '@/lib/db/types'

export type BookingSpanDay = {
  bookingId: string
  shootDayId: string
  date: string
}

export type BookingSpan = {
  personId: string
  /** Inclusive ISO date (YYYY-MM-DD) of the first booked shoot day. */
  startDate: string
  /** Inclusive ISO date (YYYY-MM-DD) of the last booked shoot day. */
  endDate: string
  bookingIds: string[]
  shootDayIds: string[]
  days: BookingSpanDay[]
}

/** Adds (or subtracts) whole days to an ISO date string using UTC to avoid DST drift. */
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Whole-day difference `b - a` between two ISO date strings. */
export function diffDaysIso(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const au = Date.UTC(ay, am - 1, ad)
  const bu = Date.UTC(by, bm - 1, bd)
  return Math.round((bu - au) / 86_400_000)
}

/**
 * Groups a person's bookings into contiguous spans based on shoot-day ordering.
 * A run continues while consecutive booked shoot days are adjacent in the
 * production's shoot-day sequence (no unbooked shoot day in between).
 */
export function buildBookingSpans(bookings: Booking[], shootDays: ShootDay[]): BookingSpan[] {
  const dateByShootDayId = new Map<string, string>()
  for (const d of shootDays) dateByShootDayId.set(d.id, d.shoot_date)

  // Global shoot-day ordering by date, used to detect gaps between bookings.
  const orderedDates = [...new Set(shootDays.map((d) => d.shoot_date))].sort()
  const orderIndexByDate = new Map<string, number>()
  orderedDates.forEach((date, i) => orderIndexByDate.set(date, i))

  type Entry = BookingSpanDay & { order: number }
  const byPerson = new Map<string, Entry[]>()
  for (const b of bookings) {
    if (!b.shoot_day_id) continue
    const date = dateByShootDayId.get(b.shoot_day_id)
    if (!date) continue
    const order = orderIndexByDate.get(date)
    if (order === undefined) continue
    const arr = byPerson.get(b.person_id) ?? []
    arr.push({ bookingId: b.id, shootDayId: b.shoot_day_id, date, order })
    byPerson.set(b.person_id, arr)
  }

  const spans: BookingSpan[] = []
  for (const [personId, entriesRaw] of byPerson) {
    const entries = entriesRaw.sort((a, b) => a.order - b.order || a.date.localeCompare(b.date))
    let run: Entry[] = []
    const flush = () => {
      if (run.length === 0) return
      const days = run.map(({ bookingId, shootDayId, date }) => ({ bookingId, shootDayId, date }))
      spans.push({
        personId,
        startDate: run[0].date,
        endDate: run[run.length - 1].date,
        bookingIds: run.map((e) => e.bookingId),
        shootDayIds: [...new Set(run.map((e) => e.shootDayId))],
        days,
      })
      run = []
    }
    for (const entry of entries) {
      if (run.length === 0) {
        run.push(entry)
        continue
      }
      const prev = run[run.length - 1]
      // Same shoot day (duplicate booking) or the next shoot day in sequence → same span.
      if (entry.order - prev.order <= 1) {
        run.push(entry)
      } else {
        flush()
        run.push(entry)
      }
    }
    flush()
  }

  return spans.sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.personId.localeCompare(b.personId)
  )
}

export type MonthSpanSegment = {
  /** Zero-based week row within the rendered month grid. */
  weekIndex: number
  /** Zero-based column (0 = Sunday ... 6 = Saturday). */
  startCol: number
  endCol: number
  /** True when the span continues into an earlier week or a previous month. */
  continuesLeft: boolean
  /** True when the span continues into a later week or the next month. */
  continuesRight: boolean
}

function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10))
}

/**
 * Splits a span into per-week segments for a given rendered month (Sunday-start
 * grid with leading blanks). Segments are clamped to the visible month; the
 * `continuesLeft`/`continuesRight` flags indicate clipped ends (square caps).
 */
export function getMonthSpanSegments(
  span: { startDate: string; endDate: string },
  year: number,
  month: number
): MonthSpanSegment[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthStart = `${year}-${pad(month + 1)}-01`
  const monthEnd = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`

  if (span.endDate < monthStart || span.startDate > monthEnd) return []

  const firstWeekday = new Date(year, month, 1).getDay()
  const startsBeforeMonth = span.startDate < monthStart
  const endsAfterMonth = span.endDate > monthEnd
  const clampStartDay = startsBeforeMonth ? 1 : dayOfMonth(span.startDate)
  const clampEndDay = endsAfterMonth ? daysInMonth : dayOfMonth(span.endDate)

  const segments: MonthSpanSegment[] = []
  let cursor = clampStartDay
  while (cursor <= clampEndDay) {
    const cellIndex = firstWeekday + cursor - 1
    const weekIndex = Math.floor(cellIndex / 7)
    const weekLastCell = (weekIndex + 1) * 7 - 1
    const weekLastDay = Math.min(clampEndDay, weekLastCell - firstWeekday + 1)
    const startCol = (firstWeekday + cursor - 1) % 7
    const endCol = (firstWeekday + weekLastDay - 1) % 7
    segments.push({
      weekIndex,
      startCol,
      endCol,
      continuesLeft: cursor > clampStartDay || (cursor === clampStartDay && startsBeforeMonth),
      continuesRight: weekLastDay < clampEndDay || (weekLastDay === clampEndDay && endsAfterMonth),
    })
    cursor = weekLastDay + 1
  }
  return segments
}

/**
 * Assigns non-overlapping lanes (vertical rows) to a week's segments so that
 * overlapping people never render on top of each other. Greedy by start column.
 */
export function assignLanes<T extends { startCol: number; endCol: number }>(
  segments: T[]
): { segment: T; lane: number }[] {
  const laneEnds: number[] = []
  const ordered = [...segments].sort(
    (a, b) => a.startCol - b.startCol || b.endCol - a.endCol
  )
  const result: { segment: T; lane: number }[] = []
  for (const segment of ordered) {
    let lane = laneEnds.findIndex((end) => end < segment.startCol)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(segment.endCol)
    } else {
      laneEnds[lane] = segment.endCol
    }
    result.push({ segment, lane })
  }
  return result
}

export type SpanMovePlan =
  | { ok: true; updates: { bookingId: string; shootDayId: string }[] }
  | { ok: false; reason: string }

/**
 * Computes the booking updates needed to move a whole span by `offsetDays`.
 * Every booked shoot day must map to an existing shoot day at the shifted date
 * and must not collide with another (non-span) booking for the same person.
 */
export function computeSpanMovePlan(args: {
  span: BookingSpan
  offsetDays: number
  shootDayIdByDate: Map<string, string>
  blockedShootDayIds: Set<string>
}): SpanMovePlan {
  const { span, offsetDays, shootDayIdByDate, blockedShootDayIds } = args
  if (offsetDays === 0) return { ok: true, updates: [] }
  const updates: { bookingId: string; shootDayId: string }[] = []
  for (const day of span.days) {
    const newDate = addDaysIso(day.date, offsetDays)
    const shootDayId = shootDayIdByDate.get(newDate)
    if (!shootDayId) return { ok: false, reason: `No shoot day on ${newDate}` }
    if (blockedShootDayIds.has(shootDayId)) {
      return { ok: false, reason: `Already booked on ${newDate}` }
    }
    updates.push({ bookingId: day.bookingId, shootDayId })
  }
  return { ok: true, updates }
}

export type SpanResizePlan = {
  creates: { shootDayId: string; role: string | null; notes: string | null }[]
  deletes: string[]
}

/**
 * Computes creates/deletes to resize a span to `[newStartDate, newEndDate]`.
 * Every shoot day in the new inclusive range gets a booking (created if
 * missing); span bookings that fall outside the new range are deleted.
 */
export function computeSpanResizePlan(args: {
  span: BookingSpan
  newStartDate: string
  newEndDate: string
  shootDaysInRange: { id: string; date: string }[]
  personBookedShootDayIds: Set<string>
  role: string | null
  notes: string | null
}): SpanResizePlan {
  const { span, newStartDate, newEndDate, shootDaysInRange, personBookedShootDayIds, role, notes } =
    args
  const creates = shootDaysInRange
    .filter((sd) => !personBookedShootDayIds.has(sd.id))
    .map((sd) => ({ shootDayId: sd.id, role, notes }))
  const deletes = span.days
    .filter((d) => d.date < newStartDate || d.date > newEndDate)
    .map((d) => d.bookingId)
  return { creates, deletes }
}
