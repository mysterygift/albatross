import {
  touchLastSynced,
  updateLinkedProjectState,
} from '@/lib/server/linkedProjectRepository'
import {
  countPendingForProduction,
  deleteServerOutboxRow,
  incrementTry,
  listPendingForProduction,
} from '@/lib/server/serverOutboxRepository'
import { resolveServerPublishContext } from '@/lib/db/projectDataSource'
import { serverRuntimeMutate } from '@/lib/server/serverClient'
import { ServerRequestError } from '@/lib/server/serverErrors'
/**
 * Sends queued server mutations for a production. Best-effort; leaves rows on failure.
 */
export async function runServerSyncOnce(productionId: string): Promise<{ processed: number; failed: number }> {
  const ctx = await resolveServerPublishContext(productionId)
  if (!ctx) return { processed: 0, failed: 0 }

  const pending = await listPendingForProduction(productionId)
  let processed = 0
  let failed = 0
  for (const row of pending) {
    try {
      const payload = row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : {}
      const op = row.operation.toLowerCase()
      const method: 'POST' | 'PATCH' | 'DELETE' =
        op === 'delete' ? 'DELETE' : op === 'create' ? 'POST' : 'PATCH'
      await serverRuntimeMutate(
        ctx.baseUrl,
        ctx.token,
        ctx.remoteProjectId,
        method,
        row.entity_table,
        method === 'POST' ? null : row.entity_id,
        payload,
        row.expected_updated_at,
      )
      await deleteServerOutboxRow(row.id)
      processed += 1
    } catch (e) {
      failed += 1
      if (e instanceof ServerRequestError && e.kind === 'conflict') {
        await updateLinkedProjectState(productionId, 'conflict', new Date().toISOString())
      } else if (e instanceof ServerRequestError && e.kind === 'network') {
        await updateLinkedProjectState(productionId, 'offline')
      }
      await incrementTry(row.id, e instanceof Error ? e.message : String(e))
    }
  }
  if (processed > 0) {
    await touchLastSynced(productionId)
    await updateLinkedProjectState(productionId, 'linked')
  }
  return { processed, failed }
}

export async function getQueuedMutationCount(productionId: string): Promise<number> {
  return countPendingForProduction(productionId)
}
