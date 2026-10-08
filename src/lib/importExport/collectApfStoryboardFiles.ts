import { BaseDirectory, readFile } from '@tauri-apps/plugin-fs'

import { apfStoryboardBundledZipPath } from '@/lib/importExport/documentPaths'
import type { ApfTableRow } from '@/lib/importExport/payload'

export type ApfBundledStoryboardEntry = {
  /** Path inside the zip (forward slashes). */
  archivePath: string
  bytes: Uint8Array
  imageId: string
}

/**
 * Reads storyboard image bytes from app data (`storage_key` relative to BaseDirectory.AppData).
 * Missing files do not fail export; their ids are returned so the manifest can list them.
 */
export async function collectApfStoryboardBundledEntries(
  imageRows: ApfTableRow[]
): Promise<{ entries: ApfBundledStoryboardEntry[]; missingImageIds: string[] }> {
  const entries: ApfBundledStoryboardEntry[] = []
  const missingImageIds: string[] = []

  for (const row of imageRows) {
    const id = row.id != null ? String(row.id) : ''
    const fileName = row.original_filename != null ? String(row.original_filename) : ''
    const storageKey = row.storage_key != null ? String(row.storage_key) : ''
    if (!id || !fileName || !storageKey) {
      if (id) missingImageIds.push(id)
      continue
    }

    try {
      const bytes = await readFile(storageKey, { baseDir: BaseDirectory.AppData })
      entries.push({
        archivePath: apfStoryboardBundledZipPath(id, fileName),
        bytes: new Uint8Array(bytes),
        imageId: id,
      })
    } catch {
      missingImageIds.push(id)
    }
  }

  return { entries, missingImageIds }
}
