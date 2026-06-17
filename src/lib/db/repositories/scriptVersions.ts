import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRow } from '../outbox'
import { coerceBoolean } from '../sqlValueCoercion'
import type { ScriptVersion } from '../types'

const TABLE = 'script_versions'

type Stmt = { sql: string; bindValues: unknown[] }

function rowToScriptVersion(r: Record<string, unknown>): ScriptVersion {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    episode_id: (r.episode_id as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    version_label: (r.version_label as string | null) ?? null,
    revision_colour: (r.revision_colour as string | null) ?? null,
    is_locked: coerceBoolean(r.is_locked, false) ? 1 : 0,
    locked_pages_json: (r.locked_pages_json as string | null) ?? null,
    previous_script_version_id: (r.previous_script_version_id as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listScriptVersionsByProduction(productionId: string): Promise<ScriptVersion[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [productionId]
  )
  return rows.map(rowToScriptVersion)
}

export async function getScriptVersionById(id: string): Promise<ScriptVersion | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToScriptVersion(rows[0]!) : null
}

/** Newest non-deleted script version for a production + episode scope (null episode matches null only). */
export async function getLatestScriptVersionForScope(
  productionId: string,
  episodeId?: string | null
): Promise<ScriptVersion | null> {
  const db = await getDb()
  const scopedEpisode = episodeId?.trim() ? episodeId.trim() : null
  const rows = await db.select<Record<string, unknown>[]>(
    scopedEpisode
      ? `SELECT * FROM ${TABLE}
         WHERE production_id = $1 AND deleted_at IS NULL AND episode_id = $2
         ORDER BY created_at DESC, id DESC LIMIT 1`
      : `SELECT * FROM ${TABLE}
         WHERE production_id = $1 AND deleted_at IS NULL AND episode_id IS NULL
         ORDER BY created_at DESC, id DESC LIMIT 1`,
    scopedEpisode ? [productionId, scopedEpisode] : [productionId]
  )
  return rows.length ? rowToScriptVersion(rows[0]!) : null
}

export type CreateScriptVersionData = {
  production_id: string
  episode_id?: string | null
  title?: string | null
  version_label?: string | null
  revision_colour?: string | null
  is_locked?: boolean
  locked_pages_json?: string | null
  previous_script_version_id?: string | null
}

/**
 * Returns statements to create a script version for use in executeBatch (insert + outbox).
 * Does not include BEGIN/COMMIT. Caller provides id and ts.
 */
export function buildCreateScriptVersionStatements(
  id: string,
  ts: string,
  data: CreateScriptVersionData
): Stmt[] {
  const isLocked = data.is_locked ? 1 : 0
  const insert: Stmt = {
    sql: `INSERT INTO ${TABLE} (id, production_id, episode_id, title, version_label, revision_colour, is_locked, locked_pages_json, previous_script_version_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    bindValues: [
      id,
      data.production_id,
      data.episode_id ?? null,
      data.title ?? null,
      data.version_label ?? null,
      data.revision_colour ?? null,
      isLocked,
      data.locked_pages_json ?? null,
      data.previous_script_version_id ?? null,
      ts,
      ts,
    ],
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: id,
    operation: 'create',
    payloadJson: JSON.stringify({ ...data, id, is_locked: isLocked }),
  })
  return [insert, outbox]
}

export async function createScriptVersion(data: CreateScriptVersionData): Promise<ScriptVersion> {
  const id = uuid()
  const ts = now()
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildCreateScriptVersionStatements(id, ts, data),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  return (await getScriptVersionById(id))!
}

const EDITABLE_KEYS = [
  'episode_id',
  'title',
  'version_label',
  'revision_colour',
  'is_locked',
  'locked_pages_json',
  'previous_script_version_id',
] as const

export type UpdateScriptVersionPatch = {
  episode_id?: string | null
  title?: string | null
  version_label?: string | null
  revision_colour?: string | null
  is_locked?: boolean
  locked_pages_json?: string | null
  previous_script_version_id?: string | null
}

export async function updateScriptVersion(
  id: string,
  patch: UpdateScriptVersionPatch
): Promise<ScriptVersion> {
  const db = await getDb()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of EDITABLE_KEYS) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(k === 'is_locked' ? (patch.is_locked ? 1 : 0) : patch[k])
    }
  }
  if (cols.length === 0) {
    const existing = await getScriptVersionById(id)
    if (!existing) throw new Error(`Script version not found: ${id}`)
    return existing
  }
  const ts = now()
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(
    `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1} AND deleted_at IS NULL`,
    vals
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify(patch))
  return (await getScriptVersionById(id))!
}

export async function softDeleteScriptVersion(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(`UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`, [ts, ts, id])
  await outboxPush(TABLE, id, 'delete', null)
}
