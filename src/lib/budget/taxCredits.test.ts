import { describe, expect, it } from 'vitest'
import {
  computeTaxCreditForScheme,
  computeTaxCreditTotals,
  computeTotalCoreSpend,
  computeVatTotals,
} from './taxCredits'
import type { Expense, ExpenseTaxCreditAllocation } from '@/lib/db/types'

const baseScheme = {
  id: 'scheme-1',
  name: 'AVEC (Live action)',
  net_rate: 0.255,
  cap_percent: 0.8,
  min_qualifying_percent: 0.1,
  max_qualifying_amount: null,
  max_core_budget: null,
  is_vfx: false,
  is_enabled: true,
}

function alloc(
  schemeId: string,
  expenseId: string,
  amount: number
): ExpenseTaxCreditAllocation {
  return {
    id: `alloc-${expenseId}-${schemeId}`,
    expense_id: expenseId,
    tax_credit_scheme_id: schemeId,
    qualifying_amount: amount,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    deleted_at: null,
  }
}

function expense(id: string, amount: number, vatRate: number | null = null): Expense {
  return {
    id,
    production_id: 'prod-1',
    category_id: null,
    account_id: 'acc-1',
    transaction_type: 'purchase',
    vendor_id: null,
    amount,
    date: '2025-01-01',
    vendor: null,
    notes: null,
    expense_type: 'other',
    vat_rate_percent: vatRate,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    deleted_at: null,
  }
}

describe('computeTaxCreditForScheme', () => {
  it('applies 80% cap on qualifying spend', () => {
    const expenses = [expense('e1', 1_000_000)]
    const totalCore = computeTotalCoreSpend(expenses)
    const allocations = [alloc('scheme-1', 'e1', 1_000_000)]
    const result = computeTaxCreditForScheme(baseScheme, allocations, totalCore)
    expect(result.cappedQualifyingSpend).toBe(800_000)
    expect(result.creditAmount).toBe(800_000 * 0.255)
  })

  it('does not cap VFX scheme when cap_percent is null', () => {
    const vfxScheme = { ...baseScheme, id: 'vfx', name: 'AVEC VFX', cap_percent: null, is_vfx: true, net_rate: 0.2925 }
    const expenses = [expense('e1', 1_000_000)]
    const allocations = [alloc('vfx', 'e1', 1_000_000)]
    const result = computeTaxCreditForScheme(vfxScheme, allocations, computeTotalCoreSpend(expenses))
    expect(result.cappedQualifyingSpend).toBe(1_000_000)
    expect(result.creditAmount).toBe(1_000_000 * 0.2925)
  })

  it('marks scheme ineligible when core budget exceeded', () => {
    const enhanced = {
      ...baseScheme,
      id: 'enhanced',
      name: 'Enhanced',
      net_rate: 0.3975,
      max_core_budget: 23_500_000,
      max_qualifying_amount: 15_000_000,
    }
    const expenses = [expense('e1', 25_000_000)]
    const allocations = [alloc('enhanced', 'e1', 10_000_000)]
    const result = computeTaxCreditForScheme(enhanced, allocations, computeTotalCoreSpend(expenses))
    expect(result.ineligible).toBe(true)
    expect(result.creditAmount).toBe(0)
  })

  it('applies max_qualifying_amount cap', () => {
    const enhanced = {
      ...baseScheme,
      max_qualifying_amount: 15_000_000,
    }
    const expenses = [expense('e1', 20_000_000)]
    const allocations = [alloc('scheme-1', 'e1', 20_000_000)]
    const result = computeTaxCreditForScheme(enhanced, allocations, computeTotalCoreSpend(expenses))
    expect(result.cappedQualifyingSpend).toBe(15_000_000)
  })

  it('warns when below minimum qualifying threshold', () => {
    const expenses = [expense('e1', 1_000_000)]
    const allocations = [alloc('scheme-1', 'e1', 50_000)]
    const result = computeTaxCreditForScheme(baseScheme, allocations, computeTotalCoreSpend(expenses))
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('computeTaxCreditTotals', () => {
  it('sums credits across multiple enabled schemes', () => {
    const scheme2 = { ...baseScheme, id: 'scheme-2', name: 'California', net_rate: 0.2, cap_percent: null }
    const expenses = [expense('e1', 500_000)]
    const allocations = [
      alloc('scheme-1', 'e1', 300_000),
      alloc('scheme-2', 'e1', 200_000),
    ]
    const totals = computeTaxCreditTotals({
      schemes: [baseScheme, scheme2],
      allocations,
      expenses,
      totalActual: 500_000,
      totalDerived: 50_000,
    })
    expect(totals.totalTaxCredits).toBeGreaterThan(0)
    expect(totals.perScheme).toHaveLength(2)
    expect(totals.netCostAfterCredits).toBe(550_000 - totals.totalTaxCredits)
  })

  it('ignores disabled schemes', () => {
    const disabled = { ...baseScheme, is_enabled: false }
    const expenses = [expense('e1', 100_000)]
    const allocations = [alloc('scheme-1', 'e1', 100_000)]
    const totals = computeTaxCreditTotals({
      schemes: [disabled],
      allocations,
      expenses,
      totalActual: 100_000,
    })
    expect(totals.totalTaxCredits).toBe(0)
  })
})

describe('computeVatTotals', () => {
  it('computes VAT per expense with rate', () => {
    const expenses = [expense('e1', 1000, 20), expense('e2', 500, null)]
    const vat = computeVatTotals(expenses)
    expect(vat.totalVat).toBe(200)
    expect(vat.perExpense).toHaveLength(1)
  })
})
