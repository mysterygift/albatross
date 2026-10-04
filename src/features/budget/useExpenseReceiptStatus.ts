import { useQuery } from '@tanstack/react-query'

import { NO_EXPENSE_PROOF, type ExpenseProofCounts } from '@/lib/budget/receiptStatus'
import {
  expenseReceiptStatusQueryKey,
  listReceiptStatusByExpenseIds,
} from '@/lib/db/repositories/expenseReceipts'

const EMPTY: Record<string, ExpenseProofCounts> = {}

/** Batched proof status (receipt / linked-invoice file) for a set of expenses; one query for all ids. */
export function useExpenseReceiptStatus(
  productionId: string,
  expenseIds: readonly string[],
  enabled = true
): { proofByExpenseId: Record<string, ExpenseProofCounts>; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: expenseReceiptStatusQueryKey(productionId, expenseIds),
    queryFn: () => listReceiptStatusByExpenseIds(expenseIds),
    enabled: enabled && Boolean(productionId) && expenseIds.length > 0,
  })
  return { proofByExpenseId: data ?? EMPTY, isLoading }
}

export { NO_EXPENSE_PROOF }
