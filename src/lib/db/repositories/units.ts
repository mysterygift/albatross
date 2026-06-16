import { unitNameToKey } from '@/lib/schedule/unitKey'
import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Unit } from '../types'

const TABLE = 'units'

function rowToUnit(r: Record<string, unknown>): Unit {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listUnitsByProduction(productionId: string): Promise<Unit[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  return rows.map(rowToUnit)
}

export async function getUnitById(id: string): Promise<Unit | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToUnit(rows[0]!) : null
}

export async function createUnit(data: { production_id: string; name: string }): Promise<Unit> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, data.production_id, data.name, ts, ts]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  return (await getUnitById(id))!
}

export async function ensureMainUnit(productionId: string): Promise<Unit> {
  const units = await listUnitsByProduction(productionId)
  const main = units.find((u) => u.name === 'Main Unit')
  if (main) return main
  return createUnit({ production_id: productionId, name: 'Main Unit' })
}

export async function ensureSecondUnit(productionId: string): Promise<Unit> {
  const units = await listUnitsByProduction(productionId)
  const second = units.find((u) => unitNameToKey(u.name) === 'second')
  if (second) return second
  return createUnit({ production_id: productionId, name: 'Second Unit' })
}

export async function updateUnit(id: string, data: { name: string }): Promise<Unit> {
  const db = await getDb()
  const ts = now()
  await db.execute(`UPDATE ${TABLE} SET name = $1, updated_at = $2 WHERE id = $3`, [
    data.name,
    ts,
    id,
  ])
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  return (await getUnitById(id))!
}

export async function deleteUnit(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(`UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`, [
    ts,
    ts,
    id,
  ])
  await outboxPush(TABLE, id, 'delete', null)
}
