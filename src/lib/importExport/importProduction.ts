/**
 * Full-project import from `.apf` into SQLite + app-local document storage.
 * @see DOCS/import-export.md
 * @see DOCS/database.md — one `executeBatch(BEGIN, …, COMMIT)` inside `runInSerializedTransaction`.
 */
import { BaseDirectory, readFile, remove } from '@tauri-apps/plugin-fs'

import { getCurrentSessionUserId } from '@/lib/auth/currentSessionUser'
import { executeBatch, getDb, runInSerializedTransaction } from '@/lib/db/client'
import { projectMembershipInsertStatement } from '@/lib/db/repositories/projectMemberships'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { CURRENT_APF_FORMAT_VERSION } from '@/lib/importExport/constants'
import { ApfError, ApfImportDbError } from '@/lib/importExport/errors'
import { extractApfDocumentsForImport } from '@/lib/importExport/extractApfDocumentsForImport'
import { extractApfStoryboardImagesForImport } from '@/lib/importExport/extractApfStoryboardImagesForImport'
import type { ImportProductionResult } from '@/lib/importExport/importTypes'
import { planApfImportStatements, type ImportSqlStatement } from '@/lib/importExport/planImportStatements'
import { isClientEncryptionEnabled } from '@/lib/security/dataEncryptionContext'
import { requireSensitiveDataAccess } from '@/lib/security/sensitiveDataAccess'
import { encryptLocationFields, encryptPersonFields, encryptVendorFields } from '@/lib/security/sensitiveEntityFieldCrypto'
import { preflightApfImportDb } from '@/lib/importExport/preflightApfImport'
import type { ApfV1DataFile } from '@/lib/importExport/payload'
import { parseApfArchiveBytes } from '@/lib/importExport/readApfArchive'

function cloneDataFile(data: ApfV1DataFile): ApfV1DataFile {
  return JSON.parse(JSON.stringify(data)) as ApfV1DataFile
}

async function removeWrittenPaths(relPaths: string[]): Promise<void> {
  for (const p of relPaths) {
    try {
      await remove(p, { baseDir: BaseDirectory.AppData })
    } catch {
      // best-effort cleanup after failed import
    }
  }
}

/**
 * When a soft-deleted production with this id exists, returns the app-relative paths of its attachment and
 * storyboard files (to remove once it is purged); otherwise `null`.
 */
async function listSoftDeletedProductionFiles(
  db: Pick<DatabaseAdapter, 'select'>,
  productionId: string
): Promise<string[] | null> {
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM productions WHERE id = $1 AND deleted_at IS NOT NULL LIMIT 1`,
    [productionId]
  )
  if (rows.length === 0) return null
  const docs = await db.select<{ file_path: string | null }[]>(
    `SELECT file_path FROM documents WHERE production_id = $1`,
    [productionId]
  )
  const images = await db.select<{ storage_key: string | null }[]>(
    `SELECT storage_key FROM storyboard_images WHERE production_id = $1`,
    [productionId]
  )
  return [...docs.map((d) => d.file_path), ...images.map((i) => i.storage_key)].filter(
    (p): p is string => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !p.includes('..')
  )
}

function toUint8Array(raw: Uint8Array): Uint8Array {
  return new Uint8Array(raw)
}

/** OS-opened `.apf` paths need an explicit fs scope grant (Tauri); dialog picks are already scoped. */
async function grantApfReadScopeIfNeeded(path: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke<void>('grant_read_access_for_apf', { path })
  } catch {
    // Non-Tauri dev, or command unavailable — `readFile` may still work for in-scope paths.
  }
}

/**
 * Imports a production package from disk. `apfPath` must be an absolute path acceptable to the
 * Tauri fs plugin (same convention as export `writeFile`).
 *
 * All-or-nothing: on failure, no DB rows from this import remain and extracted attachment files
 * written under `attachments/<productionId>/` for this attempt are removed.
 */
export async function importProductionFromApf(apfPath: string): Promise<ImportProductionResult> {
  await requireSensitiveDataAccess()
  const writtenRelPaths: string[] = []
  let dbBatchAttempted = false

  try {
    await grantApfReadScopeIfNeeded(apfPath.trim())
    const rawBytes = await readFile(apfPath)
    const archiveBytes = toUint8Array(rawBytes)

    const { index, normalized } = parseApfArchiveBytes(archiveBytes)

    await preflightApfImportDb({
      manifest: normalized.manifest,
      data: normalized.data,
    })

    const productionId = normalized.manifest.production.id
    const dataForDb = cloneDataFile(normalized.data)
    const importDb = await getDb()
    if (await isClientEncryptionEnabled(importDb)) {
      dataForDb.tables.people = await Promise.all(dataForDb.tables.people.map(encryptPersonFields))
      dataForDb.tables.locations = await Promise.all(dataForDb.tables.locations.map(encryptLocationFields))
      dataForDb.tables.vendors = await Promise.all(dataForDb.tables.vendors.map(encryptVendorFields))
    }

    const { filesRestored, warnings } = await extractApfDocumentsForImport({
      zipIndex: index,
      manifest: normalized.manifest,
      productionId,
      documentRows: dataForDb.tables.documents,
      writtenRelPaths,
    })

    const storyboard = await extractApfStoryboardImagesForImport({
      zipIndex: index,
      manifest: normalized.manifest,
      productionId,
      imageRows: dataForDb.tables.storyboard_images,
      writtenRelPaths,
    })

    const insertStatements = await planApfImportStatements(importDb, dataForDb)

    // Ids are preserved, so a soft-deleted copy of this production must go first. Its rows cascade away with it.
    const staleFiles = await listSoftDeletedProductionFiles(importDb, productionId)
    const purgeStatements: ImportSqlStatement[] = staleFiles
      ? [{ sql: 'DELETE FROM productions WHERE id = $1 AND deleted_at IS NOT NULL', bindValues: [productionId] }]
      : []

    // The importing user administers what they import; otherwise a non-admin could not see it.
    const importerId = await getCurrentSessionUserId()
    const membershipStatements: ImportSqlStatement[] = importerId
      ? [
          projectMembershipInsertStatement({
            id: crypto.randomUUID(),
            productionId,
            userId: importerId,
            accessLevel: 'administrator',
            ts: new Date().toISOString(),
          }),
        ]
      : []
    dbBatchAttempted = true

    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, [
        { sql: 'BEGIN TRANSACTION', bindValues: [] },
        ...purgeStatements,
        ...insertStatements,
        ...membershipStatements,
        { sql: 'COMMIT', bindValues: [] },
      ])
    })

    if (staleFiles) {
      // Files the new import just wrote share paths with the old ones; only remove what it did not write.
      const written = new Set(writtenRelPaths)
      await removeWrittenPaths(staleFiles.filter((p) => !written.has(p)))
    }

    const prodRow = dataForDb.tables.productions[0]!
    const productionName =
      typeof prodRow.name === 'string' ? prodRow.name : normalized.manifest.production.name

    return {
      ok: true,
      productionId,
      productionName,
      formatVersion: CURRENT_APF_FORMAT_VERSION,
      filesRestored: filesRestored + storyboard.filesRestored,
      warnings: [...warnings, ...storyboard.warnings],
    }
  } catch (e) {
    await removeWrittenPaths(writtenRelPaths)

    if (e instanceof ApfError) {
      return { ok: false, error: e }
    }
    if (dbBatchAttempted && e instanceof Error) {
      return { ok: false, error: new ApfImportDbError(`Database import failed: ${e.message}`) }
    }
    if (e instanceof Error) {
      return { ok: false, error: e }
    }
    return { ok: false, error: new Error(String(e)) }
  }
}
