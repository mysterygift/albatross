import type { BudgetRevision } from '@/lib/db/repositories/budgetRevisions'

export const CREATE_BUDGET_REVISION_VALUE = '__create_budget_revision__'

export function getBudgetRevisionContextLabel(revision: BudgetRevision | null | undefined): string {
  if (!revision) return 'Loading revision...'
  return revision.is_live ? 'Live revision' : 'Draft revision'
}

export function getBudgetRevisionTriggerLabel(params: {
  selectedRevision: BudgetRevision | null | undefined
  revisions: BudgetRevision[]
  isLoading: boolean
}): string {
  if (params.isLoading) return 'Loading revisions...'
  if (params.selectedRevision?.name) return params.selectedRevision.name
  if (params.revisions.length === 0) return 'No revisions'
  return 'Select revision'
}

export function getBudgetRevisionOptionLabels(revisions: BudgetRevision[]): string[] {
  if (revisions.length === 0) return ['No revisions found', 'Create budget revision...']
  return [
    ...revisions.map((rev) => `${rev.name} ${rev.is_live ? '· Live' : '· Draft'}`),
    'Create budget revision...',
  ]
}

export function isCreateBudgetRevisionSelection(value: string): boolean {
  return value === CREATE_BUDGET_REVISION_VALUE
}
