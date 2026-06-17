import { describe, expect, it } from 'vitest'
import {
  buildVatReclaimRateMap,
  computeExpenseVatReclaim,
  computeVatPaid,
  computeVatReclaimTotals,
} from './vatReclaim'
import type { Expense, VatReclaimRate } from '@/lib/db/types'

function expense(
  overrides: Partial<Expense> & Pick<Expense, 'id' | 'amount'>
): Expense {
  return {
    production_id: 'prod-1',
    category_id: null,
    account_id: 'acc-1',
    transaction_type: 'purchase',
    vendor_id: null,
    date: '2025-01-01',
    vendor: null,
    notes: null,
    expense_type: 'other',
    vat_rate_percent: 20,
    vat_reclaimed_amount: null,
    vat_reclaim_date: null,
    vat_reclaim_reference: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

const rates: VatReclaimRate[] = [
  {
    id: 'r1',
    production_id: 'prod-1',
    transaction_type: 'purchase',
    reclaim_percent: 100,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'r2',
    production_id: 'prod-1',
    transaction_type: 'labour',
    reclaim_percent: 0,
    created_at: '',
    updated_at: '',
  },
]

describe('computeVatPaid', () => {
  it('returns 0 when no VAT rate', () => {
    expect(computeVatPaid(expense({ id: 'e1', amount: 1000, vat_rate_percent: null }))).toBe(0)
  })

  it('computes from ex-VAT amount', () => {
    expect(computeVatPaid(expense({ id: 'e1', amount: 1000, vat_rate_percent: 20 }))).toBe(200)
  })
})

describe('computeExpenseVatReclaim', () => {
  const map = buildVatReclaimRateMap(rates)

  it('applies 0% reclaim for labour', () => {
    const result = computeExpenseVatReclaim(
      expense({ id: 'e1', amount: 1000, transaction_type: 'labour' }),
      map
    )
    expect(result.vatPaid).toBe(200)
    expect(result.vatReclaimable).toBe(0)
  })

  it('applies full reclaim for purchase', () => {
    const result = computeExpenseVatReclaim(
      expense({ id: 'e1', amount: 1000, transaction_type: 'purchase' }),
      map
    )
    expect(result.vatReclaimable).toBe(200)
  })

  it('computes outstanding after partial reclaim', () => {
    const result = computeExpenseVatReclaim(
      expense({
        id: 'e1',
        amount: 1000,
        transaction_type: 'purchase',
        vat_reclaimed_amount: 50,
      }),
      map
    )
    expect(result.vatOutstanding).toBe(150)
  })
})

describe('computeVatReclaimTotals', () => {
  it('sums across expenses', () => {
    const totals = computeVatReclaimTotals(
      [
        expense({ id: 'e1', amount: 1000, transaction_type: 'purchase' }),
        expense({ id: 'e2', amount: 500, transaction_type: 'labour' }),
      ],
      rates
    )
    expect(totals.totalVatPaid).toBe(300)
    expect(totals.totalVatReclaimable).toBe(200)
  })
})
