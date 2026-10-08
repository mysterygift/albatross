/**
 * Units on shoot days: Main Unit, Second Unit … Fifth Unit.
 *
 * A shoot day unit's rank is the unit it points at (`shoot_day_units.unit_id`), and its day is
 * `shoot_day_id`. Moving a unit to another day or changing its rank is an UPDATE of that one row,
 * so everything keyed on the shoot day unit (strips, call sheets, movement order times, risk
 * assessment links) follows it. Every operation leaves each day it touches with contiguous ranks
 * starting at Main Unit, and re-mirrors the Main Unit's CALL/WRAP into `shoot_days`.
 */
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRow, outboxStatementForRows, type OutboxRow } from '../outbox'
import {
  findShootingBlocIdForProductionDate,
  persistShootDayShootingBlocId,
} from '../shootingBlocAssociation'
import {
  MAX_UNITS_PER_DAY,
  UNIT_RANKS,
  unitNameToRank,
  unitRankToName,
  type UnitRank,
} from '@/lib/schedule/unitKey'
import {
  ensureCallWrapStripsForProduction,
  getShootDayById,
  moveShootDayToDate,
  resequenceShootDays,
} from './schedule'
import { getOrCreateShootDayUnit, getShootDayUnitById } from './shoot-day-units'
import {
  CONTENT_STRIP_TYPES,
  deleteShootDayAndDiscardStrips,
  listStripsForDayUnit,
  moveStripToUnscheduled,
  resyncShootDayCallWrapFromMainUnit,
  softDeleteStripForDayRemoval,
} from './stripboard-strips'
import { ensureUnitForRank } from './units'

type Stmt = { sql: string; bindValues: unknown[] }

type LiveDayUnit = {
  id: string
  shoot_day_id: string
  unit_id: string
  unit_name: string
}

/** A shoot day unit's wanted day and rank. */
type Placement = {
  shootDayUnitId: string
  fromShootDayId: string
  fromUnitId: string
  toShootDayId: string
  toRank: UnitRank
}

function rankOrder(name: string): number {
  return unitNameToRank(name) ?? MAX_UNITS_PER_DAY + 1
}

/** Live units on a day in display order (Main Unit first). */
async function listLiveDayUnits(shootDayId: string): Promise<LiveDayUnit[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT sdu.id, sdu.shoot_day_id, sdu.unit_id, u.name AS unit_name
     FROM shoot_day_units sdu
     INNER JOIN units u ON u.id = sdu.unit_id
     WHERE sdu.shoot_day_id = $1 AND sdu.deleted_at IS NULL`,
    [shootDayId]
  )
  return rows
    .map((r) => ({
      id: r.id as string,
      shoot_day_id: r.shoot_day_id as string,
      unit_id: r.unit_id as string,
      unit_name: (r.unit_name as string | null) ?? '',
    }))
    .sort(
      (a, b) =>
        rankOrder(a.unit_name) - rankOrder(b.unit_name) || a.unit_name.localeCompare(b.unit_name)
    )
}

async function findLiveShootDayIdOnDate(productionId: string, shootDate: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM shoot_days WHERE production_id = $1 AND shoot_date = $2 AND deleted_at IS NULL`,
    [productionId, shootDate]
  )
  return rows.length ? (rows[0]!.id as string) : null
}

/** Placements that give `ordered` contiguous ranks on `toShootDayId`, in list order. */
function placementsInOrder(ordered: LiveDayUnit[], toShootDayId: string): Placement[] {
  return ordered.map((du, index) => ({
    shootDayUnitId: du.id,
    fromShootDayId: du.shoot_day_id,
    fromUnitId: du.unit_id,
    toShootDayId,
    toRank: UNIT_RANKS[index]!,
  }))
}

async function ensureUnitIdsByRank(productionId: string, placements: Placement[]): Promise<Map<UnitRank, string>> {
  const ranks = [...new Set(placements.map((p) => p.toRank))].sort()
  const byRank = new Map<UnitRank, string>()
  for (const rank of ranks) {
    byRank.set(rank, (await ensureUnitForRank(productionId, rank)).id)
  }
  return byRank
}

/**
 * Statements that apply placements. Changed rows are first parked on throwaway units created and
 * removed inside the same transaction, because `UNIQUE(shoot_day_id, unit_id)` is checked row by
 * row: swapping Main and Second directly would collide halfway through. Soft-deleted rows still
 * holding a target slot are purged for the same reason.
 */
async function buildPlacementStatements(
  productionId: string,
  placements: Placement[],
  unitIdByRank: Map<UnitRank, string>,
  ts: string
): Promise<Stmt[]> {
  const changed = placements.filter(
    (p) => p.fromShootDayId !== p.toShootDayId || p.fromUnitId !== unitIdByRank.get(p.toRank)
  )
  if (changed.length === 0) return []

  const db = await getDb()
  const statements: Stmt[] = []
  const outbox: OutboxRow[] = []

  for (const p of changed) {
    statements.push({
      sql: `DELETE FROM shoot_day_units WHERE shoot_day_id = $1 AND unit_id = $2 AND deleted_at IS NOT NULL`,
      bindValues: [p.toShootDayId, unitIdByRank.get(p.toRank)],
    })
  }

  const parkingUnitIds = changed.map(() => uuid())
  for (const parkingUnitId of parkingUnitIds) {
    statements.push({
      sql: `INSERT INTO units (id, production_id, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
      bindValues: [parkingUnitId, productionId, `__unit_move_${parkingUnitId}`, ts, ts],
    })
  }
  changed.forEach((p, i) => {
    statements.push({
      sql: `UPDATE shoot_day_units SET unit_id = $1 WHERE id = $2`,
      bindValues: [parkingUnitIds[i], p.shootDayUnitId],
    })
  })
  for (const p of changed) {
    const unitId = unitIdByRank.get(p.toRank)!
    statements.push({
      sql: `UPDATE shoot_day_units SET shoot_day_id = $1, unit_id = $2, updated_at = $3 WHERE id = $4`,
      bindValues: [p.toShootDayId, unitId, ts, p.shootDayUnitId],
    })
    outbox.push({
      entity: 'shoot_day_units',
      entityId: p.shootDayUnitId,
      operation: 'update',
      payloadJson: JSON.stringify({ shoot_day_id: p.toShootDayId, unit_id: unitId }),
    })
  }
  for (const parkingUnitId of parkingUnitIds) {
    statements.push({ sql: `DELETE FROM units WHERE id = $1`, bindValues: [parkingUnitId] })
  }

  // Rows that change day take their strips and call sheets along; risk assessment links to the
  // old day's RAMS no longer apply.
  for (const p of changed.filter((c) => c.fromShootDayId !== c.toShootDayId)) {
    const stripRows = await db.select<Record<string, unknown>[]>(
      `SELECT id FROM stripboard_strips WHERE shoot_day_unit_id = $1 AND deleted_at IS NULL`,
      [p.shootDayUnitId]
    )
    if (stripRows.length > 0) {
      statements.push({
        sql: `UPDATE stripboard_strips SET shoot_day_id = $1, updated_at = $2 WHERE shoot_day_unit_id = $3 AND deleted_at IS NULL`,
        bindValues: [p.toShootDayId, ts, p.shootDayUnitId],
      })
      for (const r of stripRows) {
        outbox.push({
          entity: 'stripboard_strips',
          entityId: r.id as string,
          operation: 'update',
          payloadJson: JSON.stringify({ shoot_day_id: p.toShootDayId }),
        })
      }
    }

    const callSheetRows = await db.select<Record<string, unknown>[]>(
      `SELECT id FROM call_sheets WHERE shoot_day_unit_id = $1 AND deleted_at IS NULL`,
      [p.shootDayUnitId]
    )
    if (callSheetRows.length > 0) {
      statements.push({
        sql: `UPDATE call_sheets SET shoot_day_id = $1, updated_at = $2 WHERE shoot_day_unit_id = $3 AND deleted_at IS NULL`,
        bindValues: [p.toShootDayId, ts, p.shootDayUnitId],
      })
      for (const r of callSheetRows) {
        outbox.push({
          entity: 'call_sheets',
          entityId: r.id as string,
          operation: 'update',
          payloadJson: JSON.stringify({ shoot_day_id: p.toShootDayId }),
        })
      }
    }

    const ramsLinkRows = await db.select<Record<string, unknown>[]>(
      `SELECT rau.id FROM risk_assessment_units rau
       INNER JOIN risk_assessments ra ON ra.id = rau.risk_assessment_id
       WHERE rau.shoot_day_unit_id = $1 AND rau.deleted_at IS NULL AND ra.shoot_day_id <> $2`,
      [p.shootDayUnitId, p.toShootDayId]
    )
    for (const r of ramsLinkRows) {
      statements.push({
        sql: `UPDATE risk_assessment_units SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
        bindValues: [ts, ts, r.id as string],
      })
      outbox.push({
        entity: 'risk_assessment_units',
        entityId: r.id as string,
        operation: 'delete',
        payloadJson: null,
      })
    }
  }

  const outboxStatement = outboxStatementForRows(outbox)
  if (outboxStatement) statements.push(outboxStatement)
  return statements
}

async function runStatements(statements: Stmt[]): Promise<void> {
  if (statements.length === 0) return
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      ...statements,
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}

export type MoveShootDayUnitResult =
  | { status: 'unchanged' }
  | { status: 'moved'; shootDayId: string; unitName: string; movedWholeDay: boolean }
  /** The unit is the only one on its day and the target date has a shoot day: the caller must choose. */
  | { status: 'needs_source_decision'; sourceShootDayId: string; targetShootDayId: string }

/** What to do with a shoot day whose only unit moves onto another shoot day. */
export type EmptiedSourceDayAction = 'delete' | 'keep'

/**
 * Move one shoot day unit (with its strips) to another date.
 *
 * - Target date has a shoot day: the unit joins it at the next free rank (a Main Unit landing on a
 *   day that has one becomes the Second Unit, and so on). Throws `TARGET_DAY_FULL` at five units.
 * - Target date is empty: a new shoot day is created there with this unit as its Main Unit. When the
 *   unit is the only one on its day, the whole shoot day moves instead (`moveShootDayToDate`).
 * - The units left behind close the gap (Second becomes Main when Main leaves).
 * - When the unit is its day's only unit and the target has a shoot day, `emptiedSourceDay` decides
 *   whether the old day is deleted or kept with a fresh, empty Main Unit; without it the result is
 *   `needs_source_decision` and nothing changes.
 */
export async function moveShootDayUnitToDate(args: {
  shootDayUnitId: string
  targetDate: string
  emptiedSourceDay?: EmptiedSourceDayAction
}): Promise<MoveShootDayUnitResult> {
  const shootDayUnit = await getShootDayUnitById(args.shootDayUnitId)
  if (!shootDayUnit) throw new Error('SHOOT_DAY_UNIT_NOT_FOUND')
  const sourceDay = await getShootDayById(shootDayUnit.shoot_day_id)
  if (!sourceDay) throw new Error('SHOOT_DAY_NOT_FOUND')
  if (sourceDay.shoot_date === args.targetDate) return { status: 'unchanged' }

  const productionId = sourceDay.production_id
  const sourceUnits = await listLiveDayUnits(sourceDay.id)
  const moving = sourceUnits.find((du) => du.id === shootDayUnit.id)
  if (!moving) throw new Error('SHOOT_DAY_UNIT_NOT_FOUND')
  const remaining = sourceUnits.filter((du) => du.id !== moving.id)
  const targetShootDayId = await findLiveShootDayIdOnDate(productionId, args.targetDate)

  if (!targetShootDayId && remaining.length === 0) {
    const result = await moveShootDayToDate(sourceDay.id, args.targetDate)
    if (!result.success) throw new Error('MOVE_FAILED')
    return { status: 'moved', shootDayId: sourceDay.id, unitName: moving.unit_name, movedWholeDay: true }
  }

  const targetUnits = targetShootDayId ? await listLiveDayUnits(targetShootDayId) : []
  if (targetUnits.length >= MAX_UNITS_PER_DAY) throw new Error('TARGET_DAY_FULL')
  if (targetShootDayId && remaining.length === 0 && !args.emptiedSourceDay) {
    return { status: 'needs_source_decision', sourceShootDayId: sourceDay.id, targetShootDayId }
  }

  const ts = now()
  const statements: Stmt[] = []
  const toShootDayId = targetShootDayId ?? uuid()
  if (!targetShootDayId) {
    const shootingBlocId = await findShootingBlocIdForProductionDate(productionId, args.targetDate)
    statements.push(
      {
        sql: `INSERT INTO shoot_days (id, production_id, shoot_date, day_number, created_at, updated_at, shooting_bloc_id)
              VALUES ($1, $2, $3, NULL, $4, $5, $6)`,
        bindValues: [toShootDayId, productionId, args.targetDate, ts, ts, shootingBlocId],
      },
      outboxStatementForRow({
        entity: 'shoot_days',
        entityId: toShootDayId,
        operation: 'create',
        payloadJson: JSON.stringify({
          id: toShootDayId,
          production_id: productionId,
          shoot_date: args.targetDate,
          day_number: null,
          shooting_bloc_id: shootingBlocId,
        }),
      })
    )
  }

  const placements = [
    ...placementsInOrder([...targetUnits, moving], toShootDayId),
    ...placementsInOrder(remaining, sourceDay.id),
  ]
  const unitIdByRank = await ensureUnitIdsByRank(productionId, placements)
  statements.push(...(await buildPlacementStatements(productionId, placements, unitIdByRank, ts)))
  await runStatements(statements)

  const newRank = UNIT_RANKS[targetUnits.length]!
  if (!targetShootDayId) {
    await resequenceShootDays(productionId)
    await persistShootDayShootingBlocId(toShootDayId, productionId, args.targetDate)
  }
  await resyncShootDayCallWrapFromMainUnit(toShootDayId)

  if (remaining.length > 0) {
    await resyncShootDayCallWrapFromMainUnit(sourceDay.id)
  } else if (args.emptiedSourceDay === 'delete') {
    await deleteShootDayAndDiscardStrips(sourceDay.id)
  } else {
    const mainUnit = await ensureUnitForRank(productionId, 1)
    await getOrCreateShootDayUnit(sourceDay.id, mainUnit.id)
    await ensureCallWrapStripsForProduction(productionId)
    await resyncShootDayCallWrapFromMainUnit(sourceDay.id)
  }

  return { status: 'moved', shootDayId: toShootDayId, unitName: unitRankToName(newRank), movedWholeDay: false }
}

/**
 * Re-rank a day's units: `orderedShootDayUnitIds[0]` becomes Main Unit, the next Second Unit, and so
 * on. The list must hold every live unit on the day exactly once.
 */
export async function reorderShootDayUnits(shootDayId: string, orderedShootDayUnitIds: string[]): Promise<void> {
  const day = await getShootDayById(shootDayId)
  if (!day) throw new Error('SHOOT_DAY_NOT_FOUND')
  const live = await listLiveDayUnits(shootDayId)
  const byId = new Map(live.map((du) => [du.id, du]))
  const ordered = orderedShootDayUnitIds.map((id) => byId.get(id))
  if (
    ordered.length !== live.length ||
    new Set(orderedShootDayUnitIds).size !== live.length ||
    ordered.some((du) => !du)
  ) {
    throw new Error('UNIT_ORDER_MISMATCH')
  }
  if (live.length > MAX_UNITS_PER_DAY) throw new Error('TOO_MANY_UNITS')

  const placements = placementsInOrder(ordered as LiveDayUnit[], shootDayId)
  const unitIdByRank = await ensureUnitIdsByRank(day.production_id, placements)
  await runStatements(await buildPlacementStatements(day.production_id, placements, unitIdByRank, now()))
  await resyncShootDayCallWrapFromMainUnit(shootDayId)
}

/** Swap the ranks of two units on the same day (e.g. make the Second Unit the Main Unit). */
export async function swapShootDayUnitRanks(shootDayUnitIdA: string, shootDayUnitIdB: string): Promise<void> {
  if (shootDayUnitIdA === shootDayUnitIdB) return
  const a = await getShootDayUnitById(shootDayUnitIdA)
  const b = await getShootDayUnitById(shootDayUnitIdB)
  if (!a || !b) throw new Error('SHOOT_DAY_UNIT_NOT_FOUND')
  if (a.shoot_day_id !== b.shoot_day_id) throw new Error('UNITS_ON_DIFFERENT_DAYS')
  const order = (await listLiveDayUnits(a.shoot_day_id)).map((du) => du.id)
  const indexA = order.indexOf(a.id)
  const indexB = order.indexOf(b.id)
  order[indexA] = b.id
  order[indexB] = a.id
  await reorderShootDayUnits(a.shoot_day_id, order)
}

/**
 * Add the next unit (Second … Fifth) to each given shoot day. Days that already run five units are
 * skipped. Seeds CALL + WRAP strips for the new unit columns.
 */
export async function addUnitToShootDays(args: {
  productionId: string
  shootDayIds: string[]
}): Promise<{ linkedShootDayUnitIds: string[]; skippedFullShootDayIds: string[] }> {
  const { productionId, shootDayIds } = args
  if (!productionId) throw new Error('productionId is required')
  if (shootDayIds.length === 0) throw new Error('shootDayIds is required')

  const uniqueShootDayIds = [...new Set(shootDayIds)]
  for (const shootDayId of uniqueShootDayIds) {
    const shootDay = await getShootDayById(shootDayId)
    if (!shootDay || shootDay.production_id !== productionId) {
      throw new Error('INVALID_SHOOT_DAY')
    }
  }

  const linkedShootDayUnitIds: string[] = []
  const skippedFullShootDayIds: string[] = []
  for (const shootDayId of uniqueShootDayIds) {
    const live = await listLiveDayUnits(shootDayId)
    const usedRanks = new Set(live.map((du) => unitNameToRank(du.unit_name)))
    const freeRank = live.length < MAX_UNITS_PER_DAY ? UNIT_RANKS.find((rank) => !usedRanks.has(rank)) : undefined
    if (!freeRank) {
      skippedFullShootDayIds.push(shootDayId)
      continue
    }
    const unit = await ensureUnitForRank(productionId, freeRank)
    const shootDayUnit = await getOrCreateShootDayUnit(shootDayId, unit.id)
    linkedShootDayUnitIds.push(shootDayUnit.id)
  }

  await ensureCallWrapStripsForProduction(productionId)
  return { linkedShootDayUnitIds, skippedFullShootDayIds }
}

/**
 * Remove a unit other than Main Unit from its shoot day. Its scheduled SHOT/SCENE strips move to
 * Unscheduled and its structural strips are soft-deleted; the units after it move up a rank.
 */
export async function removeUnitFromShootDay(shootDayUnitId: string): Promise<void> {
  const shootDayUnit = await getShootDayUnitById(shootDayUnitId)
  if (!shootDayUnit) throw new Error('SHOOT_DAY_UNIT_NOT_FOUND')
  const live = await listLiveDayUnits(shootDayUnit.shoot_day_id)
  if (live[0]?.id === shootDayUnitId) throw new Error('CANNOT_REMOVE_MAIN_UNIT')

  const strips = await listStripsForDayUnit(shootDayUnit.shoot_day_id, shootDayUnitId)
  for (const strip of strips) {
    if (strip.strip_status === 'SCHEDULED' && CONTENT_STRIP_TYPES.includes(strip.strip_type)) {
      await moveStripToUnscheduled(strip.id)
    } else {
      await softDeleteStripForDayRemoval(strip.id)
    }
  }

  const db = await getDb()
  const ts = now()
  await db.execute(`UPDATE shoot_day_units SET deleted_at = $1, updated_at = $2 WHERE id = $3`, [
    ts,
    ts,
    shootDayUnitId,
  ])
  await outboxPush('shoot_day_units', shootDayUnitId, 'delete', null)

  const rest = live.filter((du) => du.id !== shootDayUnitId).map((du) => du.id)
  await reorderShootDayUnits(shootDayUnit.shoot_day_id, rest)
}
