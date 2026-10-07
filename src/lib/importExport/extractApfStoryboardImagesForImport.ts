import { BaseDirectory, mkdir, writeFile } from '@tauri-apps/plugin-fs'

import { ApfImportIoError, ApfImportPreflightError } from '@/lib/importExport/errors'
import { apfSanitizeDocumentBasename, apfStoryboardBundledZipPathForManifest } from '@/lib/importExport/documentPaths'
import type { ApfManifestV1 } from '@/lib/importExport/manifest'
import type { ApfTableRow } from '@/lib/importExport/payload'
import { normalizeApfZipEntryPath } from '@/lib/importExport/validateLayout'

import type { ApfZipIndex } from '@/lib/importExport/readApfArchive'

const STORYBOARD_ROOT = 'storyboards'

function assertSafeId(label: string, id: string): void {
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) {
    throw new ApfImportPreflightError(`Invalid ${label} for import: ${id}`)
  }
}

/**
 * App-relative path for an imported storyboard image. Never taken from the file: `storage_key` in a package is
 * rewritten so it cannot point outside `storyboards/<productionId>/`.
 */
export function importedStoryboardImageRelativePath(
  productionId: string,
  shotId: string,
  imageId: string,
  fileName: string
): string {
  return `${STORYBOARD_ROOT}/${productionId}/shots/${shotId}/imported/${imageId}-${apfSanitizeDocumentBasename(fileName)}`
}

export type ExtractApfStoryboardImagesResult = {
  filesRestored: number
  warnings: string[]
}

/**
 * Writes bundled storyboard image bytes into app data and sets `storage_key` on each image row.
 * Rows without a zip entry keep the canonical target key but no file is written.
 */
export async function extractApfStoryboardImagesForImport(params: {
  zipIndex: ApfZipIndex
  manifest: ApfManifestV1
  productionId: string
  imageRows: ApfTableRow[]
  /** Relative paths under `BaseDirectory.AppData` written during this call (for rollback). */
  writtenRelPaths: string[]
}): Promise<ExtractApfStoryboardImagesResult> {
  const { zipIndex, manifest, productionId, imageRows, writtenRelPaths } = params

  let filesRestored = 0
  const warnings: string[] = []
  const madeDirs = new Set<string>()

  for (const row of imageRows) {
    const id = row.id != null ? String(row.id) : ''
    const shotId = row.shot_id != null ? String(row.shot_id) : ''
    const fileName = row.original_filename != null ? String(row.original_filename) : ''
    if (!id || !shotId || !fileName) {
      warnings.push('Skipped storyboard image row missing id, shot_id or original_filename')
      continue
    }
    assertSafeId('storyboard_images.id', id)
    assertSafeId('storyboard_images.shot_id', shotId)

    const relLocal = importedStoryboardImageRelativePath(productionId, shotId, id, fileName)
    row.storage_key = relLocal

    const zipRel = normalizeApfZipEntryPath(apfStoryboardBundledZipPathForManifest(manifest, id, fileName))
    const bytes = zipIndex.get(zipRel)
    if (!bytes?.length) {
      warnings.push(`No bundled bytes in archive for storyboard image ${id}; storage_key set but image file missing`)
      continue
    }

    try {
      const dir = relLocal.split('/').slice(0, -1).join('/')
      if (!madeDirs.has(dir)) {
        await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true })
        madeDirs.add(dir)
      }
      await writeFile(relLocal, bytes, { baseDir: BaseDirectory.AppData })
      writtenRelPaths.push(relLocal)
      filesRestored += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new ApfImportIoError(`Failed to write storyboard image "${relLocal}": ${msg}`)
    }
  }

  return { filesRestored, warnings }
}
