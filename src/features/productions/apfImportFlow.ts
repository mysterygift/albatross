import type { QueryClient } from '@tanstack/react-query'

import { getProductionById } from '@/lib/db/repositories/production'
import {
  importProductionFromApf,
  userMessageForImportFailure,
  userMessageForImportSuccess,
} from '@/lib/importExport'

export type ApfImportFlowContext = {
  queryClient: QueryClient
  refetchProductions: () => void | Promise<unknown>
  setCurrentProductionId: (id: string | null) => void
  persistShowArchived: (value: boolean) => void
}

export type ApfImportFlowOutcome =
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string; revealArchivedInList: boolean }

/**
 * Shared path for manual Import Project and desktop-open `.apf` routing.
 */
export async function runApfImportWithUiFollowUp(
  path: string,
  ctx: ApfImportFlowContext
): Promise<ApfImportFlowOutcome> {
  const result = await importProductionFromApf(path)
  if (!result.ok) {
    return { kind: 'error', message: userMessageForImportFailure(result.error) }
  }

  ctx.queryClient.invalidateQueries({ queryKey: ['productions'] })
  await Promise.resolve(ctx.refetchProductions())
  const prod = await getProductionById(result.productionId)

  if (prod?.archived_at) {
    ctx.persistShowArchived(true)
    let msg = `Project “${result.productionName}” was imported. It is archived — use “Show archived projects” to see it in the list below.`
    if (result.warnings.length > 0) {
      msg +=
        ' Some document attachments were missing from the file; those rows were imported without files.'
    }
    return { kind: 'success', message: msg, revealArchivedInList: true }
  }

  ctx.setCurrentProductionId(result.productionId)
  return {
    kind: 'success',
    message: userMessageForImportSuccess(result),
    revealArchivedInList: false,
  }
}
