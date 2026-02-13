import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { ShootDay, Scene, Shot, StripboardItem } from '../types'

const DAY_TABLE = 'shoot_days'
const SCENE_TABLE = 'scenes'
const SHOT_TABLE = 'shots'
const STRIP_TABLE = 'stripboard_items'

function rowToShootDay(r: Record<string, unknown>): ShootDay {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shoot_date: r.shoot_date as string,
    day_number: r.day_number as number | null,
    call_time: r.call_time as string | null,
    wrap_time: (r.wrap_time as string | null) ?? null,
    notes: r.notes as string | null,
    weather_manual: r.weather_manual as string | null,
    meal_times_json: (r.meal_times_json as string | null) ?? null,
    weather_json: (r.weather_json as string | null) ?? null,
    parking_base_address: (r.parking_base_address as string | null) ?? null,
    special_notes: (r.special_notes as string | null) ?? null,
    hospital_name: (r.hospital_name as string | null) ?? null,
    hospital_address: (r.hospital_address as string | null) ?? null,
    police_station_name: (r.police_station_name as string | null) ?? null,
    police_station_address: (r.police_station_address as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToScene(r: Record<string, unknown>): Scene {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    scene_number: r.scene_number as string,
    heading: r.heading as string | null,
    title: (r.title as string | null) ?? null,
    description: r.description as string | null,
    int_ext: (r.int_ext as Scene['int_ext']) ?? null,
    day_night: (r.day_night as Scene['day_night']) ?? null,
    page_eighths: (r.page_eighths as number | null) ?? null,
    location_id: (r.location_id as string | null) ?? null,
    duration_minutes: (r.duration_minutes as number | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToShot(r: Record<string, unknown>): Shot {
  return {
    id: r.id as string,
    scene_id: r.scene_id as string,
    shot_number: r.shot_number as string,
    description: r.description as string | null,
    shot_description: (r.shot_description as string | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    action_description: (r.action_description as string | null) ?? null,
    shot_size: (r.shot_size as Shot['shot_size']) ?? null,
    support: (r.support as string | null) ?? null,
    lens: (r.lens as string | null) ?? null,
    duration_seconds: (r.duration_seconds as number | null) ?? null,
    estimated_shoot_minutes: (r.estimated_shoot_minutes as number | null) ?? null,
    camera_movement: (r.camera_movement as Shot['camera_movement']) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToStripboardItem(r: Record<string, unknown>): StripboardItem {
  return {
    id: r.id as string,
    shoot_day_id: r.shoot_day_id as string,
    scene_id: r.scene_id as string,
    sort_order: r.sort_order as number,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

// Shoot days
export async function listShootDaysByProduction(productionId: string): Promise<ShootDay[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${DAY_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY shoot_date`,
    [productionId]
  )
  return rows.map(rowToShootDay)
}

export async function getShootDayById(id: string): Promise<ShootDay | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${DAY_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToShootDay(rows[0]!) : null
}

export async function createShootDay(data: {
  production_id: string
  shoot_date: string
  day_number?: number | null
  call_time?: string | null
  wrap_time?: string | null
  notes?: string | null
  weather_manual?: string | null
  meal_times_json?: string | null
  weather_json?: string | null
  parking_base_address?: string | null
  special_notes?: string | null
  hospital_name?: string | null
  hospital_address?: string | null
  police_station_name?: string | null
  police_station_address?: string | null
}): Promise<ShootDay> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${DAY_TABLE} (id, production_id, shoot_date, day_number, call_time, notes, weather_manual, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.production_id,
      data.shoot_date,
      data.day_number ?? null,
      data.call_time ?? null,
      data.notes ?? null,
      data.weather_manual ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(DAY_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  if (data.wrap_time != null || data.meal_times_json != null || data.weather_json != null ||
      data.parking_base_address != null || data.special_notes != null || data.hospital_name != null ||
      data.hospital_address != null || data.police_station_name != null || data.police_station_address != null) {
    await updateShootDay(id, {
      wrap_time: data.wrap_time ?? undefined,
      meal_times_json: data.meal_times_json ?? undefined,
      weather_json: data.weather_json ?? undefined,
      parking_base_address: data.parking_base_address ?? undefined,
      special_notes: data.special_notes ?? undefined,
      hospital_name: data.hospital_name ?? undefined,
      hospital_address: data.hospital_address ?? undefined,
      police_station_name: data.police_station_name ?? undefined,
      police_station_address: data.police_station_address ?? undefined,
    })
  }
  const day = await getShootDayById(id)
  if (!day) throw new Error('Shoot day not found after create')
  return day
}

const SHOOT_DAY_UPDATE_KEYS = [
  'shoot_date', 'day_number', 'call_time', 'wrap_time', 'notes', 'weather_manual',
  'meal_times_json', 'weather_json', 'parking_base_address', 'special_notes',
  'hospital_name', 'hospital_address', 'police_station_name', 'police_station_address',
] as const

export async function updateShootDay(
  id: string,
  data: Partial<Pick<ShootDay, (typeof SHOOT_DAY_UPDATE_KEYS)[number]>>
): Promise<ShootDay> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of SHOOT_DAY_UPDATE_KEYS) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) return (await getShootDayById(id))!
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${DAY_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(DAY_TABLE, id, 'update', JSON.stringify(data))
  return (await getShootDayById(id))!
}

export async function deleteShootDay(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${DAY_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(DAY_TABLE, id, 'delete', null)
}

// Scenes
export async function listScenesByProduction(productionId: string): Promise<Scene[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SCENE_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY scene_number`,
    [productionId]
  )
  return rows.map(rowToScene)
}

export async function getSceneById(id: string): Promise<Scene | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SCENE_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToScene(rows[0]!) : null
}

export async function createScene(data: {
  production_id: string
  scene_number: string
  heading?: string | null
  title?: string | null
  description?: string | null
  int_ext?: Scene['int_ext']
  day_night?: Scene['day_night']
  page_eighths?: number | null
  location_id?: string | null
  duration_minutes?: number | null
}): Promise<Scene> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${SCENE_TABLE} (id, production_id, scene_number, heading, description, title, int_ext, day_night, page_eighths, location_id, duration_minutes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      data.production_id,
      data.scene_number,
      data.heading ?? null,
      data.description ?? null,
      data.title ?? null,
      data.int_ext ?? null,
      data.day_night ?? null,
      data.page_eighths ?? null,
      data.location_id ?? null,
      data.duration_minutes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(SCENE_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  return (await getSceneById(id))!
}

const SCENE_UPDATE_KEYS = [
  'scene_number', 'heading', 'title', 'description', 'int_ext', 'day_night', 'page_eighths', 'location_id', 'duration_minutes',
] as const

export async function updateScene(
  id: string,
  data: Partial<Pick<Scene, (typeof SCENE_UPDATE_KEYS)[number]>>
): Promise<Scene> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of SCENE_UPDATE_KEYS) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) return (await getSceneById(id))!
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${SCENE_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(SCENE_TABLE, id, 'update', JSON.stringify(data))
  return (await getSceneById(id))!
}

export async function deleteScene(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${SCENE_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(SCENE_TABLE, id, 'delete', null)
}

// Shots
export async function listShotsByScene(sceneId: string): Promise<Shot[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SHOT_TABLE} WHERE scene_id = $1 AND deleted_at IS NULL ORDER BY shot_number`,
    [sceneId]
  )
  return rows.map(rowToShot)
}

/** All shots for a production (for Shot List and stripboard unscheduled). */
export async function listShotsByProduction(productionId: string): Promise<Shot[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT s.* FROM ${SHOT_TABLE} s INNER JOIN ${SCENE_TABLE} sc ON sc.id = s.scene_id AND sc.production_id = $1 AND sc.deleted_at IS NULL WHERE s.deleted_at IS NULL ORDER BY sc.scene_number, s.shot_number`,
    [productionId]
  )
  return rows.map(rowToShot)
}

export async function getShotById(id: string): Promise<Shot | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SHOT_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToShot(rows[0]!) : null
}

/** Per-shot estimated minutes (shot.estimated_shoot_minutes). Used for stripboard day totals. */
export async function getEstimatedShootMinutesByShotIds(shotIds: string[]): Promise<Map<string, number>> {
  if (shotIds.length === 0) return new Map()
  const db = await getDb()
  const placeholders = shotIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id, COALESCE(estimated_shoot_minutes, 0) AS mins FROM ${SHOT_TABLE} WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    shotIds
  )
  const map = new Map<string, number>()
  for (const r of rows) {
    const id = r.id as string
    const mins = Number(r.mins) || 0
    map.set(id, mins)
  }
  return map
}

/** Sum of estimated_shoot_minutes per scene (time to get shots in practice). Used for stripboard day duration. */
export async function getEstimatedShootMinutesBySceneIds(sceneIds: string[]): Promise<Map<string, number>> {
  if (sceneIds.length === 0) return new Map()
  const db = await getDb()
  const placeholders = sceneIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT scene_id, COALESCE(SUM(estimated_shoot_minutes), 0) AS total FROM ${SHOT_TABLE}
     WHERE scene_id IN (${placeholders}) AND deleted_at IS NULL GROUP BY scene_id`,
    sceneIds
  )
  const map = new Map<string, number>()
  for (const r of rows) {
    const id = r.scene_id as string
    const total = Number(r.total) || 0
    map.set(id, total)
  }
  return map
}

export async function createShot(data: {
  scene_id: string
  shot_number: string
  description?: string | null
  shot_description?: string | null
  subject?: string | null
  action_description?: string | null
  shot_size?: Shot['shot_size']
  support?: string | null
  lens?: string | null
  duration_seconds?: number | null
  estimated_shoot_minutes?: number | null
  camera_movement?: Shot['camera_movement']
  notes?: string | null
}): Promise<Shot> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${SHOT_TABLE} (id, scene_id, shot_number, description, shot_description, subject, action_description, shot_size, support, lens, duration_seconds, estimated_shoot_minutes, camera_movement, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      data.scene_id,
      data.shot_number,
      data.description ?? null,
      data.shot_description ?? null,
      data.subject ?? null,
      data.action_description ?? null,
      data.shot_size ?? null,
      data.support ?? null,
      data.lens ?? null,
      data.duration_seconds ?? null,
      data.estimated_shoot_minutes ?? null,
      data.camera_movement ?? null,
      data.notes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(SHOT_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${SHOT_TABLE} WHERE id = $1`, [id])
  return rowToShot(rows[0]!)
}

const SHOT_UPDATE_KEYS = [
  'shot_number', 'description', 'shot_description', 'subject', 'action_description', 'shot_size',
  'support', 'lens', 'duration_seconds', 'estimated_shoot_minutes', 'camera_movement', 'notes',
] as const

export async function updateShot(
  id: string,
  data: Partial<Pick<Shot, (typeof SHOT_UPDATE_KEYS)[number]>>
): Promise<Shot> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of SHOT_UPDATE_KEYS) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${SHOT_TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToShot(rows[0]!) : (await listShotsByScene(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${SHOT_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(SHOT_TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${SHOT_TABLE} WHERE id = $1`, [id])
  return rowToShot(rows[0]!)
}

export async function deleteShot(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${SHOT_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(SHOT_TABLE, id, 'delete', null)
}

// Stripboard
export async function listStripboardByShootDay(shootDayId: string): Promise<StripboardItem[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${STRIP_TABLE} WHERE shoot_day_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
    [shootDayId]
  )
  return rows.map(rowToStripboardItem)
}

export async function setStripboardOrder(
  shootDayId: string,
  sceneIdsInOrder: string[]
): Promise<void> {
  const db = await getDb()
  const ts = now()
  for (let i = 0; i < sceneIdsInOrder.length; i++) {
    const sceneId = sceneIdsInOrder[i]!
    const existing = await db.select<Record<string, unknown>[]>(
      `SELECT id FROM ${STRIP_TABLE} WHERE shoot_day_id = $1 AND scene_id = $2 AND deleted_at IS NULL`,
      [shootDayId, sceneId]
    )
    if (existing.length > 0) {
      await db.execute(
        `UPDATE ${STRIP_TABLE} SET sort_order = $1, updated_at = $2 WHERE id = $3`,
        [i, ts, existing[0]!.id]
      )
    } else {
      const id = uuid()
      await db.execute(
        `INSERT INTO ${STRIP_TABLE} (id, shoot_day_id, scene_id, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, shootDayId, sceneId, i, ts, ts]
      )
      await outboxPush(STRIP_TABLE, id, 'create', JSON.stringify({ shoot_day_id: shootDayId, scene_id: sceneId, sort_order: i }))
    }
  }
}

export async function addSceneToStripboard(shootDayId: string, sceneId: string, sortOrder: number): Promise<StripboardItem> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${STRIP_TABLE} (id, shoot_day_id, scene_id, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, shootDayId, sceneId, sortOrder, ts, ts]
  )
  await outboxPush(STRIP_TABLE, id, 'create', JSON.stringify({ shoot_day_id: shootDayId, scene_id: sceneId, sort_order: sortOrder }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${STRIP_TABLE} WHERE id = $1`, [id])
  return rowToStripboardItem(rows[0]!)
}

export async function removeSceneFromStripboard(shootDayId: string, sceneId: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${STRIP_TABLE} WHERE shoot_day_id = $1 AND scene_id = $2 AND deleted_at IS NULL`,
    [shootDayId, sceneId]
  )
  if (rows.length === 0) return
  const ts = now()
  await db.execute(
    `UPDATE ${STRIP_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, rows[0]!.id]
  )
  await outboxPush(STRIP_TABLE, rows[0]!.id as string, 'delete', null)
}
