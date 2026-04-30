import { getDb, now, uuid } from '@/lib/db/client'

const TABLE = 'server_outbox_pending'

export async function enqueueServerOutbox(input: {
  production_id: string
  entity_table: string
  entity_id: string
  operation: string
  payload_json: string | null
  expected_updated_at: string | null
}): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, entity_table, entity_id, operation, payload_json, expected_updated_at, created_at, tries, last_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, NULL)`,
    [uuid(), input.production_id, input.entity_table, input.entity_id, input.operation, input.payload_json, input.expected_updated_at, now()],
  )
}

export async function listPendingForProduction(productionId: string): Promise<
  Array<{
    id: string
    production_id: string
    entity_table: string
    entity_id: string
    operation: string
    payload_json: string | null
    expected_updated_at: string | null
    tries: number
  }>
> {
  const db = await getDb()
  return db.select(`SELECT * FROM ${TABLE} WHERE production_id = $1 ORDER BY created_at ASC`, [productionId])
}

export async function countPendingForProduction(productionId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<Array<{ c: number }>>(`SELECT COUNT(*) AS c FROM ${TABLE} WHERE production_id = $1`, [
    productionId,
  ])
  return Number(rows[0]?.c ?? 0)
}

export async function deleteServerOutboxRow(id: string): Promise<void> {
  const db = await getDb()
  await db.execute(`DELETE FROM ${TABLE} WHERE id = $1`, [id])
}

export async function incrementTry(id: string, lastError: string): Promise<void> {
  const db = await getDb()
  await db.execute(`UPDATE ${TABLE} SET tries = tries + 1, last_error = $1 WHERE id = $2`, [lastError, id])
}
