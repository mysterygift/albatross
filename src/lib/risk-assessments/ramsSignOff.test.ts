import { describe, expect, it } from 'vitest'
import { describeRamsSignOff, getRamsSignOffStatus } from '@/lib/risk-assessments/ramsSignOff'

const main = 'sdu-main'
const second = 'sdu-second'

describe('getRamsSignOffStatus', () => {
  it('is missing when no RAMS exists', () => {
    expect(getRamsSignOffStatus([], main)).toBe('missing')
  })

  it('is missing when RAMS only covers the other unit', () => {
    expect(getRamsSignOffStatus([{ status: 'approved', shoot_day_unit_ids: [second] }], main)).toBe(
      'missing'
    )
  })

  it('is unapproved when a covering RAMS is a draft', () => {
    expect(getRamsSignOffStatus([{ status: 'draft', shoot_day_unit_ids: [main] }], main)).toBe(
      'unapproved'
    )
  })

  it('is unapproved if any covering RAMS is still a draft', () => {
    expect(
      getRamsSignOffStatus(
        [
          { status: 'approved', shoot_day_unit_ids: [main] },
          { status: 'draft', shoot_day_unit_ids: [main, second] },
        ],
        main
      )
    ).toBe('unapproved')
  })

  it('is ok when every covering RAMS is approved (a draft on the other unit is ignored)', () => {
    expect(
      getRamsSignOffStatus(
        [
          { status: 'approved', shoot_day_unit_ids: [main] },
          { status: 'draft', shoot_day_unit_ids: [second] },
        ],
        main
      )
    ).toBe('ok')
  })

  it('a shared RAMS covers both units', () => {
    const list = [{ status: 'approved' as const, shoot_day_unit_ids: [main, second] }]
    expect(getRamsSignOffStatus(list, main)).toBe('ok')
    expect(getRamsSignOffStatus(list, second)).toBe('ok')
  })

  it('with no unit selected, considers every RAMS on the day', () => {
    expect(getRamsSignOffStatus([], null)).toBe('missing')
    expect(getRamsSignOffStatus([{ status: 'approved', shoot_day_unit_ids: [] }], null)).toBe('ok')
    expect(getRamsSignOffStatus([{ status: 'draft', shoot_day_unit_ids: [] }], null)).toBe(
      'unapproved'
    )
  })
})

describe('describeRamsSignOff', () => {
  it('distinguishes "not signed off" from "no RAMS covers this unit"', () => {
    expect(describeRamsSignOff('unapproved', 'Main Unit')?.title).toBe('RAMS not signed off')
    expect(describeRamsSignOff('missing', 'Main Unit')?.title).toBe('No RAMS covers this unit')
    expect(describeRamsSignOff('missing', 'Second Unit')?.detail).toContain('Second Unit')
    expect(describeRamsSignOff('ok', 'Main Unit')).toBeNull()
  })
})
