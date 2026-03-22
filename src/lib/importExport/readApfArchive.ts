import { strFromU8, unzipSync } from 'fflate'

import {
  ApfArchiveLayoutError,
  ApfImportPreflightError,
  ApfNotZipPayloadError,
  ApfZipCorruptError,
} from '@/lib/importExport/errors'
import { parseApfManifestJson, type ApfManifestV1 } from '@/lib/importExport/manifest'
import { normalizeApfManifestAndData, type NormalizedApfProjectPackage } from '@/lib/importExport/pipeline'
import { isLikelyZipPayload } from '@/lib/importExport/sniff'
import { normalizeApfZipEntryPath, normalizeApfZipEntrySet, validateApfArchiveLayout } from '@/lib/importExport/validateLayout'

export type ApfZipIndex = ReadonlyMap<string, Uint8Array>

/**
 * Build a map of normalized entry path → file bytes (skips empty directory placeholders).
 */
export function buildApfZipIndex(unzipped: Record<string, Uint8Array>): ApfZipIndex {
  const m = new Map<string, Uint8Array>()
  for (const [rawPath, bytes] of Object.entries(unzipped)) {
    const norm = normalizeApfZipEntryPath(rawPath)
    if (!norm || norm.endsWith('/')) continue
    m.set(norm, bytes)
  }
  return m
}

function parseJsonUtf8(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes, false))
  } catch {
    throw new ApfArchiveLayoutError(`Invalid JSON in ${label}`)
  }
}

export type ParsedApfArchive = {
  index: ApfZipIndex
  normalized: NormalizedApfProjectPackage
}

/**
 * Unzip bytes, validate required entries, parse + migrate manifest and data payload.
 */
export function parseApfArchiveBytes(archiveBytes: Uint8Array): ParsedApfArchive {
  if (!isLikelyZipPayload(archiveBytes)) {
    throw new ApfNotZipPayloadError()
  }

  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(archiveBytes)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new ApfZipCorruptError(`Corrupt or unreadable ZIP archive: ${msg}`)
  }

  const index = buildApfZipIndex(unzipped)
  const pathSet = normalizeApfZipEntrySet(index.keys())

  const layoutNoManifest = validateApfArchiveLayout(pathSet)
  if (!layoutNoManifest.ok) {
    throw layoutNoManifest.error
  }

  const manifestBytes = index.get(layoutNoManifest.manifestPath)
  if (!manifestBytes?.length) {
    throw new ApfArchiveLayoutError('manifest.json is empty or missing')
  }

  const manifestRaw = parseJsonUtf8(manifestBytes, 'manifest.json')
  const manifest = parseApfManifestJson(manifestRaw)

  const layoutWithManifest = validateApfArchiveLayout(pathSet, manifest)
  if (!layoutWithManifest.ok) {
    throw layoutWithManifest.error
  }

  const dataBytes = index.get(layoutWithManifest.dataPath)
  if (!dataBytes?.length) {
    throw new ApfArchiveLayoutError(`${layoutWithManifest.dataPath} is empty or missing`)
  }

  const dataRaw = parseJsonUtf8(dataBytes, layoutWithManifest.dataPath)
  const normalized = normalizeApfManifestAndData(manifest, dataRaw)

  return { index, normalized }
}

export function assertManifestMatchesProductionPayload(
  manifest: ApfManifestV1,
  productionRow: Record<string, unknown> | undefined
): void {
  if (!productionRow || typeof productionRow.id !== 'string') {
    throw new ApfImportPreflightError('data/production.json must include exactly one productions row with string id')
  }
  if (manifest.production.id !== productionRow.id) {
    throw new ApfImportPreflightError(
      `manifest.production.id (${manifest.production.id}) does not match tables.productions[0].id (${productionRow.id})`
    )
  }
}
