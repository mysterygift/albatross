import { BaseDirectory, mkdir, writeFile } from '@tauri-apps/plugin-fs'

import {
  ApfImportIoError,
  ApfImportPreflightError,
} from '@/lib/importExport/errors'
import { apfDocumentBundledZipPathForManifest, apfSanitizeDocumentBasename } from '@/lib/importExport/documentPaths'
import type { ApfManifestV1 } from '@/lib/importExport/manifest'
import type { ApfTableRow } from '@/lib/importExport/payload'
import { normalizeApfZipEntryPath } from '@/lib/importExport/validateLayout'

import type { ApfZipIndex } from '@/lib/importExport/readApfArchive'

const ATTACHMENTS = 'attachments'

function assertSafeDocumentId(id: string): void {
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) {
    throw new ApfImportPreflightError(`Invalid documents.id for import: ${id}`)
  }
}

/**
 * App-relative path for an imported document (matches duplicate-production layout).
 */
export function importedDocumentRelativePath(productionId: string, documentId: string, fileName: string): string {
  const safe = apfSanitizeDocumentBasename(fileName)
  return `${ATTACHMENTS}/${productionId}/${documentId}-${safe}`
}

export type ExtractApfDocumentsResult = {
  filesRestored: number
  warnings: string[]
}

/**
 * Writes bundled bytes into app data and sets `file_path` on each document row.
 * Rows without a zip entry keep the canonical target path but no file is written (same as duplicate when source file is missing).
 */
export async function extractApfDocumentsForImport(params: {
  zipIndex: ApfZipIndex
  manifest: ApfManifestV1
  productionId: string
  documentRows: ApfTableRow[]
  /** Relative paths under `BaseDirectory.AppData` written during this call (for rollback). */
  writtenRelPaths: string[]
}): Promise<ExtractApfDocumentsResult> {
  const { zipIndex, manifest, productionId, documentRows, writtenRelPaths } = params

  await mkdir(`${ATTACHMENTS}/${productionId}`, { baseDir: BaseDirectory.AppData, recursive: true })

  let filesRestored = 0
  const warnings: string[] = []
  const seenWritePaths = new Set<string>()

  for (const row of documentRows) {
    const id = row.id != null ? String(row.id) : ''
    const fileName = row.file_name != null ? String(row.file_name) : ''
    if (!id || !fileName) {
      warnings.push('Skipped document row missing id or file_name')
      continue
    }
    assertSafeDocumentId(id)

    const relLocal = importedDocumentRelativePath(productionId, id, fileName)
    row.file_path = relLocal

    const zipRel = normalizeApfZipEntryPath(apfDocumentBundledZipPathForManifest(manifest, id, fileName))
    const bytes = zipIndex.get(zipRel)
    if (!bytes?.length) {
      warnings.push(`No bundled bytes in archive for document ${id}; file_path set but attachment missing`)
      continue
    }

    if (seenWritePaths.has(relLocal)) {
      continue
    }
    seenWritePaths.add(relLocal)

    try {
      await writeFile(relLocal, bytes, { baseDir: BaseDirectory.AppData })
      writtenRelPaths.push(relLocal)
      filesRestored += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new ApfImportIoError(`Failed to write document file "${relLocal}": ${msg}`)
    }
  }

  return { filesRestored, warnings }
}
