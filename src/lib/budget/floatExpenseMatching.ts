/**
 * Derived petty cash float reconciliation (not persisted).
 * Float spend vs allocation; independent of budget_item_expense_links.
 */

import type {
  BudgetItemExpenseLink,
  Expense,
  FloatExpenseLink,
  PettyCashFloat,
  PettyCashFloatReconciliationStatus,
} from '@/lib/db/types'
import { sumAllocatedAmountForExpense } from '@/lib/budget/reconciliation'

export function sumFloatMatchedForExpense(expenseId: string, links: FloatExpenseLink[]): number {
  return links
    .filter((l) => l.expense_id === expenseId)
    .reduce((sum, l) => sum + l.matched_amount, 0)
}

export function getPettyCashFloatDerived(
  float: PettyCashFloat,
  linksForFloat: FloatExpenseLink[]
): {
  allocated: number
  matched: number
  remaining: number
  status: PettyCashFloatReconciliationStatus
} {
  const allocated = float.amount
  const matched = linksForFloat.reduce((s, l) => s + l.matched_amount, 0)
  const remaining = allocated - matched
  let status: PettyCashFloatReconciliationStatus
  if (matched === 0) status = 'unmatched'
  else if (matched < allocated) status = 'partial'
  else if (matched === allocated) status = 'matched'
  else status = 'overspent'
  return { allocated, matched, remaining, status }
}

/** Expense amount minus budget reconciliation and any active float link (for picking match amounts). */
export function getExpenseUnallocatedForFloatMatching(
  expense: Expense,
  budgetLinks: BudgetItemExpenseLink[],
  floatLinks: FloatExpenseLink[]
): number {
  const budget = sumAllocatedAmountForExpense(expense.id, budgetLinks)
  const floatPart = sumFloatMatchedForExpense(expense.id, floatLinks)
  return expense.amount - budget - floatPart
}
