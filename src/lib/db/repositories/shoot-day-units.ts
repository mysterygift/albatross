import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { ShootDayUnit } from '../types'

const TABLE = 'shoot_day_units'

function rowToShootDayUnit(r: Record<string, unknown>): ShootDayUnit {
  return {
    id: r.id as string,
    shoot_day_id: r.shoot_day_id as string,
    unit_id: r.unit_id as string,
    notes: r.notes as string | null,
    is_locked: (r.is_locked as number) ?? 0,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listShootDayUnitsByShootDay(shootDayId: string): Promise<ShootDayUnit[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shoot_day_id = $1 AND deleted_at IS NULL ORDER BY unit_id`,
    [shootDayId]
  )
  return rows.map(rowToShootDayUnit)
}

/** All shoot day units for a production (join via shoot_days). */
export async function listShootDayUnitsByProduction(productionId: string): Promise<ShootDayUnit[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT sdu.* FROM ${TABLE} sdu
     INNER JOIN shoot_days sd ON sd.id = sdu.shoot_day_id AND sd.deleted_at IS NULL
     WHERE sd.production_id = $1 AND sdu.deleted_at IS NULL ORDER BY sdu.shoot_day_id, sdu.unit_id`,
    [productionId]
  )
  return rows.map(rowToShootDayUnit)
}

export async function getShootDayUnitById(id: string): Promise<ShootDayUnit | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToShootDayUnit(rows[0]!) : null
}

export async function getOrCreateShootDayUnit(
  shootDayId: string,
  unitId: string
): Promise<ShootDayUnit> {
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shoot_day_id = $1 AND unit_id = $2 AND deleted_at IS NULL`,
    [shootDayId, unitId]
  )
  if (existing.length) return rowToShootDayUnit(existing[0]!)
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, shoot_day_id, unit_id, is_locked, created_at, updated_at)
     VALUES ($1, $2, $3, 0, $4, $5)`,
    [id, shootDayId, unitId, ts, ts]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ shoot_day_id: shootDayId, unit_id: unitId }))
  return (await getShootDayUnitById(id))!
}

export async function setShootDayUnitLocked(id: string, isLocked: boolean): Promise<ShootDayUnit> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET is_locked = $1, updated_at = $2 WHERE id = $3`,
    [isLocked ? 1 : 0, ts, id]
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify({ is_locked: isLocked }))
  return (await getShootDayUnitById(id))!
}
