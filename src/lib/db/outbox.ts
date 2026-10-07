/**
 * Local change log: repositories record every create/update/delete as an `outbox` row
 * (entity, entity_id, operation, payload_json).
 *
 * Nothing in the app reads or replays this table today. It is not the sync queue: the legacy linked
 * runtime queues failed server writes in `server_outbox_pending` (src/lib/server), and sync-v2 keeps its
 * own durable journal in `sync_mutation_batches` / `sync_mutations` (src/lib/server/syncV2). Writes that sync-v2 captures
 * (only createShot for collaborative productions so far) skip this table. See DOCS/collaboration.md.
 *
 * For fewer round-trips and less lock pressure: use outboxInsert(db, ...) inside the same
 * transaction as the primary write (same BEGIN/COMMIT). outboxPush() gets its own connection
 * and is serialized by the global write queue in client.ts.
 */
import { getDb, now, uuid } from './client'
import type { DatabaseAdapter } from './databaseAdapter'

export type OutboxOperation = 'create' | 'update' | 'delete'

export interface OutboxRow {
  entity: string
  entityId: string
  operation: OutboxOperation
  payloadJson: string | null
}

const OUTBOX_INSERT_SQL =
  'INSERT INTO outbox (id, entity, entity_id, operation, payload_json, created_at) VALUES ($1, $2, $3, $4, $5, $6)'

/** Returns one statement for use in executeBatch (single outbox row). */
export function outboxStatementForRow(row: OutboxRow): { sql: string; bindValues: unknown[] } {
  return {
    sql: OUTBOX_INSERT_SQL,
    bindValues: [uuid(), row.entity, row.entityId, row.operation, row.payloadJson, now()],
  }
}

/** Returns one statement for many outbox rows (multi-value INSERT) for use in executeBatch. */
export function outboxStatementForRows(rows: OutboxRow[]): { sql: string; bindValues: unknown[] } | null {
  if (rows.length === 0) return null
  const ts = now()
  const placeholders: string[] = []
  const bindValues: unknown[] = []
  let i = 1
  for (const r of rows) {
    placeholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`)
    bindValues.push(uuid(), r.entity, r.entityId, r.operation, r.payloadJson, ts)
    i += 6
  }
  return {
    sql: `INSERT INTO outbox (id, entity, entity_id, operation, payload_json, created_at) VALUES ${placeholders.join(', ')}`,
    bindValues,
  }
}

/** Insert one outbox row using the given db handle. Use inside a transaction to avoid extra round-trips. */
export async function outboxInsert(
  db: Pick<DatabaseAdapter, 'execute'>,
  entity: string,
  entityId: string,
  operation: OutboxOperation,
  payloadJson: string | null = null
): Promise<void> {
  await db.execute(OUTBOX_INSERT_SQL, [uuid(), entity, entityId, operation, payloadJson, now()])
}

/**
 * Insert many outbox rows in one statement. Use inside a transaction to avoid holding the lock
 * for many round-trips (was causing 8s+ lock waits when moving units with many strips).
 */
export async function outboxInsertMany(
  db: Pick<DatabaseAdapter, 'execute'>,
  rows: OutboxRow[]
): Promise<void> {
  if (rows.length === 0) return
  const ts = now()
  const placeholders: string[] = []
  const bind: unknown[] = []
  let i = 1
  for (const r of rows) {
    placeholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`)
    bind.push(uuid(), r.entity, r.entityId, r.operation, r.payloadJson, ts)
    i += 6
  }
  await db.execute(
    `INSERT INTO outbox (id, entity, entity_id, operation, payload_json, created_at) VALUES ${placeholders.join(', ')}`,
    bind
  )
}

export async function outboxPush(
  entity: string,
  entityId: string,
  operation: OutboxOperation,
  payloadJson: string | null = null
): Promise<void> {
  const db = await getDb()
  await outboxInsert(db, entity, entityId, operation, payloadJson)
}
