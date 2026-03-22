import { CURRENT_APF_FORMAT_VERSION } from '@/lib/importExport/constants'
import { assertApfImportableFormatVersion } from '@/lib/importExport/compatibility'
import { ApfInvalidDataError } from '@/lib/importExport/errors'
import { parseApfManifestJson, type ApfManifestV1 } from '@/lib/importExport/manifest'
import { migrateApfToCurrentVersion } from '@/lib/importExport/migrate'
import {
  assertApfManifestDataFormatVersionAligned,
  parseApfV1DataFileJson,
  type ApfV1DataFile,
} from '@/lib/importExport/payload'

/** Normalized package ready for DB import (`importProductionFromApf`). */
export type NormalizedApfProjectPackage = {
  manifest: ApfManifestV1
  data: ApfV1DataFile
}

/**
 * Parse JSON, enforce importable formatVersion range, align manifest/data versions, run file migrations.
 * Does not read zip bytes, validate zip layout, or touch the database.
 */
export function normalizeApfManifestAndData(
  manifestRaw: unknown,
  dataRaw: unknown
): NormalizedApfProjectPackage {
  const manifest = parseApfManifestJson(manifestRaw)
  assertApfImportableFormatVersion(manifest.formatVersion)

  const data = parseApfV1DataFileJson(dataRaw)
  assertApfManifestDataFormatVersionAligned(manifest.formatVersion, data.formatVersion)

  const migrated = migrateApfToCurrentVersion({ manifest, data })

  if (migrated.data.formatVersion !== CURRENT_APF_FORMAT_VERSION) {
    throw new ApfInvalidDataError(
      `Expected data formatVersion ${CURRENT_APF_FORMAT_VERSION} after migration, got ${migrated.data.formatVersion}`
    )
  }

  return migrated
}
