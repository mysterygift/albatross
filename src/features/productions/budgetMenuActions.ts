import { riskWatchQueryKey } from '@/lib/budget/vendors/riskWatch'
import type { BudgetRevision } from '@/lib/db/repositories/budgetRevisions'

export type BudgetMenuActionMessage = {
  type: 'success' | 'error'
  message: string
  timeoutMs: number
}

type DuplicateLiveAsDraftDeps = {
  currentProductionId: string | null
  hasLiveRevision: boolean
  isBusy: boolean
  duplicateLiveBudgetRevisionAsDraft: (params: { productionId: string }) => Promise<BudgetRevision>
  setSelectedBudgetRevisionId: (productionId: string, revisionId: string) => void
  invalidateQueries: (queryKey: readonly unknown[]) => void
}

const DUPLICATE_INVALIDATION_KEY_FACTORIES: Array<(productionId: string) => readonly unknown[]> = [
  (productionId) => ['budget-revisions', productionId],
  (productionId) => ['working-budget-revision', productionId],
  (productionId) => ['budget-items', productionId],
  (productionId) => ['budget-item-expense-links', productionId],
  (productionId) => ['cost-report-groups', productionId],
  (productionId) => ['cost-report-groups-with-accounts', productionId],
  (productionId) => ['production-totals', productionId],
  (productionId) => ['fringe-rules', productionId],
  (productionId) => ['contingency-rules', productionId],
  (productionId) => ['floats', productionId],
  (productionId) => ['float-expense-links-by-production', productionId],
  (productionId) => ['dashboard-budget-health', productionId],
  (productionId) => riskWatchQueryKey(productionId),
  (productionId) => ['budget-compare-items', productionId],
  (productionId) => ['budget-compare-fringe-rules', productionId],
  (productionId) => ['budget-compare-contingency-rules', productionId],
  (productionId) => ['budget-compare-floats', productionId],
  (productionId) => ['budget-compare-float-links', productionId],
]

export async function runDuplicateLiveAsDraftFromMenu(
  deps: DuplicateLiveAsDraftDeps
): Promise<BudgetMenuActionMessage | null> {
  if (deps.isBusy) return null
  if (!deps.currentProductionId) {
    return {
      type: 'error',
      message: 'Choose a current production before duplicating the live budget revision.',
      timeoutMs: 5000,
    }
  }
  if (!deps.hasLiveRevision) {
    return {
      type: 'error',
      message: 'No live budget revision is set for this production yet.',
      timeoutMs: 6000,
    }
  }

  try {
    const created = await deps.duplicateLiveBudgetRevisionAsDraft({
      productionId: deps.currentProductionId,
    })

    deps.setSelectedBudgetRevisionId(deps.currentProductionId, created.id)
    for (const makeKey of DUPLICATE_INVALIDATION_KEY_FACTORIES) {
      deps.invalidateQueries(makeKey(deps.currentProductionId))
    }

    return {
      type: 'success',
      message: `Created draft revision "${created.name}" from the live revision.`,
      timeoutMs: 5000,
    }
  } catch (err) {
    return {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unable to duplicate live budget revision.',
      timeoutMs: 6000,
    }
  }
}

export function canDuplicateLiveAsDraftFromMenuContext(params: {
  currentProductionId: string | null
  hasLiveRevision: boolean
  isBusy: boolean
}): boolean {
  if (params.isBusy) return false
  if (!params.currentProductionId) return false
  return params.hasLiveRevision
}
