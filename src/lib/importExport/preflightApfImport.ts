import { getDb } from '@/lib/db/client'
import {
  ApfImportConflictError,
  ApfImportPreflightError,
} from '@/lib/importExport/errors'
import type { ApfManifestV1 } from '@/lib/importExport/manifest'
import type { ApfV1DataFile } from '@/lib/importExport/payload'
import { assertManifestMatchesProductionPayload } from '@/lib/importExport/readApfArchive'

/**
 * DB + payload checks before file extraction or any import write.
 */
export async function preflightApfImportDb(params: {
  manifest: ApfManifestV1
  data: ApfV1DataFile
}): Promise<void> {
  const { manifest, data } = params
  const prows = data.tables.productions
  if (prows.length !== 1) {
    throw new ApfImportPreflightError(
      `Expected exactly one row in tables.productions, got ${prows.length}`
    )
  }
  const prod = prows[0]!
  assertManifestMatchesProductionPayload(manifest, prod)

  const productionId = String(prod.id)
  const slug =
    prod.slug != null && String(prod.slug).length > 0
      ? String(prod.slug)
      : manifest.production.slug != null
        ? String(manifest.production.slug)
        : null

  const db = await getDb()

  const existingById = await db.select<{ id: string }[]>(
    `SELECT id FROM productions WHERE id = $1 LIMIT 1`,
    [productionId]
  )
  if (existingById.length > 0) {
    throw new ApfImportConflictError(
      'production_id',
      `A production with id ${productionId} already exists. Remove it or use a different package (import does not merge or overwrite).`
    )
  }

  if (slug) {
    const slugRow = await db.select<{ id: string }[]>(
      `SELECT id FROM productions WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
      [slug]
    )
    if (slugRow.length > 0) {
      throw new ApfImportConflictError(
        'slug',
        `Another active production already uses slug "${slug}". Resolve the slug conflict before importing.`
      )
    }
  }
}
