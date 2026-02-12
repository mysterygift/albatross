/**
 * Outbox for future sync: every create/update/delete writes here.
 * Do not implement sync now; just populate the table.
 */
import { getDb, now, uuid } from './client'

export type OutboxOperation = 'create' | 'update' | 'delete'

export async function outboxPush(
  entity: string,
  entityId: string,
  operation: OutboxOperation,
  payloadJson: string | null = null
): Promise<void> {
  const db = await getDb()
  await db.execute(
    'INSERT INTO outbox (id, entity, entity_id, operation, payload_json, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [uuid(), entity, entityId, operation, payloadJson, now()]
  )
}
