/**
 * Outbox for future sync: every create/update/delete writes here.
 * Do not implement sync now; just populate the table.
 *
 * For fewer round-trips and less lock pressure: use outboxInsert(db, ...) inside the same
 * transaction as the primary write (same BEGIN/COMMIT). outboxPush() gets its own connection
 * and is serialized by the global write queue in client.ts.
 */
import type Database from '@tauri-apps/plugin-sql'
import { getDb, now, uuid } from './client'

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
  const bind: unknown[] = []
  let i = 1
  for (const r of rows) {
    placeholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`)
    bind.push(uuid(), r.entity, r.entityId, r.operation, r.payloadJson, ts)
    i += 6
  }
  return {
    sql: `INSERT INTO outbox (id, entity, entity_id, operation, payload_json, created_at) VALUES ${placeholders.join(', ')}`,
    bind,
  }
}

/** Insert one outbox row using the given db handle. Use inside a transaction to avoid extra round-trips. */
export async function outboxInsert(
  db: Database,
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
export async function outboxInsertMany(db: Database, rows: OutboxRow[]): Promise<void> {
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
