import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OVERTIME_SETTINGS,
  absoluteMinutes,
  bookingCoversDay,
  computeCrewDay,
  computeOvertimeDay,
  crewForDay,
  formatDuration,
  formatOvertime,
  parseClock,
  pickDayRates,
  restMinutes,
  type OvertimeSettings,
} from './overtime'

const S = DEFAULT_OVERTIME_SETTINGS

describe('clock helpers', () => {
  it('parses HH:MM and rejects anything else', () => {
    expect(parseClock('08:00')).toBe(480)
    expect(parseClock('7:05')).toBe(425)
    expect(parseClock('24:00')).toBeNull()
    expect(parseClock('0800')).toBeNull()
    expect(parseClock('')).toBeNull()
    expect(parseClock(null)).toBeNull()
  })

  it('puts a time earlier than notBefore on the next day', () => {
    const call = absoluteMinutes('2026-11-06', '12:00')!
    const wrap = absoluteMinutes('2026-11-06', '00:30', call)!
    expect(wrap - call).toBe(12 * 60 + 30)
  })

  it('formats durations and billed overtime', () => {
    expect(formatDuration(795)).toBe('13h 15m')
    expect(formatDuration(45)).toBe('45m')
    expect(formatDuration(120)).toBe('2h')
    expect(formatDuration(null)).toBe('—')
    expect(formatOvertime(0)).toBe('—')
    expect(formatOvertime(30)).toBe('½ hr')
    expect(formatOvertime(60)).toBe('1 hr')
    expect(formatOvertime(90)).toBe('1½ hr')
    expect(formatOvertime(135)).toBe('2¼ hr')
    expect(formatOvertime(37)).toBe('37m')
  })
})

describe('computeCrewDay', () => {
  // Toothpick Day 3: call 08:00, planned wrap 20:00.
  const day3 = { shootDate: '2026-11-04', scheduledCall: '08:00', scheduledWrap: '20:00', settings: S }

  it('bills overtime past the planned wrap per started half hour', () => {
    const r = computeCrewDay({ ...day3, call: '08:00', wrap: '20:24', dayRate: 320, overtimeExempt: false })
    expect(r.workedMinutes).toBe(12 * 60 + 24)
    expect(r.overtimeMinutes).toBe(24)
    expect(r.billedOvertimeMinutes).toBe(30)
    // 320 / 10 × 1.5 × 0.5 h
    expect(r.overtimeCost).toBe(24)
  })

  it('prices a late de-rig', () => {
    const r = computeCrewDay({ ...day3, call: '08:00', wrap: '21:15', dayRate: 250, overtimeExempt: false })
    expect(r.billedOvertimeMinutes).toBe(90)
    expect(r.overtimeCost).toBe(56.25)
  })

  it('has no overtime at or before the planned wrap', () => {
    const r = computeCrewDay({ ...day3, call: '08:00', wrap: '20:00', dayRate: 250, overtimeExempt: false })
    expect(r.billedOvertimeMinutes).toBe(0)
    expect(r.overtimeCost).toBe(0)
  })

  it('costs nothing on a buyout, and cannot be priced without a rate', () => {
    expect(computeCrewDay({ ...day3, call: '08:00', wrap: '21:00', dayRate: 250, overtimeExempt: true }).overtimeCost).toBe(0)
    expect(computeCrewDay({ ...day3, call: '08:00', wrap: '21:00', dayRate: null, overtimeExempt: false }).overtimeCost).toBeNull()
  })

  it('bills exact minutes when the increment is 0', () => {
    const settings: OvertimeSettings = { ...S, overtime_increment_minutes: 0 }
    const r = computeCrewDay({ ...day3, settings, call: '08:00', wrap: '20:24', dayRate: 200, overtimeExempt: false })
    expect(r.billedOvertimeMinutes).toBe(24)
    expect(r.overtimeCost).toBe(12)
  })

  it('handles a night shoot wrapping after midnight', () => {
    // Toothpick Day 5: call 12:00, planned wrap 23:30; the unit actually wraps at 00:10.
    const r = computeCrewDay({
      shootDate: '2026-11-06',
      scheduledCall: '12:00',
      scheduledWrap: '23:30',
      settings: S,
      call: '12:00',
      wrap: '00:10',
      dayRate: 200,
      overtimeExempt: false,
    })
    expect(r.workedMinutes).toBe(12 * 60 + 10)
    expect(r.overtimeMinutes).toBe(40)
    expect(r.billedOvertimeMinutes).toBe(60)
  })

  it('handles a planned wrap after midnight', () => {
    const r = computeCrewDay({
      shootDate: '2026-11-06',
      scheduledCall: '16:00',
      scheduledWrap: '03:00',
      settings: S,
      call: '16:00',
      wrap: '02:00',
      dayRate: 200,
      overtimeExempt: false,
    })
    expect(r.overtimeMinutes).toBe(0)
  })

  it('can start overtime a standard day after each call', () => {
    const settings: OvertimeSettings = { ...S, overtime_basis: 'day_length', standard_day_minutes: 11 * 60 }
    const r = computeCrewDay({ ...day3, settings, call: '07:00', wrap: '19:00', dayRate: 200, overtimeExempt: false })
    expect(r.overtimeMinutes).toBe(60)
  })

  it('falls back to the standard day when the shoot day has no planned wrap', () => {
    const r = computeCrewDay({ ...day3, scheduledWrap: null, call: '08:00', wrap: '19:30', dayRate: 200, overtimeExempt: false })
    expect(r.overtimeMinutes).toBe(30)
  })
})

describe('restMinutes', () => {
  it('measures from wrap to the next call on its own date', () => {
    const wrap = absoluteMinutes('2026-11-04', '21:15')
    expect(restMinutes(wrap, '2026-11-05', '06:00')).toBe(8 * 60 + 45)
    expect(restMinutes(wrap, null, '06:00')).toBeNull()
    expect(restMinutes(wrap, '2026-11-05', null)).toBeNull()
  })
})

describe('who is on the day', () => {
  const day = { id: 'd3', shoot_date: '2026-11-04' }

  it('matches bookings by shoot day or date range', () => {
    expect(bookingCoversDay({ shoot_day_id: 'd3', start_date: null, end_date: null }, day)).toBe(true)
    expect(bookingCoversDay({ shoot_day_id: 'd2', start_date: '2026-11-01', end_date: '2026-11-30' }, day)).toBe(false)
    expect(bookingCoversDay({ shoot_day_id: null, start_date: '2026-11-02', end_date: '2026-11-10' }, day)).toBe(true)
    expect(bookingCoversDay({ shoot_day_id: null, start_date: '2026-11-04', end_date: null }, day)).toBe(true)
    expect(bookingCoversDay({ shoot_day_id: null, start_date: '2026-11-05', end_date: null }, day)).toBe(false)
  })

  it('lists booked crew and anyone with their own hours, never cast', () => {
    const people = [
      { id: 'gaffer', name: 'Giorgos Papadakis', is_cast: 0, department: 'Lighting', deleted_at: null },
      { id: 'dop', name: 'Lars Eriksson', is_cast: 0, department: 'Camera', deleted_at: null },
      { id: 'hugh', name: 'Kofi Asante', is_cast: 1, department: null, deleted_at: null },
      { id: 'extra', name: 'Pick-up Spark', is_cast: 0, department: 'Lighting', deleted_at: null },
      { id: 'off', name: 'Not Booked', is_cast: 0, department: 'Grip', deleted_at: null },
    ]
    const bookings = [
      { person_id: 'gaffer', shoot_day_id: 'd3', start_date: null, end_date: null, deleted_at: null },
      { person_id: 'dop', shoot_day_id: null, start_date: '2026-11-02', end_date: '2026-11-10', deleted_at: null },
      { person_id: 'hugh', shoot_day_id: 'd3', start_date: null, end_date: null, deleted_at: null },
      { person_id: 'off', shoot_day_id: 'd3', start_date: null, end_date: null, deleted_at: '2026-10-01' },
    ]
    expect(crewForDay({ people, bookings, day, personIdsWithHours: ['extra'] })).toEqual(['dop', 'gaffer', 'extra'])
  })
})

describe('pickDayRates', () => {
  it('prefers a shoot day rate, ignores overtime lines and missing rates', () => {
    const rates = pickDayRates([
      { person_id: 'a', rate_per_day: 180, labour_rate_type: 'prep_day' },
      { person_id: 'a', rate_per_day: 250, labour_rate_type: 'shoot_day' },
      { person_id: 'b', rate_per_day: 900, labour_rate_type: 'overtime' },
      { person_id: 'c', rate_per_day: null, labour_rate_type: 'shoot_day' },
      { person_id: null, rate_per_day: 100, labour_rate_type: 'shoot_day' },
      { person_id: 'd', rate_per_day: 150, labour_rate_type: null },
    ])
    expect(Object.fromEntries(rates)).toEqual({ a: 250, d: 150 })
  })
})

describe('computeOvertimeDay', () => {
  const base = {
    shootDate: '2026-11-04',
    scheduledCall: '08:00',
    scheduledWrap: '20:00',
    actualCall: '08:00',
    actualWrap: '20:24',
    nextShootDate: '2026-11-05',
    nextUnitCall: '06:00',
    settings: S,
  }

  it('summarises the day: unit wrap for everyone, exceptions on top', () => {
    const s = computeOvertimeDay({
      ...base,
      people: [
        { personId: 'dop', ownCall: null, ownWrap: null, dayRate: 320, overtimeExempt: false },
        { personId: 'gaffer', ownCall: null, ownWrap: '21:15', dayRate: 250, overtimeExempt: false },
        { personId: 'spark', ownCall: null, ownWrap: '21:15', dayRate: null, overtimeExempt: false },
        { personId: 'director', ownCall: null, ownWrap: null, dayRate: 250, overtimeExempt: true },
      ],
    })
    expect(s.projected).toBe(false)
    expect(s.unitWrap).toBe('20:24')
    expect(s.unitOvertime.billedOvertimeMinutes).toBe(30)
    expect(s.overtimeCost).toBe(80.25) // 24.00 + 56.25
    expect(s.unpricedCount).toBe(1)
    expect(s.eligibleCount).toBe(3)
    expect(s.pricedEligibleCount).toBe(2)
    expect(s.withOvertime).toBe(3)
    expect(s.ownTimesCount).toBe(2)
    // 21:15 → 06:00 is 8h 45m; 20:24 → 06:00 is 9h 36m; both under 11h.
    expect(s.rows.find((r) => r.personId === 'gaffer')!.restMinutes).toBe(525)
    expect(s.shortRestCount).toBe(4)
  })

  it('uses the planned wrap, marked projected, until an actual wrap is logged', () => {
    const s = computeOvertimeDay({
      ...base,
      actualCall: null,
      actualWrap: null,
      people: [{ personId: 'dop', ownCall: null, ownWrap: null, dayRate: 320, overtimeExempt: false }],
    })
    expect(s.projected).toBe(true)
    expect(s.unitCall).toBe('08:00')
    expect(s.unitWrap).toBe('20:00')
    expect(s.overtimeCost).toBe(0)
  })

  it("uses a person's own call on the next day for their rest", () => {
    const s = computeOvertimeDay({
      ...base,
      people: [{ personId: 'gaffer', ownCall: null, ownWrap: '21:15', dayRate: 250, overtimeExempt: false, nextOwnCall: '09:00' }],
    })
    expect(s.rows[0]!.restMinutes).toBe(11 * 60 + 45)
    expect(s.rows[0]!.shortRest).toBe(false)
  })
})
