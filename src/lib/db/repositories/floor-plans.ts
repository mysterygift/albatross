/**
 * Floor plans (experimental) storage. Local SQLite only, like Overtime: writes throw
 * FLOOR_PLANS_REMOTE_ERROR for productions served from a remote server.
 *
 * A floor plan belongs to a location and holds its drawing in `layout_json`. A setup holds the
 * camera and actor markers for one scene (shot_id NULL) or one shot on one plan; there is at most
 * one live setup per (plan, scene, shot), enforced here.
 */

import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import { getEffectiveDataSourceForProduction } from '../projectDataSource'
import {
  emptyLayout,
  parseLayout,
  parseMarkers,
  type FloorPlanLayout,
  type FloorPlanMarker,
} from '@/lib/floor-plans/model'

export const FLOOR_PLANS_REMOTE_ERROR =
  'Floor plans are stored on this device only and are not available for productions served from a remote server.'

type Stmt = { sql: string; bindValues: unknown[] }

const PLANS = 'floor_plans'
const SETUPS = 'floor_plan_setups'

export type FloorPlan = {
  id: string
  production_id: string
  location_id: string
  name: string
  layout: FloorPlanLayout
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type FloorPlanSetup = {
  id: string
  production_id: string
  floor_plan_id: string
  scene_id: string
  /** Null: blocking for the whole scene. */
  shot_id: string | null
  markers: FloorPlanMarker[]
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const strOrNull = (v: unknown): string | null => (v == null ? null : (v as string))

function rowToFloorPlan(r: Record<string, unknown>): FloorPlan {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    location_id: r.location_id as string,
    name: r.name as string,
    layout: parseLayout(typeof r.layout_json === 'string' ? r.layout_json : JSON.stringify(r.layout_json ?? null)),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: strOrNull(r.deleted_at),
  }
}

function rowToSetup(r: Record<string, unknown>): FloorPlanSetup {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    floor_plan_id: r.floor_plan_id as string,
    scene_id: r.scene_id as string,
    shot_id: strOrNull(r.shot_id),
    markers: parseMarkers(typeof r.markers_json === 'string' ? r.markers_json : JSON.stringify(r.markers_json ?? null)),
    notes: strOrNull(r.notes),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: strOrNull(r.deleted_at),
  }
}

async function assertLocal(productionId: string): Promise<void> {
  if ((await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
    throw new Error(FLOOR_PLANS_REMOTE_ERROR)
  }
}

async function assertInProduction(table: 'locations' | 'scenes', id: string, productionId: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM ${table} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  const label = table === 'locations' ? 'Location' : 'Scene'
  if (rows.length === 0) throw new Error(`${label} not found`)
  if (rows[0]!.production_id !== productionId) throw new Error(`${label} belongs to a different production`)
}

async function runBatch(statements: Stmt[]): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [{ sql: 'BEGIN', bindValues: [] }, ...statements, { sql: 'COMMIT', bindValues: [] }])
  })
}

async function getFloorPlanRow(id: string): Promise<FloorPlan | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${PLANS} WHERE id = $1 AND deleted_at IS NULL`, [id])
  return rows[0] ? rowToFloorPlan(rows[0]) : null
}

// ─── Floor plans ────────────────────────────────────────────────────────────

/** Live plans whose location is live, by name. */
export async function listFloorPlansByProduction(productionId: string): Promise<FloorPlan[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT fp.* FROM ${PLANS} fp
     INNER JOIN locations l ON l.id = fp.location_id AND l.deleted_at IS NULL
     WHERE fp.production_id = $1 AND fp.deleted_at IS NULL
     ORDER BY LOWER(fp.name), fp.created_at`,
    [productionId]
  )
  return rows.map(rowToFloorPlan)
}

export async function createFloorPlan(input: {
  productionId: string
  locationId: string
  name: string
  layout?: FloorPlanLayout
}): Promise<FloorPlan> {
  await assertLocal(input.productionId)
  await assertInProduction('locations', input.locationId, input.productionId)
  const name = input.name.trim()
  if (!name) throw new Error('Give the floor plan a name.')
  const id = uuid()
  const ts = now()
  const layoutJson = JSON.stringify(input.layout ?? emptyLayout())
  await runBatch([
    {
      sql: `INSERT INTO ${PLANS} (id, production_id, location_id, name, layout_json, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      bindValues: [id, input.productionId, input.locationId, name, layoutJson, ts],
    },
    outboxStatementForRow({
      entity: PLANS,
      entityId: id,
      operation: 'create',
      payloadJson: JSON.stringify({ production_id: input.productionId, location_id: input.locationId, name }),
    }),
  ])
  const plan = await getFloorPlanRow(id)
  if (!plan) throw new Error('Floor plan was not saved')
  return plan
}

export async function updateFloorPlan(
  id: string,
  patch: { name?: string; locationId?: string; layout?: FloorPlanLayout }
): Promise<FloorPlan> {
  const existing = await getFloorPlanRow(id)
  if (!existing) throw new Error('Floor plan not found')
  await assertLocal(existing.production_id)
  const sets: string[] = []
  const values: unknown[] = []
  const payload: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new Error('Give the floor plan a name.')
    values.push(name)
    sets.push(`name = $${values.length}`)
    payload.name = name
  }
  if (patch.locationId !== undefined) {
    await assertInProduction('locations', patch.locationId, existing.production_id)
    values.push(patch.locationId)
    sets.push(`location_id = $${values.length}`)
    payload.location_id = patch.locationId
  }
  if (patch.layout !== undefined) {
    values.push(JSON.stringify(patch.layout))
    sets.push(`layout_json = $${values.length}`)
    payload.layout_json = patch.layout
  }
  if (sets.length === 0) return existing
  values.push(now())
  sets.push(`updated_at = $${values.length}`)
  values.push(id)
  await runBatch([
    { sql: `UPDATE ${PLANS} SET ${sets.join(', ')} WHERE id = $${values.length}`, bindValues: values },
    outboxStatementForRow({ entity: PLANS, entityId: id, operation: 'update', payloadJson: JSON.stringify(payload) }),
  ])
  const plan = await getFloorPlanRow(id)
  if (!plan) throw new Error('Floor plan not found')
  return plan
}

/** Soft-deletes the plan and its setups together. */
export async function deleteFloorPlan(id: string): Promise<void> {
  const existing = await getFloorPlanRow(id)
  if (!existing) return
  await assertLocal(existing.production_id)
  const db = await getDb()
  const setupIds = (
    await db.select<Array<{ id: string }>>(`SELECT id FROM ${SETUPS} WHERE floor_plan_id = $1 AND deleted_at IS NULL`, [id])
  ).map((r) => r.id)
  const ts = now()
  await runBatch([
    { sql: `UPDATE ${SETUPS} SET deleted_at = $1, updated_at = $1 WHERE floor_plan_id = $2 AND deleted_at IS NULL`, bindValues: [ts, id] },
    { sql: `UPDATE ${PLANS} SET deleted_at = $1, updated_at = $1 WHERE id = $2`, bindValues: [ts, id] },
    ...setupIds.map((setupId) =>
      outboxStatementForRow({ entity: SETUPS, entityId: setupId, operation: 'delete', payloadJson: null })
    ),
    outboxStatementForRow({ entity: PLANS, entityId: id, operation: 'delete', payloadJson: null }),
  ])
}

// ─── Setups ─────────────────────────────────────────────────────────────────

/** Live setups on live plans, for live scenes and (when set) live shots. */
export async function listFloorPlanSetupsByProduction(productionId: string): Promise<FloorPlanSetup[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT s.* FROM ${SETUPS} s
     INNER JOIN ${PLANS} fp ON fp.id = s.floor_plan_id AND fp.deleted_at IS NULL
     INNER JOIN scenes sc ON sc.id = s.scene_id AND sc.deleted_at IS NULL
     LEFT JOIN shots sh ON sh.id = s.shot_id
     WHERE s.production_id = $1 AND s.deleted_at IS NULL AND (s.shot_id IS NULL OR sh.deleted_at IS NULL)
     ORDER BY s.created_at`,
    [productionId]
  )
  return rows.map(rowToSetup)
}

export type SaveFloorPlanSetupInput = {
  productionId: string
  floorPlanId: string
  sceneId: string
  shotId: string | null
  markers: FloorPlanMarker[]
  notes?: string | null
}

/**
 * Creates or replaces the setup for (plan, scene, shot). Saving no markers and no notes removes it,
 * so an emptied setup does not linger in exports.
 */
export async function saveFloorPlanSetup(input: SaveFloorPlanSetupInput): Promise<FloorPlanSetup | null> {
  await assertLocal(input.productionId)
  const plan = await getFloorPlanRow(input.floorPlanId)
  if (!plan || plan.production_id !== input.productionId) throw new Error('Floor plan not found')
  await assertInProduction('scenes', input.sceneId, input.productionId)
  const db = await getDb()
  if (input.shotId) {
    const shots = await db.select<Array<{ scene_id: string }>>(
      `SELECT scene_id FROM shots WHERE id = $1 AND deleted_at IS NULL`,
      [input.shotId]
    )
    if (shots.length === 0) throw new Error('Shot not found')
    if (shots[0]!.scene_id !== input.sceneId) throw new Error('Shot belongs to a different scene')
  }

  return runInSerializedTransaction(async () => {
    const existingRows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${SETUPS}
       WHERE floor_plan_id = $1 AND scene_id = $2 AND deleted_at IS NULL
         AND ${input.shotId ? 'shot_id = $3' : 'shot_id IS NULL'}
       ORDER BY created_at`,
      input.shotId ? [input.floorPlanId, input.sceneId, input.shotId] : [input.floorPlanId, input.sceneId]
    )
    const [existing, ...duplicates] = existingRows.map(rowToSetup)
    const markersJson = JSON.stringify(input.markers)
    const notes = input.notes !== undefined ? input.notes?.trim() || null : existing?.notes ?? null
    const ts = now()
    const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
    // Earlier duplicates (e.g. from a merge) are folded into the one being saved.
    for (const dup of duplicates) {
      statements.push(
        { sql: `UPDATE ${SETUPS} SET deleted_at = $1, updated_at = $1 WHERE id = $2`, bindValues: [ts, dup.id] },
        outboxStatementForRow({ entity: SETUPS, entityId: dup.id, operation: 'delete', payloadJson: null })
      )
    }
    let resultId: string | null
    if (input.markers.length === 0 && notes == null) {
      if (existing) {
        statements.push(
          { sql: `UPDATE ${SETUPS} SET deleted_at = $1, updated_at = $1 WHERE id = $2`, bindValues: [ts, existing.id] },
          outboxStatementForRow({ entity: SETUPS, entityId: existing.id, operation: 'delete', payloadJson: null })
        )
      }
      resultId = null
    } else if (existing) {
      statements.push(
        {
          sql: `UPDATE ${SETUPS} SET markers_json = $1, notes = $2, updated_at = $3 WHERE id = $4`,
          bindValues: [markersJson, notes, ts, existing.id],
        },
        outboxStatementForRow({
          entity: SETUPS,
          entityId: existing.id,
          operation: 'update',
          payloadJson: JSON.stringify({ markers_json: input.markers, notes }),
        })
      )
      resultId = existing.id
    } else {
      const id = uuid()
      statements.push(
        {
          sql: `INSERT INTO ${SETUPS} (id, production_id, floor_plan_id, scene_id, shot_id, markers_json, notes, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          bindValues: [id, input.productionId, input.floorPlanId, input.sceneId, input.shotId, markersJson, notes, ts],
        },
        outboxStatementForRow({
          entity: SETUPS,
          entityId: id,
          operation: 'create',
          payloadJson: JSON.stringify({
            production_id: input.productionId,
            floor_plan_id: input.floorPlanId,
            scene_id: input.sceneId,
            shot_id: input.shotId,
            markers_json: input.markers,
            notes,
          }),
        })
      )
      resultId = id
    }
    if (statements.length === 1) return null
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
    if (!resultId) return null
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${SETUPS} WHERE id = $1`, [resultId])
    return rows[0] ? rowToSetup(rows[0]) : null
  })
}

export async function deleteFloorPlanSetup(id: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM ${SETUPS} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  if (rows.length === 0) return
  await assertLocal(rows[0]!.production_id)
  const ts = now()
  await runBatch([
    { sql: `UPDATE ${SETUPS} SET deleted_at = $1, updated_at = $1 WHERE id = $2`, bindValues: [ts, id] },
    outboxStatementForRow({ entity: SETUPS, entityId: id, operation: 'delete', payloadJson: null }),
  ])
}
