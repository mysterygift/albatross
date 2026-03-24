import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { MusicTrack, Clearance, MusicTrack as MT } from '../types'
import { getProductionById } from './production'
import { getActiveEpisodeByIdForProduction, getEpisodeByIdForProductionIncludeArchived } from './episodes'

const TRACK_TABLE = 'music_tracks'
const CLEAR_TABLE = 'clearances'
const CUE_TABLE = 'cue_sheets'

function rowToMusicTrack(r: Record<string, unknown>): MusicTrack {
  const eid = r.episode_id
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    episode_id:
      eid == null || (typeof eid === 'string' && eid.trim() === '') ? null : (eid as string),
    title: r.title as string,
    artist: r.artist as string | null,
    publisher_label: r.publisher_label as string | null,
    notes: r.notes as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function normalizeEpisodeIdForWrite(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = String(raw).trim()
  return t === '' ? null : t
}

async function assertMusicTrackEpisodeAllowed(productionId: string, episodeId: string | null): Promise<void> {
  const prod = await getProductionById(productionId)
  if (!prod) throw new Error('Production not found')
  const hasEpisode = episodeId != null
  if (!prod.is_episodic && hasEpisode) {
    throw new Error('Episode cannot be set for non-episodic productions.')
  }
  if (prod.is_episodic && hasEpisode) {
    const ep = await getActiveEpisodeByIdForProduction(productionId, episodeId!)
    if (!ep) throw new Error('Episode not found or archived.')
  }
}

export type MusicTrackScopeLabel =
  | { kind: 'project_wide' }
  | { kind: 'episode'; name: string; archived: boolean }

/** Display label for list/detail; uses include-archived read so archived episodes stay readable. */
export async function resolveMusicTrackScopeLabel(
  productionId: string,
  episodeId: string | null
): Promise<MusicTrackScopeLabel> {
  if (episodeId == null || episodeId.trim() === '') return { kind: 'project_wide' }
  const ep = await getEpisodeByIdForProductionIncludeArchived(productionId, episodeId)
  if (!ep) return { kind: 'episode', name: 'Unknown episode', archived: false }
  return { kind: 'episode', name: ep.name, archived: ep.deleted_at != null }
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

export type ListMusicTracksOptions = {
  filter?: 'all' | 'project_wide' | 'episode'
  /** Required when filter === 'episode'. */
  episodeId?: string
}

export async function listMusicTracksByProduction(
  productionId: string,
  options?: ListMusicTracksOptions
): Promise<MT[]> {
  const db = await getDb()
  const filter = options?.filter ?? 'all'
  const clauses = [`production_id = $1`, `deleted_at IS NULL`]
  const bind: unknown[] = [productionId]
  let i = 2
  if (filter === 'project_wide') {
    clauses.push(`episode_id IS NULL`)
  } else if (filter === 'episode') {
    const eid = options?.episodeId?.trim()
    if (!eid) {
      throw new Error('episodeId is required when filtering by episode.')
    }
    clauses.push(`episode_id = $${i++}`)
    bind.push(eid)
  }
  const sql = `SELECT * FROM ${TRACK_TABLE} WHERE ${clauses.join(' AND ')} ORDER BY title`
  const rows = await db.select<Record<string, unknown>[]>(sql, bind)
  return rows.map(rowToMusicTrack)
}

export async function createMusicTrack(data: {
  production_id: string
  title: string
  artist?: string | null
  publisher_label?: string | null
  notes?: string | null
  episode_id?: string | null
}): Promise<MT> {
  const episodeId = normalizeEpisodeIdForWrite(data.episode_id)
  await assertMusicTrackEpisodeAllowed(data.production_id, episodeId)
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TRACK_TABLE} (id, production_id, episode_id, title, artist, publisher_label, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.production_id,
      episodeId,
      data.title,
      data.artist ?? null,
      data.publisher_label ?? null,
      data.notes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TRACK_TABLE, id, 'create', JSON.stringify({ ...data, id, episode_id: episodeId }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TRACK_TABLE} WHERE id = $1`, [id])
  return rowToMusicTrack(rows[0]!)
}

const MUSIC_TRACK_UPDATE_KEYS = ['title', 'artist', 'publisher_label', 'notes', 'episode_id'] as const

export async function updateMusicTrack(
  id: string,
  data: Partial<Pick<MT, (typeof MUSIC_TRACK_UPDATE_KEYS)[number]>>
): Promise<MT> {
  const db = await getDb()
  const existingRows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TRACK_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  if (!existingRows.length) throw new Error('Music track not found')
  const existing = rowToMusicTrack(existingRows[0]!)

  if (data.episode_id !== undefined) {
    const nextEp = normalizeEpisodeIdForWrite(data.episode_id)
    if (nextEp !== existing.episode_id) {
      await assertMusicTrackEpisodeAllowed(existing.production_id, nextEp)
    }
  }

  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of MUSIC_TRACK_UPDATE_KEYS) {
    if (data[k] !== undefined) {
      const v = k === 'episode_id' ? normalizeEpisodeIdForWrite(data.episode_id as string | null) : data[k]
      cols.push(`${k} = $${i++}`)
      vals.push(v)
    }
  }
  if (cols.length === 0) {
    return existing
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
