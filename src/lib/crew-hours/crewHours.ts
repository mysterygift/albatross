/**
 * Crew hours (experimental): pure calculations for hours worked, overtime and rest between days.
 * No DB access; see repositories/crewHours.ts for storage and features/people/crew-hours for the UI.
 *
 * Times are 24-hour HH:MM on a shoot date. A wrap earlier than its call is taken to be after
 * midnight, so night shoots work without a separate date field.
 */

import type { Booking, Person, ShootDay } from '@/lib/db/types'
import { roundMoney } from '@/lib/money/roundMoney'

export type OvertimeBasis = 'scheduled_wrap' | 'day_length'

export type CrewHoursSettings = {
  overtime_basis: OvertimeBasis
  /** Length of a standard day from call, including lunch (used by 'day_length'). */
  standard_day_minutes: number
  /** Hourly rate = day rate / this. */
  hourly_rate_divisor: number
  /** Overtime hour = hourly rate × this. */
  overtime_multiplier: number
  /** Overtime is billed per started block of this many minutes; 0 bills exact minutes. */
  overtime_increment_minutes: number
  /** Rest needed between unit wrap and the next call. */
  minimum_rest_minutes: number
}

export const DEFAULT_CREW_HOURS_SETTINGS: CrewHoursSettings = {
  overtime_basis: 'scheduled_wrap',
  standard_day_minutes: 11 * 60,
  hourly_rate_divisor: 10,
  overtime_multiplier: 1.5,
  overtime_increment_minutes: 30,
  minimum_rest_minutes: 11 * 60,
}

const MINUTES_PER_DAY = 24 * 60

/** Minutes after midnight for "HH:MM", or null when blank or not a time. */
export function parseClock(value: string | null | undefined): number | null {
  const m = (value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Days since the epoch for an ISO date (YYYY-MM-DD), independent of time zone. */
function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Math.round(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000)
}

/**
 * A clock time on a shoot date as absolute minutes. With `notBefore`, a time that would fall
 * earlier is moved to the next day (a wrap after midnight).
 */
export function absoluteMinutes(isoDate: string, clock: string | null | undefined, notBefore?: number | null): number | null {
  const mins = parseClock(clock)
  if (mins == null) return null
  let abs = dayNumber(isoDate) * MINUTES_PER_DAY + mins
  if (notBefore != null && abs < notBefore) abs += MINUTES_PER_DAY
  return abs
}

/** "13h 15m", "45m", "0m". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—'
  const sign = minutes < 0 ? '−' : ''
  const total = Math.abs(Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${sign}${m}m`
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}m`
}

/** Billed overtime as hours: "½ hr", "1 hr", "1½ hr", "2¼ hr", or minutes when not on a quarter hour. */
export function formatOvertime(minutes: number): string {
  if (minutes <= 0) return '—'
  if (minutes % 15 !== 0) return formatDuration(minutes)
  const whole = Math.floor(minutes / 60)
  const frac = { 0: '', 15: '¼', 30: '½', 45: '¾' }[minutes % 60 as 0 | 15 | 30 | 45]
  return `${whole === 0 ? '' : whole}${frac} hr`
}

export type CrewDayInput = {
  shootDate: string
  /** This person's call and wrap (their own, else the unit's). */
  call: string | null
  wrap: string | null
  /** The shoot day's planned call and wrap (shoot_days). */
  scheduledCall: string | null
  scheduledWrap: string | null
  dayRate: number | null
  overtimeExempt: boolean
  settings: CrewHoursSettings
}

export type CrewDayResult = {
  callAbs: number | null
  wrapAbs: number | null
  workedMinutes: number | null
  /** When overtime begins, as absolute minutes. */
  overtimeStartAbs: number | null
  overtimeMinutes: number
  billedOvertimeMinutes: number
  /** 0 when exempt; null when there is overtime but no day rate to price it. */
  overtimeCost: number | null
}

export function computeCrewDay(input: CrewDayInput): CrewDayResult {
  const { settings } = input
  const callAbs = absoluteMinutes(input.shootDate, input.call)
  const wrapAbs = absoluteMinutes(input.shootDate, input.wrap, callAbs)
  const workedMinutes = callAbs != null && wrapAbs != null ? wrapAbs - callAbs : null

  let overtimeStartAbs: number | null = null
  if (settings.overtime_basis === 'scheduled_wrap' && input.scheduledWrap) {
    const anchor = absoluteMinutes(input.shootDate, input.scheduledCall) ?? callAbs
    overtimeStartAbs = absoluteMinutes(input.shootDate, input.scheduledWrap, anchor)
  }
  if (overtimeStartAbs == null && callAbs != null) overtimeStartAbs = callAbs + settings.standard_day_minutes

  const overtimeMinutes =
    wrapAbs != null && overtimeStartAbs != null ? Math.max(0, wrapAbs - overtimeStartAbs) : 0
  const inc = settings.overtime_increment_minutes
  const billedOvertimeMinutes = inc > 0 ? Math.ceil(overtimeMinutes / inc) * inc : overtimeMinutes

  let overtimeCost: number | null
  if (billedOvertimeMinutes === 0 || input.overtimeExempt) overtimeCost = 0
  else if (input.dayRate == null || settings.hourly_rate_divisor <= 0) overtimeCost = null
  else {
    const hourly = input.dayRate / settings.hourly_rate_divisor
    overtimeCost = roundMoney(hourly * settings.overtime_multiplier * (billedOvertimeMinutes / 60))
  }

  return { callAbs, wrapAbs, workedMinutes, overtimeStartAbs, overtimeMinutes, billedOvertimeMinutes, overtimeCost }
}

/** Minutes between a wrap and the next call (next shoot date + call), or null when either is unknown. */
export function restMinutes(wrapAbs: number | null, nextShootDate: string | null, nextCall: string | null): number | null {
  if (wrapAbs == null || !nextShootDate) return null
  const nextCallAbs = absoluteMinutes(nextShootDate, nextCall)
  return nextCallAbs == null ? null : nextCallAbs - wrapAbs
}

/** True when a booking covers the shoot day: by shoot_day_id, or by a date range that includes its date. */
export function bookingCoversDay(booking: Pick<Booking, 'shoot_day_id' | 'start_date' | 'end_date'>, day: Pick<ShootDay, 'id' | 'shoot_date'>): boolean {
  if (booking.shoot_day_id) return booking.shoot_day_id === day.id
  if (!booking.start_date) return false
  const end = booking.end_date ?? booking.start_date
  return booking.start_date <= day.shoot_date && day.shoot_date <= end
}

/**
 * Crew on a shoot day: crew (not cast) booked on it, plus anyone with their own hours recorded for it.
 * Sorted by department, then name.
 */
export function crewForDay(params: {
  people: Pick<Person, 'id' | 'name' | 'is_cast' | 'department' | 'deleted_at'>[]
  bookings: Pick<Booking, 'person_id' | 'shoot_day_id' | 'start_date' | 'end_date' | 'deleted_at'>[]
  day: Pick<ShootDay, 'id' | 'shoot_date'>
  personIdsWithHours: Iterable<string>
}): string[] {
  const ids = new Set<string>(params.personIdsWithHours)
  for (const b of params.bookings) {
    if (!b.deleted_at && bookingCoversDay(b, params.day)) ids.add(b.person_id)
  }
  return params.people
    .filter((p) => ids.has(p.id) && !p.deleted_at && Number(p.is_cast) !== 1)
    .sort(
      (a, b) =>
        (a.department ?? '~').localeCompare(b.department ?? '~') || a.name.localeCompare(b.name)
    )
    .map((p) => p.id)
}

export type LabourRateCandidate = {
  person_id: string | null
  rate_per_day: number | null
  labour_rate_type: 'prep_day' | 'shoot_day' | 'overtime' | null
}

/**
 * Each person's shoot-day rate from their labour budget lines: a 'shoot_day' line wins, then an
 * untyped one, then a prep day rate. Overtime lines are budgets for overtime, not rates, so are ignored.
 */
export function pickDayRates(lines: LabourRateCandidate[]): Map<string, number> {
  const rank = (t: LabourRateCandidate['labour_rate_type']) => (t === 'shoot_day' ? 0 : t == null ? 1 : 2)
  const best = new Map<string, { rate: number; rank: number }>()
  for (const l of lines) {
    if (!l.person_id || l.labour_rate_type === 'overtime') continue
    if (l.rate_per_day == null || !(l.rate_per_day > 0)) continue
    const r = rank(l.labour_rate_type)
    const prev = best.get(l.person_id)
    if (!prev || r < prev.rank) best.set(l.person_id, { rate: l.rate_per_day, rank: r })
  }
  return new Map([...best].map(([id, v]) => [id, v.rate]))
}

export type CrewHoursRowInput = {
  personId: string
  ownCall: string | null
  ownWrap: string | null
  dayRate: number | null
  overtimeExempt: boolean
  /** This person's call on the next shoot day, if recorded. */
  nextOwnCall?: string | null
}

export type CrewHoursRow = CrewDayResult & {
  personId: string
  /** Effective call / wrap: their own, else the unit's. */
  call: string | null
  wrap: string | null
  /** Their own call / wrap when recorded; null = the unit's. */
  ownCall: string | null
  ownWrap: string | null
  /** True when this person has their own call or wrap. */
  ownTimes: boolean
  dayRate: number | null
  overtimeExempt: boolean
  restMinutes: number | null
  shortRest: boolean
}

export type CrewHoursDayInput = {
  shootDate: string
  scheduledCall: string | null
  scheduledWrap: string | null
  /** The unit's actual call / wrap (Script Supervisor day log); null = not logged yet. */
  actualCall: string | null
  actualWrap: string | null
  nextShootDate: string | null
  /** The next day's unit call: actual if logged, else planned. */
  nextUnitCall: string | null
  settings: CrewHoursSettings
  people: CrewHoursRowInput[]
}

export type CrewHoursDaySummary = {
  unitCall: string | null
  unitWrap: string | null
  /** True when the unit wrap is the planned one (no actual wrap logged), so figures are projected. */
  projected: boolean
  rows: CrewHoursRow[]
  crewCount: number
  /** People whose overtime is payable (not exempt) and who have overtime. */
  withOvertime: number
  /** Priced overtime: sum of costs that could be worked out. */
  overtimeCost: number
  /** Non-exempt people with overtime but no day rate, so not priced. */
  unpricedCount: number
  /** Non-exempt people (eligible for overtime), and how many of them have a rate. */
  eligibleCount: number
  pricedEligibleCount: number
  shortRestCount: number
  ownTimesCount: number
  unitOvertime: CrewDayResult
}

export function computeCrewHoursDay(input: CrewHoursDayInput): CrewHoursDaySummary {
  const unitCall = input.actualCall ?? input.scheduledCall
  const unitWrap = input.actualWrap ?? input.scheduledWrap
  const projected = input.actualWrap == null
  const base = {
    shootDate: input.shootDate,
    scheduledCall: input.scheduledCall,
    scheduledWrap: input.scheduledWrap,
    settings: input.settings,
  }

  const rows: CrewHoursRow[] = input.people.map((p) => {
    const call = p.ownCall ?? unitCall
    const wrap = p.ownWrap ?? unitWrap
    const day = computeCrewDay({ ...base, call, wrap, dayRate: p.dayRate, overtimeExempt: p.overtimeExempt })
    const rest = restMinutes(day.wrapAbs, input.nextShootDate, p.nextOwnCall ?? input.nextUnitCall)
    return {
      ...day,
      personId: p.personId,
      call,
      wrap,
      ownCall: p.ownCall,
      ownWrap: p.ownWrap,
      ownTimes: p.ownCall != null || p.ownWrap != null,
      dayRate: p.dayRate,
      overtimeExempt: p.overtimeExempt,
      restMinutes: rest,
      shortRest: rest != null && rest < input.settings.minimum_rest_minutes,
    }
  })

  const eligible = rows.filter((r) => !r.overtimeExempt)
  return {
    unitCall,
    unitWrap,
    projected,
    rows,
    crewCount: rows.length,
    withOvertime: eligible.filter((r) => r.billedOvertimeMinutes > 0).length,
    overtimeCost: roundMoney(rows.reduce((s, r) => s + (r.overtimeCost ?? 0), 0)),
    unpricedCount: eligible.filter((r) => r.billedOvertimeMinutes > 0 && r.overtimeCost == null).length,
    eligibleCount: eligible.length,
    pricedEligibleCount: eligible.filter((r) => r.dayRate != null).length,
    shortRestCount: rows.filter((r) => r.shortRest).length,
    ownTimesCount: rows.filter((r) => r.ownTimes).length,
    unitOvertime: computeCrewDay({ ...base, call: unitCall, wrap: unitWrap, dayRate: null, overtimeExempt: false }),
  }
}
