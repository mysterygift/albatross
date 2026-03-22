/**
 * Full-project export to `.apf` (ZIP + manifest + data/production.json + files/documents/...).
 */
import { writeFile } from '@tauri-apps/plugin-fs'

import { getProductionById } from '@/lib/db/repositories/production'
import { buildApfZipBytes } from '@/lib/importExport/buildApfArchive'
import { buildApfExportManifest } from '@/lib/importExport/buildExportManifest'
import { buildApfV1ExportDataFile, countTableRows } from '@/lib/importExport/buildExportPayload'
import { collectApfDocumentBundledEntries } from '@/lib/importExport/collectApfDocumentFiles'
import { ApfExportError } from '@/lib/importExport/errors'
import { loadApfV1ProductionTables } from '@/lib/importExport/exportLoadProductionData'
import { parseApfManifestJson } from '@/lib/importExport/manifest'
import { parseApfV1DataFileJson } from '@/lib/importExport/payload'

function validateExportArtifacts(
  manifest: ReturnType<typeof buildApfExportManifest>,
  dataFile: ReturnType<typeof buildApfV1ExportDataFile>
): void {
  parseApfManifestJson(JSON.parse(JSON.stringify(manifest)))
  parseApfV1DataFileJson(JSON.parse(JSON.stringify(dataFile)))
}

/**
 * Exports one production to a `.apf` file at `outputPath` (absolute path; same convention as
 * `writeFile` with a dialog-selected path — see `writeFileInDirectory`).
 *
 * - Overwrites `outputPath` if it already exists.
 * - Does not create parent directories (caller or OS dialog typically ensures they exist).
 * - Missing document files: rows stay in JSON; ids listed in `manifest.export.missingDocumentFileIds`.
 */
export async function exportProductionAsApf(productionId: string, outputPath: string): Promise<void> {
  const prod = await getProductionById(productionId)
  if (!prod) {
    throw new ApfExportError('Production not found or deleted')
  }

  const tables = await loadApfV1ProductionTables(productionId)
  if (tables.productions.length !== 1) {
    throw new ApfExportError('Expected exactly one active production row in export set')
  }

  const dataFile = buildApfV1ExportDataFile(tables)
  const exportedAtIso = new Date().toISOString()
  const tableRowCounts = countTableRows(tables)

  const { entries, missingDocumentFileIds } = await collectApfDocumentBundledEntries(tables.documents)
  const bundledDocumentIds = entries.map((e) => e.documentId).sort()

  const manifest = buildApfExportManifest({
    productionId: prod.id,
    productionName: prod.name,
    slug: prod.slug,
    exportedAtIso,
    tableRowCounts,
    bundledDocumentIds,
    missingDocumentFileIds,
  })

  validateExportArtifacts(manifest, dataFile)

  const zipBytes = buildApfZipBytes(manifest, dataFile, entries)

  await writeFile(outputPath, zipBytes)
}
