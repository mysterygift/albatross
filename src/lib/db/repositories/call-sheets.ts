import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { CallSheetRecord } from '../types'

const TABLE = 'call_sheets'

function rowToCallSheet(r: Record<string, unknown>): CallSheetRecord {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shoot_day_id: r.shoot_day_id as string,
    shoot_day_unit_id: r.shoot_day_unit_id as string | null,
    overrides_json: r.overrides_json as string | null,
    generated_document_id: r.generated_document_id as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function getCallSheetByShootDayAndUnit(
  shootDayId: string,
  shootDayUnitId: string | null
): Promise<CallSheetRecord | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shoot_day_id = $1 AND (($2 IS NULL AND shoot_day_unit_id IS NULL) OR shoot_day_unit_id = $2) AND deleted_at IS NULL LIMIT 1`,
    [shootDayId, shootDayUnitId]
  )
  return rows.length ? rowToCallSheet(rows[0]!) : null
}

export async function upsertCallSheet(data: {
  production_id: string
  shoot_day_id: string
  shoot_day_unit_id?: string | null
  overrides_json?: string | null
  generated_document_id?: string | null
}): Promise<CallSheetRecord> {
  const db = await getDb()
  const existing = await getCallSheetByShootDayAndUnit(
    data.shoot_day_id,
    data.shoot_day_unit_id ?? null
  )
  const ts = now()
  if (existing) {
    await db.execute(
      `UPDATE ${TABLE} SET overrides_json = $1, generated_document_id = $2, updated_at = $3 WHERE id = $4`,
      [
        data.overrides_json ?? existing.overrides_json,
        data.generated_document_id ?? existing.generated_document_id,
        ts,
        existing.id,
      ]
    )
    await outboxPush(TABLE, existing.id, 'update', JSON.stringify(data))
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [
      existing.id,
    ])
    return rowToCallSheet(rows[0]!)
  }
  const id = uuid()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, shoot_day_id, shoot_day_unit_id, overrides_json, generated_document_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      data.production_id,
      data.shoot_day_id,
      data.shoot_day_unit_id ?? null,
      data.overrides_json ?? null,
      data.generated_document_id ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [
    id,
  ])
  return rowToCallSheet(rows[0]!)
}
