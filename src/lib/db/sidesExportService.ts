/**
 * SB7 — Sides PDF export & document storage.
 *
 * Orchestrates a single sides export: render the SB6 draft model to a PDF, store the file in the
 * app-managed attachment storage, and record a `shoot_day_sides_exports` row linked to the stored
 * document. The PDF is generated before any DB/file write so a generation failure leaves zero rows;
 * the document and export inserts are coordinated in one transaction (per DATABASE_LAYER.md), and a
 * failed DB write removes the orphaned file.
 *
 * Read-only with respect to script data: this never mutates script sections, ranges, or versions.
 * New exports are always inserted as new rows, so previous exports are preserved (the document
 * workflow has no version-replacement path).
 */
import { BaseDirectory, mkdir, remove, writeFile } from '@tauri-apps/plugin-fs'

import { buildSidesPdfData, generateSidesPdf } from '@/lib/pdf/sides'
import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'

import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from './client'
import { buildCreateDocumentStatements, getDocumentById } from './repositories/document'
import { getProductionById } from './repositories/production'
import { listScriptVersionsByProduction } from './repositories/scriptVersions'
import {
  buildCreateSidesExportStatements,
  getSidesExportById,
  listSidesExportsByShootDay,
} from './repositories/sidesExports'
import {
  analyzeExportCoverage,
  getBlockingExportIssues,
} from './coverageAnalysisService'
import type {
  SidesBuilderSource,
  SidesDraftModel,
  SidesFilters,
  SidesValidationCode,
} from './sidesBuilderService'
import type { Document, ShootDaySidesExport } from './types'

const ATTACHMENTS_DIR = 'attachments'
const SIDES_ENTITY_TYPE = 'sides_export'

/** Structured `metadata_json` payload stored on a sides export row. */
export type SidesExportMetadata = {
  selectedSectionIds: string[]
  filters: SidesFilters
  warnings: Array<{ code: SidesValidationCode; message: string; blocking: boolean }>
  scriptVersionIds: string[]
}

export type ExportShootDaySidesArgs = {
  source: SidesBuilderSource
  model: SidesDraftModel
  filters: SidesFilters
  /** Optional override; otherwise resolved from the production record. */
  productionTitle?: string
  /** Optional fixed timestamp for deterministic output (tests). */
  generatedAt?: Date
}

export type ExportShootDaySidesResult = {
  document: Document
  exportRecord: ShootDaySidesExport
}

function resolveScriptVersionLabels(
  scriptVersionIds: string[],
  versions: Awaited<ReturnType<typeof listScriptVersionsByProduction>>
): string[] {
  const byId = new Map(versions.map((v) => [v.id, v]))
  return scriptVersionIds.map((id) => {
    const v = byId.get(id)
    if (!v) return id
    return v.version_label?.trim() || v.revision_colour?.trim() || v.title?.trim() || id
  })
}

/**
 * Generate, store, and record a sides export for a shoot day. Throws if no sections are selected.
 */
export async function exportShootDaySides(
  args: ExportShootDaySidesArgs
): Promise<ExportShootDaySidesResult> {
  const { source, model, filters } = args

  const blocking = getBlockingExportIssues(
    analyzeExportCoverage({
      source,
      selectedEntries: source.entries.filter((e) =>
        model.selectedSectionIds.includes(e.sectionId)
      ),
    })
  )
  if (blocking.length > 0) {
    throw new Error(blocking[0]!.message)
  }

  const { productionId, shootDayId } = source

  // Resolve presentation context (read-only).
  const productionTitle =
    args.productionTitle ?? (await getProductionById(productionId))?.name ?? 'Production'
  const versions = await listScriptVersionsByProduction(productionId)
  const scriptVersionLabels = resolveScriptVersionLabels(source.scriptVersionIds, versions)

  // 1. Generate the PDF first; a generation failure leaves zero DB rows and zero files.
  const pdfData = buildSidesPdfData({
    productionTitle,
    shootDate: source.shootDate,
    unitName: source.unitName,
    scriptVersionLabels,
    model,
    generatedAt: args.generatedAt,
  })
  const bytes = new Uint8Array(await generateSidesPdf(pdfData))

  // 2. Write the PDF into app-managed storage (per-production subdirectory, document-id prefixed).
  const documentId = uuid()
  const exportId = uuid()
  const ts = now()
  const unitToken = sanitizeForFilename(source.unitName ?? source.unitId ?? 'main')
  const dateToken = source.shootDate ? sanitizeForFilename(source.shootDate) : 'undated'
  const fileName = `sides-${dateToken}-${unitToken}.pdf`
  const relativePath = `${ATTACHMENTS_DIR}/${productionId}/${documentId}-${fileName}`

  await mkdir(`${ATTACHMENTS_DIR}/${productionId}`, {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  })
  await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppData })

  // 3. Record the document + export atomically; remove the file if the DB write fails.
  const existingCount = (await listSidesExportsByShootDay(shootDayId)).length
  const exportLabel = `Sides v${existingCount + 1}${source.shootDate ? ` — ${source.shootDate}` : ''}`

  const metadata: SidesExportMetadata = {
    selectedSectionIds: model.selectedSectionIds,
    filters,
    warnings: model.validation.map((w) => ({
      code: w.code,
      message: w.message,
      blocking: w.blocking,
    })),
    scriptVersionIds: source.scriptVersionIds,
  }

  try {
    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, [
        { sql: 'BEGIN', bindValues: [] },
        ...buildCreateDocumentStatements(documentId, ts, {
          production_id: productionId,
          entity_type: SIDES_ENTITY_TYPE,
          entity_id: shootDayId,
          file_name: fileName,
          file_path: relativePath,
          mime_type: 'application/pdf',
        }),
        ...buildCreateSidesExportStatements(exportId, ts, {
          production_id: productionId,
          shoot_day_id: shootDayId,
          unit_id: source.unitId,
          document_id: documentId,
          script_version_id:
            source.scriptVersionIds.length === 1 ? source.scriptVersionIds[0]! : null,
          export_label: exportLabel,
          metadata_json: JSON.stringify(metadata),
        }),
        { sql: 'COMMIT', bindValues: [] },
      ])
    })
  } catch (error) {
    try {
      await remove(relativePath, { baseDir: BaseDirectory.AppData })
    } catch {
      // Best-effort cleanup; surface the original DB error.
    }
    throw error
  }

  const document = (await getDocumentById(documentId))!
  const exportRecord = (await getSidesExportById(exportId))!
  return { document, exportRecord }
}
