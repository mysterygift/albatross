import { describe, expect, it } from 'vitest'
import {
  addCalendarDaysToIso,
  calendarDayDeltaBetween,
  classifyShootingBlocRangeMutation,
  describeShootingBlocRangeChange,
  inclusiveDayCount,
  isPureCalendarShift,
} from '@/lib/db/shootingBlocAssociation'

describe('shooting bloc range classification & description', () => {
  it('classifyShootingBlocRangeMutation detects shift, shrink, expand', () => {
    expect(
      classifyShootingBlocRangeMutation('2025-06-01', '2025-06-10', '2025-06-01', '2025-06-10')
    ).toEqual({ kind: 'none' })
    expect(
      classifyShootingBlocRangeMutation('2025-06-01', '2025-06-10', '2025-06-04', '2025-06-13')
    ).toEqual({ kind: 'shift', deltaDays: 3 })
    expect(
      classifyShootingBlocRangeMutation('2025-06-01', '2025-06-10', '2025-06-01', '2025-06-07')
    ).toEqual({ kind: 'shrink' })
    expect(
      classifyShootingBlocRangeMutation('2025-06-01', '2025-06-07', '2025-06-01', '2025-06-10')
    ).toEqual({ kind: 'expand' })
  })

  it('inclusiveDayCount and calendar arithmetic', () => {
    expect(inclusiveDayCount('2025-06-01', '2025-06-10')).toBe(10)
    expect(calendarDayDeltaBetween('2025-06-01', '2025-06-04')).toBe(3)
    expect(addCalendarDaysToIso('2025-06-28', 3)).toBe('2025-07-01')
  })

  it('isPureCalendarShift matches parallel deltas', () => {
    expect(isPureCalendarShift('2025-06-01', '2025-06-10', '2025-06-04', '2025-06-13')).toBe(true)
    expect(isPureCalendarShift('2025-06-01', '2025-06-10', '2025-06-01', '2025-06-07')).toBe(false)
  })

  it('describeShootingBlocRangeChange lists excluded shoot days for shrink', () => {
    const tagged = [
      { id: 'a', shoot_date: '2025-06-01' },
      { id: 'b', shoot_date: '2025-06-05' },
      { id: 'c', shoot_date: '2025-06-10' },
    ]
    const d = describeShootingBlocRangeChange(
      '2025-06-01',
      '2025-06-10',
      '2025-06-02',
      '2025-06-08',
      tagged
    )
    expect(d.kind).toBe('shrink')
    expect(d.excludedShootDayIds.sort()).toEqual(['a', 'c'])
    expect(d.trimFromStart).toBe(true)
    expect(d.trimFromEnd).toBe(true)
  })

  it('describeShootingBlocRangeChange shift messaging includes delta', () => {
    const d = describeShootingBlocRangeChange(
      '2025-06-01',
      '2025-06-07',
      '2025-06-02',
      '2025-06-08',
      []
    )
    expect(d.kind).toBe('shift')
    expect(d.deltaDays).toBe(1)
    expect(d.detailLines.some((l) => l.includes('+1'))).toBe(true)
  })
})
