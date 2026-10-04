/**
 * Layout helpers for the Bookings Timeline View: one row per person, one column
 * per day of the visible month. All functions are pure so they can be unit tested.
 */

import type { Person } from '@/lib/db/types'
import type { BookingColorConfig } from './bookingCalendarColors'
import { diffDaysIso } from './bookingSpans'

export type TimelineSegment = {
  /** 1-based day of month where the bar starts (clamped to the month). */
  startDay: number
  /** 1-based day of month where the bar ends (clamped to the month). */
  endDay: number
  continuesLeft: boolean
  continuesRight: boolean
}

/** Clamps a span to the visible month, or returns null when it misses the month entirely. */
export function getMonthTimelineSegment(
  span: { startDate: string; endDate: string },
  year: number,
  month: number
): TimelineSegment | null {
  const pad = (n: number) => String(n).padStart(2, '0')
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthStart = `${year}-${pad(month + 1)}-01`
  const monthEnd = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`
  if (span.endDate < monthStart || span.startDate > monthEnd) return null
  const startsBefore = span.startDate < monthStart
  const endsAfter = span.endDate > monthEnd
  return {
    startDay: startsBefore ? 1 : diffDaysIso(monthStart, span.startDate) + 1,
    endDay: endsAfter ? daysInMonth : diffDaysIso(monthStart, span.endDate) + 1,
    continuesLeft: startsBefore,
    continuesRight: endsAfter,
  }
}

export type TimelineGroup = {
  key: string
  label: string
  /** One color for department groups; several for principal cast so the swatch shows each. */
  colors: string[]
  people: Person[]
}

export const PRINCIPAL_GROUP_KEY = 'principal-cast'
export const SUPPORTING_GROUP_KEY = 'supporting-cast'
export const OTHER_CREW_GROUP_KEY = 'other-crew'

function castOrder(a: Person, b: Person): number {
  const an = a.cast_number ? Number(a.cast_number) : Number.POSITIVE_INFINITY
  const bn = b.cast_number ? Number(b.cast_number) : Number.POSITIVE_INFINITY
  if (an !== bn) return an - bn
  return a.name.localeCompare(b.name)
}

/**
 * Groups people for the timeline: principal cast, supporting cast, then crew by
 * department (alphabetical). Empty groups are omitted.
 */
export function buildTimelineGroups(people: Person[], config: BookingColorConfig): TimelineGroup[] {
  const principals = people.filter((p) => p.is_cast === 1 && p.id in config.principalCastColors).sort(castOrder)
  const supporting = people.filter((p) => p.is_cast === 1 && !(p.id in config.principalCastColors)).sort(castOrder)
  const crew = people.filter((p) => p.is_cast !== 1)

  const groups: TimelineGroup[] = []
  if (principals.length > 0) {
    groups.push({
      key: PRINCIPAL_GROUP_KEY,
      label: 'Principal cast',
      colors: principals.map((p) => config.principalCastColors[p.id]),
      people: principals,
    })
  }
  if (supporting.length > 0) {
    groups.push({
      key: SUPPORTING_GROUP_KEY,
      label: 'Supporting cast',
      colors: [config.supportingCastColor],
      people: supporting,
    })
  }

  const byDepartment = new Map<string, Person[]>()
  const noDepartment: Person[] = []
  for (const p of crew) {
    const dept = p.department?.trim()
    if (!dept) {
      noDepartment.push(p)
      continue
    }
    byDepartment.set(dept, [...(byDepartment.get(dept) ?? []), p])
  }
  for (const dept of [...byDepartment.keys()].sort((a, b) => a.localeCompare(b))) {
    groups.push({
      key: `dept:${dept}`,
      label: dept,
      colors: [config.departmentColors[dept] ?? config.crewFallbackColor],
      people: byDepartment.get(dept)!.sort((a, b) => a.name.localeCompare(b.name)),
    })
  }
  if (noDepartment.length > 0) {
    groups.push({
      key: OTHER_CREW_GROUP_KEY,
      label: 'Other crew',
      colors: [config.crewFallbackColor],
      people: noDepartment.sort((a, b) => a.name.localeCompare(b.name)),
    })
  }
  return groups
}

/** First and last initial (one letter for a single name) for an avatar chip. */
export function personInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]]
  return picked.map((w) => w[0].toUpperCase()).join('')
}
