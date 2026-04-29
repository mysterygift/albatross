import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { OptimisticConcurrencyConflictError } from '../concurrency'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type { Scene, Shot, StripboardStrip, StripStatus, StripType } from '../types'
import { listScenesByProduction, listShootDaysByProduction, listShotsByProduction } from './schedule'
import { normalizeScheduleTimeInput } from '@/lib/schedule/time'

const TABLE = 'stripboard_strips'
export const SORT_GAP = 1000
const CALL_WRAP_TYPES: ReadonlyArray<StripType> = ['CALL', 'WRAP']

// Strip state transitions: SCHEDULED ↔ UNSCHEDULED ↔ BONEYARD. No hard deletes;
// use moveStripToUnscheduled / moveStripToBoneyard (UPDATE strip_status). TanStack
// Query invalidates: stripboard, unscheduled-scenes, boneyard-strips.

function rowToStrip(r: Record<string, unknown>): StripboardStrip {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shoot_day_id: (r.shoot_day_id as string | null) ?? null,
    shoot_day_unit_id: (r.shoot_day_unit_id as string | null) ?? null,
    strip_type: r.strip_type as StripType,
    scene_id: (r.scene_id as string | null) ?? null,
    shot_id: (r.shot_id as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    estimated_minutes: (r.estimated_minutes as number | null) ?? null,
    sort_index: Number(r.sort_index ?? 0),
    color_tag: (r.color_tag as string | null) ?? null,
    strip_status: (r.strip_status as StripStatus) ?? 'SCHEDULED',
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function titlePrefixForType(stripType: StripType): string {
  return stripType === 'CALL' ? 'Call' : 'Wrap'
}

function parseTimeFromCallWrapTitle(title: string | null | undefined): string | null {
  const raw = title?.trim() ?? ''
  if (!raw) return null
  const m = raw.match(/(\d{1,2}:\d{2})$/)
  if (!m) return null
  return normalizeScheduleTimeInput(m[1])
}

function buildCallWrapTitle(stripType: StripType, time: string): string {
  return `${titlePrefixForType(stripType)} ${time}`
}

async function getStripByIdRaw(db: Awaited<ReturnType<typeof getDb>>, stripId: string): Promise<Record<string, unknown> | null> {
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [stripId]
  )
  return rows[0] ?? null
}

async function ensureUniqueCallWrapPerDayUnit(
  db: Awaited<ReturnType<typeof getDb>>,
  shootDayUnitId: string,
  stripType: StripType,
  excludeStripId?: string
): Promise<void> {
  if (!CALL_WRAP_TYPES.includes(stripType)) return
  const binds: unknown[] = [shootDayUnitId, stripType]
  let excludeSql = ''
  if (excludeStripId) {
    binds.push(excludeStripId)
    excludeSql = ` AND id <> $${binds.length}`
  }
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id
     FROM ${TABLE}
     WHERE shoot_day_unit_id = $1
       AND strip_type = $2
       AND strip_status = 'SCHEDULED'
       AND deleted_at IS NULL
       ${excludeSql}
     LIMIT 1`,
    binds
  )
  if (rows.length > 0) {
    throw new Error(`Only one ${stripType} strip is allowed per unit/day.`)
  }
}

/**
 * Canonical write-back rule:
 * - `shoot_days.call_time` / `shoot_days.wrap_time` are updated from the Main Unit strip only.
 * - If the relevant Main Unit strip is missing or invalid, the shoot_days field is cleared.
 */
async function syncShootDayCallWrapForMainUnit(
  db: Awaited<ReturnType<typeof getDb>>,
  shootDayId: string,
  ts: string,
  statements?: Array<{ sql: string; bindValues: unknown[] }>,
  pendingTitleOverridesByStripId?: Record<string, string | null>
): Promise<void> {
  const rows = await db.select<Record<string, unknown>[]>(
    `
    SELECT
      s.id,
      s.strip_type,
      s.title
    FROM ${TABLE} s
    INNER JOIN shoot_day_units sdu ON sdu.id = s.shoot_day_unit_id AND sdu.deleted_at IS NULL
    INNER JOIN units u ON u.id = sdu.unit_id AND u.deleted_at IS NULL
    WHERE s.shoot_day_id = $1
      AND s.strip_status = 'SCHEDULED'
      AND s.deleted_at IS NULL
      AND s.strip_type IN ('CALL', 'WRAP')
      AND LOWER(u.name) LIKE '%main%'
    ORDER BY s.sort_index ASC
    `,
    [shootDayId]
  )
  let callTime: string | null = null
  let wrapTime: string | null = null
  const parsedRows: Array<{ stripId: string; stripType: string; rawTitle: string | null; parsedTime: string | null }> = []
  for (const row of rows) {
    const stripType = row.strip_type as StripType
    const rowId = row.id as string
    const effectiveTitle = pendingTitleOverridesByStripId && rowId in pendingTitleOverridesByStripId
      ? pendingTitleOverridesByStripId[rowId] ?? null
      : ((row.title as string | null) ?? null)
    const parsed = parseTimeFromCallWrapTitle(effectiveTitle)
    parsedRows.push({
      stripId: rowId,
      stripType,
      rawTitle: effectiveTitle,
      parsedTime: parsed,
    })
    if (!parsed) continue
    if (stripType === 'CALL' && callTime == null) callTime = parsed
    if (stripType === 'WRAP' && wrapTime == null) wrapTime = parsed
  }
  const updateSql = `UPDATE shoot_days SET call_time = $1, wrap_time = $2, updated_at = $3 WHERE id = $4`
  const bindValues: unknown[] = [callTime, wrapTime, ts, shootDayId]
  if (statements) {
    statements.push({ sql: updateSql, bindValues })
    statements.push(
      outboxStatementForRow({
        entity: 'shoot_days',
        entityId: shootDayId,
        operation: 'update',
        payloadJson: JSON.stringify({ call_time: callTime, wrap_time: wrapTime }),
      })
    )
    return
  }
  await db.execute(updateSql, bindValues)
  await outboxPush('shoot_days', shootDayId, 'update', JSON.stringify({ call_time: callTime, wrap_time: wrapTime }))
}

/** List strips that are on the board (SCHEDULED with a day). Used for stripboard columns. */
export async function listStripsByProduction(productionId: string): Promise<StripboardStrip[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL AND strip_status = 'SCHEDULED' AND shoot_day_id IS NOT NULL ORDER BY shoot_day_id, shoot_day_unit_id, sort_index`,
    [productionId]
  )
  return rows.map(rowToStrip)
}

/** List all strips for a shoot day (all units), ordered by sort_index. */
export async function listStripsByShootDay(shootDayId: string): Promise<StripboardStrip[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shoot_day_id = $1 AND deleted_at IS NULL ORDER BY sort_index`,
    [shootDayId]
  )
  return rows.map(rowToStrip)
}

/** List strips for a specific day+unit, ordered by sort_index. */
export async function listStripsForDayUnit(
  shootDayId: string,
  shootDayUnitId: string
): Promise<StripboardStrip[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shoot_day_id = $1 AND shoot_day_unit_id = $2 AND deleted_at IS NULL ORDER BY sort_index`,
    [shootDayId, shootDayUnitId]
  )
  return rows.map(rowToStrip)
}

/** For a production, return a map of shoot day id → list of scene ids scheduled on that day (from strips). */
export async function getScheduledSceneIdsByShootDay(
  productionId: string
): Promise<Map<string, string[]>> {
  const days = await listShootDaysByProduction(productionId)
  const map = new Map<string, string[]>()
  for (const day of days) {
    const strips = await listStripsByShootDay(day.id)
    const sceneIds = [...new Set(strips.map((s) => s.scene_id).filter(Boolean) as string[])]
    map.set(day.id, sceneIds)
  }
  return map
}

/** For a production, return a map of shoot day id → list of shot ids scheduled on that day (from SCHEDULED strips with shot_id). Used for shot-level booking intelligence. */
export async function getScheduledShotIdsByShootDay(
  productionId: string
): Promise<Map<string, string[]>> {
  const days = await listShootDaysByProduction(productionId)
  const map = new Map<string, string[]>()
  for (const day of days) {
    const strips = await listStripsByShootDay(day.id)
    const shotIds = [...new Set(strips.map((s) => s.shot_id).filter(Boolean) as string[])]
    map.set(day.id, shotIds)
  }
  return map
}

/** Set of shot ids that have at least one SCHEDULED (on-board) SHOT strip for this production. */
export async function getScheduledShotIds(productionId: string): Promise<Set<string>> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT DISTINCT shot_id FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL AND strip_status = 'SCHEDULED' AND shot_id IS NOT NULL`,
    [productionId]
  )
  const set = new Set<string>()
  for (const r of rows) {
    const id = r?.shot_id as string | undefined
    if (id) set.add(id)
  }
  return set
}

/** Get max sort_index for a day/unit (for appending). */
async function getMaxSortIndex(db: Awaited<ReturnType<typeof getDb>>, shootDayId: string, shootDayUnitId: string): Promise<number> {
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT COALESCE(MAX(sort_index), 0) AS mx FROM ${TABLE} WHERE shoot_day_id = $1 AND shoot_day_unit_id = $2 AND deleted_at IS NULL`,
    [shootDayId, shootDayUnitId]
  )
  return Number(rows[0]?.mx ?? 0)
}

export type CreateStripData = {
  production_id: string
  shoot_day_id: string
  shoot_day_unit_id: string | null
  sort_index?: number
  strip_type: StripType
  scene_id?: string | null
  shot_id?: string | null
  title?: string | null
  description?: string | null
  estimated_minutes?: number | null
  color_tag?: string | null
}

/** Create a strip at the end of the day/unit. Returns the new strip. */
export async function createStrip(data: CreateStripData): Promise<StripboardStrip> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const shootDayUnitId = data.shoot_day_unit_id ?? null
  if (CALL_WRAP_TYPES.includes(data.strip_type) && !shootDayUnitId) {
    throw new Error(`${data.strip_type} strip requires a shoot day unit.`)
  }
  if (shootDayUnitId && CALL_WRAP_TYPES.includes(data.strip_type)) {
    await ensureUniqueCallWrapPerDayUnit(db, shootDayUnitId, data.strip_type)
  }
  const normalizedCallWrapTime =
    CALL_WRAP_TYPES.includes(data.strip_type) && data.title
      ? normalizeScheduleTimeInput(data.title)
      : null
  if (CALL_WRAP_TYPES.includes(data.strip_type) && !normalizedCallWrapTime) {
    throw new Error(`${data.strip_type} strip requires a valid HH:MM time.`)
  }
  const persistedTitle =
    normalizedCallWrapTime != null
      ? buildCallWrapTitle(data.strip_type, normalizedCallWrapTime)
      : data.title ?? null
  const sortIndex =
    data.sort_index != null
      ? data.sort_index
      : shootDayUnitId
        ? await getMaxSortIndex(db, data.shoot_day_id, shootDayUnitId) + SORT_GAP
        : 0
  const payload = {
    ...data,
    id,
    title: persistedTitle,
    description: normalizedCallWrapTime != null ? null : data.description ?? null,
    sort_index: sortIndex,
  }
  if (CALL_WRAP_TYPES.includes(data.strip_type)) {
    await runInSerializedTransaction(async () => {
      const conn = await getDb()
      const statements: Array<{ sql: string; bindValues: unknown[] }> = [
        { sql: 'BEGIN', bindValues: [] },
        {
          sql: `INSERT INTO ${TABLE} (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SCHEDULED', $13, $14)`,
          bindValues: [
            id, data.production_id, data.shoot_day_id, data.shoot_day_unit_id ?? null,
            data.strip_type, data.scene_id ?? null, data.shot_id ?? null, persistedTitle, null,
            data.estimated_minutes ?? null, sortIndex, data.color_tag ?? null, ts, ts,
          ],
        },
        outboxStatementForRow({
          entity: TABLE,
          entityId: id,
          operation: 'create',
          payloadJson: JSON.stringify(payload),
        }),
      ]
      await syncShootDayCallWrapForMainUnit(
        conn,
        data.shoot_day_id,
        ts,
        statements,
        CALL_WRAP_TYPES.includes(data.strip_type) ? { [id]: persistedTitle } : undefined
      )
      statements.push({ sql: 'COMMIT', bindValues: [] })
      await executeBatch(conn, statements)
    })
  } else {
    await db.execute(
      `INSERT INTO ${TABLE} (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SCHEDULED', $13, $14)`,
      [
        id, data.production_id, data.shoot_day_id, data.shoot_day_unit_id ?? null,
        data.strip_type, data.scene_id ?? null, data.shot_id ?? null, persistedTitle, data.description ?? null,
        data.estimated_minutes ?? null, sortIndex, data.color_tag ?? null, ts, ts,
      ]
    )
    await outboxPush(TABLE, id, 'create', JSON.stringify(payload))
  }
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToStrip(rows[0]!)
}

/** Create a SHOT strip for the given shot at the end of the day/unit. */
export async function createShotStrip(
  productionId: string,
  shotId: string,
  shootDayId: string,
  shootDayUnitId: string,
  sortIndex?: number
): Promise<StripboardStrip> {
  return createStrip({
    production_id: productionId,
    shoot_day_id: shootDayId,
    shoot_day_unit_id: shootDayUnitId,
    sort_index: sortIndex,
    strip_type: 'SHOT',
    shot_id: shotId,
  })
}

/** Move a strip to another day/unit at the given sort_index. Sets strip_status to SCHEDULED. Single-strip update by id. */
export async function moveStrip(
  stripId: string,
  toShootDayId: string,
  toShootDayUnitId: string,
  toSortIndex: number
): Promise<StripboardStrip> {
  const db = await getDb()
  const ts = now()
  const existing = await getStripByIdRaw(db, stripId)
  if (!existing) throw new Error('Strip not found')
  const existingType = existing.strip_type as StripType
  const fromShootDayId = (existing.shoot_day_id as string | null) ?? null
  if (CALL_WRAP_TYPES.includes(existingType)) {
    await ensureUniqueCallWrapPerDayUnit(db, toShootDayUnitId, existingType, stripId)
    await runInSerializedTransaction(async () => {
      const conn = await getDb()
      const statements: Array<{ sql: string; bindValues: unknown[] }> = [
        { sql: 'BEGIN', bindValues: [] },
        {
          sql: `UPDATE ${TABLE} SET shoot_day_id = $1, shoot_day_unit_id = $2, sort_index = $3, strip_status = 'SCHEDULED', updated_at = $4 WHERE id = $5`,
          bindValues: [toShootDayId, toShootDayUnitId, toSortIndex, ts, stripId],
        },
        outboxStatementForRow({
          entity: TABLE,
          entityId: stripId,
          operation: 'update',
          payloadJson: JSON.stringify({ shoot_day_id: toShootDayId, shoot_day_unit_id: toShootDayUnitId, sort_index: toSortIndex, strip_status: 'SCHEDULED' }),
        }),
      ]
      if (fromShootDayId) {
        await syncShootDayCallWrapForMainUnit(conn, fromShootDayId, ts, statements)
      }
      if (!fromShootDayId || fromShootDayId !== toShootDayId) {
        await syncShootDayCallWrapForMainUnit(conn, toShootDayId, ts, statements)
      }
      statements.push({ sql: 'COMMIT', bindValues: [] })
      await executeBatch(conn, statements)
    })
  } else {
    await db.execute(
      `UPDATE ${TABLE} SET shoot_day_id = $1, shoot_day_unit_id = $2, sort_index = $3, strip_status = 'SCHEDULED', updated_at = $4 WHERE id = $5`,
      [toShootDayId, toShootDayUnitId, toSortIndex, ts, stripId]
    )
    await outboxPush(TABLE, stripId, 'update', JSON.stringify({ shoot_day_id: toShootDayId, shoot_day_unit_id: toShootDayUnitId, sort_index: toSortIndex, strip_status: 'SCHEDULED' }))
  }
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [stripId])
  if (rows.length === 0) throw new Error('Strip not found')
  return rowToStrip(rows[0]!)
}

/** Move a single strip from the board to Unscheduled. Strip remains in DB; not deleted. Single-strip update by id. */
export async function moveStripToUnscheduled(stripId: string): Promise<StripboardStrip> {
  const db = await getDb()
  const ts = now()
  const existing = await getStripByIdRaw(db, stripId)
  if (!existing) throw new Error('Strip not found')
  const isCallWrap = CALL_WRAP_TYPES.includes(existing.strip_type as StripType)
  const fromShootDayId = (existing.shoot_day_id as string | null) ?? null
  if (isCallWrap && fromShootDayId) {
    await runInSerializedTransaction(async () => {
      const conn = await getDb()
      const statements: Array<{ sql: string; bindValues: unknown[] }> = [
        { sql: 'BEGIN', bindValues: [] },
        {
          sql: `UPDATE ${TABLE} SET strip_status = 'UNSCHEDULED', shoot_day_id = NULL, shoot_day_unit_id = NULL, updated_at = $1 WHERE id = $2`,
          bindValues: [ts, stripId],
        },
        outboxStatementForRow({
          entity: TABLE,
          entityId: stripId,
          operation: 'update',
          payloadJson: JSON.stringify({ strip_status: 'UNSCHEDULED', shoot_day_id: null, shoot_day_unit_id: null }),
        }),
      ]
      await syncShootDayCallWrapForMainUnit(conn, fromShootDayId, ts, statements)
      statements.push({ sql: 'COMMIT', bindValues: [] })
      await executeBatch(conn, statements)
    })
  } else {
    await db.execute(
      `UPDATE ${TABLE} SET strip_status = 'UNSCHEDULED', shoot_day_id = NULL, shoot_day_unit_id = NULL, updated_at = $1 WHERE id = $2`,
      [ts, stripId]
    )
    await outboxPush(TABLE, stripId, 'update', JSON.stringify({ strip_status: 'UNSCHEDULED', shoot_day_id: null, shoot_day_unit_id: null }))
  }
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [stripId])
  if (rows.length === 0) throw new Error('Strip not found')
  return rowToStrip(rows[0]!)
}

/** Move a single strip to Boneyard (discarded). Strip remains in DB; can be recovered or permanently deleted from Boneyard. Single-strip update by id. */
export async function moveStripToBoneyard(stripId: string): Promise<StripboardStrip> {
  const db = await getDb()
  const ts = now()
  const existing = await getStripByIdRaw(db, stripId)
  if (!existing) throw new Error('Strip not found')
  const isCallWrap = CALL_WRAP_TYPES.includes(existing.strip_type as StripType)
  const fromShootDayId = (existing.shoot_day_id as string | null) ?? null
  if (isCallWrap && fromShootDayId) {
    await runInSerializedTransaction(async () => {
      const conn = await getDb()
      const statements: Array<{ sql: string; bindValues: unknown[] }> = [
        { sql: 'BEGIN', bindValues: [] },
        {
          sql: `UPDATE ${TABLE} SET strip_status = 'BONEYARD', shoot_day_id = NULL, shoot_day_unit_id = NULL, updated_at = $1 WHERE id = $2`,
          bindValues: [ts, stripId],
        },
        outboxStatementForRow({
          entity: TABLE,
          entityId: stripId,
          operation: 'update',
          payloadJson: JSON.stringify({ strip_status: 'BONEYARD', shoot_day_id: null, shoot_day_unit_id: null }),
        }),
      ]
      await syncShootDayCallWrapForMainUnit(conn, fromShootDayId, ts, statements)
      statements.push({ sql: 'COMMIT', bindValues: [] })
      await executeBatch(conn, statements)
    })
  } else {
    await db.execute(
      `UPDATE ${TABLE} SET strip_status = 'BONEYARD', shoot_day_id = NULL, shoot_day_unit_id = NULL, updated_at = $1 WHERE id = $2`,
      [ts, stripId]
    )
    await outboxPush(TABLE, stripId, 'update', JSON.stringify({ strip_status: 'BONEYARD', shoot_day_id: null, shoot_day_unit_id: null }))
  }
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [stripId])
  if (rows.length === 0) throw new Error('Strip not found')
  return rowToStrip(rows[0]!)
}

/** List strips in Unscheduled panel (strip_status = UNSCHEDULED). */
export async function listUnscheduledStrips(productionId: string): Promise<StripboardStrip[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL AND strip_status = 'UNSCHEDULED' ORDER BY sort_index`,
    [productionId]
  )
  return rows.map(rowToStrip)
}

/** List strips in Boneyard (strip_status = BONEYARD). */
export async function listBoneyardStrips(productionId: string): Promise<StripboardStrip[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL AND strip_status = 'BONEYARD' ORDER BY sort_index`,
    [productionId]
  )
  return rows.map(rowToStrip)
}

/** Reorder a strip within the same day/unit (update sort_index only). */
export async function reorderStrip(
  stripId: string,
  toSortIndex: number,
  options?: { expectedUpdatedAt?: string }
): Promise<StripboardStrip> {
  const db = await getDb()
  const ts = now()
  const bindValues: unknown[] = [toSortIndex, ts, stripId]
  let sql = `UPDATE ${TABLE} SET sort_index = $1, updated_at = $2 WHERE id = $3`
  if (options?.expectedUpdatedAt) {
    sql += ' AND updated_at = $4'
    bindValues.push(options.expectedUpdatedAt)
  }
  const result = await db.execute(sql, bindValues)
  if ((result.rowsAffected ?? 0) === 0 && options?.expectedUpdatedAt) {
    throw new OptimisticConcurrencyConflictError({
      entity: TABLE,
      entityId: stripId,
      expectedUpdatedAt: options.expectedUpdatedAt,
    })
  }
  await outboxPush(TABLE, stripId, 'update', JSON.stringify({ sort_index: toSortIndex }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [stripId])
  if (rows.length === 0) throw new Error('Strip not found')
  return rowToStrip(rows[0]!)
}

export async function updateStripEstimatedMinutes(stripId: string, estimatedMinutes: number | null): Promise<StripboardStrip> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET estimated_minutes = $1, updated_at = $2 WHERE id = $3`,
    [estimatedMinutes, ts, stripId]
  )
  await outboxPush(TABLE, stripId, 'update', JSON.stringify({ estimated_minutes: estimatedMinutes }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [stripId])
  if (rows.length === 0) throw new Error('Strip not found')
  return rowToStrip(rows[0]!)
}

/**
 * Soft-delete a single strip by id. Only affects one row.
 * Stripboard trash and Boneyard permanent delete both use this.
 * CALL/WRAP scheduled on a shoot day: allowed only if another SCHEDULED strip of the same type remains on that day; updates shoot_days via sync when applicable.
 */
export async function deleteStrip(stripId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  const existing = await getStripByIdRaw(db, stripId)
  if (!existing) return
  const stripType = existing.strip_type as StripType
  const isCallWrap = CALL_WRAP_TYPES.includes(stripType)
  const status = (existing.strip_status as StripStatus) ?? 'SCHEDULED'
  const shootDayId = (existing.shoot_day_id as string | null) ?? null

  if (isCallWrap && status === 'SCHEDULED' && shootDayId) {
    const countRows = await db.select<Record<string, unknown>[]>(
      `SELECT COUNT(*) AS c FROM ${TABLE}
       WHERE shoot_day_id = $1
         AND strip_type = $2
         AND strip_status = 'SCHEDULED'
         AND deleted_at IS NULL`,
      [shootDayId, stripType]
    )
    const count = Number(countRows[0]?.c ?? 0)
    if (count <= 1) {
      throw new Error(`Cannot delete the only ${stripType} strip for this shoot day.`)
    }
    await runInSerializedTransaction(async () => {
      const conn = await getDb()
      const statements: Array<{ sql: string; bindValues: unknown[] }> = [
        { sql: 'BEGIN', bindValues: [] },
        {
          sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
          bindValues: [ts, ts, stripId],
        },
        outboxStatementForRow({
          entity: TABLE,
          entityId: stripId,
          operation: 'delete',
          payloadJson: null,
        }),
      ]
      await syncShootDayCallWrapForMainUnit(conn, shootDayId, ts, statements)
      statements.push({ sql: 'COMMIT', bindValues: [] })
      await executeBatch(conn, statements)
    })
    return
  }

  const result = await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, stripId]
  )
  if (import.meta.env.DEV && result?.rowsAffected !== undefined && result.rowsAffected > 1) {
    console.warn(`[stripboard] deleteStrip expected 1 row affected, got ${result.rowsAffected}. stripId=${stripId}`)
  }
  await outboxPush(TABLE, stripId, 'delete', null)
}

export async function updateCallWrapStripTime(stripId: string, time: string): Promise<StripboardStrip> {
  const normalized = normalizeScheduleTimeInput(time)
  if (!normalized) {
    throw new Error('Time must be in HH:MM format.')
  }
  const db = await getDb()
  const existing = await getStripByIdRaw(db, stripId)
  if (!existing) throw new Error('Strip not found')
  const stripType = existing.strip_type as StripType
  if (!CALL_WRAP_TYPES.includes(stripType)) {
    throw new Error('Only CALL/WRAP strips can update time.')
  }
  const shootDayId = (existing.shoot_day_id as string | null) ?? null
  if (!shootDayId) throw new Error('Strip is not assigned to a shoot day.')
  const title = buildCallWrapTitle(stripType, normalized)
  const ts = now()
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
      {
        sql: `UPDATE ${TABLE} SET title = $1, description = NULL, updated_at = $2 WHERE id = $3`,
        bindValues: [title, ts, stripId],
      },
      outboxStatementForRow({
        entity: TABLE,
        entityId: stripId,
        operation: 'update',
        payloadJson: JSON.stringify({ title, description: null }),
      }),
    ]
    await syncShootDayCallWrapForMainUnit(
      conn,
      shootDayId,
      ts,
      statements,
      { [stripId]: title }
    )
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(conn, statements)
  })
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [stripId])
  if (rows.length === 0) throw new Error('Strip not found')
  return rowToStrip(rows[0]!)
}

export type UpdateStripData = {
  strip_type?: StripType
  title?: string | null
  description?: string | null
}

/**
 * Generic strip metadata update.
 * Includes CALL/WRAP uniqueness + shoot_days call/wrap sync when type/time changes.
 */
export async function updateStrip(
  stripId: string,
  data: UpdateStripData,
  options?: { expectedUpdatedAt?: string }
): Promise<StripboardStrip> {
  const db = await getDb()
  const existing = await getStripByIdRaw(db, stripId)
  if (!existing) throw new Error('Strip not found')
  if (options?.expectedUpdatedAt && String(existing.updated_at) !== options.expectedUpdatedAt) {
    throw new OptimisticConcurrencyConflictError({
      entity: TABLE,
      entityId: stripId,
      expectedUpdatedAt: options.expectedUpdatedAt,
    })
  }
  const nextType = (data.strip_type ?? (existing.strip_type as StripType))
  const shootDayId = (existing.shoot_day_id as string | null) ?? null
  const shootDayUnitId = (existing.shoot_day_unit_id as string | null) ?? null
  const ts = now()

  const isCallWrapNext = CALL_WRAP_TYPES.includes(nextType)
  if (isCallWrapNext && !shootDayUnitId) {
    throw new Error(`${nextType} strip requires a shoot day unit.`)
  }
  if (isCallWrapNext && shootDayUnitId) {
    await ensureUniqueCallWrapPerDayUnit(db, shootDayUnitId, nextType, stripId)
  }
  let nextTitle = data.title
  let nextDescription = data.description
  if (isCallWrapNext) {
    const normalized = normalizeScheduleTimeInput(data.title ?? (existing.title as string | null) ?? '')
    if (!normalized) throw new Error(`${nextType} strip requires a valid HH:MM time.`)
    nextTitle = buildCallWrapTitle(nextType, normalized)
    nextDescription = null
  }

  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (data.strip_type !== undefined) {
    cols.push(`strip_type = $${i++}`)
    vals.push(nextType)
  }
  if (nextTitle !== undefined) {
    cols.push(`title = $${i++}`)
    vals.push(nextTitle)
  }
  if (nextDescription !== undefined) {
    cols.push(`description = $${i++}`)
    vals.push(nextDescription)
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [stripId])
    if (rows.length === 0) throw new Error('Strip not found')
    return rowToStrip(rows[0]!)
  }
  cols.push(`updated_at = $${i++}`)
  vals.push(ts)
  vals.push(stripId)
  if (options?.expectedUpdatedAt) {
    vals.push(options.expectedUpdatedAt)
  }

  const touchingCallWrap =
    CALL_WRAP_TYPES.includes(existing.strip_type as StripType) || CALL_WRAP_TYPES.includes(nextType)

  if (touchingCallWrap && shootDayId) {
    await runInSerializedTransaction(async () => {
      const conn = await getDb()
      const statements: Array<{ sql: string; bindValues: unknown[] }> = [
        { sql: 'BEGIN', bindValues: [] },
        {
          sql: `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i}${
            options?.expectedUpdatedAt ? ` AND updated_at = $${i + 1}` : ''
          }`,
          bindValues: vals,
        },
        outboxStatementForRow({
          entity: TABLE,
          entityId: stripId,
          operation: 'update',
          payloadJson: JSON.stringify({
            strip_type: data.strip_type,
            title: nextTitle,
            description: nextDescription,
          }),
        }),
      ]
      await syncShootDayCallWrapForMainUnit(conn, shootDayId, ts, statements)
      statements.push({ sql: 'COMMIT', bindValues: [] })
      await executeBatch(conn, statements)
    })
  } else {
    const result = await db.execute(
      `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i}${
        options?.expectedUpdatedAt ? ` AND updated_at = $${i + 1}` : ''
      }`,
      vals
    )
    if ((result.rowsAffected ?? 0) === 0) {
      if (options?.expectedUpdatedAt) {
        throw new OptimisticConcurrencyConflictError({
          entity: TABLE,
          entityId: stripId,
          expectedUpdatedAt: options.expectedUpdatedAt,
        })
      }
      throw new Error('Strip not found')
    }
    await outboxPush(TABLE, stripId, 'update', JSON.stringify({
      strip_type: data.strip_type,
      title: nextTitle,
      description: nextDescription,
    }))
  }

  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [stripId])
  if (rows.length === 0) throw new Error('Strip not found')
  return rowToStrip(rows[0]!)
}

/** Assign multiple shots to a day/unit; creates SHOT strips at the end in order. */
export async function bulkAssignShotsToDay(
  productionId: string,
  shotIds: string[],
  shootDayId: string,
  shootDayUnitId: string
): Promise<StripboardStrip[]> {
  const result: StripboardStrip[] = []
  for (const shotId of shotIds) {
    const strip = await createShotStrip(productionId, shotId, shootDayId, shootDayUnitId)
    result.push(strip)
  }
  return result
}

export type UnscheduledShotsFilters = {
  search?: string
  locationId?: string | null
}

export type ShotWithScene = { shot: Shot; scene: Scene }

/** Shots that do not have a SCHEDULED SHOT strip on the stripboard. Optional search and locationId (scene) filter. */
export async function listUnscheduledShots(
  productionId: string,
  filters?: UnscheduledShotsFilters
): Promise<ShotWithScene[]> {
  const scheduledShotIds = await getScheduledShotIds(productionId)
  const allShots = await listShotsByProduction(productionId)
  const scenes = await listScenesByProduction(productionId)
  const sceneMap = new Map(scenes.map((s) => [s.id, s]))
  let list: ShotWithScene[] = allShots
    .filter((shot) => !scheduledShotIds.has(shot.id))
    .map((shot) => ({ shot, scene: sceneMap.get(shot.scene_id)! }))
    .filter((x) => x.scene != null)
  const search = filters?.search?.trim().toLowerCase()
  if (search) {
    list = list.filter(
      (x) =>
        x.scene.scene_number.toLowerCase().includes(search) ||
        x.shot.shot_number.toLowerCase().includes(search) ||
        (x.scene.heading ?? '').toLowerCase().includes(search) ||
        (x.scene.title ?? '').toLowerCase().includes(search) ||
        (x.shot.shot_description ?? '').toLowerCase().includes(search) ||
        (x.shot.subject ?? '').toLowerCase().includes(search)
    )
  }
  if (filters?.locationId !== undefined && filters?.locationId !== null) {
    list = list.filter((x) => x.scene.location_id === filters.locationId)
  } else if (filters?.locationId === null) {
    list = list.filter((x) => !x.scene.location_id)
  }
  return list
}
