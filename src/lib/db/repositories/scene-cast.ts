import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { SceneCast } from '../types'

const TABLE = 'scene_cast'

function rowToSceneCast(r: Record<string, unknown>): SceneCast {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    scene_id: r.scene_id as string,
    person_id: r.person_id as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listSceneCastByScene(sceneId: string): Promise<SceneCast[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE scene_id = $1 AND deleted_at IS NULL`,
    [sceneId]
  )
  return rows.map(rowToSceneCast)
}

export async function listSceneCastByPerson(personId: string): Promise<SceneCast[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE person_id = $1 AND deleted_at IS NULL ORDER BY scene_id`,
    [personId]
  )
  return rows.map(rowToSceneCast)
}

export async function listPersonIdsByScene(sceneId: string): Promise<string[]> {
  const list = await listSceneCastByScene(sceneId)
  return list.map((c) => c.person_id)
}

export async function addSceneCast(data: {
  production_id: string
  scene_id: string
  person_id: string
}): Promise<SceneCast> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, scene_id, person_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, data.production_id, data.scene_id, data.person_id, ts, ts]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  return (await listSceneCastByScene(data.scene_id)).find((c) => c.id === id)!
}

export async function removeSceneCast(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}

export async function getCastIdsBySceneIds(sceneIds: string[]): Promise<Map<string, string[]>> {
  if (sceneIds.length === 0) return new Map()
  const db = await getDb()
  const placeholders = sceneIds.map((_, i) => `$${i + 1}`).join(',')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT scene_id, person_id FROM ${TABLE} WHERE scene_id IN (${placeholders}) AND deleted_at IS NULL`,
    sceneIds
  )
  const map = new Map<string, string[]>()
  for (const r of rows) {
    const sid = r.scene_id as string
    const pid = r.person_id as string
    const arr = map.get(sid) ?? []
    if (!arr.includes(pid)) arr.push(pid)
    map.set(sid, arr)
  }
  return map
}
