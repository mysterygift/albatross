/**
 * Derived reconciliation state from budget items, expenses, and budget_item_expense_links.
 * Does not persist; computed for UI and completion checks.
 * estimated_cost and expenses.amount remain source of truth.
 */

import type {
  BudgetItem,
  BudgetItemExpenseLink,
  BudgetItemReconciliationStatus,
  Expense,
  ExpenseReconciliationStatus,
} from '@/lib/db/types'
import { roundMoney } from '@/lib/money/roundMoney'

/** Sum all link.matched_amount for the given budget item (caller passes non-deleted links). */
export function sumMatchedAmountForBudgetItem(
  budgetItemId: string,
  links: BudgetItemExpenseLink[]
): number {
  const sum = links
    .filter((l) => l.budget_item_id === budgetItemId)
    .reduce((sum, l) => sum + l.matched_amount, 0)
  return roundMoney(sum)
}

/** Sum all link.matched_amount for the given expense (caller passes non-deleted links). */
export function sumAllocatedAmountForExpense(
  expenseId: string,
  links: BudgetItemExpenseLink[]
): number {
  const sum = links
    .filter((l) => l.expense_id === expenseId)
    .reduce((sum, l) => sum + l.matched_amount, 0)
  return roundMoney(sum)
}

/** estimated_cost - matched_sum; may be negative if overspent. */
export function getBudgetItemRemainingEstimate(
  budgetItem: BudgetItem,
  links: BudgetItemExpenseLink[]
): number {
  const matched = sumMatchedAmountForBudgetItem(budgetItem.id, links)
  return roundMoney(budgetItem.estimated_cost - matched)
}

/** expense.amount - allocated_sum. */
export function getExpenseUnallocatedAmount(
  expense: Expense,
  links: BudgetItemExpenseLink[]
): number {
  const allocated = sumAllocatedAmountForExpense(expense.id, links)
  return roundMoney(expense.amount - allocated)
}

/** Line item match status from matched sum vs estimated_cost. */
export function getBudgetItemMatchStatus(
  budgetItem: BudgetItem,
  links: BudgetItemExpenseLink[]
): BudgetItemReconciliationStatus {
  const matched = sumMatchedAmountForBudgetItem(budgetItem.id, links)
  const estimated = roundMoney(budgetItem.estimated_cost)
  if (matched === 0) return 'unmatched'
  if (matched < estimated) return 'partial'
  if (matched === estimated) return 'matched'
  return 'overspent'
}

/** Expense allocation status from allocated sum vs amount. */
export function getExpenseAllocationStatus(
  expense: Expense,
  links: BudgetItemExpenseLink[]
): ExpenseReconciliationStatus {
  const allocated = sumAllocatedAmountForExpense(expense.id, links)
  const amount = roundMoney(expense.amount)
  if (allocated === 0) return 'unallocated'
  if (allocated < amount) return 'partial'
  return 'allocated'
}

export type ReconciliationSummary = {
  lineItems: {
    matched: number
    partial: number
    unmatched: number
    overspent: number
  }
  expenses: {
    allocated: number
    partial: number
    unallocated: number
  }
  totalRemainingEstimate: number
  totalUnallocatedSpend: number
}

/** Aggregate counts and totals for a production's reconciliation state. */
export function getReconciliationSummary(params: {
  budgetItems: BudgetItem[]
  expenses: Expense[]
  links: BudgetItemExpenseLink[]
}): ReconciliationSummary {
  const { budgetItems, expenses, links } = params
  const lineItems = {
    matched: 0,
    partial: 0,
    unmatched: 0,
    overspent: 0,
  }
  let totalRemainingEstimate = 0
  for (const item of budgetItems) {
    const status = getBudgetItemMatchStatus(item, links)
    lineItems[status] += 1
    totalRemainingEstimate += getBudgetItemRemainingEstimate(item, links)
  }

  const expenseCounts = {
    allocated: 0,
    partial: 0,
    unallocated: 0,
  }
  let totalUnallocatedSpend = 0
  for (const expense of expenses) {
    const status = getExpenseAllocationStatus(expense, links)
    expenseCounts[status] += 1
    totalUnallocatedSpend += getExpenseUnallocatedAmount(expense, links)
  }

  return {
    lineItems,
    expenses: expenseCounts,
    totalRemainingEstimate,
    totalUnallocatedSpend,
  }
}

// ─── Safety helpers for future "Mark Production Complete" ────────────────────

/** True if any expense has unallocated amount > 0. */
export function hasUnallocatedSpend(
  expenses: Expense[],
  links: BudgetItemExpenseLink[]
): boolean {
  return expenses.some((e) => getExpenseUnallocatedAmount(e, links) > 0)
}

/** True if any line item has matched_sum === 0. */
export function hasUnmatchedLineItems(
  budgetItems: BudgetItem[],
  links: BudgetItemExpenseLink[]
): boolean {
  return budgetItems.some((item) => sumMatchedAmountForBudgetItem(item.id, links) === 0)
}

/** Expenses with unallocated amount > 0. */
export function getUnallocatedExpenses(
  expenses: Expense[],
  links: BudgetItemExpenseLink[]
): Expense[] {
  return expenses.filter((e) => getExpenseUnallocatedAmount(e, links) > 0)
}

/** Line items with matched_sum === 0. */
export function getUnmatchedBudgetItems(
  budgetItems: BudgetItem[],
  links: BudgetItemExpenseLink[]
): BudgetItem[] {
  return budgetItems.filter((item) => sumMatchedAmountForBudgetItem(item.id, links) === 0)
}
