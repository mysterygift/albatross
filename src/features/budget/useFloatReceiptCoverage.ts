import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useExpenseReceiptStatus } from '@/features/budget/useExpenseReceiptStatus'
import { summarizeFloatReceiptCoverage, type FloatReceiptCoverage } from '@/lib/budget/receiptStatus'
import { listFloatExpenseLinksByProduction } from '@/lib/db/repositories/floatReconciliation'

/** Receipt coverage (null while loading) for the expenses linked to every float in a production (2 batched queries). */
export function useFloatReceiptCoverage(
  productionId: string,
  revisionId?: string
): FloatReceiptCoverage | null {
  // Same key as FloatReconciliationDialog so the two share one cache entry.
  const { data: floatLinks = [] } = useQuery({
    queryKey: ['float-expense-links-by-production', productionId, revisionId],
    queryFn: () => listFloatExpenseLinksByProduction(productionId, revisionId),
    enabled: !!productionId,
  })
  const expenseIds = useMemo(() => [...new Set(floatLinks.map((l) => l.expense_id))], [floatLinks])
  const { proofByExpenseId, isLoading } = useExpenseReceiptStatus(productionId, expenseIds)
  return useMemo(
    // null while the status is loading so the UI never flashes "everything is missing".
    () => (isLoading ? null : summarizeFloatReceiptCoverage(floatLinks, proofByExpenseId)),
    [floatLinks, proofByExpenseId, isLoading]
  )
}
