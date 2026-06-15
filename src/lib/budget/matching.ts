/**
 * Groundwork for matching/filtering between typed line items and typed expenses.
 * Same classification types: labour, purchase, rental, allow, deposit.
 * Related = same account_id + same classification type.
 */
import type { BudgetItem, Expense, LineItemType } from '@/lib/db/types'

export type ClassificationFilter = 'all' | LineItemType

/** Classification type for an item; null treated as allow for legacy rows. */
export type ClassificationType = LineItemType | null

/** Get line item classification; null when unclassified. */
export function getLineItemType(item: BudgetItem): LineItemType | null {
  return item.line_item_type ?? null
}

/** Get expense classification (transaction_type); null when unclassified. */
export function getExpenseType(expense: Expense): LineItemType | null {
  return expense.transaction_type ?? null
}

/** Same classification (both typed and equal, or both unclassified). */
export function sameClassification(
  a: ClassificationType,
  b: ClassificationType
): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a === b
}

/** Filter line items by classification filter. */
export function filterLineItemsByClassification(
  items: BudgetItem[],
  filter: ClassificationFilter
): BudgetItem[] {
  if (filter === 'all') return items
  return items.filter((i) => {
    const type = getLineItemType(i)
    if (filter === 'allow' && type === null) return true
    return type === filter
  })
}

/** Filter expenses by classification filter. */
export function filterExpensesByClassification(
  expenses: Expense[],
  filter: ClassificationFilter
): Expense[] {
  if (filter === 'all') return expenses
  return expenses.filter((e) => {
    const type = getExpenseType(e)
    if (filter === 'allow' && type === null) return true
    return type === filter
  })
}

/**
 * Get expenses in the same account with the same classification as the line item.
 */
export function getRelatedExpensesForLineItem(
  lineItem: BudgetItem,
  expenses: Expense[],
  accountId: string | null
): Expense[] {
  if (accountId == null) return []
  const itemType = getLineItemType(lineItem)
  return expenses.filter(
    (e) =>
      e.account_id === accountId && sameClassification(itemType, getExpenseType(e))
  )
}

/**
 * Get line items in the same account with the same classification as the expense.
 */
export function getRelatedLineItemsForExpense(
  expense: Expense,
  lineItems: BudgetItem[],
  accountId: string | null
): BudgetItem[] {
  if (accountId == null) return []
  const expenseType = getExpenseType(expense)
  return lineItems.filter(
    (i) =>
      i.account_id === accountId && sameClassification(getLineItemType(i), expenseType)
  )
}

/** Sum estimated_cost for line items. */
export function sumEstimatedForLineItems(items: BudgetItem[]): number {
  return items.reduce((sum, i) => sum + (i.estimated_cost ?? 0), 0)
}

/** Sum amount (actual spend) for expenses. */
export function sumActualForExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)
}
