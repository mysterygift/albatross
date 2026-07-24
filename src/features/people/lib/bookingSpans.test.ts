import { describe, expect, it } from 'vitest'
import {
  addDaysIso,
  assignLanes,
  buildBookingSpans,
  computeSpanMovePlan,
  computeSpanResizePlan,
  diffDaysIso,
  getMonthSpanSegments,
  type BookingSpan,
} from './bookingSpans'
import type { Booking, ShootDay } from '@/lib/db/types'

function shootDay(id: string, date: string): ShootDay {
  return {
    id,
    production_id: 'p1',
    shoot_date: date,
    day_number: null,
    call_time: null,
    wrap_time: null,
    notes: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  } as unknown as ShootDay
}

function booking(id: string, personId: string, shootDayId: string): Booking {
  return {
    id,
    production_id: 'p1',
    person_id: personId,
    shoot_day_id: shootDayId,
    start_date: null,
    end_date: null,
    role: null,
    notes: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  }
}

describe('date helpers', () => {
  it('adds days across month boundaries', () => {
    expect(addDaysIso('2026-01-30', 3)).toBe('2026-02-02')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('diffs days', () => {
    expect(diffDaysIso('2026-01-01', '2026-01-08')).toBe(7)
    expect(diffDaysIso('2026-01-08', '2026-01-01')).toBe(-7)
  })
})

describe('buildBookingSpans', () => {
  const shootDays = [
    shootDay('d1', '2026-01-05'), // Mon
    shootDay('d2', '2026-01-06'),
    shootDay('d3', '2026-01-07'),
    shootDay('d4', '2026-01-09'), // Fri (skips d? no d for 08)
    shootDay('d5', '2026-01-12'), // next Mon
  ]

  it('merges consecutive shoot-day bookings into one span even across non-shoot gaps', () => {
    // Person booked on d3 (Wed 07) and d4 (Fri 09) — adjacent in shoot-day order → one span
    const spans = buildBookingSpans(
      [booking('b1', 'alice', 'd3'), booking('b2', 'alice', 'd4')],
      shootDays
    )
    expect(spans).toHaveLength(1)
    expect(spans[0].startDate).toBe('2026-01-07')
    expect(spans[0].endDate).toBe('2026-01-09')
    expect(spans[0].bookingIds).toEqual(['b1', 'b2'])
  })

  it('breaks the span when an intervening shoot day is unbooked', () => {
    // Booked d1 and d3, but d2 is a shoot day with no booking → two spans
    const spans = buildBookingSpans(
      [booking('b1', 'alice', 'd1'), booking('b2', 'alice', 'd3')],
      shootDays
    )
    expect(spans).toHaveLength(2)
    expect(spans.map((s) => s.startDate)).toEqual(['2026-01-05', '2026-01-07'])
  })

  it('separates spans per person', () => {
    const spans = buildBookingSpans(
      [booking('b1', 'alice', 'd1'), booking('b2', 'bob', 'd1')],
      shootDays
    )
    expect(spans).toHaveLength(2)
    expect(new Set(spans.map((s) => s.personId))).toEqual(new Set(['alice', 'bob']))
  })

  it('ignores bookings without a resolvable shoot day', () => {
    const spans = buildBookingSpans([booking('b1', 'alice', 'missing')], shootDays)
    expect(spans).toHaveLength(0)
  })
})

describe('getMonthSpanSegments', () => {
  // January 2026: Jan 1 is a Thursday (getDay 4). firstWeekday for the month = 4.
  it('produces a single segment within one week', () => {
    const segs = getMonthSpanSegments({ startDate: '2026-01-05', endDate: '2026-01-07' }, 2026, 0)
    expect(segs).toHaveLength(1)
    // Jan 5 = Monday (col 1), Jan 7 = Wednesday (col 3)
    expect(segs[0]).toMatchObject({ startCol: 1, endCol: 3, continuesLeft: false, continuesRight: false })
  })

  it('splits a span across week boundaries with continuation flags', () => {
    // Jan 9 (Fri) to Jan 13 (Tue) crosses the Sat/Sun week boundary
    const segs = getMonthSpanSegments({ startDate: '2026-01-09', endDate: '2026-01-13' }, 2026, 0)
    expect(segs).toHaveLength(2)
    expect(segs[0].continuesRight).toBe(true)
    expect(segs[1].continuesLeft).toBe(true)
  })

  it('clamps spans that start before the visible month', () => {
    const segs = getMonthSpanSegments({ startDate: '2025-12-30', endDate: '2026-01-02' }, 2026, 0)
    expect(segs[0].continuesLeft).toBe(true)
  })

  it('returns nothing when the span misses the month', () => {
    expect(getMonthSpanSegments({ startDate: '2026-03-01', endDate: '2026-03-05' }, 2026, 0)).toEqual([])
  })
})

describe('assignLanes', () => {
  it('keeps non-overlapping segments on the same lane', () => {
    const laned = assignLanes([
      { startCol: 0, endCol: 1 },
      { startCol: 3, endCol: 4 },
    ])
    expect(laned.every((l) => l.lane === 0)).toBe(true)
  })

  it('pushes overlapping segments to new lanes', () => {
    const laned = assignLanes([
      { startCol: 0, endCol: 3 },
      { startCol: 2, endCol: 5 },
    ])
    expect(new Set(laned.map((l) => l.lane))).toEqual(new Set([0, 1]))
  })
})

describe('computeSpanMovePlan', () => {
  const span: BookingSpan = {
    personId: 'alice',
    startDate: '2026-01-05',
    endDate: '2026-01-06',
    bookingIds: ['b1', 'b2'],
    shootDayIds: ['d1', 'd2'],
    days: [
      { bookingId: 'b1', shootDayId: 'd1', date: '2026-01-05' },
      { bookingId: 'b2', shootDayId: 'd2', date: '2026-01-06' },
    ],
  }
  const shootDayIdByDate = new Map([
    ['2026-01-05', 'd1'],
    ['2026-01-06', 'd2'],
    ['2026-01-12', 'd5'],
    ['2026-01-13', 'd6'],
  ])

  it('maps each booking to the shifted shoot day', () => {
    const plan = computeSpanMovePlan({ span, offsetDays: 7, shootDayIdByDate, blockedShootDayIds: new Set() })
    expect(plan).toEqual({ ok: true, updates: [{ bookingId: 'b1', shootDayId: 'd5' }, { bookingId: 'b2', shootDayId: 'd6' }] })
  })

  it('fails when a target date has no shoot day', () => {
    const plan = computeSpanMovePlan({ span, offsetDays: 1, shootDayIdByDate, blockedShootDayIds: new Set() })
    expect(plan.ok).toBe(false)
  })

  it('fails on collision with an existing booking', () => {
    const plan = computeSpanMovePlan({ span, offsetDays: 7, shootDayIdByDate, blockedShootDayIds: new Set(['d5']) })
    expect(plan.ok).toBe(false)
  })
})

describe('computeSpanResizePlan', () => {
  const span: BookingSpan = {
    personId: 'alice',
    startDate: '2026-01-05',
    endDate: '2026-01-06',
    bookingIds: ['b1', 'b2'],
    shootDayIds: ['d1', 'd2'],
    days: [
      { bookingId: 'b1', shootDayId: 'd1', date: '2026-01-05' },
      { bookingId: 'b2', shootDayId: 'd2', date: '2026-01-06' },
    ],
  }

  it('creates bookings for newly covered shoot days', () => {
    const plan = computeSpanResizePlan({
      span,
      newStartDate: '2026-01-05',
      newEndDate: '2026-01-07',
      shootDaysInRange: [
        { id: 'd1', date: '2026-01-05' },
        { id: 'd2', date: '2026-01-06' },
        { id: 'd3', date: '2026-01-07' },
      ],
      personBookedShootDayIds: new Set(['d1', 'd2']),
      role: 'Lead',
      notes: null,
    })
    expect(plan.creates).toEqual([{ shootDayId: 'd3', role: 'Lead', notes: null }])
    expect(plan.deletes).toEqual([])
  })

  it('deletes bookings that fall outside the shrunk range', () => {
    const plan = computeSpanResizePlan({
      span,
      newStartDate: '2026-01-05',
      newEndDate: '2026-01-05',
      shootDaysInRange: [{ id: 'd1', date: '2026-01-05' }],
      personBookedShootDayIds: new Set(['d1', 'd2']),
      role: null,
      notes: null,
    })
    expect(plan.creates).toEqual([])
    expect(plan.deletes).toEqual(['b2'])
  })
})
