import { riskWatchQueryKey } from '@/lib/budget/vendors/riskWatch'
import type { BudgetRevision } from '@/lib/db/repositories/budgetRevisions'

export type CreateBudgetRevisionMode = 'blank' | 'copy'

export type CreateBudgetRevisionInput = {
  productionId: string | null
  name: string
  mode: CreateBudgetRevisionMode
  sourceRevisionId: string | null
}

type CreateBudgetRevisionDeps = {
  createBlankBudgetRevision: (params: { productionId: string; name: string }) => Promise<BudgetRevision>
  createBudgetRevisionFromExisting: (params: {
    productionId: string
    sourceRevisionId: string
    newRevisionName: string
  }) => Promise<BudgetRevision>
  setSelectedBudgetRevisionId: (productionId: string, revisionId: string) => void
  invalidateQueries: (queryKey: readonly unknown[]) => void
}

export type CreateBudgetRevisionValidationErrors = {
  name?: string
  sourceRevisionId?: string
}

export type CreateBudgetRevisionResult =
  | { ok: true; revision: BudgetRevision }
  | { ok: false; errors?: CreateBudgetRevisionValidationErrors; message: string }

const CREATE_INVALIDATION_KEY_FACTORIES: Array<(productionId: string) => readonly unknown[]> = [
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

export function validateCreateBudgetRevisionInput(
  input: CreateBudgetRevisionInput
): CreateBudgetRevisionValidationErrors {
  const errors: CreateBudgetRevisionValidationErrors = {}
  if (!input.name.trim()) errors.name = 'Revision name is required.'
  if (input.mode === 'copy' && !input.sourceRevisionId) {
    errors.sourceRevisionId = 'Choose a source revision to copy.'
  }
  return errors
}

export async function runCreateBudgetRevision(
  deps: CreateBudgetRevisionDeps,
  input: CreateBudgetRevisionInput
): Promise<CreateBudgetRevisionResult> {
  if (!input.productionId) {
    return { ok: false, message: 'Select a production before creating a budget revision.' }
  }

  const validationErrors = validateCreateBudgetRevisionInput(input)
  if (validationErrors.name || validationErrors.sourceRevisionId) {
    return {
      ok: false,
      errors: validationErrors,
      message: 'Fix the validation errors before creating a revision.',
    }
  }

  try {
    const trimmedName = input.name.trim()
    const created =
      input.mode === 'blank'
        ? await deps.createBlankBudgetRevision({
            productionId: input.productionId,
            name: trimmedName,
          })
        : await deps.createBudgetRevisionFromExisting({
            productionId: input.productionId,
            sourceRevisionId: input.sourceRevisionId!,
            newRevisionName: trimmedName,
          })

    deps.setSelectedBudgetRevisionId(input.productionId, created.id)
    for (const makeKey of CREATE_INVALIDATION_KEY_FACTORIES) {
      deps.invalidateQueries(makeKey(input.productionId))
    }

    return { ok: true, revision: created }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Unable to create budget revision.',
    }
  }
}
