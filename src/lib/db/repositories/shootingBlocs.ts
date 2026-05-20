import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import {
  addCalendarDaysToIso,
  classifyShootingBlocRangeMutation,
  reassignShootDaysAfterShootingBlocRangeChange,
} from '../shootingBlocAssociation'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type { ShootingBloc } from '../types'
import { setShootDayDatesForBlocShiftBatch } from './schedule'
import { deleteShootDayAndDiscardStrips } from './stripboard-strips'

const TABLE = 'shooting_blocs'
const SHOOT_DAYS_TABLE = 'shoot_days'

/** Default name for the shooting bloc created when episodic mode is enabled. */
export const DEFAULT_EPISODIC_SHOOTING_BLOC_NAME = 'Block A'

const DEFAULT_EPISODIC_BLOC_SPAN_DAYS = 90

/** UTC today through today + 89 days (90 inclusive days). */
export function defaultEpisodicShootingBlocDateRange(): { start_date: string; end_date: string } {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const start_date = `${y}-${m}-${day}`
  const end_date = addCalendarDaysToIso(start_date, DEFAULT_EPISODIC_BLOC_SPAN_DAYS - 1)
  return { start_date, end_date }
}

export function shootingBlocInsertStatement(params: {
  id: string
  production_id: string
  name: string
  start_date: string
  end_date: string
  ts: string
}): { sql: string; bindValues: unknown[] } {
  return {
    sql: `INSERT INTO ${TABLE} (id, production_id, name, start_date, end_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    bindValues: [
      params.id,
      params.production_id,
      params.name,
      params.start_date,
      params.end_date,
      params.ts,
      params.ts,
    ],
  }
}

export function shootingBlocOutboxCreate(blocId: string, payload: Record<string, unknown>) {
  return outboxStatementForRow({
    entity: TABLE,
    entityId: blocId,
    operation: 'create',
    payloadJson: JSON.stringify(payload),
  })
}

export async function listBlocTaggedShootDays(
  productionId: string,
  blocId: string
): Promise<{ id: string; shoot_date: string }[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `
    SELECT id, shoot_date FROM ${SHOOT_DAYS_TABLE}
    WHERE production_id = $1 AND shooting_bloc_id = $2 AND deleted_at IS NULL
    ORDER BY shoot_date ASC, id ASC
    `,
    [productionId, blocId]
  )
  return rows.map((r) => ({ id: r.id as string, shoot_date: r.shoot_date as string }))
}

async function applyShootingBlocRangeChangeMutations(
  productionId: string,
  blocId: string,
  oldStart: string,
  oldEnd: string,
  newStart: string,
  newEnd: string
): Promise<void> {
  const mutation = classifyShootingBlocRangeMutation(oldStart, oldEnd, newStart, newEnd)
  if (mutation.kind === 'none' || mutation.kind === 'expand') return

  if (mutation.kind === 'shift') {
    const rows = await listBlocTaggedShootDays(productionId, blocId)
    if (rows.length === 0) return
    const delta = mutation.deltaDays
    const movingIds = new Set(rows.map((r) => r.id))
    const db = await getDb()
    for (const r of rows) {
      const target = addCalendarDaysToIso(r.shoot_date, delta)
      const existing = await db.select<Record<string, unknown>[]>(
        `SELECT id FROM ${SHOOT_DAYS_TABLE} WHERE production_id = $1 AND shoot_date = $2 AND deleted_at IS NULL`,
        [productionId, target]
      )
      if (existing.length > 0 && !movingIds.has(existing[0]!.id as string)) {
        throw new Error(
          `Cannot shift shooting bloc: another shoot day already exists on ${target}. Move or remove it first.`
        )
      }
    }
    const sorted = [...rows].sort((a, b) =>
      delta > 0 ? b.shoot_date.localeCompare(a.shoot_date) : a.shoot_date.localeCompare(b.shoot_date)
    )
    const orderedUpdates = sorted.map((r) => ({
      shootDayId: r.id,
      newDate: addCalendarDaysToIso(r.shoot_date, delta),
    }))
    await setShootDayDatesForBlocShiftBatch(productionId, orderedUpdates)
    return
  }

  const rows = await listBlocTaggedShootDays(productionId, blocId)
  for (const r of rows) {
    if (r.shoot_date < newStart || r.shoot_date > newEnd) {
      await deleteShootDayAndDiscardStrips(r.id)
    }
  }
}

/**
 * Inclusive overlap on ISO YYYY-MM-DD strings (lexicographic order matches calendar order).
 * Two ranges overlap iff they share at least one calendar day.
 * Adjacent ranges do not overlap: e.g. [2025-01-01, 2025-01-10] and [2025-01-11, 2025-01-15] are valid.
 */
export function shootingBlocRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA <= endB && endA >= startB
}

function rowToBloc(r: Record<string, unknown>): ShootingBloc {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    start_date: r.start_date as string,
    end_date: r.end_date as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listShootingBlocsByProduction(productionId: string): Promise<ShootingBloc[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY start_date ASC, id ASC`,
    [productionId]
  )
  return rows.map(rowToBloc)
}

async function assertNoOverlapWithOthers(
  productionId: string,
  startDate: string,
  endDate: string,
  excludeBlocId: string | null
): Promise<void> {
  if (startDate > endDate) {
    throw new Error('Shooting bloc start_date must be before or equal to end_date')
  }
  const others = await listShootingBlocsByProduction(productionId)
  for (const o of others) {
    if (excludeBlocId != null && o.id === excludeBlocId) continue
    if (shootingBlocRangesOverlap(startDate, endDate, o.start_date, o.end_date)) {
      throw new Error('Shooting bloc date range overlaps an existing bloc in this production')
    }
  }
}

export type InsertShootingBlocInput = {
  production_id: string
  name: string
  start_date: string
  end_date: string
}

export async function createShootingBloc(data: InsertShootingBlocInput): Promise<ShootingBloc> {
  await assertNoOverlapWithOthers(data.production_id, data.start_date, data.end_date, null)
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, start_date, end_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, data.production_id, data.name, data.start_date, data.end_date, ts, ts]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id, created_at: ts, updated_at: ts }))
  return (await getShootingBlocById(id))!
}

export async function getShootingBlocById(id: string): Promise<ShootingBloc | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToBloc(rows[0]!) : null
}

export async function updateShootingBloc(
  id: string,
  data: Partial<Pick<ShootingBloc, 'name' | 'start_date' | 'end_date'>>
): Promise<ShootingBloc> {
  const existing = await getShootingBlocById(id)
  if (!existing) throw new Error('Shooting bloc not found')

  const name = data.name ?? existing.name
  const start_date = data.start_date ?? existing.start_date
  const end_date = data.end_date ?? existing.end_date

  await assertNoOverlapWithOthers(existing.production_id, start_date, end_date, id)

  const rangeChanged = start_date !== existing.start_date || end_date !== existing.end_date
  if (rangeChanged) {
    await applyShootingBlocRangeChangeMutations(
      existing.production_id,
      id,
      existing.start_date,
      existing.end_date,
      start_date,
      end_date
    )
  }

  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET name = $1, start_date = $2, end_date = $3, updated_at = $4 WHERE id = $5`,
    [name, start_date, end_date, ts, id]
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify({ name, start_date, end_date }))
  if (rangeChanged) {
    await reassignShootDaysAfterShootingBlocRangeChange({
      productionId: existing.production_id,
      blocId: id,
      oldStart: existing.start_date,
      oldEnd: existing.end_date,
      newStart: start_date,
      newEnd: end_date,
    })
  }
  return (await getShootingBlocById(id))!
}

/**
 * Soft-deletes a shooting bloc and merges its shoot days into the prior calendar bloc.
 * Throws if the bloc is the first (earliest start_date) in the production.
 */
export async function deleteShootingBloc(blocId: string): Promise<void> {
  const existing = await getShootingBlocById(blocId)
  if (!existing) throw new Error('Shooting bloc not found')

  const blocs = await listShootingBlocsByProduction(existing.production_id)
  const index = blocs.findIndex((b) => b.id === blocId)
  if (index < 0) throw new Error('Shooting bloc not found')
  if (index === 0) {
    throw new Error('Cannot delete the first shooting bloc')
  }

  const previous = blocs[index - 1]!
  const willExtendPrevious = existing.end_date > previous.end_date
  const tagged = await listBlocTaggedShootDays(existing.production_id, blocId)
  const ts = now()

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN', bindValues: [] }]

    for (const row of tagged) {
      statements.push({
        sql: `UPDATE ${SHOOT_DAYS_TABLE} SET shooting_bloc_id = $1, updated_at = $2 WHERE id = $3`,
        bindValues: [previous.id, ts, row.id],
      })
      statements.push(
        outboxStatementForRow({
          entity: SHOOT_DAYS_TABLE,
          entityId: row.id,
          operation: 'update',
          payloadJson: JSON.stringify({ shooting_bloc_id: previous.id }),
        })
      )
    }

    statements.push({
      sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [ts, ts, blocId],
    })
    statements.push(
      outboxStatementForRow({
        entity: TABLE,
        entityId: blocId,
        operation: 'delete',
        payloadJson: null,
      })
    )
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })

  let previousAfterExtend = (await getShootingBlocById(previous.id))!
  if (willExtendPrevious) {
    previousAfterExtend = await updateShootingBloc(previous.id, { end_date: existing.end_date })
  }

  await reassignShootDaysAfterShootingBlocRangeChange({
    productionId: existing.production_id,
    blocId,
    oldStart: existing.start_date,
    oldEnd: existing.end_date,
    newStart: previousAfterExtend.start_date,
    newEnd: previousAfterExtend.end_date,
  })
}
