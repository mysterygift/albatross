import { describe, expect, it } from 'vitest'

import { describeAmendment } from '@/lib/budget/vendors/poAmendments'

const money = (n: number) => `£${n.toLocaleString('en-GB')}`

describe('describeAmendment', () => {
  it('describes an increase with its reason', () => {
    expect(
      describeAmendment({ previous_amount: 2000, new_amount: 5000, reason: 'Client uplift' }, money)
    ).toBe('Increased £2,000 → £5,000 · Client uplift')
  })

  it('describes a decrease without a reason', () => {
    expect(describeAmendment({ previous_amount: 5000, new_amount: 4000, reason: null }, money)).toBe(
      'Decreased £5,000 → £4,000'
    )
    expect(describeAmendment({ previous_amount: 5000, new_amount: 4000, reason: '  ' }, money)).toBe(
      'Decreased £5,000 → £4,000'
    )
  })

  it('handles a PO that had no value before', () => {
    expect(describeAmendment({ previous_amount: null, new_amount: 1500, reason: null }, money)).toBe('Set to £1,500')
  })
})
