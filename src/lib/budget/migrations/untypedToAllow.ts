import {
  allowDetailsToJson,
  type AllowDetails,
} from '@/lib/budget/transactions/allow'
import {
  allowLineItemDetailsToJson,
  type AllowLineItemDetails,
} from '@/lib/budget/line-items/allow'
import type { BudgetItem, Expense } from '@/lib/db/types'

const GENERAL_SPEND_LABEL = 'General spend'

export function buildMigratedAllowExpenseDetails(
  expense: Pick<Expense, 'notes' | 'vendor' | 'amount'>
): AllowDetails {
  const allowDescription =
    expense.notes?.trim() ||
    expense.vendor?.trim() ||
    GENERAL_SPEND_LABEL

  return {
    allow_description: allowDescription,
    provisional_amount: expense.amount > 0 ? expense.amount : null,
    status: 'resolved',
    notes: expense.notes?.trim() ? expense.notes.trim() : null,
  }
}

export function buildMigratedAllowLineItemDetails(
  item: Pick<BudgetItem, 'description' | 'estimated_cost'>
): AllowLineItemDetails {
  return {
    allow_description: item.description.trim() || GENERAL_SPEND_LABEL,
    provisional_amount: item.estimated_cost > 0 ? item.estimated_cost : null,
    status: 'open',
    notes: null,
  }
}

export function buildDefaultAllowLineItemDetails(
  item: Pick<BudgetItem, 'description' | 'estimated_cost'>
): AllowLineItemDetails {
  return buildMigratedAllowLineItemDetails(item)
}

export function migratedAllowExpenseDetailsJson(
  expense: Pick<Expense, 'notes' | 'vendor' | 'amount'>
): string {
  return allowDetailsToJson(buildMigratedAllowExpenseDetails(expense))
}

export function defaultAllowLineItemDetailsJson(
  item: Pick<BudgetItem, 'description' | 'estimated_cost'>
): string {
  return allowLineItemDetailsToJson(buildDefaultAllowLineItemDetails(item))
}
