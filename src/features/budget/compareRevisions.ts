import {
  buildAccountTree,
  computeAccountTotals,
  computeContingencyTotals,
  computeFringeTotals,
} from '@/lib/budget/calculations'
import { computeTaxCreditTotals } from '@/lib/budget/taxCredits'
import { getFloatSummaryForProduction } from '@/lib/budget/floatSummary'
import type { BudgetRevision } from '@/lib/db/repositories/budgetRevisions'
import type { ContingencyRuleWithScopes, FringeRuleWithScopes } from '@/lib/db/repositories/budgetDerived'
import type {
  BudgetAccount,
  BudgetItem,
  Expense,
  ExpenseTaxCreditAllocation,
  FloatExpenseLink,
  Person,
  PettyCashFloat,
  TaxCreditScheme,
} from '@/lib/db/types'

export type RevisionSummaryMetrics = {
  estimate: number
  actuals: number
  variance: number
  derivedCosts: number
  taxCredits: number
  floatExposure: number
}

export type ComparisonMetricRow = {
  key: keyof RevisionSummaryMetrics
  label: string
  base: number
  compare: number
  delta: number
}

export function resolveCompareRevisionDefaults(params: {
  revisions: BudgetRevision[]
  liveRevisionId?: string | null
  selectedRevisionId?: string | null
}): { baseRevisionId: string | null; compareRevisionId: string | null } {
  const ids = params.revisions.map((r) => r.id)
  if (ids.length === 0) return { baseRevisionId: null, compareRevisionId: null }

  const liveId = params.liveRevisionId && ids.includes(params.liveRevisionId) ? params.liveRevisionId : null
  const selectedId =
    params.selectedRevisionId && ids.includes(params.selectedRevisionId) ? params.selectedRevisionId : null

  const baseRevisionId = liveId ?? selectedId ?? ids[0]!
  const compareRevisionId = selectedId && selectedId !== baseRevisionId ? selectedId : ids.find((id) => id !== baseRevisionId) ?? baseRevisionId

  return { baseRevisionId, compareRevisionId }
}

export function computeRevisionSummaryMetrics(params: {
  items: BudgetItem[]
  expenses: Expense[]
  accounts: BudgetAccount[]
  fringeRules: FringeRuleWithScopes[]
  contingencyRules: ContingencyRuleWithScopes[]
  floats: PettyCashFloat[]
  floatExpenseLinks: FloatExpenseLink[]
  people: Person[]
  taxCreditSchemes?: TaxCreditScheme[]
  taxCreditAllocations?: ExpenseTaxCreditAllocation[]
}): RevisionSummaryMetrics {
  const estimate = params.items.reduce((sum, item) => sum + item.estimated_cost, 0)
  const actuals = params.expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const variance = estimate - actuals

  const accountTree = buildAccountTree(params.accounts)
  const accountTotals = computeAccountTotals(params.accounts, params.items, params.expenses)
  const fringe = computeFringeTotals(params.fringeRules, accountTotals, accountTree)
  const contingency = computeContingencyTotals(params.contingencyRules, accountTotals, accountTree)
  const derivedCosts = fringe.totalFringesAmount + contingency.totalContingencyAmount

  const taxCreditTotals =
    params.taxCreditSchemes && params.taxCreditAllocations
      ? computeTaxCreditTotals({
          schemes: params.taxCreditSchemes,
          allocations: params.taxCreditAllocations,
          expenses: params.expenses,
          totalActual: actuals,
          totalDerived: derivedCosts,
        })
      : null

  const floatSummary = getFloatSummaryForProduction({
    floats: params.floats,
    floatExpenseLinks: params.floatExpenseLinks,
    people: params.people,
  })

  return {
    estimate,
    actuals,
    variance,
    derivedCosts,
    taxCredits: taxCreditTotals?.totalTaxCredits ?? 0,
    floatExposure: floatSummary.totalRemaining,
  }
}

export function buildComparisonRows(
  base: RevisionSummaryMetrics,
  compare: RevisionSummaryMetrics
): ComparisonMetricRow[] {
  return [
    { key: 'estimate', label: 'Estimate', base: base.estimate, compare: compare.estimate, delta: compare.estimate - base.estimate },
    { key: 'actuals', label: 'Actuals', base: base.actuals, compare: compare.actuals, delta: compare.actuals - base.actuals },
    { key: 'variance', label: 'Variance', base: base.variance, compare: compare.variance, delta: compare.variance - base.variance },
    {
      key: 'derivedCosts',
      label: 'Derived costs',
      base: base.derivedCosts,
      compare: compare.derivedCosts,
      delta: compare.derivedCosts - base.derivedCosts,
    },
    {
      key: 'taxCredits',
      label: 'Tax credits',
      base: base.taxCredits,
      compare: compare.taxCredits,
      delta: compare.taxCredits - base.taxCredits,
    },
    {
      key: 'floatExposure',
      label: 'Float exposure',
      base: base.floatExposure,
      compare: compare.floatExposure,
      delta: compare.floatExposure - base.floatExposure,
    },
  ]
}
