import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from './client'
import { episodeInsertStatement, episodeOutboxCreate } from './repositories/episodes'
import { getProductionById } from './repositories/production'
import { outboxStatementForRow } from './outbox'
import type { Production } from './types'

const PRODUCTIONS = 'productions'

export type EnableEpisodicProductionParams = {
  productionId: string
  initialEpisodeName: string
}

/**
 * One-way: enables episodic mode and creates the first episode in a single transaction.
 * No-op if already episodic. Throws if production missing or episode name empty.
 */
export async function enableEpisodicProduction(params: EnableEpisodicProductionParams): Promise<Production> {
  const name = params.initialEpisodeName.trim()
  if (!name) {
    throw new Error('Episodic mode requires at least one episode name')
  }

  const prod = await getProductionById(params.productionId)
  if (!prod) throw new Error('Production not found')

  if (prod.is_episodic) {
    return prod
  }

  const ts = now()
  const episodeId = uuid()

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const epStmt = episodeInsertStatement({
      id: episodeId,
      production_id: params.productionId,
      name,
      sort_order: 0,
      ts,
    })
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      epStmt,
      {
        sql: `UPDATE ${PRODUCTIONS} SET is_episodic = 1, updated_at = $1 WHERE id = $2`,
        bindValues: [ts, params.productionId],
      },
      episodeOutboxCreate(episodeId, {
        id: episodeId,
        production_id: params.productionId,
        name,
        sort_order: 0,
        created_at: ts,
        updated_at: ts,
      }),
      outboxStatementForRow({
        entity: PRODUCTIONS,
        entityId: params.productionId,
        operation: 'update',
        payloadJson: JSON.stringify({ is_episodic: 1, updated_at: ts }),
      }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })

  return (await getProductionById(params.productionId))!
}

/** Alias aligned with product naming; same behavior as {@link enableEpisodicProduction}. */
export const enableProductionEpisodes = enableEpisodicProduction
