import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import {
  resolveSelectedBudgetRevision,
  setLiveBudgetRevisionForProduction,
} from '@/lib/db/repositories/budgetRevisions'

export function useWorkingBudgetRevision(
  productionId: string | null | undefined,
  options?: { explicitRevisionId?: string | null }
) {
  const { getSelectedBudgetRevisionId, setSelectedBudgetRevisionId, clearSelectedBudgetRevisionId } = useCurrentProduction()
  const explicitRevisionId = options?.explicitRevisionId?.trim() || null
  const selectedRevisionId = getSelectedBudgetRevisionId(productionId)
  const effectiveSelectedRevisionId = explicitRevisionId ?? selectedRevisionId

  useEffect(() => {
    if (!productionId || !explicitRevisionId) return
    setSelectedBudgetRevisionId(productionId, explicitRevisionId)
  }, [productionId, explicitRevisionId, setSelectedBudgetRevisionId])

  const query = useQuery({
    queryKey: ['working-budget-revision', productionId, effectiveSelectedRevisionId],
    queryFn: () =>
      resolveSelectedBudgetRevision({
        productionId: productionId!,
        selectedRevisionId: effectiveSelectedRevisionId,
      }),
    enabled: !!productionId,
  })

  useEffect(() => {
    if (!productionId || !effectiveSelectedRevisionId || query.isLoading) return
    if (!query.data) {
      clearSelectedBudgetRevisionId(productionId)
    }
  }, [productionId, effectiveSelectedRevisionId, query.data, query.isLoading, clearSelectedBudgetRevisionId])

  return {
    ...query,
    selectedRevisionId: effectiveSelectedRevisionId,
    setSelectedRevisionId: (revisionId: string) => setSelectedBudgetRevisionId(productionId, revisionId),
    clearSelectedRevisionId: () => clearSelectedBudgetRevisionId(productionId),
    hasExplicitSelection: !!effectiveSelectedRevisionId,
  }
}

export function useSetLiveBudgetRevisionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ productionId, revisionId }: { productionId: string; revisionId: string }) =>
      setLiveBudgetRevisionForProduction({ productionId, revisionId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['working-budget-revision', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['budget-revisions', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['budget-items', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['cost-report-groups-with-accounts', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['production-totals', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['fringe-rules', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['contingency-rules', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['floats', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['float-expense-links-by-production', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-budget-health', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['risk-watch', variables.productionId] })
    },
  })
}
