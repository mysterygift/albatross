import { describe, expect, it } from 'vitest'

import {
  computePoCommitments,
  computePoCommitted,
  computePoRemaining,
  getPoMatchWarnings,
  resolveDraftAllocations,
  resolveLinkAmount,
  suggestPoIncrease,
  type PoCommitment,
  type PoCommitmentLink,
} from './poMatching'

const link = (over: Partial<PoCommitmentLink> & Pick<PoCommitmentLink, 'poId' | 'expenseId'>): PoCommitmentLink => ({
  allocatedAmount: null,
  expenseAmount: 100,
  ...over,
})

const commitment = (over: Partial<PoCommitment> = {}): PoCommitment => ({
  poId: 'po-1',
  poNumber: 'PO-001',
  amount: 1000,
  committed: 0,
  remaining: 1000,
  ...over,
})

describe('resolveLinkAmount', () => {
  it('uses the explicit allocation when present', () => {
    expect(resolveLinkAmount({ allocatedAmount: 40, expenseAmount: 100 }, 2)).toBe(40)
    expect(resolveLinkAmount({ allocatedAmount: 40, expenseAmount: 100 }, 1)).toBe(40)
  })

  it('null allocation on a single-PO expense is the whole expense', () => {
    expect(resolveLinkAmount({ allocatedAmount: null, expenseAmount: 100 }, 1)).toBe(100)
  })

  it('null allocation on a multi-PO expense is unallocated', () => {
    expect(resolveLinkAmount({ allocatedAmount: null, expenseAmount: 100 }, 2)).toBe(0)
  })
})

describe('computePoCommitted', () => {
  it('returns an empty record without links', () => {
    expect(computePoCommitted([])).toEqual({})
  })

  it('sums allocations and whole-expense amounts per PO', () => {
    const links = [
      link({ poId: 'po-1', expenseId: 'e1', expenseAmount: 100 }),
      link({ poId: 'po-1', expenseId: 'e2', expenseAmount: 50 }),
      link({ poId: 'po-2', expenseId: 'e3', expenseAmount: 80, allocatedAmount: 30 }),
    ]
    expect(computePoCommitted(links)).toEqual({ 'po-1': 150, 'po-2': 30 })
  })

  it('derives the link count from the list when expenseLinkCount is omitted', () => {
    const links = [
      link({ poId: 'po-1', expenseId: 'e1', expenseAmount: 100, allocatedAmount: 60 }),
      link({ poId: 'po-2', expenseId: 'e1', expenseAmount: 100 }), // multi-PO, null -> 0
    ]
    expect(computePoCommitted(links)).toEqual({ 'po-1': 60, 'po-2': 0 })
  })

  it('prefers an explicit expenseLinkCount (links to POs outside the list)', () => {
    const links = [link({ poId: 'po-1', expenseId: 'e1', expenseAmount: 100, expenseLinkCount: 2 })]
    expect(computePoCommitted(links)).toEqual({ 'po-1': 0 })
    const single = [link({ poId: 'po-1', expenseId: 'e1', expenseAmount: 100, expenseLinkCount: 1 })]
    expect(computePoCommitted(single)).toEqual({ 'po-1': 100 })
  })

  it('can exclude an expense (edit mode)', () => {
    const links = [
      link({ poId: 'po-1', expenseId: 'e1', expenseAmount: 100 }),
      link({ poId: 'po-1', expenseId: 'e2', expenseAmount: 25 }),
    ]
    expect(computePoCommitted(links, { excludeExpenseId: 'e1' })).toEqual({ 'po-1': 25 })
  })
})

describe('computePoRemaining / computePoCommitments', () => {
  it('returns null remaining when the PO has no value', () => {
    expect(computePoRemaining(null, 50)).toBeNull()
  })

  it('goes negative when over-committed', () => {
    expect(computePoRemaining(100, 130)).toBe(-30)
  })

  it('builds a commitment per PO including POs with no links', () => {
    const result = computePoCommitments(
      [
        { id: 'po-1', amount: 500, poNumber: 'PO-1' },
        { id: 'po-2', amount: null },
        { id: 'po-3', amount: 200 },
      ],
      [link({ poId: 'po-1', expenseId: 'e1', expenseAmount: 120.5 }), link({ poId: 'po-2', expenseId: 'e2' })]
    )
    expect(result['po-1']).toEqual({
      poId: 'po-1',
      poNumber: 'PO-1',
      amount: 500,
      poAmount: 500,
      currency_code: null,
      exchange_rate: null,
      committed: 120.5,
      remaining: 379.5,
    })
    expect(result['po-2']).toMatchObject({ committed: 100, remaining: null })
    expect(result['po-3']).toMatchObject({ committed: 0, remaining: 200 })
  })

  it('avoids floating point drift', () => {
    const result = computePoCommitments(
      [{ id: 'po-1', amount: 0.3 }],
      [
        link({ poId: 'po-1', expenseId: 'e1', expenseAmount: 0.1 }),
        link({ poId: 'po-1', expenseId: 'e2', expenseAmount: 0.2 }),
      ]
    )
    expect(result['po-1']!.remaining).toBe(0)
  })
})

describe('resolveDraftAllocations', () => {
  it('single PO with null allocation takes the whole expense', () => {
    expect(resolveDraftAllocations(80, [{ poId: 'po-1', allocatedAmount: null }])).toEqual([
      { poId: 'po-1', amount: 80 },
    ])
  })

  it('multi PO with null allocation resolves to 0', () => {
    expect(
      resolveDraftAllocations(80, [
        { poId: 'po-1', allocatedAmount: 50 },
        { poId: 'po-2', allocatedAmount: null },
      ])
    ).toEqual([
      { poId: 'po-1', amount: 50 },
      { poId: 'po-2', amount: 0 },
    ])
  })
})

describe('getPoMatchWarnings', () => {
  const base = {
    expenseAmount: 100,
    allocations: [{ poId: 'po-1', allocatedAmount: null }],
    commitments: { 'po-1': commitment() },
  }

  it('has no warnings when everything lines up', () => {
    expect(
      getPoMatchWarnings({
        ...base,
        invoice: { id: 'inv-1', amount: 100, poId: 'po-1' },
      })
    ).toEqual([])
  })

  it('has no warnings without POs or invoice', () => {
    expect(getPoMatchWarnings({ expenseAmount: 100, allocations: [], commitments: {} })).toEqual([])
  })

  it('warns when the spend exceeds the PO remaining', () => {
    const warnings = getPoMatchWarnings({
      ...base,
      commitments: { 'po-1': commitment({ committed: 950, remaining: 50 }) },
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ code: 'over_po_remaining', poId: 'po-1', overBy: 50 })
  })

  it('does not warn when spend exactly uses the remaining balance', () => {
    expect(
      getPoMatchWarnings({
        ...base,
        commitments: { 'po-1': commitment({ committed: 900, remaining: 100 }) },
      })
    ).toEqual([])
  })

  it('does not warn about remaining for POs with no value set', () => {
    expect(
      getPoMatchWarnings({
        ...base,
        commitments: { 'po-1': commitment({ amount: null, remaining: null }) },
      })
    ).toEqual([])
  })

  it('treats an already over-committed PO as over by the full amount', () => {
    const warnings = getPoMatchWarnings({
      ...base,
      commitments: { 'po-1': commitment({ committed: 1100, remaining: -100 }) },
    })
    expect(warnings[0]).toMatchObject({ code: 'over_po_remaining', overBy: 200 })
  })

  it('warns when the invoice amount differs from the expense amount', () => {
    const warnings = getPoMatchWarnings({
      ...base,
      invoice: { id: 'inv-1', invoiceNumber: 'INV-9', amount: 120, poId: null },
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      code: 'invoice_amount_mismatch',
      invoiceId: 'inv-1',
      expected: 100,
      actual: 120,
    })
  })

  it('ignores invoices without an amount', () => {
    expect(getPoMatchWarnings({ ...base, invoice: { amount: null, poId: null } })).toEqual([])
  })

  it('warns when the invoice sits on a different PO', () => {
    const warnings = getPoMatchWarnings({
      ...base,
      invoice: { id: 'inv-1', amount: 100, poId: 'po-other' },
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ code: 'invoice_on_different_po', poId: 'po-other' })
  })

  it('does not warn when the invoice PO is one of several selected POs', () => {
    const warnings = getPoMatchWarnings({
      expenseAmount: 100,
      allocations: [
        { poId: 'po-1', allocatedAmount: 60 },
        { poId: 'po-2', allocatedAmount: 40 },
      ],
      commitments: { 'po-1': commitment(), 'po-2': commitment({ poId: 'po-2' }) },
      invoice: { amount: 100, poId: 'po-2' },
    })
    expect(warnings).toEqual([])
  })

  it('does not warn about the invoice PO when no PO is selected', () => {
    expect(
      getPoMatchWarnings({
        expenseAmount: 100,
        allocations: [],
        commitments: {},
        invoice: { amount: 100, poId: 'po-1' },
      })
    ).toEqual([])
  })

  it('warns when allocations do not sum to the expense amount', () => {
    const warnings = getPoMatchWarnings({
      expenseAmount: 100,
      allocations: [
        { poId: 'po-1', allocatedAmount: 60 },
        { poId: 'po-2', allocatedAmount: 30 },
      ],
      commitments: { 'po-1': commitment(), 'po-2': commitment({ poId: 'po-2' }) },
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ code: 'allocation_sum_mismatch', expected: 100, actual: 90 })
  })

  it('warns when a single explicit allocation exceeds the expense amount', () => {
    const warnings = getPoMatchWarnings({
      ...base,
      allocations: [{ poId: 'po-1', allocatedAmount: 150 }],
    })
    expect(warnings.map((w) => w.code)).toContain('allocation_sum_mismatch')
  })

  it('flags missing allocations on multi-PO drafts', () => {
    const warnings = getPoMatchWarnings({
      expenseAmount: 100,
      allocations: [
        { poId: 'po-1', allocatedAmount: 100 },
        { poId: 'po-2', allocatedAmount: null },
      ],
      commitments: { 'po-1': commitment(), 'po-2': commitment({ poId: 'po-2', poNumber: 'PO-002' }) },
    })
    expect(warnings.map((w) => w.code)).toEqual(['allocation_missing'])
    expect(warnings[0]).toMatchObject({ poId: 'po-2' })
  })

  it('reports every applicable warning together', () => {
    const warnings = getPoMatchWarnings({
      expenseAmount: 100,
      allocations: [{ poId: 'po-1', allocatedAmount: 80 }],
      commitments: { 'po-1': commitment({ remaining: 50 }) },
      invoice: { amount: 90, poId: 'po-x' },
    })
    expect(warnings.map((w) => w.code).sort()).toEqual([
      'allocation_sum_mismatch',
      'invoice_amount_mismatch',
      'invoice_on_different_po',
      'over_po_remaining',
    ])
  })

  it('tolerates sub-cent differences', () => {
    expect(
      getPoMatchWarnings({
        ...base,
        invoice: { amount: 100.004, poId: null },
      })
    ).toEqual([])
  })
})

describe('foreign-currency POs', () => {
  // 1 USD = 0.79 GBP: a $1,000 PO is worth £790 against production-currency spend.
  const usd = { currency_code: 'USD', exchange_rate: 0.79 }

  it('converts the PO amount via the locked rate before committed / remaining', () => {
    const result = computePoCommitments(
      [{ id: 'po-1', amount: 1000, poNumber: 'PO-1', ...usd }],
      [link({ poId: 'po-1', expenseId: 'e1', expenseAmount: 300 })]
    )
    expect(result['po-1']).toMatchObject({
      amount: 790,
      poAmount: 1000,
      currency_code: 'USD',
      exchange_rate: 0.79,
      committed: 300,
      remaining: 490,
    })
  })

  it('treats a null-currency PO as production currency (no conversion, even with a stray rate)', () => {
    const result = computePoCommitments(
      [{ id: 'po-1', amount: 1000, currency_code: null, exchange_rate: 0.5 }],
      [link({ poId: 'po-1', expenseId: 'e1', expenseAmount: 300 })]
    )
    expect(result['po-1']).toMatchObject({ amount: 1000, poAmount: 1000, committed: 300, remaining: 700 })
  })

  it('rounds converted amounts to 2dp', () => {
    const result = computePoCommitments([{ id: 'po-1', amount: 100.55, currency_code: 'EUR', exchange_rate: 0.8573 }], [])
    expect(result['po-1']!.amount).toBe(86.2)
    expect(result['po-1']!.remaining).toBe(86.2)
  })

  it('warns when an allocation exceeds the converted remaining', () => {
    const commitments = computePoCommitments(
      [{ id: 'po-1', amount: 1000, poNumber: 'PO-1', ...usd }],
      [link({ poId: 'po-1', expenseId: 'e0', expenseAmount: 700 })]
    )
    const warnings = getPoMatchWarnings({
      expenseAmount: 100,
      allocations: [{ poId: 'po-1', allocatedAmount: null }],
      commitments,
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ code: 'over_po_remaining', overBy: 10, expected: 90, actual: 100 })
  })

  it('no over-PO warning when the spend fits the converted remaining', () => {
    const commitments = computePoCommitments([{ id: 'po-1', amount: 1000, ...usd }], [])
    expect(
      getPoMatchWarnings({ expenseAmount: 790, allocations: [{ poId: 'po-1', allocatedAmount: null }], commitments })
    ).toEqual([])
  })

  it('suggests the increase in PO currency, converted back and rounded up', () => {
    const c = computePoCommitments(
      [{ id: 'po-1', amount: 1000, ...usd }],
      [link({ poId: 'po-1', expenseId: 'e0', expenseAmount: 700 })]
    )['po-1']!
    // remaining £90, spend £100 -> £10 short -> 10 / 0.79 = 12.658... USD -> 12.66
    expect(suggestPoIncrease(c, 100)).toBe(12.66)
  })
})

describe('rounding', () => {
  it('never leaks float artifacts into committed / remaining', () => {
    const c = computePoCommitments(
      [{ id: 'po-1', amount: 0.6 }],
      [
        link({ poId: 'po-1', expenseId: 'e1', expenseAmount: 0.1 }),
        link({ poId: 'po-1', expenseId: 'e2', expenseAmount: 0.2 }),
      ]
    )['po-1']!
    expect(c.committed).toBe(0.3)
    expect(c.remaining).toBe(0.3)
  })

  it('compares allocation sums rounding-safely', () => {
    const warnings = getPoMatchWarnings({
      expenseAmount: 0.3,
      allocations: [
        { poId: 'po-1', allocatedAmount: 0.1 },
        { poId: 'po-2', allocatedAmount: 0.2 },
      ],
      commitments: {},
    })
    expect(warnings.map((w) => w.code)).not.toContain('allocation_sum_mismatch')
  })
})

describe('suggestPoIncrease', () => {
  it('returns the shortfall when the allocation exceeds remaining', () => {
    expect(suggestPoIncrease(commitment({ remaining: 40 }), 100)).toBe(60)
  })

  it('returns 0 when it fits', () => {
    expect(suggestPoIncrease(commitment({ remaining: 100 }), 100)).toBe(0)
  })

  it('returns 0 for a PO with no value', () => {
    expect(suggestPoIncrease(commitment({ amount: null, remaining: null }), 100)).toBe(0)
  })

  it('covers an already over-committed PO', () => {
    expect(suggestPoIncrease(commitment({ remaining: -20 }), 100)).toBe(120)
  })
})
