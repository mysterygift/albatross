import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { EquipmentTerm } from '../types'

const TABLE = 'equipment_terms'

function rowToTerm(r: Record<string, unknown>): EquipmentTerm {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    type: r.type as string,
    value: r.value as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listEquipmentTermsByProductionAndType(
  productionId: string,
  type: string
): Promise<EquipmentTerm[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND type = $2 AND deleted_at IS NULL ORDER BY value`,
    [productionId, type]
  )
  return rows.map(rowToTerm)
}

/** Ensure a term exists; insert if not. Returns the term (existing or newly created). */
export async function upsertEquipmentTerm(
  productionId: string,
  type: string,
  value: string
): Promise<EquipmentTerm> {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Equipment term value cannot be empty')
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND type = $2 AND value = $3 AND deleted_at IS NULL`,
    [productionId, type, trimmed]
  )
  if (existing.length > 0) return rowToTerm(existing[0]!)
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, type, value, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, productionId, type, trimmed, ts, ts]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ production_id: productionId, type, value: trimmed, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToTerm(rows[0]!)
}
