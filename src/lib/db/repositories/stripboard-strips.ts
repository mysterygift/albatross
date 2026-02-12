import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Scene, StripboardStrip, StripStatus, StripType } from '../types'
import { listScenesByProduction, listShootDaysByProduction } from './schedule'

const TABLE = 'stripboard_strips'
export const SORT_GAP = 1000

function rowToStrip(r: Record<string, unknown>): StripboardStrip {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shoot_day_id: (r.shoot_day_id as string | null) ?? null,
    shoot_day_unit_id: (r.shoot_day_unit_id as string | null) ?? null,
    strip_type: r.strip_type as StripType,
    scene_id: (r.scene_id as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    estimated_minutes: (r.estimated_minutes as number | null) ?? null,
    sort_index: Number(r.sort_index) ?? 0,
    color_tag: (r.color_tag as string | null) ?? null,
    strip_status: (r.strip_status as StripStatus) ?? 'SCHEDULED',
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
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

/** Set of scene ids that have at least one SCHEDULED (on-board) SCENE strip for this production. */
async function getScheduledSceneIds(productionId: string): Promise<Set<string>> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT DISTINCT scene_id FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL AND strip_status = 'SCHEDULED' AND scene_id IS NOT NULL`,
    [productionId]
  )
  const set = new Set<string>()
  for (const r of rows) {
    const id = r?.scene_id as string | undefined
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
  strip_type: StripType
  scene_id?: string | null
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
  const sortIndex = shootDayUnitId
    ? await getMaxSortIndex(db, data.shoot_day_id, shootDayUnitId) + SORT_GAP
    : 0
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'SCHEDULED', $12, $13)`,
    [
      id, data.production_id, data.shoot_day_id, data.shoot_day_unit_id ?? null,
      data.strip_type, data.scene_id ?? null, data.title ?? null, data.description ?? null,
      data.estimated_minutes ?? null, sortIndex, data.color_tag ?? null, ts, ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id, sort_index: sortIndex }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToStrip(rows[0]!)
}

/** Create a SCENE strip for the given scene at the end of the day/unit. */
export async function createSceneStrip(
  productionId: string,
  sceneId: string,
  shootDayId: string,
  shootDayUnitId: string
): Promise<StripboardStrip> {
  return createStrip({
    production_id: productionId,
    shoot_day_id: shootDayId,
    shoot_day_unit_id: shootDayUnitId,
    strip_type: 'SCENE',
    scene_id: sceneId,
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
  await db.execute(
    `UPDATE ${TABLE} SET shoot_day_id = $1, shoot_day_unit_id = $2, sort_index = $3, strip_status = 'SCHEDULED', updated_at = $4 WHERE id = $5`,
    [toShootDayId, toShootDayUnitId, toSortIndex, ts, stripId]
  )
  await outboxPush(TABLE, stripId, 'update', JSON.stringify({ shoot_day_id: toShootDayId, shoot_day_unit_id: toShootDayUnitId, sort_index: toSortIndex, strip_status: 'SCHEDULED' }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [stripId])
  if (rows.length === 0) throw new Error('Strip not found')
  return rowToStrip(rows[0]!)
}

/** Move a single strip from the board to Unscheduled. Strip remains in DB; not deleted. Single-strip update by id. */
export async function moveStripToUnscheduled(stripId: string): Promise<StripboardStrip> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET strip_status = 'UNSCHEDULED', shoot_day_id = NULL, shoot_day_unit_id = NULL, updated_at = $1 WHERE id = $2`,
    [ts, stripId]
  )
  await outboxPush(TABLE, stripId, 'update', JSON.stringify({ strip_status: 'UNSCHEDULED', shoot_day_id: null, shoot_day_unit_id: null }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [stripId])
  if (rows.length === 0) throw new Error('Strip not found')
  return rowToStrip(rows[0]!)
}

/** Move a single strip to Boneyard (discarded). Strip remains in DB; can be recovered or permanently deleted from Boneyard. Single-strip update by id. */
export async function moveStripToBoneyard(stripId: string): Promise<StripboardStrip> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET strip_status = 'BONEYARD', shoot_day_id = NULL, shoot_day_unit_id = NULL, updated_at = $1 WHERE id = $2`,
    [ts, stripId]
  )
  await outboxPush(TABLE, stripId, 'update', JSON.stringify({ strip_status: 'BONEYARD', shoot_day_id: null, shoot_day_unit_id: null }))
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
export async function reorderStrip(stripId: string, toSortIndex: number): Promise<StripboardStrip> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET sort_index = $1, updated_at = $2 WHERE id = $3`,
    [toSortIndex, ts, stripId]
  )
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
 * Use for: moving a strip from the board to Boneyard (permanent discard) only.
 * For moving to Unscheduled, use moveStripToUnscheduled(stripId) instead.
 */
export async function deleteStrip(stripId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  const result = await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, stripId]
  )
  if (import.meta.env.DEV && result?.rowsAffected !== undefined && result.rowsAffected > 1) {
    console.warn(`[stripboard] deleteStrip expected 1 row affected, got ${result.rowsAffected}. stripId=${stripId}`)
  }
  await outboxPush(TABLE, stripId, 'delete', null)
}

/** Assign multiple scenes to a day/unit; creates SCENE strips at the end in order. */
export async function bulkAssignScenesToDay(
  productionId: string,
  sceneIds: string[],
  shootDayId: string,
  shootDayUnitId: string
): Promise<StripboardStrip[]> {
  const result: StripboardStrip[] = []
  for (const sceneId of sceneIds) {
    const strip = await createSceneStrip(productionId, sceneId, shootDayId, shootDayUnitId)
    result.push(strip)
  }
  return result
}

export type UnscheduledScenesFilters = {
  search?: string
  locationId?: string | null
}

/** Scenes that do not have a SCENE strip on the stripboard. Optional search (scene_number, heading, title) and locationId filter. */
export async function listUnscheduledScenes(
  productionId: string,
  filters?: UnscheduledScenesFilters
): Promise<Scene[]> {
  const scheduledIds = await getScheduledSceneIds(productionId)
  const allScenes = await listScenesByProduction(productionId)
  let list = allScenes.filter((s) => !scheduledIds.has(s.id))
  const search = filters?.search?.trim().toLowerCase()
  if (search) {
    list = list.filter(
      (s) =>
        s.scene_number.toLowerCase().includes(search) ||
        (s.heading ?? '').toLowerCase().includes(search) ||
        (s.title ?? '').toLowerCase().includes(search)
    )
  }
  if (filters?.locationId !== undefined && filters?.locationId !== null) {
    list = list.filter((s) => s.location_id === filters.locationId)
  } else if (filters?.locationId === null) {
    list = list.filter((s) => !s.location_id)
  }
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/76cef4f5-a1f0-453f-b82a-14d185be1b61',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'stripboard-strips.ts:listUnscheduledScenes',message:'return list',data:{scheduledCount:scheduledIds.size,allScenesCount:allScenes.length,listCount:list.length,sceneIds:list.map(s=>s.id)},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return list
}
