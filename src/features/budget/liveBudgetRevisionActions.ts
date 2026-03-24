import type { BudgetRevision } from '@/lib/db/repositories/budgetRevisions'

export type LiveBudgetRevisionSwitchInput = {
  currentProductionId: string | null
  targetRevision: BudgetRevision | null
  isBusy: boolean
}

type LiveBudgetRevisionSwitchDeps = {
  setLiveBudgetRevision: (params: { productionId: string; revisionId: string }) => Promise<unknown>
}

export type LiveBudgetRevisionSwitchResult =
  | { ok: true }
  | { ok: false; message: string; isNoop?: boolean }

export async function runLiveBudgetRevisionSwitch(
  deps: LiveBudgetRevisionSwitchDeps,
  input: LiveBudgetRevisionSwitchInput
): Promise<LiveBudgetRevisionSwitchResult> {
  if (input.isBusy) {
    return { ok: false, message: 'Live revision update is already in progress.', isNoop: true }
  }
  if (!input.currentProductionId) {
    return { ok: false, message: 'Select a production before setting a live revision.' }
  }
  if (!input.targetRevision) {
    return { ok: false, message: 'Choose a target revision to set as live.' }
  }
  if (input.targetRevision.is_live) {
    return { ok: false, message: 'This revision is already live.', isNoop: true }
  }

  try {
    await deps.setLiveBudgetRevision({
      productionId: input.currentProductionId,
      revisionId: input.targetRevision.id,
    })
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Unable to update live revision.',
    }
  }
}
