/**
 * Shot-level cast participation. Refinement layer on top of scene_cast.
 * scene_cast remains the scene-level source of truth; DooD still uses scene_cast only.
 * When adding a person to a shot, we ensure they are also on the parent scene (auto-add scene_cast if needed).
 */

import { getDb, now, uuid, runInSerializedTransaction, executeBatch } from '../client'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type { ShotCast } from '../types'
import { getShotById } from './schedule'
import { listSceneCastByScene } from './scene-cast'

const TABLE = 'shot_cast'
const SCENE_CAST_TABLE = 'scene_cast'

function rowToShotCast(r: Record<string, unknown>): ShotCast {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shot_id: r.shot_id as string,
    person_id: r.person_id as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listShotCastByShot(shotId: string): Promise<ShotCast[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shot_id = $1 AND deleted_at IS NULL ORDER BY person_id`,
    [shotId]
  )
  return rows.map(rowToShotCast)
}

export async function listShotCastByPerson(personId: string): Promise<ShotCast[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE person_id = $1 AND deleted_at IS NULL ORDER BY shot_id`,
    [personId]
  )
  return rows.map(rowToShotCast)
}

/** Shot_cast rows for this person in the given production (for Person detail shot participation). */
export async function listShotCastByPersonInProduction(
  productionId: string,
  personId: string
): Promise<ShotCast[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND person_id = $2 AND deleted_at IS NULL ORDER BY shot_id`,
    [productionId, personId]
  )
  return rows.map(rowToShotCast)
}

/** Shot ids this person is attached to (within any production). For production-scoped use, use listShotCastByPersonInProduction. */
export async function listShotIdsByPerson(personId: string): Promise<string[]> {
  const list = await listShotCastByPerson(personId)
  return list.map((sc) => sc.shot_id)
}

/** Batch: shot_id -> person_id[]. For use in DooD/scheduling (shot_cast is not yet consumed by DooD). */
export async function getCastIdsByShotIds(shotIds: string[]): Promise<Map<string, string[]>> {
  if (shotIds.length === 0) return new Map()
  const db = await getDb()
  const placeholders = shotIds.map((_, i) => `$${i + 1}`).join(',')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT shot_id, person_id FROM ${TABLE} WHERE shot_id IN (${placeholders}) AND deleted_at IS NULL`,
    shotIds
  )
  const map = new Map<string, string[]>()
  for (const r of rows) {
    const sid = r.shot_id as string
    const pid = r.person_id as string
    const arr = map.get(sid) ?? []
    if (!arr.includes(pid)) arr.push(pid)
    map.set(sid, arr)
  }
  return map
}

/** Batch: shot_id -> ShotCast[]. For shot list UI (per-shot cast with ids for remove). */
export async function listShotCastByShotIds(shotIds: string[]): Promise<Map<string, ShotCast[]>> {
  if (shotIds.length === 0) return new Map()
  const db = await getDb()
  const placeholders = shotIds.map((_, i) => `$${i + 1}`).join(',')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shot_id IN (${placeholders}) AND deleted_at IS NULL ORDER BY shot_id, person_id`,
    shotIds
  )
  const map = new Map<string, ShotCast[]>()
  for (const r of rows) {
    const sc = rowToShotCast(r)
    const arr = map.get(sc.shot_id) ?? []
    arr.push(sc)
    map.set(sc.shot_id, arr)
  }
  return map
}

/**
 * Add a cast member to a shot. Ensures scene_cast exists for the shot's scene (auto-adds if missing).
 * If person is not on the parent scene, we add scene_cast then shot_cast in one transaction.
 */
export async function addShotCast(data: {
  production_id: string
  shot_id: string
  person_id: string
}): Promise<ShotCast> {
  const db = await getDb()
  const existingShotCast = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shot_id = $1 AND person_id = $2 AND deleted_at IS NULL`,
    [data.shot_id, data.person_id]
  )
  if (existingShotCast.length > 0) return rowToShotCast(existingShotCast[0]!)

  const shot = await getShotById(data.shot_id)
  if (!shot) throw new Error('Shot not found')

  const sceneCastList = await listSceneCastByScene(shot.scene_id)
  const hasSceneCast = sceneCastList.some((sc) => sc.person_id === data.person_id)

  if (!hasSceneCast) {
    await runInSerializedTransaction(async () => {
      const conn = await getDb()
      const idScene = uuid()
      const idShot = uuid()
      const ts = now()
      const outboxScene = outboxStatementForRow({
        entity: SCENE_CAST_TABLE,
        entityId: idScene,
        operation: 'create',
        payloadJson: JSON.stringify({ id: idScene, production_id: data.production_id, scene_id: shot.scene_id, person_id: data.person_id }),
      })
      const outboxShot = outboxStatementForRow({
        entity: TABLE,
        entityId: idShot,
        operation: 'create',
        payloadJson: JSON.stringify({ id: idShot, ...data }),
      })
      const batch: Array<{ sql: string; bindValues: unknown[] }> = [
        { sql: 'BEGIN TRANSACTION', bindValues: [] },
        {
          sql: `INSERT INTO ${SCENE_CAST_TABLE} (id, production_id, scene_id, person_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          bindValues: [idScene, data.production_id, shot.scene_id, data.person_id, ts, ts],
        },
        {
          sql: `INSERT INTO ${TABLE} (id, production_id, shot_id, person_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          bindValues: [idShot, data.production_id, data.shot_id, data.person_id, ts, ts],
        },
        outboxScene,
        outboxShot,
        { sql: 'COMMIT', bindValues: [] },
      ]
      await executeBatch(conn, batch)
    })
  } else {
    const id = uuid()
    const ts = now()
    await db.execute(
      `INSERT INTO ${TABLE} (id, production_id, shot_id, person_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, data.production_id, data.shot_id, data.person_id, ts, ts]
    )
    await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  }

  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shot_id = $1 AND person_id = $2 AND deleted_at IS NULL`,
    [data.shot_id, data.person_id]
  )
  return rowToShotCast(rows[0]!)
}

export async function removeShotCast(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
