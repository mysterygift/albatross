import type { Expense, ExpenseTaxCreditAllocation, TaxCreditScheme } from '@/lib/db/types'

export type TaxCreditSchemeRow = Pick<
  TaxCreditScheme,
  | 'id'
  | 'name'
  | 'net_rate'
  | 'cap_percent'
  | 'min_qualifying_percent'
  | 'max_qualifying_amount'
  | 'max_core_budget'
  | 'is_vfx'
  | 'is_enabled'
>

export type SchemeTaxCreditResult = {
  schemeId: string
  schemeName: string
  qualifyingSpend: number
  cappedQualifyingSpend: number
  creditAmount: number
  warnings: string[]
  ineligible: boolean
}

export type TaxCreditTotalsResult = {
  perScheme: SchemeTaxCreditResult[]
  totalQualifyingSpend: number
  totalTaxCredits: number
  netCostAfterCredits: number
}

export type VatTotalsResult = {
  perExpense: Array<{ expenseId: string; vatAmount: number }>
  totalVat: number
}

/** Sum of all expense amounts (total core spend proxy). */
export function computeTotalCoreSpend(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0)
}

export function computeVatTotals(expenses: Expense[]): VatTotalsResult {
  const perExpense: VatTotalsResult['perExpense'] = []
  let totalVat = 0
  for (const e of expenses) {
    if (e.vat_rate_percent == null || e.vat_rate_percent <= 0) continue
    const vatAmount = e.amount * (e.vat_rate_percent / 100)
    perExpense.push({ expenseId: e.id, vatAmount })
    totalVat += vatAmount
  }
  return { perExpense, totalVat }
}

function sumQualifyingForScheme(
  schemeId: string,
  allocations: ExpenseTaxCreditAllocation[]
): number {
  return allocations
    .filter((a) => a.tax_credit_scheme_id === schemeId)
    .reduce((sum, a) => sum + a.qualifying_amount, 0)
}

export function computeTaxCreditForScheme(
  scheme: TaxCreditSchemeRow,
  allocations: ExpenseTaxCreditAllocation[],
  totalCoreSpend: number
): SchemeTaxCreditResult {
  const warnings: string[] = []
  const qualifyingSpend = sumQualifyingForScheme(scheme.id, allocations)

  if (!scheme.is_enabled) {
    return {
      schemeId: scheme.id,
      schemeName: scheme.name,
      qualifyingSpend,
      cappedQualifyingSpend: 0,
      creditAmount: 0,
      warnings,
      ineligible: false,
    }
  }

  if (
    scheme.max_core_budget != null &&
    totalCoreSpend > scheme.max_core_budget
  ) {
    return {
      schemeId: scheme.id,
      schemeName: scheme.name,
      qualifyingSpend,
      cappedQualifyingSpend: 0,
      creditAmount: 0,
      warnings: [
        `Total core spend exceeds maximum budget (£${scheme.max_core_budget.toLocaleString()}) for this scheme.`,
      ],
      ineligible: true,
    }
  }

  let cappedQualifyingSpend = qualifyingSpend

  if (scheme.cap_percent != null) {
    const capAmount = totalCoreSpend * scheme.cap_percent
    cappedQualifyingSpend = Math.min(cappedQualifyingSpend, capAmount)
  }

  if (scheme.max_qualifying_amount != null) {
    cappedQualifyingSpend = Math.min(cappedQualifyingSpend, scheme.max_qualifying_amount)
  }

  if (
    scheme.min_qualifying_percent != null &&
    totalCoreSpend > 0 &&
    qualifyingSpend < totalCoreSpend * scheme.min_qualifying_percent
  ) {
    warnings.push(
      `Qualifying spend is below the ${(scheme.min_qualifying_percent * 100).toFixed(0)}% minimum threshold for this scheme.`,
    )
  }

  const creditAmount = cappedQualifyingSpend * scheme.net_rate

  return {
    schemeId: scheme.id,
    schemeName: scheme.name,
    qualifyingSpend,
    cappedQualifyingSpend,
    creditAmount,
    warnings,
    ineligible: false,
  }
}

export function computeTaxCreditTotals(params: {
  schemes: TaxCreditSchemeRow[]
  allocations: ExpenseTaxCreditAllocation[]
  expenses: Expense[]
  totalActual: number
  totalDerived?: number
}): TaxCreditTotalsResult {
  const { schemes, allocations, expenses, totalActual, totalDerived = 0 } = params
  const totalCoreSpend = computeTotalCoreSpend(expenses)
  const perScheme = schemes.map((scheme) =>
    computeTaxCreditForScheme(scheme, allocations, totalCoreSpend)
  )
  const enabledResults = perScheme.filter((r) => {
    const scheme = schemes.find((s) => s.id === r.schemeId)
    return scheme?.is_enabled
  })
  const totalQualifyingSpend = enabledResults.reduce((s, r) => s + r.qualifyingSpend, 0)
  const totalTaxCredits = enabledResults.reduce((s, r) => s + r.creditAmount, 0)
  const grossCost = totalActual + totalDerived
  const netCostAfterCredits = grossCost - totalTaxCredits

  return {
    perScheme,
    totalQualifyingSpend,
    totalTaxCredits,
    netCostAfterCredits,
  }
}
