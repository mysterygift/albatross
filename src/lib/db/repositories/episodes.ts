import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import {
  outboxPush,
  outboxStatementForRow,
  outboxStatementForRows,
  type OutboxRow,
} from '../outbox'
import type { Episode } from '../types'

const TABLE = 'episodes'

function rowToEpisode(r: Record<string, unknown>): Episode {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    sort_order: Number(r.sort_order),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listEpisodesByProduction(productionId: string): Promise<Episode[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC`,
    [productionId]
  )
  return rows.map(rowToEpisode)
}

export type InsertEpisodeInput = {
  production_id: string
  name: string
  sort_order: number
}

/** Insert a single episode row (outbox). Prefer `createEpisodeInTransaction` when batching. */
export async function createEpisode(data: InsertEpisodeInput): Promise<Episode> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, data.production_id, data.name, data.sort_order, ts, ts]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id, created_at: ts, updated_at: ts }))
  return (await getEpisodeById(id))!
}

export async function getEpisodeById(id: string): Promise<Episode | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToEpisode(rows[0]!) : null
}

/** Active-only episode for a production (for ownership checks). */
export async function getActiveEpisodeByIdForProduction(
  productionId: string,
  episodeId: string
): Promise<Episode | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND production_id = $2 AND deleted_at IS NULL`,
    [episodeId, productionId]
  )
  return rows.length ? rowToEpisode(rows[0]!) : null
}

/** Episode by id scoped to production, including archived (`deleted_at` set). For scene labels / edit UI. */
export async function getEpisodeByIdForProductionIncludeArchived(
  productionId: string,
  episodeId: string
): Promise<Episode | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND production_id = $2`,
    [episodeId, productionId]
  )
  return rows.length ? rowToEpisode(rows[0]!) : null
}

/** Settings/admin list: active and archived rows, stable canonical order. */
export async function listEpisodesForProductionManagement(productionId: string): Promise<Episode[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 ORDER BY sort_order ASC, id ASC`,
    [productionId]
  )
  return rows.map(rowToEpisode)
}

export async function countActiveEpisodesByProduction(productionId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL`,
    [productionId]
  )
  return Number(rows[0]?.n ?? 0)
}

/** Highest `sort_order` among active episodes, or -1 if none. */
export async function getMaxActiveEpisodeSortOrder(productionId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ mx: number | null }[]>(
    `SELECT MAX(sort_order) AS mx FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL`,
    [productionId]
  )
  const mx = rows[0]?.mx
  return mx == null ? -1 : Number(mx)
}

export async function updateEpisodeNameForProduction(
  productionId: string,
  episodeId: string,
  name: string
): Promise<Episode> {
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE id = $1 AND production_id = $2 AND deleted_at IS NULL`,
    [episodeId, productionId]
  )
  if (existing.length === 0) throw new Error('Episode not found')
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET name = $1, updated_at = $2 WHERE id = $3 AND production_id = $4 AND deleted_at IS NULL`,
    [name, ts, episodeId, productionId]
  )
  await outboxPush(TABLE, episodeId, 'update', JSON.stringify({ name, updated_at: ts }))
  const out = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [episodeId])
  return rowToEpisode(out[0]!)
}

/**
 * Reassign `sort_order` to 0..n-1 for active episodes. `orderedActiveIds` must list each active
 * episode id for this production exactly once.
 */
export async function reorderActiveEpisodes(productionId: string, orderedActiveIds: string[]): Promise<void> {
  if (orderedActiveIds.length === 0) return
  const ts = now()
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const batch: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN', bindValues: [] }]
    orderedActiveIds.forEach((id, index) => {
      batch.push({
        sql: `UPDATE ${TABLE} SET sort_order = $1, updated_at = $2 WHERE id = $3 AND production_id = $4 AND deleted_at IS NULL`,
        bindValues: [index, ts, id, productionId],
      })
      batch.push(
        outboxStatementForRow({
          entity: TABLE,
          entityId: id,
          operation: 'update',
          payloadJson: JSON.stringify({ sort_order: index, updated_at: ts }),
        })
      )
    })
    batch.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, batch)
  })
}

const SCENES_TABLE = 'scenes'
const MUSIC_TRACKS_TABLE = 'music_tracks'
const DELIVERABLES_TABLE = 'deliverables'

export type EpisodeActiveReferenceCounts = {
  scenes: number
  musicTracks: number
  deliverables: number
}

/** Live rows only (`deleted_at IS NULL` on referencing tables). Central place to extend when new `episode_id` FKs are added. */
export async function countActiveReferencesToEpisode(episodeId: string): Promise<EpisodeActiveReferenceCounts> {
  const db = await getDb()
  const [sc] = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM ${SCENES_TABLE} WHERE episode_id = $1 AND deleted_at IS NULL`,
    [episodeId]
  )
  const [mt] = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM ${MUSIC_TRACKS_TABLE} WHERE episode_id = $1 AND deleted_at IS NULL`,
    [episodeId]
  )
  const [del] = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM ${DELIVERABLES_TABLE} WHERE episode_id = $1 AND deleted_at IS NULL`,
    [episodeId]
  )
  return {
    scenes: Number(sc?.n ?? 0),
    musicTracks: Number(mt?.n ?? 0),
    deliverables: Number(del?.n ?? 0),
  }
}

/**
 * Permanently delete an episode (active or archived). Clears `episode_id` on scenes, music_tracks,
 * and deliverables for this production that referenced it so rows can be reassigned in the UI.
 * Active episodes: requires at least one other active episode. One transaction + outbox per touched row.
 */
export async function deleteEpisodeAndClearReferencesForProduction(
  productionId: string,
  episodeId: string
): Promise<void> {
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    const ts = now()

    const epMeta = await conn.select<{ deleted_at: string | null }[]>(
      `SELECT deleted_at FROM ${TABLE} WHERE id = $1 AND production_id = $2`,
      [episodeId, productionId]
    )
    if (epMeta.length === 0) throw new Error('Episode not found')

    const deletedAt = epMeta[0]!.deleted_at
    const isActive = deletedAt == null || (typeof deletedAt === 'string' && deletedAt.trim() === '')
    if (isActive) {
      const [cnt] = await conn.select<{ n: number }[]>(
        `SELECT COUNT(*) AS n FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL`,
        [productionId]
      )
      if (Number(cnt?.n ?? 0) <= 1) throw new Error('Cannot delete the last active episode.')
    }

    const scenes = await conn.select<{ id: string }[]>(
      `SELECT id FROM ${SCENES_TABLE} WHERE production_id = $1 AND episode_id = $2 AND deleted_at IS NULL`,
      [productionId, episodeId]
    )
    const tracks = await conn.select<{ id: string }[]>(
      `SELECT id FROM ${MUSIC_TRACKS_TABLE} WHERE production_id = $1 AND episode_id = $2 AND deleted_at IS NULL`,
      [productionId, episodeId]
    )
    const deliverables = await conn.select<{ id: string }[]>(
      `SELECT id FROM ${DELIVERABLES_TABLE} WHERE production_id = $1 AND episode_id = $2 AND deleted_at IS NULL`,
      [productionId, episodeId]
    )

    const statements: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN', bindValues: [] }]

    statements.push({
      sql: `UPDATE ${SCENES_TABLE} SET episode_id = NULL, updated_at = $1 WHERE production_id = $2 AND episode_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, productionId, episodeId],
    })
    statements.push({
      sql: `UPDATE ${MUSIC_TRACKS_TABLE} SET episode_id = NULL, updated_at = $1 WHERE production_id = $2 AND episode_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, productionId, episodeId],
    })
    statements.push({
      sql: `UPDATE ${DELIVERABLES_TABLE} SET episode_id = NULL, updated_at = $1 WHERE production_id = $2 AND episode_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, productionId, episodeId],
    })

    const sceneOutbox: OutboxRow[] = scenes.map((r) => ({
      entity: SCENES_TABLE,
      entityId: r.id,
      operation: 'update',
      payloadJson: JSON.stringify({ episode_id: null, updated_at: ts }),
    }))
    const trackOutbox: OutboxRow[] = tracks.map((r) => ({
      entity: MUSIC_TRACKS_TABLE,
      entityId: r.id,
      operation: 'update',
      payloadJson: JSON.stringify({ episode_id: null, updated_at: ts }),
    }))
    const delOutbox: OutboxRow[] = deliverables.map((r) => ({
      entity: DELIVERABLES_TABLE,
      entityId: r.id,
      operation: 'update',
      payloadJson: JSON.stringify({ episode_id: null, updated_at: ts }),
    }))

    for (const batch of [sceneOutbox, trackOutbox, delOutbox]) {
      const o = outboxStatementForRows(batch)
      if (o) statements.push(o)
    }

    statements.push({
      sql: `DELETE FROM ${TABLE} WHERE id = $1 AND production_id = $2`,
      bindValues: [episodeId, productionId],
    })
    statements.push(
      outboxStatementForRow({
        entity: TABLE,
        entityId: episodeId,
        operation: 'delete',
        payloadJson: null,
      })
    )
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(conn, statements)
  })
}

/** @deprecated Prefer {@link deleteEpisodeAndClearReferencesForProduction}; kept for call sites. */
export async function hardDeleteArchivedEpisodeForProduction(
  productionId: string,
  episodeId: string
): Promise<void> {
  await deleteEpisodeAndClearReferencesForProduction(productionId, episodeId)
}

/** Soft-archive: set `deleted_at` (episode lifecycle, not hard delete). */
export async function archiveEpisodeForProduction(productionId: string, episodeId: string): Promise<void> {
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE id = $1 AND production_id = $2 AND deleted_at IS NULL`,
    [episodeId, productionId]
  )
  if (existing.length === 0) throw new Error('Episode not found')
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND production_id = $4 AND deleted_at IS NULL`,
    [ts, ts, episodeId, productionId]
  )
  await outboxPush(TABLE, episodeId, 'update', JSON.stringify({ deleted_at: ts, updated_at: ts }))
}

/** Statement + bind values for INSERT (use inside executeBatch after production exists). */
export function episodeInsertStatement(params: {
  id: string
  production_id: string
  name: string
  sort_order: number
  ts: string
}): { sql: string; bindValues: unknown[] } {
  return {
    sql: `INSERT INTO ${TABLE} (id, production_id, name, sort_order, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    bindValues: [params.id, params.production_id, params.name, params.sort_order, params.ts, params.ts],
  }
}

export function episodeOutboxCreate(episodeId: string, payload: Record<string, unknown>) {
  return outboxStatementForRow({
    entity: TABLE,
    entityId: episodeId,
    operation: 'create',
    payloadJson: JSON.stringify(payload),
  })
}
