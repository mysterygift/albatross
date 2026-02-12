import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Equipment } from '../types'

const TABLE = 'equipment'

function rowToEquipment(r: Record<string, unknown>): Equipment {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    source_type: (r.source_type as Equipment['source_type']) ?? 'rented',
    vendor: r.vendor as string | null,
    cost: r.cost as number | null,
    shoot_day_id: r.shoot_day_id as string | null,
    notes: r.notes as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listEquipmentByProduction(productionId: string): Promise<Equipment[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  return rows.map(rowToEquipment)
}

export async function createEquipment(data: {
  production_id: string
  name: string
  source_type?: Equipment['source_type']
  vendor?: string | null
  cost?: number | null
  shoot_day_id?: string | null
  notes?: string | null
}): Promise<Equipment> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, source_type, vendor, cost, shoot_day_id, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      data.production_id,
      data.name,
      data.source_type ?? 'rented',
      data.vendor ?? null,
      data.cost ?? null,
      data.shoot_day_id ?? null,
      data.notes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  return (await listEquipmentByProduction(data.production_id)).find((e) => e.id === id)!
}

export async function updateEquipment(
  id: string,
  data: Partial<Omit<Equipment, 'id' | 'production_id' | 'created_at' | 'updated_at' | 'deleted_at'>>
): Promise<Equipment> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['name', 'source_type', 'vendor', 'cost', 'shoot_day_id', 'notes'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToEquipment(rows[0]!) : (await listEquipmentByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToEquipment(rows[0]!)
}

export async function deleteEquipment(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
