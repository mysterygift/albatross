/**
 * "Export PDF" on the Stripboard, Shot List and Storyboard pages: build the PDF, file a copy in
 * Documents → Script & sides, then offer a save dialog.
 */
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { persistProductionDocument } from '@/lib/documents/persistDocument'
import { saveFileWithDialog } from '@/lib/files'
import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'
import { readStoryboardImageBytes } from '@/lib/files/storyboard'
import { generateShootingSchedulePdf } from '@/lib/pdf/shootingSchedule'
import { buildShotListPdfData, generateShotListPdf } from '@/lib/pdf/shotList'
import { buildStoryboardPdfData, generateStoryboardPdf } from '@/lib/pdf/storyboard'
import {
  loadScheduleExportSources,
  loadStoryboardImagesForExport,
  type ScheduleExportActor,
  type ScheduleExportSources,
} from '@/lib/schedule/scheduleExportSources'
import { buildShootingScheduleData } from '@/lib/schedule/shootingScheduleExport'

export type ScheduleExportResult = { fileName: string; savedPath: string | null }

async function fileAndOffer(args: {
  productionId: string
  fileName: string
  bytes: Uint8Array
  entityType: string
  entityId: string | null
  title: string
}): Promise<ScheduleExportResult> {
  await persistProductionDocument({
    productionId: args.productionId,
    fileName: args.fileName,
    bytes: args.bytes,
    mimeType: 'application/pdf',
    entityType: args.entityType,
    entityId: args.entityId,
  })
  const savedPath = await saveFileWithDialog(
    { defaultPath: args.fileName, filters: [{ name: 'PDF', extensions: ['pdf'] }], title: args.title },
    args.bytes
  )
  return { fileName: args.fileName, savedPath }
}

function sceneScope(sources: ScheduleExportSources, sceneId: string | null | undefined) {
  const scene = sceneId ? sources.scenes.find((s) => s.id === sceneId) : null
  return scene
    ? { label: `Scene ${scene.scene_number}`, token: `scene-${sanitizeForFilename(scene.scene_number)}`, sceneIds: [scene.id] }
    : { label: 'All scenes', token: 'all-scenes', sceneIds: undefined }
}

/** Whole schedule, or every unit of one shoot day. */
export async function exportShootingSchedulePdf(args: {
  productionId: string
  actor?: ScheduleExportActor
  shootDayId?: string | null
}): Promise<ScheduleExportResult> {
  const sources = await loadScheduleExportSources(args.productionId, args.actor)
  const day = args.shootDayId ? sources.shootDays.find((d) => d.id === args.shootDayId) : null
  const scopeLabel = day
    ? [day.day_number != null ? `Day ${day.day_number}` : null, day.shoot_date].filter(Boolean).join(' | ')
    : 'Whole schedule'
  const data = buildShootingScheduleData({
    productionName: sources.productionName,
    scopeLabel,
    shootDays: sources.shootDays,
    shootDayUnits: sources.shootDayUnits,
    units: sources.units,
    strips: sources.strips,
    scenes: sources.scenes,
    shots: sources.shots,
    locations: sources.locations,
    castPeople: sources.cast,
    castBySceneId: sources.castBySceneId,
    castByShotId: sources.castByShotId,
    includeEpisodes: sources.includeEpisodes,
    episodes: sources.episodes,
    shootDayIds: day ? [day.id] : undefined,
  })
  return fileAndOffer({
    productionId: args.productionId,
    fileName: `shooting-schedule-${day ? day.shoot_date : 'all-days'}.pdf`,
    bytes: new Uint8Array(await generateShootingSchedulePdf(data)),
    entityType: DOCUMENT_ENTITY_TYPES.shootingSchedule,
    entityId: day?.id ?? null,
    title: 'Export shooting schedule',
  })
}

/** One scene, or every scene. */
export async function exportShotListPdf(args: {
  productionId: string
  actor?: ScheduleExportActor
  sceneId?: string | null
}): Promise<ScheduleExportResult> {
  const sources = await loadScheduleExportSources(args.productionId, args.actor)
  const scope = sceneScope(sources, args.sceneId)
  const data = buildShotListPdfData({
    productionName: sources.productionName,
    scopeLabel: scope.label,
    scenes: sources.scenes,
    shots: sources.shots,
    locations: sources.locations,
    castPeople: sources.cast,
    castBySceneId: sources.castBySceneId,
    castByShotId: sources.castByShotId,
    sceneIds: scope.sceneIds,
  })
  return fileAndOffer({
    productionId: args.productionId,
    fileName: `shot-list-${scope.token}.pdf`,
    bytes: new Uint8Array(await generateShotListPdf(data)),
    entityType: DOCUMENT_ENTITY_TYPES.shotList,
    entityId: scope.sceneIds?.[0] ?? null,
    title: 'Export shot list',
  })
}

/** One scene, or every scene. */
export async function exportStoryboardPdf(args: {
  productionId: string
  actor?: ScheduleExportActor
  sceneId?: string | null
}): Promise<ScheduleExportResult> {
  const [sources, images] = await Promise.all([
    loadScheduleExportSources(args.productionId, args.actor),
    loadStoryboardImagesForExport(args.productionId, args.actor),
  ])
  const scope = sceneScope(sources, args.sceneId)
  const data = buildStoryboardPdfData({
    productionName: sources.productionName,
    scopeLabel: scope.label,
    scenes: sources.scenes,
    shots: sources.shots,
    images,
    locations: sources.locations,
    sceneIds: scope.sceneIds,
  })
  return fileAndOffer({
    productionId: args.productionId,
    fileName: `storyboard-${scope.token}.pdf`,
    bytes: new Uint8Array(await generateStoryboardPdf(data, { readImage: readStoryboardImageBytes })),
    entityType: DOCUMENT_ENTITY_TYPES.storyboardExport,
    entityId: scope.sceneIds?.[0] ?? null,
    title: 'Export storyboard',
  })
}
