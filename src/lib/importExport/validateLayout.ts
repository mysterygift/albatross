import {
  APF_MANIFEST_ENTRY_PATH,
  APF_V1_DATA_ENTRY_PATH,
} from '@/lib/importExport/constants'
import { ApfArchiveLayoutError } from '@/lib/importExport/errors'
import type { ApfManifestV1 } from '@/lib/importExport/manifest'
import { getManifestDataEntryPath } from '@/lib/importExport/manifest'

/** Normalize zip entry paths for comparison (forward slashes, no leading slash). */
export function normalizeApfZipEntryPath(entryPath: string): string {
  let s = entryPath.trim().replace(/\\/g, '/')
  while (s.startsWith('./')) s = s.slice(2)
  while (s.startsWith('/')) s = s.slice(1)
  return s
}

/**
 * Build a set of normalized entry paths from a zip listing (provided by a future zip driver).
 */
export function normalizeApfZipEntrySet(entries: Iterable<string>): ReadonlySet<string> {
  return new Set(Array.from(entries, normalizeApfZipEntryPath))
}

export type ApfArchiveLayoutValidation = {
  ok: true
  manifestPath: string
  dataPath: string
} | {
  ok: false
  error: ApfArchiveLayoutError
}

/**
 * Verifies required entries exist for a v1-style layout. Does not open or parse file contents.
 * @param entryPaths - normalized paths (use `normalizeApfZipEntrySet` on raw zip indices).
 * @param manifest - parsed manifest (optional `dataEntryPath` overrides default data file location).
 */
export function validateApfArchiveLayout(
  entryPaths: ReadonlySet<string>,
  manifest?: ApfManifestV1
): ApfArchiveLayoutValidation {
  const manifestPath = normalizeApfZipEntryPath(APF_MANIFEST_ENTRY_PATH)
  if (!entryPaths.has(manifestPath)) {
    return {
      ok: false,
      error: new ApfArchiveLayoutError(`Missing required archive entry: ${APF_MANIFEST_ENTRY_PATH}`),
    }
  }

  const dataPath = normalizeApfZipEntryPath(
    manifest ? getManifestDataEntryPath(manifest) : APF_V1_DATA_ENTRY_PATH
  )
  if (!entryPaths.has(dataPath)) {
    return {
      ok: false,
      error: new ApfArchiveLayoutError(`Missing required archive entry: ${dataPath}`),
    }
  }

  return { ok: true, manifestPath, dataPath }
}
