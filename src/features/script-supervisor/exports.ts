/**
 * Script Supervisor exports (SS9): continuity sheets (PDF), editor's log (CSV) and the marked-up script (PDF).
 * Each export saves a copy to Documents → Set paperwork, then opens a save dialog.
 */
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { persistProductionDocument } from '@/lib/documents/persistDocument'
import { saveFileWithDialog } from '@/lib/files'
import { assertScriptSupervisorLocal } from '@/lib/db/repositories/scriptSupervisor'
import {
  listScenesShotOnDay,
  loadContinuityDay,
  loadMarkedUpScenes,
  type ExportScene,
} from '@/lib/db/scriptSupervisorExportService'
import { generateContinuitySheetsPdf } from '@/lib/pdf/continuitySheets'
import { generateMarkedUpScriptPdf } from '@/lib/pdf/markedUpScript'
import {
  buildContinuitySheets,
  buildEditorsLogCsv,
  continuitySheetsFileName,
  editorsLogFileName,
} from '@/lib/script-supervisor/continuitySheets'
import { markedUpScriptFileName } from '@/lib/script-supervisor/markedUpScript'

export type DayExportContext = {
  productionId: string
  productionName: string
  shootDayId: string
  shootDate: string
  dayNumber: number | null
  totalShootDays: number | null
}

export type ExportKind = 'continuity' | 'editors_log' | 'marked_up_day'

async function savePdf(productionId: string, fileName: string, bytes: Uint8Array, entityType: string, entityId: string, title: string) {
  await persistProductionDocument({ productionId, fileName, bytes, mimeType: 'application/pdf', entityType, entityId })
  await saveFileWithDialog({ defaultPath: fileName, filters: [{ name: 'PDF', extensions: ['pdf'] }], title }, bytes)
}

function dayLabel(ctx: DayExportContext): string {
  return ctx.dayNumber != null ? `Day ${ctx.dayNumber} | ${ctx.shootDate}` : ctx.shootDate
}

async function dayInput(ctx: DayExportContext) {
  await assertScriptSupervisorLocal(ctx.productionId)
  const slates = await loadContinuityDay(ctx.shootDayId)
  if (slates.length === 0) throw new Error('No slates logged on this day yet')
  return {
    productionName: ctx.productionName,
    shootDate: ctx.shootDate,
    dayNumber: ctx.dayNumber,
    totalShootDays: ctx.totalShootDays,
    slates,
  }
}

export async function exportContinuitySheets(ctx: DayExportContext): Promise<void> {
  const data = buildContinuitySheets(await dayInput(ctx))
  const bytes = new Uint8Array(await generateContinuitySheetsPdf(data))
  await savePdf(
    ctx.productionId,
    continuitySheetsFileName(ctx.dayNumber, ctx.shootDate),
    bytes,
    DOCUMENT_ENTITY_TYPES.continuitySheets,
    ctx.shootDayId,
    'Export continuity sheets'
  )
}

export async function exportEditorsLog(ctx: DayExportContext): Promise<void> {
  const csv = buildEditorsLogCsv(await dayInput(ctx))
  const fileName = editorsLogFileName(ctx.dayNumber, ctx.shootDate)
  await persistProductionDocument({
    productionId: ctx.productionId,
    fileName,
    bytes: csv,
    mimeType: 'text/csv',
    entityType: DOCUMENT_ENTITY_TYPES.editorsLog,
    entityId: ctx.shootDayId,
    isText: true,
  })
  await saveFileWithDialog({ defaultPath: fileName, filters: [{ name: 'CSV', extensions: ['csv'] }], title: "Export editor's log" }, csv, true)
}

async function markedUp(productionId: string, scenes: readonly ExportScene[]) {
  const { scenes: inputs, missing } = await loadMarkedUpScenes(productionId, scenes)
  if (inputs.length === 0) {
    throw new Error(
      missing.length === 1
        ? `Scene ${missing[0]!.sceneNumber} isn’t in an imported script yet`
        : 'None of these scenes are in an imported script yet'
    )
  }
  return { inputs, missing }
}

/** Marked-up pages for every scene slated on the day. Returns scene numbers left out (not in a script). */
export async function exportDayMarkedUpScript(ctx: DayExportContext): Promise<string[]> {
  await assertScriptSupervisorLocal(ctx.productionId)
  const scenes = await listScenesShotOnDay(ctx.shootDayId)
  if (scenes.length === 0) throw new Error('No scenes slated on this day yet')
  const { inputs, missing } = await markedUp(ctx.productionId, scenes)
  const bytes = new Uint8Array(
    await generateMarkedUpScriptPdf({ productionName: ctx.productionName, subtitle: dayLabel(ctx), scenes: inputs })
  )
  await savePdf(
    ctx.productionId,
    markedUpScriptFileName({ dayNumber: ctx.dayNumber, shootDate: ctx.shootDate }),
    bytes,
    DOCUMENT_ENTITY_TYPES.markedUpScript,
    ctx.shootDayId,
    'Export marked-up script'
  )
  return missing.map((m) => m.sceneNumber)
}

/** Marked-up pages for one scene, lined to date (Script view → Export PDF). */
export async function exportSceneMarkedUpScript(input: { productionId: string; productionName: string; scene: ExportScene; asOf: string }): Promise<void> {
  await assertScriptSupervisorLocal(input.productionId)
  const { inputs } = await markedUp(input.productionId, [input.scene])
  const bytes = new Uint8Array(
    await generateMarkedUpScriptPdf({ productionName: input.productionName, subtitle: `Lined to ${input.asOf}`, scenes: inputs })
  )
  await savePdf(
    input.productionId,
    markedUpScriptFileName({ sceneNumber: input.scene.sceneNumber }),
    bytes,
    DOCUMENT_ENTITY_TYPES.markedUpScript,
    input.scene.sceneId,
    'Export marked-up script'
  )
}
