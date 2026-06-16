/**
 * Persist generated or uploaded bytes into app-managed attachment storage and record
 * a documents row atomically (mirrors sidesExportService pattern).
 */
import { BaseDirectory, mkdir, remove, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'

import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '@/lib/db/client'
import {
  buildCreateDocumentStatements,
  getDocumentById,
} from '@/lib/db/repositories/document'
import type { Document } from '@/lib/db/types'

const ATTACHMENTS_DIR = 'attachments'

type Stmt = { sql: string; bindValues: unknown[] }

export type PersistProductionDocumentArgs = {
  productionId: string
  fileName: string
  bytes: Uint8Array | string
  mimeType: string | null
  entityType: string | null
  entityId?: string | null
  /** When true, bytes is written as UTF-8 text (CSV, etc.). */
  isText?: boolean
  /** Optional pre-assigned id for coordinating with junction tables in the same transaction. */
  documentId?: string
  /** Additional SQL statements (insert/update) run in the same transaction after the document insert. */
  extraStatements?: Stmt[]
}

export type PersistProductionDocumentResult = {
  documentId: string
  relativePath: string
  document: Document
}

function buildRelativePath(productionId: string, documentId: string, fileName: string): string {
  return `${ATTACHMENTS_DIR}/${productionId}/${documentId}-${fileName}`
}

/**
 * Write file bytes to app storage and insert a documents row in one transaction.
 * Removes the file if the DB write fails.
 */
export async function persistProductionDocument(
  args: PersistProductionDocumentArgs
): Promise<PersistProductionDocumentResult> {
  const documentId = args.documentId ?? uuid()
  const ts = now()
  const relativePath = buildRelativePath(args.productionId, documentId, args.fileName)

  await mkdir(`${ATTACHMENTS_DIR}/${args.productionId}`, {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  })

  if (args.isText && typeof args.bytes === 'string') {
    await writeTextFile(relativePath, args.bytes, { baseDir: BaseDirectory.AppData })
  } else {
    const bytes =
      typeof args.bytes === 'string' ? new TextEncoder().encode(args.bytes) : args.bytes
    await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppData })
  }

  try {
    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, [
        { sql: 'BEGIN', bindValues: [] },
        ...buildCreateDocumentStatements(documentId, ts, {
          production_id: args.productionId,
          entity_type: args.entityType,
          entity_id: args.entityId ?? null,
          file_name: args.fileName,
          file_path: relativePath,
          mime_type: args.mimeType,
        }),
        ...(args.extraStatements ?? []),
        { sql: 'COMMIT', bindValues: [] },
      ])
    })
  } catch (error) {
    try {
      await remove(relativePath, { baseDir: BaseDirectory.AppData })
    } catch {
      // Best-effort cleanup; surface the original DB error.
    }
    throw error
  }

  const document = (await getDocumentById(documentId))!
  return { documentId, relativePath, document }
}

/** Query key fragment for invalidating documents after persist. */
export function documentsQueryKey(productionId: string) {
  return ['documents', productionId] as const
}
