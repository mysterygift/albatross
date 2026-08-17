/**
 * Full-project import from `.apf` into SQLite + app-local document storage.
 * @see docs/project-import-export-format-v1.md
 * @see docs/DATABASE_LAYER.md — one `executeBatch(BEGIN, …, COMMIT)` inside `runInSerializedTransaction`.
 */
import { BaseDirectory, readFile, remove } from '@tauri-apps/plugin-fs'

import { executeBatch, getDb, runInSerializedTransaction } from '@/lib/db/client'
import { CURRENT_APF_FORMAT_VERSION } from '@/lib/importExport/constants'
import { ApfError, ApfImportDbError } from '@/lib/importExport/errors'
import { extractApfDocumentsForImport } from '@/lib/importExport/extractApfDocumentsForImport'
import type { ImportProductionResult } from '@/lib/importExport/importTypes'
import { planApfImportStatements } from '@/lib/importExport/planImportStatements'
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

    const insertStatements = await planApfImportStatements(importDb, dataForDb)
    dbBatchAttempted = true

    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, [
        { sql: 'BEGIN TRANSACTION', bindValues: [] },
        ...insertStatements,
        { sql: 'COMMIT', bindValues: [] },
      ])
    })

    const prodRow = dataForDb.tables.productions[0]!
    const productionName =
      typeof prodRow.name === 'string' ? prodRow.name : normalized.manifest.production.name

    return {
      ok: true,
      productionId,
      productionName,
      formatVersion: CURRENT_APF_FORMAT_VERSION,
      filesRestored,
      warnings,
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
