import { MAX_UNITS_PER_DAY, unitNameToRank } from '@/lib/schedule/unitKey'
import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import { coerceBoolean } from '../sqlValueCoercion'
import type { ShootDayUnit } from '../types'

const TABLE = 'shoot_day_units'

function rowToShootDayUnit(r: Record<string, unknown>): ShootDayUnit {
  return {
    id: r.id as string,
    shoot_day_id: r.shoot_day_id as string,
    unit_id: r.unit_id as string,
    notes: r.notes as string | null,
    is_locked: coerceBoolean(r.is_locked, false) ? 1 : 0,
    movement_order_json: (r.movement_order_json as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

/** Main Unit first, then Second … Fifth (unit identity is by name; see `unitKey.ts`). */
function sortRowsByUnitRank(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const rankOf = (r: Record<string, unknown>) =>
    unitNameToRank((r.unit_name as string | null) ?? '') ?? MAX_UNITS_PER_DAY + 1
  return [...rows].sort(
    (a, b) =>
      String(a.shoot_day_id).localeCompare(String(b.shoot_day_id)) ||
      rankOf(a) - rankOf(b) ||
      String(a.unit_id).localeCompare(String(b.unit_id))
  )
}

/** Live units on a shoot day, Main Unit first. */
export async function listShootDayUnitsByShootDay(shootDayId: string): Promise<ShootDayUnit[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT sdu.*, u.name AS unit_name FROM ${TABLE} sdu
     LEFT JOIN units u ON u.id = sdu.unit_id
     WHERE sdu.shoot_day_id = $1 AND sdu.deleted_at IS NULL`,
    [shootDayId]
  )
  return sortRowsByUnitRank(rows).map(rowToShootDayUnit)
}

/** All shoot day units for a production (join via shoot_days), grouped by day with Main Unit first. */
export async function listShootDayUnitsByProduction(productionId: string): Promise<ShootDayUnit[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT sdu.*, u.name AS unit_name FROM ${TABLE} sdu
     INNER JOIN shoot_days sd ON sd.id = sdu.shoot_day_id AND sd.deleted_at IS NULL
     LEFT JOIN units u ON u.id = sdu.unit_id
     WHERE sd.production_id = $1 AND sdu.deleted_at IS NULL`,
    [productionId]
  )
  return sortRowsByUnitRank(rows).map(rowToShootDayUnit)
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
  // UNIQUE(shoot_day_id, unit_id) also covers soft-deleted rows, so a unit removed from this day
  // earlier would block adding it again. Its removal is already recorded; drop the tombstone.
  await db.execute(
    `DELETE FROM ${TABLE} WHERE shoot_day_id = $1 AND unit_id = $2 AND deleted_at IS NOT NULL`,
    [shootDayId, unitId]
  )
  await db.execute(
    `INSERT INTO ${TABLE} (id, shoot_day_id, unit_id, is_locked, created_at, updated_at)
     VALUES ($1, $2, $3, FALSE, $4, $5)`,
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
    [isLocked, ts, id]
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify({ is_locked: isLocked }))
  return (await getShootDayUnitById(id))!
}

export async function setShootDayUnitMovementOrderJson(
  id: string,
  movementOrderJson: string | null
): Promise<ShootDayUnit> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET movement_order_json = $1, updated_at = $2 WHERE id = $3`,
    [movementOrderJson, ts, id]
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify({ movement_order_json: movementOrderJson }))
  return (await getShootDayUnitById(id))!
}
