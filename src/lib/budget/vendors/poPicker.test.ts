import { describe, expect, it } from 'vitest'

import {
  buildPoMatchSummary,
  buildPoPickerRows,
  filterPoPickerRows,
  suggestSingleOpenPo,
  type PoPickerRow,
} from '@/lib/budget/vendors/poPicker'
import { computePoCommitments, toPoCommitmentInput } from '@/lib/budget/vendors/poMatching'

const row = (over: Partial<PoPickerRow> & Pick<PoPickerRow, 'id'>): PoPickerRow => ({
  poNumber: over.id.toUpperCase(),
  description: null,
  vendorId: 'v1',
  vendorName: 'Acme Props',
  status: 'issued',
  amount: 1000,
  poAmount: 1000,
  currency_code: null,
  exchange_rate: null,
  committed: 0,
  remaining: 1000,
  ...over,
})

const ROWS: PoPickerRow[] = [
  row({ id: 'po-1', poNumber: 'PO-001', description: 'Camera hire', vendorId: 'v1', vendorName: 'Acme Props' }),
  row({ id: 'po-2', poNumber: 'PO-002', description: 'Costume fabric', vendorId: 'v2', vendorName: 'Fabric House', status: 'approved' }),
  row({ id: 'po-3', poNumber: 'PO-003', description: 'Old set dressing', vendorId: 'v1', vendorName: 'Acme Props', status: 'closed' }),
  row({ id: 'po-4', poNumber: 'PO-004', description: 'Draft lighting', vendorId: 'v1', vendorName: 'Acme Props', status: 'draft' }),
]

const base = { query: '', vendorId: null, searchAllVendors: false, includeInactive: false }

describe('buildPoPickerRows', () => {
  it('joins vendor names and commitments', () => {
    const commitments = computePoCommitments(
      [{ id: 'po-1', amount: 500, poNumber: 'PO-001' }],
      [{ poId: 'po-1', expenseId: 'e1', allocatedAmount: null, expenseAmount: 200, expenseLinkCount: 1 }]
    )
    const rows = buildPoPickerRows(
      [{ id: 'po-1', po_number: 'PO-001', description: null, vendor_id: 'v1', status: 'issued', amount: 500 }],
      new Map([['v1', 'Acme Props']]),
      commitments
    )
    expect(rows[0]).toMatchObject({ vendorName: 'Acme Props', committed: 200, remaining: 300 })
  })
})

describe('foreign-currency POs', () => {
  const usdPo = {
    id: 'po-1',
    po_number: 'PO-001',
    description: null,
    vendor_id: 'v1',
    status: 'issued' as const,
    amount: 1000,
    currency_code: 'USD',
    exchange_rate: 0.79,
  }

  it('converts the amount and remaining to production currency but keeps the original', () => {
    const commitments = computePoCommitments(
      [toPoCommitmentInput(usdPo)],
      [{ poId: 'po-1', expenseId: 'e1', allocatedAmount: null, expenseAmount: 200, expenseLinkCount: 1 }]
    )
    const [r] = buildPoPickerRows([usdPo], new Map([['v1', 'Acme Props']]), commitments)
    expect(r).toMatchObject({
      amount: 790,
      poAmount: 1000,
      currency_code: 'USD',
      exchange_rate: 0.79,
      committed: 200,
      remaining: 590,
    })
  })

  it('summary: increaseBy is in PO currency and the original amount is kept', () => {
    const commitments = computePoCommitments([toPoCommitmentInput(usdPo)], [])
    const rows = buildPoPickerRows([usdPo], new Map([['v1', 'Acme Props']]), commitments)
    const [s] = buildPoMatchSummary({
      allocations: [{ poId: 'po-1', allocatedAmount: null }],
      rows,
      expenseAmount: 800,
    })
    // spend £800 vs £790 value -> £10 short -> 12.66 USD
    expect(s).toMatchObject({ poAmount: 1000, currency_code: 'USD', remainingAfter: -10, increaseBy: 12.66 })
  })

  it('a PO without a currency behaves as production currency', () => {
    const [r] = buildPoPickerRows(
      [{ ...usdPo, currency_code: null, exchange_rate: null }],
      new Map([['v1', 'Acme Props']]),
      {}
    )
    expect(r).toMatchObject({ amount: 1000, poAmount: 1000, remaining: 1000 })
  })
})

describe('filterPoPickerRows', () => {
  it('defaults to issued + approved only', () => {
    expect(filterPoPickerRows(ROWS, base).map((r) => r.id)).toEqual(['po-1', 'po-2'])
  })

  it('includes draft / closed / cancelled on request', () => {
    expect(filterPoPickerRows(ROWS, { ...base, includeInactive: true })).toHaveLength(4)
  })

  it('keeps already-picked POs visible whatever their status', () => {
    const ids = filterPoPickerRows(ROWS, { ...base, selectedIds: ['po-3'] }).map((r) => r.id)
    expect(ids).toContain('po-3')
  })

  it('searches PO number, description and vendor name, all tokens required', () => {
    expect(filterPoPickerRows(ROWS, { ...base, query: 'po-002' }).map((r) => r.id)).toEqual(['po-2'])
    expect(filterPoPickerRows(ROWS, { ...base, query: 'camera' }).map((r) => r.id)).toEqual(['po-1'])
    expect(filterPoPickerRows(ROWS, { ...base, query: 'fabric house' }).map((r) => r.id)).toEqual(['po-2'])
    expect(filterPoPickerRows(ROWS, { ...base, query: 'acme fabric' })).toEqual([])
  })

  it('scopes to the selected vendor unless searching all vendors', () => {
    expect(filterPoPickerRows(ROWS, { ...base, vendorId: 'v1' }).map((r) => r.id)).toEqual(['po-1'])
    const all = filterPoPickerRows(ROWS, { ...base, vendorId: 'v1', searchAllVendors: true })
    // the vendor's own POs sort first, others follow
    expect(all.map((r) => r.id)).toEqual(['po-1', 'po-2'])
    const wide = filterPoPickerRows(ROWS, { ...base, vendorId: 'v2', searchAllVendors: true })
    expect(wide.map((r) => r.id)).toEqual(['po-2', 'po-1'])
  })
})

describe('suggestSingleOpenPo', () => {
  it('suggests the vendor\'s only open PO', () => {
    expect(suggestSingleOpenPo(ROWS, 'v1', [])?.id).toBe('po-1')
    expect(suggestSingleOpenPo(ROWS, 'v2', [])?.id).toBe('po-2')
  })

  it('does not suggest without a vendor, with several open POs, or once something is picked', () => {
    expect(suggestSingleOpenPo(ROWS, null, [])).toBeNull()
    expect(suggestSingleOpenPo([...ROWS, row({ id: 'po-5', status: 'approved' })], 'v1', [])).toBeNull()
    expect(suggestSingleOpenPo(ROWS, 'v1', ['po-1'])).toBeNull()
    expect(suggestSingleOpenPo(ROWS, 'v3', [])).toBeNull()
  })
})

describe('buildPoMatchSummary', () => {
  const rows = [row({ id: 'po-1', amount: 1000, committed: 700, remaining: 300 })]

  it('whole expense for a single PO with no allocation, and flags the shortfall', () => {
    const [s] = buildPoMatchSummary({ allocations: [{ poId: 'po-1', allocatedAmount: null }], rows, expenseAmount: 500 })
    expect(s).toMatchObject({ thisSpend: 500, poAmount: 1000, remainingBefore: 300, remainingAfter: -200, increaseBy: 200 })
  })

  it('uses explicit allocations for several POs', () => {
    const two = [...rows, row({ id: 'po-2', amount: 400, committed: 0, remaining: 400 })]
    const out = buildPoMatchSummary({
      allocations: [
        { poId: 'po-1', allocatedAmount: 250 },
        { poId: 'po-2', allocatedAmount: 250 },
      ],
      rows: two,
      expenseAmount: 500,
    })
    expect(out.map((s) => [s.thisSpend, s.remainingAfter, s.increaseBy])).toEqual([
      [250, 50, 0],
      [250, 150, 0],
    ])
  })

  it('has no remaining for a PO without a value', () => {
    const [s] = buildPoMatchSummary({
      allocations: [{ poId: 'po-9', allocatedAmount: null }],
      rows: [row({ id: 'po-9', amount: null, poAmount: null, remaining: null })],
      expenseAmount: 50,
    })
    expect(s).toMatchObject({ poAmount: null, remainingAfter: null, increaseBy: 0 })
  })
})
