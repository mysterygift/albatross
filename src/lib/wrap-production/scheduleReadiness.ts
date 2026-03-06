/**
 * Schedule and calendar readiness for wrap production.
 * Read-only; uses existing shoot day and calendar data.
 * Compares shoot_date (YYYY-MM-DD) to today for "future" items.
 */

import type { ShootDay } from '@/lib/db/types'
import type { CalendarShootDayEvent } from '@/lib/db/types'

export type ScheduleReadinessStatus = 'ready' | 'needs_review'

export type ScheduleReadinessSummary = {
  status: ScheduleReadinessStatus
  futureShootDayCount: number
  futureScheduledActivityCount: number
  /** Latest scheduled date (YYYY-MM-DD) among all shoot days; null if none. */
  latestScheduledDate: string | null
}

export type FutureScheduleRow = {
  date: string
  label: string
  unitName: string | null
  dayNumber: number | null
  /** Unique key for list (e.g. shootDayUnitId when from calendar events). */
  key: string
}

/**
 * Returns today's date in local YYYY-MM-DD (no timezone shift).
 */
export function getTodayYyyyMmDd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** End date for "future" range: yearsFromNow from today, YYYY-MM-DD. */
export function getEndOfFutureYyyyMmDd(yearsFromNow: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + yearsFromNow)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Compute schedule readiness from shoot days.
 * Ready if no future shoot days; needs_review if any exist.
 * When futureCalendarEvents are provided, future scheduled activity count uses that; otherwise shoot day count.
 */
export function getScheduleReadiness(params: {
  shootDays: ShootDay[]
  todayYyyyMmDd: string
  /** Optional: future calendar events for activity count and detail list. */
  futureCalendarEvents?: CalendarShootDayEvent[]
}): ScheduleReadinessSummary {
  const { shootDays, todayYyyyMmDd, futureCalendarEvents } = params
  const futureShootDays = shootDays.filter((d) => d.shoot_date > todayYyyyMmDd)
  const futureCount = futureShootDays.length
  const futureActivityCount =
    futureCalendarEvents?.filter((e) => e.date > todayYyyyMmDd).length ?? futureCount
  const allDates = shootDays.map((d) => d.shoot_date).filter(Boolean)
  const latestScheduledDate =
    allDates.length > 0 ? allDates.reduce((a, b) => (a > b ? a : b)) : null

  const status: ScheduleReadinessStatus =
    futureCount === 0 ? 'ready' : 'needs_review'

  return {
    status,
    futureShootDayCount: futureCount,
    futureScheduledActivityCount: futureActivityCount,
    latestScheduledDate,
  }
}

/**
 * Build detail rows for future schedule items.
 * Uses calendar events (one per shoot_day_unit) when provided; otherwise falls back to one row per future shoot day.
 */
export function getFutureScheduleRows(params: {
  shootDays: ShootDay[]
  todayYyyyMmDd: string
  /** Optional: from listCalendarShootDayEvents(productionId, { start: today, end: ... }) for richer unit-level rows. */
  futureCalendarEvents?: CalendarShootDayEvent[]
}): FutureScheduleRow[] {
  const { shootDays, todayYyyyMmDd, futureCalendarEvents } = params
  const shootDayById = new Map(shootDays.map((d) => [d.id, d]))
  const futureShootDays = shootDays.filter((d) => d.shoot_date > todayYyyyMmDd)

  if (futureCalendarEvents && futureCalendarEvents.length > 0) {
    return futureCalendarEvents
      .filter((e) => e.date > todayYyyyMmDd)
      .map((e) => {
        const day = shootDayById.get(e.shootDayId)
        const dayNumber = day?.day_number ?? null
        const label = `Shoot Day ${dayNumber ?? '?'} — ${e.unitName} — ${e.date}`
        return {
          date: e.date,
          label,
          unitName: e.unitName,
          dayNumber,
          key: e.shootDayUnitId,
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.unitName ?? '').localeCompare(b.unitName ?? ''))
  }

  // Fallback: one row per future shoot day (no unit breakdown).
  return futureShootDays.map((d) => ({
    date: d.shoot_date,
    label: `Shoot Day ${d.day_number ?? '?'} — ${d.shoot_date}`,
    unitName: null,
    dayNumber: d.day_number,
    key: d.id,
  }))
}
