import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Deliverable, TechnicalSpec } from '../types'
import { getProductionById } from './production'
import { getActiveEpisodeByIdForProduction, getEpisodeByIdForProductionIncludeArchived } from './episodes'

const DEL_TABLE = 'deliverables'
const SPEC_TABLE = 'technical_specs'

function normalizeEpisodeIdForWrite(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = String(raw).trim()
  return t === '' ? null : t
}

/** Enforces episodic rules when setting deliverable episode scope (create/update/template). */
export async function assertDeliverableEpisodeAllowed(
  productionId: string,
  episodeId: string | null
): Promise<void> {
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

export type DeliverableScopeLabel =
  | { kind: 'project_wide' }
  | { kind: 'episode'; name: string; archived: boolean }

/** Display label for list/detail; include-archived read so archived episodes stay readable. */
export async function resolveDeliverableScopeLabel(
  productionId: string,
  episodeId: string | null
): Promise<DeliverableScopeLabel> {
  if (episodeId == null || episodeId.trim() === '') return { kind: 'project_wide' }
  const ep = await getEpisodeByIdForProductionIncludeArchived(productionId, episodeId)
  if (!ep) return { kind: 'episode', name: 'Unknown episode', archived: false }
  return { kind: 'episode', name: ep.name, archived: ep.deleted_at != null }
}

function rowToDeliverable(r: Record<string, unknown>): Deliverable {
  const eid = r.episode_id
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    episode_id:
      eid == null || (typeof eid === 'string' && eid.trim() === '') ? null : (eid as string),
    name: r.name as string,
    due_date: r.due_date as string | null,
    status: r.status as string,
    recipient: (r.recipient ?? null) as string | null,
    delivery_method: (r.delivery_method ?? null) as string | null,
    delivered_by: (r.delivered_by ?? null) as string | null,
    delivered_at: (r.delivered_at ?? null) as string | null,
    approval_status: (r.approval_status ?? null) as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToTechnicalSpec(r: Record<string, unknown>): TechnicalSpec {
  return {
    id: r.id as string,
    deliverable_id: r.deliverable_id as string,
    resolution: r.resolution as string | null,
    codec: r.codec as string | null,
    audio: r.audio as string | null,
    captions: r.captions as string | null,
    aspect_ratio: r.aspect_ratio as string | null,
    platform: r.platform as string | null,
    notes: r.notes as string | null,
    bitrate: (r.bitrate ?? null) as string | null,
    subtitles: (r.subtitles ?? null) as string | null,
    graphics: (r.graphics ?? null) as string | null,
    language: (r.language ?? null) as string | null,
    audio_mix: (r.audio_mix ?? null) as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export type ListDeliverablesOptions = {
  filter?: 'all' | 'project_wide' | 'episode'
  /** Required when filter === 'episode'. */
  episodeId?: string
}

export async function listDeliverablesByProduction(
  productionId: string,
  options?: ListDeliverablesOptions
): Promise<Deliverable[]> {
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
  const sql = `SELECT * FROM ${DEL_TABLE} WHERE ${clauses.join(' AND ')} ORDER BY due_date, name`
  const rows = await db.select<Record<string, unknown>[]>(sql, bind)
  return rows.map(rowToDeliverable)
}

export async function createDeliverable(data: {
  production_id: string
  name: string
  due_date?: string | null
  status?: string
  recipient?: string | null
  delivery_method?: string | null
  delivered_by?: string | null
  delivered_at?: string | null
  approval_status?: string | null
  episode_id?: string | null
}): Promise<Deliverable> {
  const episodeId = normalizeEpisodeIdForWrite(data.episode_id)
  await assertDeliverableEpisodeAllowed(data.production_id, episodeId)
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${DEL_TABLE} (id, production_id, episode_id, name, due_date, status, recipient, delivery_method, delivered_by, delivered_at, approval_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      data.production_id,
      episodeId,
      data.name,
      data.due_date ?? null,
      data.status ?? 'not_started',
      data.recipient ?? null,
      data.delivery_method ?? null,
      data.delivered_by ?? null,
      data.delivered_at ?? null,
      data.approval_status ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(DEL_TABLE, id, 'create', JSON.stringify({ ...data, id, episode_id: episodeId }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${DEL_TABLE} WHERE id = $1`, [id])
  return rowToDeliverable(rows[0]!)
}

const DELIVERABLE_UPDATE_KEYS = [
  'name',
  'due_date',
  'status',
  'recipient',
  'delivery_method',
  'delivered_by',
  'delivered_at',
  'approval_status',
  'episode_id',
] as const

export async function updateDeliverable(
  id: string,
  data: Partial<Pick<Deliverable, (typeof DELIVERABLE_UPDATE_KEYS)[number]>>
): Promise<Deliverable> {
  const db = await getDb()
  if (data.episode_id !== undefined) {
    const existingRows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${DEL_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (!existingRows.length) throw new Error('Deliverable not found')
    const existing = rowToDeliverable(existingRows[0]!)
    const nextEp = normalizeEpisodeIdForWrite(data.episode_id)
    await assertDeliverableEpisodeAllowed(existing.production_id, nextEp)
  }
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of DELIVERABLE_UPDATE_KEYS) {
    if (data[k] !== undefined) {
      const v = k === 'episode_id' ? normalizeEpisodeIdForWrite(data.episode_id as string | null) : data[k]
      cols.push(`${k} = $${i++}`)
      vals.push(v)
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${DEL_TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToDeliverable(rows[0]!) : (await listDeliverablesByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${DEL_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(DEL_TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${DEL_TABLE} WHERE id = $1`, [id])
  return rowToDeliverable(rows[0]!)
}

export async function deleteDeliverable(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${DEL_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(DEL_TABLE, id, 'delete', null)
}

// Technical specs
export async function getTechnicalSpecByDeliverable(deliverableId: string): Promise<TechnicalSpec | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SPEC_TABLE} WHERE deliverable_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [deliverableId]
  )
  return rows.length ? rowToTechnicalSpec(rows[0]!) : null
}

/** Returns specs for the given deliverable IDs (at most one per deliverable). Used for overview tables. */
export async function getTechnicalSpecsByDeliverableIds(deliverableIds: string[]): Promise<TechnicalSpec[]> {
  if (deliverableIds.length === 0) return []
  const db = await getDb()
  const placeholders = deliverableIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SPEC_TABLE} WHERE deliverable_id IN (${placeholders}) AND deleted_at IS NULL`,
    deliverableIds
  )
  return rows.map((r) => rowToTechnicalSpec(r))
}

export async function upsertTechnicalSpec(
  deliverableId: string,
  data: Partial<Omit<TechnicalSpec, 'id' | 'deliverable_id' | 'created_at' | 'updated_at' | 'deleted_at'>>
): Promise<TechnicalSpec> {
  const db = await getDb()
  const existing = await getTechnicalSpecByDeliverable(deliverableId)
  const ts = now()
  const SPEC_UPDATE_KEYS = [
    'resolution',
    'codec',
    'audio',
    'captions',
    'aspect_ratio',
    'platform',
    'notes',
    'bitrate',
    'subtitles',
    'graphics',
    'language',
    'audio_mix',
  ] as const
  if (existing) {
    const cols: string[] = []
    const vals: unknown[] = []
    let i = 1
    for (const k of SPEC_UPDATE_KEYS) {
      if (data[k] !== undefined) {
        cols.push(`${k} = $${i++}`)
        vals.push(data[k])
      }
    }
    if (cols.length > 0) {
      cols.push(`updated_at = $${i}`)
      vals.push(ts, existing.id)
      await db.execute(`UPDATE ${SPEC_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
      await outboxPush(SPEC_TABLE, existing.id, 'update', JSON.stringify(data))
    }
    return (await getTechnicalSpecByDeliverable(deliverableId))!
  }
  const id = uuid()
  await db.execute(
    `INSERT INTO ${SPEC_TABLE} (id, deliverable_id, resolution, codec, audio, captions, aspect_ratio, platform, notes, bitrate, subtitles, graphics, language, audio_mix, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      deliverableId,
      data.resolution ?? null,
      data.codec ?? null,
      data.audio ?? null,
      data.captions ?? null,
      data.aspect_ratio ?? null,
      data.platform ?? null,
      data.notes ?? null,
      data.bitrate ?? null,
      data.subtitles ?? null,
      data.graphics ?? null,
      data.language ?? null,
      data.audio_mix ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(SPEC_TABLE, id, 'create', JSON.stringify({ deliverable_id: deliverableId, ...data }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${SPEC_TABLE} WHERE id = $1`, [id])
  return rowToTechnicalSpec(rows[0]!)
}
