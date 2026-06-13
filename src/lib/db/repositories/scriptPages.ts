import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRow } from '../outbox'
import { coerceNumber } from '../sqlValueCoercion'
import type { ScriptPage } from '../types'

const TABLE = 'script_pages'

function rowToScriptPage(r: Record<string, unknown>): ScriptPage {
  return {
    id: r.id as string,
    script_version_id: r.script_version_id as string,
    scene_id: (r.scene_id as string | null) ?? null,
    page_number: (r.page_number as string | null) ?? null,
    page_index: coerceNumber(r.page_index, 0),
    content: (r.content as string | null) ?? null,
    eighths: r.eighths != null ? coerceNumber(r.eighths, 0) : null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listScriptPagesByScriptVersion(scriptVersionId: string): Promise<ScriptPage[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE script_version_id = $1 AND deleted_at IS NULL ORDER BY page_index`,
    [scriptVersionId]
  )
  return rows.map(rowToScriptPage)
}

export async function getScriptPageById(id: string): Promise<ScriptPage | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToScriptPage(rows[0]!) : null
}

export type CreateScriptPageData = {
  script_version_id: string
  scene_id?: string | null
  page_number?: string | null
  page_index: number
  content?: string | null
  eighths?: number | null
}

/**
 * Returns statements to create a script page for use in executeBatch.
 * Does not include BEGIN/COMMIT. Caller provides id and ts.
 */
export function buildCreateScriptPageStatements(
  id: string,
  ts: string,
  data: CreateScriptPageData
): Array<{ sql: string; bindValues: unknown[] }> {
  const insert = {
    sql: `INSERT INTO ${TABLE} (id, script_version_id, scene_id, page_number, page_index, content, eighths, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    bindValues: [
      id,
      data.script_version_id,
      data.scene_id ?? null,
      data.page_number ?? null,
      data.page_index,
      data.content ?? null,
      data.eighths ?? null,
      ts,
      ts,
    ],
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: id,
    operation: 'create',
    payloadJson: JSON.stringify({ ...data, id }),
  })
  return [insert, outbox]
}

export async function createScriptPage(data: CreateScriptPageData): Promise<ScriptPage> {
  const id = uuid()
  const ts = now()
  const statements = [
    { sql: 'BEGIN', bindValues: [] as unknown[] },
    ...buildCreateScriptPageStatements(id, ts, data),
    { sql: 'COMMIT', bindValues: [] as unknown[] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  return (await getScriptPageById(id))!
}

const EDITABLE_KEYS = ['scene_id', 'page_number', 'page_index', 'content', 'eighths'] as const

export type UpdateScriptPagePatch = {
  scene_id?: string | null
  page_number?: string | null
  page_index?: number
  content?: string | null
  eighths?: number | null
}

export async function updateScriptPage(
  id: string,
  patch: UpdateScriptPagePatch
): Promise<ScriptPage> {
  const db = await getDb()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of EDITABLE_KEYS) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(patch[k])
    }
  }
  if (cols.length === 0) {
    const existing = await getScriptPageById(id)
    if (!existing) throw new Error(`Script page not found: ${id}`)
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
  return (await getScriptPageById(id))!
}

export async function softDeleteScriptPage(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(`UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`, [ts, ts, id])
  await outboxPush(TABLE, id, 'delete', null)
}
