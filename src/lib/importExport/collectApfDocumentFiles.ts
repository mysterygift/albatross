import { BaseDirectory, readFile } from '@tauri-apps/plugin-fs'

import { apfDocumentBundledZipPath } from '@/lib/importExport/documentPaths'
import type { ApfTableRow } from '@/lib/importExport/payload'

export type ApfBundledZipEntry = {
  /** Path inside the zip (forward slashes). */
  archivePath: string
  bytes: Uint8Array
  documentId: string
}

/**
 * Reads document bytes from app data (`file_path` relative to BaseDirectory.AppData).
 * Per format v1: missing files do not fail export; their ids are returned for `missingDocumentFileIds`.
 */
export async function collectApfDocumentBundledEntries(
  documentRows: ApfTableRow[]
): Promise<{ entries: ApfBundledZipEntry[]; missingDocumentFileIds: string[] }> {
  const entries: ApfBundledZipEntry[] = []
  const missingDocumentFileIds: string[] = []
  const seenArchivePaths = new Set<string>()

  for (const row of documentRows) {
    const id = row.id != null ? String(row.id) : ''
    const fileName = row.file_name != null ? String(row.file_name) : ''
    const relPath = row.file_path != null ? String(row.file_path) : ''
    if (!id || !fileName || !relPath) {
      if (id) missingDocumentFileIds.push(id)
      continue
    }

    const archivePath = apfDocumentBundledZipPath(id, fileName)
    if (seenArchivePaths.has(archivePath)) {
      continue
    }

    try {
      const bytes = await readFile(relPath, { baseDir: BaseDirectory.AppData })
      seenArchivePaths.add(archivePath)
      entries.push({ archivePath, bytes: new Uint8Array(bytes), documentId: id })
    } catch {
      missingDocumentFileIds.push(id)
    }
  }

  return { entries, missingDocumentFileIds }
}
