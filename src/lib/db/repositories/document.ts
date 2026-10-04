import { getDb, now, uuid } from '../client'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type { Document } from '../types'

const TABLE = 'documents'

type Stmt = { sql: string; bindValues: unknown[] }

function rowToDocument(r: Record<string, unknown>): Document {
  return {
    id: r.id as string,
    production_id: r.production_id as string | null,
    entity_type: r.entity_type as string | null,
    entity_id: r.entity_id as string | null,
    file_name: r.file_name as string,
    file_path: r.file_path as string,
    mime_type: r.mime_type as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listDocumentsByProduction(productionId: string): Promise<Document[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [productionId]
  )
  return rows.map(rowToDocument)
}

export async function listDocumentsByEntity(
  entityType: string,
  entityId: string
): Promise<Document[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE entity_type = $1 AND entity_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [entityType, entityId]
  )
  return rows.map(rowToDocument)
}

export async function getDocumentById(id: string): Promise<Document | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToDocument(rows[0]!) : null
}

type DocumentInsert = Pick<Document, 'file_name' | 'file_path'> &
  Partial<Pick<Document, 'production_id' | 'entity_type' | 'entity_id' | 'mime_type'>>

/**
 * Returns statements to create a document for use in executeBatch (insert + outbox).
 * Does not include BEGIN/COMMIT. Caller provides id and ts. Use this when the document insert
 * must be coordinated atomically with other writes (e.g. an export record) in one transaction.
 */
export function buildCreateDocumentStatements(id: string, ts: string, data: DocumentInsert): Stmt[] {
  const insert: Stmt = {
    sql: `INSERT INTO ${TABLE} (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    bindValues: [
      id,
      data.production_id ?? null,
      data.entity_type ?? null,
      data.entity_id ?? null,
      data.file_name,
      data.file_path,
      data.mime_type ?? null,
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

/**
 * Returns statements to soft-delete a document for use in executeBatch (update + outbox).
 * Does not include BEGIN/COMMIT. Mirrors {@link deleteDocument} for atomic multi-write callers.
 */
export function buildDeleteDocumentStatements(id: string, ts: string): Stmt[] {
  return [
    {
      sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [ts, ts, id],
    },
    outboxStatementForRow({ entity: TABLE, entityId: id, operation: 'delete', payloadJson: null }),
  ]
}

export async function createDocument(data: DocumentInsert): Promise<Document> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.production_id ?? null,
      data.entity_type ?? null,
      data.entity_id ?? null,
      data.file_name,
      data.file_path,
      data.mime_type ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  return (await getDocumentById(id))!
}

/**
 * Looks up the stored file for a document (including soft-deleted rows) and whether any other
 * document row points at the same file. Used before a hard delete to decide whether the file
 * can be removed from disk.
 */
export async function getDocumentFileRef(
  id: string
): Promise<{ filePath: string; sharedWithOthers: boolean } | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT file_path FROM ${TABLE} WHERE id = $1`,
    [id]
  )
  if (rows.length === 0) return null
  const filePath = rows[0]!.file_path as string
  const others = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE file_path = $1 AND id <> $2 LIMIT 1`,
    [filePath, id]
  )
  return { filePath, sharedWithOthers: others.length > 0 }
}

/**
 * Permanently removes the document row (no `deleted_at` tombstone). Expense receipts that point
 * at it are removed too (their FK cascades, so they are deleted explicitly to get an outbox entry);
 * other linked rows (call sheets, cue sheets, sides exports, etc.) are cleared by the table's
 * `SET NULL` FK rules. Does not touch the file on disk; see `hardDeleteDocument` in
 * `@/lib/documents/hardDeleteDocument`.
 */
export async function hardDeleteDocumentRow(id: string): Promise<void> {
  const db = await getDb()
  const receipts = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM expense_receipts WHERE document_id = $1`,
    [id]
  )
  if (receipts.length > 0) {
    await db.execute(`DELETE FROM expense_receipts WHERE document_id = $1`, [id])
  }
  await db.execute(`DELETE FROM ${TABLE} WHERE id = $1`, [id])
  for (const r of receipts) await outboxPush('expense_receipts', r.id as string, 'delete', null)
  await outboxPush(TABLE, id, 'delete', null)
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
