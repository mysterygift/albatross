/**
 * Dashboard budget health — read-only helper for the "Budget Health Check" card.
 * Derives totals from budget items, expenses, and reconciliation links.
 * Does not persist; all values are computed.
 */
import {
  listBudgetItemsByProduction,
  listExpensesByProduction,
} from '@/lib/db/repositories/budget'
import { listBudgetItemExpenseLinksByProduction } from '@/lib/db/repositories/budgetReconciliation'
import { getReconciliationSummary } from '@/lib/budget/reconciliation'

export type DashboardBudgetHealthData = {
  totalEstimated: number
  totalActual: number
  variance: number
  percentageSpent: number
  percentageRemaining: number
  unallocatedSpend: number
}

/**
 * Fetches budget data and returns derived health summary for the Dashboard card.
 * Uses same source-of-truth as Budget page: items.estimated_cost, expenses.amount, links.
 */
export async function getDashboardBudgetHealthData(
  productionId: string
): Promise<DashboardBudgetHealthData> {
  const [items, expenses, links] = await Promise.all([
    listBudgetItemsByProduction(productionId),
    listExpensesByProduction(productionId),
    listBudgetItemExpenseLinksByProduction(productionId),
  ])

  const totalEstimated = items.reduce((s, i) => s + i.estimated_cost, 0)
  const totalActual = expenses.reduce((s, e) => s + e.amount, 0)
  const variance = totalEstimated - totalActual

  const summary = getReconciliationSummary({ budgetItems: items, expenses, links })
  const unallocatedSpend = summary.totalUnallocatedSpend

  const percentageSpent = totalEstimated > 0 ? totalActual / totalEstimated : 0
  const remaining = Math.max(totalEstimated - totalActual, 0)
  const percentageRemaining = totalEstimated > 0 ? remaining / totalEstimated : 0

  return {
    totalEstimated,
    totalActual,
    variance,
    percentageSpent,
    percentageRemaining,
    unallocatedSpend,
  }
}
