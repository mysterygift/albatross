import { CURRENT_APF_FORMAT_VERSION } from '@/lib/importExport/constants'
import { ApfInvalidDataError, ApfMigrationError } from '@/lib/importExport/errors'
import type { ApfManifestV1 } from '@/lib/importExport/manifest'
import type { ApfV1DataFile } from '@/lib/importExport/payload'
import { assertApfManifestDataFormatVersionAligned } from '@/lib/importExport/payload'

export type ApfMigrationContext = {
  manifest: ApfManifestV1
  data: ApfV1DataFile
}

/**
 * One step in the file-level migration chain (e.g. v1 → v2).
 * Implementations must update both `manifest.formatVersion` and `data.formatVersion` to `toVersion`.
 */
export type ApfFileMigrator = {
  fromVersion: number
  toVersion: number
  migrate: (ctx: ApfMigrationContext) => ApfMigrationContext
}

/**
 * Registered migrators for older `.apf` payloads. Empty while only format v1 exists.
 * Add `{ fromVersion: 1, toVersion: 2, migrate }` when introducing v2, and bump constants.
 */
export const APF_FILE_MIGRATIONS: ApfFileMigrator[] = []

/**
 * Applies sequential migrators until `manifest.formatVersion === CURRENT_APF_FORMAT_VERSION`.
 * Requires manifest and data versions to match before and after each step.
 */
export function migrateApfToCurrentVersion(ctx: ApfMigrationContext): ApfMigrationContext {
  let cur = ctx
  assertApfManifestDataFormatVersionAligned(cur.manifest.formatVersion, cur.data.formatVersion)

  let v = cur.manifest.formatVersion
  while (v < CURRENT_APF_FORMAT_VERSION) {
    const next = v + 1
    const migrator = APF_FILE_MIGRATIONS.find((m) => m.fromVersion === v && m.toVersion === next)
    if (!migrator) {
      throw new ApfMigrationError(
        `No file-level migration from formatVersion ${v} to ${next}. Update Albatross or obtain a compatible .apf.`,
        'MIGRATION_MISSING'
      )
    }
    cur = migrator.migrate(cur)
    assertApfManifestDataFormatVersionAligned(cur.manifest.formatVersion, cur.data.formatVersion)
    if (cur.manifest.formatVersion !== next) {
      throw new ApfMigrationError(
        `Migration ${v}→${next} did not set manifest.formatVersion to ${next}`,
        'MIGRATION_FAILED'
      )
    }
    if (cur.data.formatVersion !== next) {
      throw new ApfMigrationError(
        `Migration ${v}→${next} did not set data formatVersion to ${next}`,
        'MIGRATION_FAILED'
      )
    }
    v = next
  }

  if (cur.manifest.formatVersion !== CURRENT_APF_FORMAT_VERSION) {
    throw new ApfInvalidDataError(
      `After migrations, expected formatVersion ${CURRENT_APF_FORMAT_VERSION}, got ${cur.manifest.formatVersion}`
    )
  }
  return cur
}
