import { describe, expect, it } from 'vitest'

import type { PoCommitment } from '@/lib/budget/vendors/poMatching'
import {
  noPoSpendItems,
  noProofSpendItems,
  overCommittedPoItems,
} from '@/lib/budget/vendors/riskWatchSignals'

const names = new Map([
  ['v1', 'Acme Props'],
  ['v2', 'Fabric House'],
])
const exp = (id: string, vendor_id: string | null, amount: number, over: Record<string, unknown> = {}) => ({
  id,
  vendor_id,
  amount,
  date: '2026-05-01',
  transaction_type: 'purchase' as const,
  ...over,
})
const NONE = { receiptCount: 0, invoiceDocumentCount: 0 }
const RECEIPT = { receiptCount: 1, invoiceDocumentCount: 0 }

describe('noPoSpendItems', () => {
  it('groups unmatched vendor spend per vendor, only for vendors that use POs', () => {
    const items = noPoSpendItems({
      expenses: [
        exp('a', 'v1', 100, { date: '2026-05-01' }),
        exp('b', 'v1', 50, { date: '2026-06-01' }),
        exp('c', 'v1', 999),
        exp('d', 'v2', 70),
      ],
      poLinkCountByExpenseId: { c: 1 },
      vendorIdsWithPos: new Set(['v1']),
      vendorNameById: names,
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'no-po-spend-v1',
      severity: 'warning',
      title: 'Acme Props has spend with no PO matched',
      subtitle: '2 expenses not matched to a PO',
      amount: 150,
      href: '/budget/vendors/v1',
      sortDate: '2026-06-01',
    })
  })

  it('ignores vendorless and non vendor-type spend', () => {
    expect(
      noPoSpendItems({
        expenses: [exp('a', null, 40), exp('b', 'v1', 30, { transaction_type: 'labour' })],
        poLinkCountByExpenseId: {},
        vendorIdsWithPos: new Set(['v1']),
        vendorNameById: names,
      })
    ).toEqual([])
  })

  it('uses singular wording for one expense', () => {
    const [item] = noPoSpendItems({
      expenses: [exp('a', 'v1', 40)],
      poLinkCountByExpenseId: {},
      vendorIdsWithPos: new Set(['v1']),
      vendorNameById: names,
    })
    expect(item!.subtitle).toBe('1 expense not matched to a PO')
  })
})

describe('noProofSpendItems', () => {
  it('groups spend with no receipt or invoice file per vendor, with a vendorless bucket', () => {
    const items = noProofSpendItems({
      expenses: [exp('a', 'v1', 100), exp('b', 'v1', 10), exp('c', 'v2', 20), exp('p', null, 5), exp('q', null, 6)],
      proofByExpenseId: { a: NONE, b: RECEIPT, c: RECEIPT, p: NONE },
      vendorNameById: names,
    })
    const byId = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(Object.keys(byId).sort()).toEqual(['no-proof-spend-no-vendor', 'no-proof-spend-v1'])
    expect(byId['no-proof-spend-v1']).toMatchObject({
      title: 'Acme Props has spend with no proof',
      subtitle: '1 expense without a receipt or invoice file',
      amount: 100,
    })
    expect(byId['no-proof-spend-no-vendor']).toMatchObject({
      title: 'Spend with no vendor and no proof',
      subtitle: '2 expenses without a receipt or invoice file',
      amount: 11,
      href: '/budget',
    })
  })

  it('treats an expense missing from the proof map as having no proof', () => {
    expect(
      noProofSpendItems({ expenses: [exp('a', 'v1', 1)], proofByExpenseId: {}, vendorNameById: names })
    ).toHaveLength(1)
  })
})

describe('overCommittedPoItems', () => {
  const po = (id: string, status = 'issued') => ({
    id,
    po_number: id.toUpperCase(),
    vendor_id: 'v1',
    status: status as 'issued',
    issue_date: '2026-04-01',
    created_at: '2026-04-01T00:00:00Z',
  })
  const c = (poId: string, amount: number, committed: number): PoCommitment => ({
    poId,
    amount,
    committed,
    remaining: amount - committed,
  })

  it('flags POs whose committed spend exceeds their value; large overruns are critical', () => {
    const items = overCommittedPoItems({
      pos: [po('small'), po('big'), po('fine'), po('exact')],
      commitments: {
        small: c('small', 1000, 1050),
        big: c('big', 1000, 1500),
        fine: c('fine', 1000, 400),
        exact: c('exact', 1000, 1000),
      },
      vendorNameById: names,
    })
    expect(items.map((i) => [i.id, i.severity, i.amount])).toEqual([
      ['po-over-committed-small', 'warning', 50],
      ['po-over-committed-big', 'critical', 500],
    ])
    expect(items[0]!.title).toBe('PO SMALL over-committed — Acme Props')
    expect(items[0]!.href).toBe('/budget/vendors/v1?highlight=small')
  })

  it('skips cancelled POs and POs without a value', () => {
    expect(
      overCommittedPoItems({
        pos: [po('x', 'cancelled'), po('y')],
        commitments: {
          x: c('x', 100, 200),
          y: { poId: 'y', amount: null, committed: 50, remaining: null },
        },
        vendorNameById: names,
      })
    ).toEqual([])
  })
})
