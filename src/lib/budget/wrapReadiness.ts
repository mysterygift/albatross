/**
 * Wrap production readiness: derived state for the Wrap Production page.
 * Read-only; does not mutate budget, expense, or reconciliation data.
 * Uses reconciliation helpers for all calculations.
 */

import type { BudgetAccount } from '@/lib/db/types'
import type { BudgetItem, BudgetItemExpenseLink, Expense } from '@/lib/db/types'
import {
  getReconciliationSummary,
  getBudgetItemMatchStatus,
  getBudgetItemRemainingEstimate,
  getExpenseUnallocatedAmount,
  sumMatchedAmountForBudgetItem,
  getUnallocatedExpenses,
  getUnmatchedBudgetItems,
  hasUnallocatedSpend,
  hasUnmatchedLineItems,
} from '@/lib/budget/reconciliation'

export type WrapBudgetReadinessStatus = 'ready' | 'needs_review'

export type WrapBudgetReadinessSummary = {
  /** Section-level status for Budget and Actualisation. */
  status: WrapBudgetReadinessStatus
  /** Number of expenses with unallocated amount > 0. */
  unallocatedExpenseCount: number
  /** Total unallocated spend across all expenses. */
  totalUnallocatedSpend: number
  /** Number of line items with no matched spend. */
  unmatchedLineItemCount: number
  /** Number of line items with some matched spend but remaining estimate > 0. */
  partialLineItemCount: number
  /** Number of line items where matched spend > estimated_cost. */
  overspentLineItemCount: number
  /** Total overspend (sum of (matched - estimated_cost) for overspent items). */
  totalOverspend: number
  /** Number of line items with remaining estimate > 0 (partial + unmatched). */
  remainingEstimateLineItemCount: number
  /** Sum of remaining estimate for items where remaining > 0 (underspend only). */
  totalRemainingEstimate: number
}

export type OverspentLineItemRow = {
  item: BudgetItem
  matchedAmount: number
  overspendAmount: number
}

export type RemainingEstimateLineItemRow = {
  item: BudgetItem
  matchedAmount: number
  remainingEstimate: number
}

/** One account (or "No account") where both overspend and underspend exist; informational only. */
export type ReallocationOpportunity = {
  accountId: string | null
  accountCode: string | null
  accountName: string | null
  totalOverspend: number
  totalUnderspend: number
}

/**
 * Compute wrap budget readiness and summary from existing reconciliation data.
 * Ready if: no unallocated spend, no unmatched line items, no overspent line items.
 */
export function getWrapBudgetReadiness(params: {
  budgetItems: BudgetItem[]
  expenses: Expense[]
  links: BudgetItemExpenseLink[]
}): WrapBudgetReadinessSummary {
  const { budgetItems, expenses, links } = params
  const summary = getReconciliationSummary({ budgetItems, expenses, links })

  let totalOverspend = 0
  let totalRemainingEstimatePositive = 0
  for (const item of budgetItems) {
    const remaining = getBudgetItemRemainingEstimate(item, links)
    const status = getBudgetItemMatchStatus(item, links)
    if (status === 'overspent') {
      totalOverspend += -remaining
    }
    if (remaining > 0) {
      totalRemainingEstimatePositive += remaining
    }
  }

  const status: WrapBudgetReadinessStatus =
    !hasUnallocatedSpend(expenses, links) &&
    !hasUnmatchedLineItems(budgetItems, links) &&
    summary.lineItems.overspent === 0
      ? 'ready'
      : 'needs_review'

  return {
    status,
    unallocatedExpenseCount: summary.expenses.unallocated + summary.expenses.partial,
    totalUnallocatedSpend: summary.totalUnallocatedSpend,
    unmatchedLineItemCount: summary.lineItems.unmatched,
    partialLineItemCount: summary.lineItems.partial,
    overspentLineItemCount: summary.lineItems.overspent,
    totalOverspend,
    remainingEstimateLineItemCount: summary.lineItems.unmatched + summary.lineItems.partial,
    totalRemainingEstimate: totalRemainingEstimatePositive,
  }
}

/** Line items where matched spend exceeds estimated_cost. */
export function getOverspentBudgetItems(
  budgetItems: BudgetItem[],
  links: BudgetItemExpenseLink[]
): OverspentLineItemRow[] {
  return budgetItems
    .filter((item) => getBudgetItemMatchStatus(item, links) === 'overspent')
    .map((item) => {
      const matched = sumMatchedAmountForBudgetItem(item.id, links)
      return {
        item,
        matchedAmount: matched,
        overspendAmount: matched - item.estimated_cost,
      }
    })
}

/** Line items with remaining estimate > 0 (partial or unmatched). */
export function getUnderspentBudgetItems(
  budgetItems: BudgetItem[],
  links: BudgetItemExpenseLink[]
): RemainingEstimateLineItemRow[] {
  return budgetItems
    .filter((item) => getBudgetItemRemainingEstimate(item, links) > 0)
    .map((item) => {
      const matched = sumMatchedAmountForBudgetItem(item.id, links)
      const remaining = getBudgetItemRemainingEstimate(item, links)
      return { item, matchedAmount: matched, remainingEstimate: remaining }
    })
}

/**
 * Potential reallocation opportunities: accounts (or unassigned) where both
 * overspend and underspend exist. Informational only; no mutations.
 * Future: expand to department / cost report group when available.
 */
export function getPotentialReallocationOpportunities(params: {
  budgetItems: BudgetItem[]
  links: BudgetItemExpenseLink[]
  accounts: BudgetAccount[]
}): ReallocationOpportunity[] {
  const { budgetItems, links, accounts } = params
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  const overspendByAccount = new Map<string | null, number>()
  const underspendByAccount = new Map<string | null, number>()

  for (const item of budgetItems) {
    const remaining = getBudgetItemRemainingEstimate(item, links)
    const accountId = item.account_id ?? null
    if (remaining < 0) {
      overspendByAccount.set(accountId, (overspendByAccount.get(accountId) ?? 0) + -remaining)
    } else if (remaining > 0) {
      underspendByAccount.set(accountId, (underspendByAccount.get(accountId) ?? 0) + remaining)
    }
  }

  const opportunities: ReallocationOpportunity[] = []
  const seenKeys = new Set<string>()

  for (const [accountId, totalOverspend] of overspendByAccount) {
    const totalUnderspend = underspendByAccount.get(accountId) ?? 0
    if (totalUnderspend <= 0) continue
    const key = accountId ?? '__none__'
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    const account = accountId ? accountById.get(accountId) ?? null : null
    opportunities.push({
      accountId,
      accountCode: account?.code ?? null,
      accountName: account?.name ?? (accountId ? null : 'Unassigned'),
      totalOverspend,
      totalUnderspend,
    })
  }

  return opportunities.sort((a, b) => {
    const nameA = a.accountName ?? a.accountCode ?? ''
    const nameB = b.accountName ?? b.accountCode ?? ''
    return nameA.localeCompare(nameB)
  })
}

export {
  getUnallocatedExpenses,
  getUnmatchedBudgetItems,
}
