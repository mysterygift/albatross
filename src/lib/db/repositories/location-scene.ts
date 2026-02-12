import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'

const TABLE = 'location_scene'

export async function listLocationIdsByScene(sceneId: string): Promise<string[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT location_id FROM ${TABLE} WHERE scene_id = $1 AND deleted_at IS NULL`,
    [sceneId]
  )
  return rows.map((r) => r.location_id as string)
}

export async function listSceneIdsByLocation(locationId: string): Promise<string[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT scene_id FROM ${TABLE} WHERE location_id = $1 AND deleted_at IS NULL`,
    [locationId]
  )
  return rows.map((r) => r.scene_id as string)
}

export async function linkLocationScene(locationId: string, sceneId: string): Promise<void> {
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE location_id = $1 AND scene_id = $2 AND deleted_at IS NULL`,
    [locationId, sceneId]
  )
  if (existing.length > 0) return
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, location_id, scene_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, locationId, sceneId, ts, ts]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ location_id: locationId, scene_id: sceneId }))
}

export async function unlinkLocationScene(locationId: string, sceneId: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE location_id = $1 AND scene_id = $2 AND deleted_at IS NULL`,
    [locationId, sceneId]
  )
  if (rows.length === 0) return
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, rows[0]!.id]
  )
  await outboxPush(TABLE, rows[0]!.id as string, 'delete', null)
}
