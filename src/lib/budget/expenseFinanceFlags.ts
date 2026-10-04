/**
 * "No PO" / "No proof" flags for expense rows, the expense detail header and Risk Watch (pure; no DB).
 *
 * - No proof: the P3 rule in `receiptStatus.ts` (receipt, or a linked invoice with a file). Applies to
 *   every expense.
 * - No PO: only where a vendor-based PO match is meaningful, i.e. the expense has a vendor and a
 *   transaction type that offers PO matching in Log Spend. Petty cash / vendorless / labour / allow
 *   spend never shows it.
 */
import type { Expense, ExpenseTransactionType } from '@/lib/db/types'
import { expenseHasProof, type ExpenseProofCounts } from '@/lib/budget/receiptStatus'

/** Transaction types that offer PO / invoice matching (vendor-type spend). */
export const PO_MATCHABLE_TRANSACTION_TYPES: readonly ExpenseTransactionType[] = ['purchase', 'rental', 'deposit']

type ExpenseFlagFields = Pick<Expense, 'vendor_id' | 'transaction_type'>

/** True when a PO match is meaningful for the expense (vendor present, vendor-type transaction). */
export function isPoMatchableExpense(expense: ExpenseFlagFields): boolean {
  return (
    expense.vendor_id != null &&
    expense.transaction_type != null &&
    PO_MATCHABLE_TRANSACTION_TYPES.includes(expense.transaction_type)
  )
}

export type ExpenseFinanceFlags = { noPo: boolean; noProof: boolean }

/**
 * Flags for one expense. `poLinkCount` / `proof` come from the batched queries; while they are still
 * loading (undefined) nothing is flagged, so rows do not flash a badge.
 */
export function getExpenseFinanceFlags(
  expense: ExpenseFlagFields,
  data: { poLinkCount: number | undefined; proof: ExpenseProofCounts | undefined }
): ExpenseFinanceFlags {
  return {
    noPo: isPoMatchableExpense(expense) && data.poLinkCount === 0,
    noProof: data.proof !== undefined && !expenseHasProof(data.proof),
  }
}

/** Flags for many expenses, keyed by id. */
export function buildExpenseFinanceFlags(
  expenses: ReadonlyArray<ExpenseFlagFields & { id: string }>,
  poLinkCounts: Readonly<Record<string, number>>,
  proofByExpenseId: Readonly<Record<string, ExpenseProofCounts | undefined>>
): Record<string, ExpenseFinanceFlags> {
  const out: Record<string, ExpenseFinanceFlags> = {}
  for (const e of expenses) {
    out[e.id] = getExpenseFinanceFlags(e, { poLinkCount: poLinkCounts[e.id], proof: proofByExpenseId[e.id] })
  }
  return out
}
