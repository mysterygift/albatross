import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Document } from '../types'

const TABLE = 'documents'

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

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
