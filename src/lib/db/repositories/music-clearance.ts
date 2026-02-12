import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { MusicTrack, Clearance, MusicTrack as MT } from '../types'

const TRACK_TABLE = 'music_tracks'
const CLEAR_TABLE = 'clearances'
const CUE_TABLE = 'cue_sheets'

function rowToMusicTrack(r: Record<string, unknown>): MusicTrack {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    title: r.title as string,
    artist: r.artist as string | null,
    publisher_label: r.publisher_label as string | null,
    notes: r.notes as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToClearance(r: Record<string, unknown>): Clearance {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    type: r.type as Clearance['type'],
    item_id: r.item_id as string,
    status: r.status as string,
    requested_at: r.requested_at as string | null,
    granted_at: r.granted_at as string | null,
    expiry: r.expiry as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listMusicTracksByProduction(productionId: string): Promise<MT[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TRACK_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY title`,
    [productionId]
  )
  return rows.map(rowToMusicTrack)
}

export async function createMusicTrack(data: {
  production_id: string
  title: string
  artist?: string | null
  publisher_label?: string | null
  notes?: string | null
}): Promise<MT> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TRACK_TABLE} (id, production_id, title, artist, publisher_label, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, data.production_id, data.title, data.artist ?? null, data.publisher_label ?? null, data.notes ?? null, ts, ts]
  )
  await outboxPush(TRACK_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TRACK_TABLE} WHERE id = $1`, [id])
  return rowToMusicTrack(rows[0]!)
}

export async function updateMusicTrack(
  id: string,
  data: Partial<Pick<MT, 'title' | 'artist' | 'publisher_label' | 'notes'>>
): Promise<MT> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['title', 'artist', 'publisher_label', 'notes'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TRACK_TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToMusicTrack(rows[0]!) : (await listMusicTracksByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${TRACK_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(TRACK_TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TRACK_TABLE} WHERE id = $1`, [id])
  return rowToMusicTrack(rows[0]!)
}

export async function deleteMusicTrack(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TRACK_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TRACK_TABLE, id, 'delete', null)
}

// Clearances
export async function listClearancesByProduction(productionId: string): Promise<Clearance[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${CLEAR_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [productionId]
  )
  return rows.map(rowToClearance)
}

export async function createClearance(data: {
  production_id: string
  type: Clearance['type']
  item_id: string
  status?: string
  requested_at?: string | null
  granted_at?: string | null
  expiry?: string | null
}): Promise<Clearance> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${CLEAR_TABLE} (id, production_id, type, item_id, status, requested_at, granted_at, expiry, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      data.production_id,
      data.type,
      data.item_id,
      data.status ?? 'pending',
      data.requested_at ?? null,
      data.granted_at ?? null,
      data.expiry ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(CLEAR_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${CLEAR_TABLE} WHERE id = $1`, [id])
  return rowToClearance(rows[0]!)
}

export async function updateClearance(
  id: string,
  data: Partial<Pick<Clearance, 'status' | 'requested_at' | 'granted_at' | 'expiry'>>
): Promise<Clearance> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['status', 'requested_at', 'granted_at', 'expiry'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${CLEAR_TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToClearance(rows[0]!) : (await listClearancesByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${CLEAR_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(CLEAR_TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${CLEAR_TABLE} WHERE id = $1`, [id])
  return rowToClearance(rows[0]!)
}

// Cue sheets (store reference to generated document)
export async function createCueSheet(productionId: string, documentId: string): Promise<{ id: string }> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${CUE_TABLE} (id, production_id, generated_at, document_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, productionId, ts, documentId, ts, ts]
  )
  return { id }
}
