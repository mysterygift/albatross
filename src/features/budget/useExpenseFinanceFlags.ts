import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useExpenseReceiptStatus } from '@/features/budget/useExpenseReceiptStatus'
import {
  buildExpenseFinanceFlags,
  isPoMatchableExpense,
  type ExpenseFinanceFlags,
} from '@/lib/budget/expenseFinanceFlags'
import {
  expensePoLinkCountsQueryKey,
  listPoLinkCountsByExpenseIds,
} from '@/lib/db/repositories/vendorFinanceLinks'
import type { Expense } from '@/lib/db/types'

const EMPTY: Record<string, number> = {}

type FlagExpense = Pick<Expense, 'id' | 'vendor_id' | 'transaction_type'>

/**
 * "No PO" / "No proof" flags for a list of expenses. Two batched queries for the whole list (PO link
 * counts for PO-matchable expenses only, plus the shared proof status query), never one per row.
 * Nothing is flagged until both have loaded.
 */
export function useExpenseFinanceFlags(
  productionId: string,
  expenses: readonly FlagExpense[]
): { flagsById: Record<string, ExpenseFinanceFlags>; isLoading: boolean } {
  const allIds = useMemo(() => expenses.map((e) => e.id), [expenses])
  const poIds = useMemo(() => expenses.filter(isPoMatchableExpense).map((e) => e.id), [expenses])

  const { proofByExpenseId, isLoading: proofLoading } = useExpenseReceiptStatus(productionId, allIds)
  const { data: poLinkCounts, isLoading: poLoading } = useQuery({
    queryKey: expensePoLinkCountsQueryKey(productionId, poIds),
    queryFn: () => listPoLinkCountsByExpenseIds(poIds),
    enabled: Boolean(productionId) && poIds.length > 0,
  })

  const flagsById = useMemo(
    () => buildExpenseFinanceFlags(expenses, poLinkCounts ?? EMPTY, proofByExpenseId),
    [expenses, poLinkCounts, proofByExpenseId]
  )
  return { flagsById, isLoading: proofLoading || poLoading }
}
