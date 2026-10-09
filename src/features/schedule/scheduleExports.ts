/**
 * "Export PDF" on the Stripboard, Shot List, Storyboard and Floor Plans pages: build the PDF, file a
 * copy in Documents → Script & sides, then offer a save dialog.
 */
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { persistProductionDocument } from '@/lib/documents/persistDocument'
import { saveFileWithDialog } from '@/lib/files'
import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'
import { readStoryboardImageBytes } from '@/lib/files/storyboard'
import { buildFloorPlanPdfData, generateFloorPlanPdf, type FloorPlanExportScope } from '@/lib/pdf/floorPlan'
import { generateShootingSchedulePdf } from '@/lib/pdf/shootingSchedule'
import { buildShotListPdfData, generateShotListPdf } from '@/lib/pdf/shotList'
import { buildStoryboardPdfData, generateStoryboardPdf } from '@/lib/pdf/storyboard'
import {
  loadFloorPlansForExport,
  loadScheduleExportSources,
  loadStoryboardImagesForExport,
  type ScheduleExportActor,
  type ScheduleExportSources,
} from '@/lib/schedule/scheduleExportSources'
import { buildShootingScheduleData, shotIdsInStripOrder } from '@/lib/schedule/shootingScheduleExport'
import { sortShootDayUnitsForDisplay } from '@/lib/schedule/unitKey'

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

/** What a floor plans export covers; picked in the Floor Plans export dialog. */
export type FloorPlanExportRequest =
  | { kind: 'day'; shootDayId: string }
  | { kind: 'location'; locationId: string }
  | { kind: 'scene'; sceneId: string }
  | { kind: 'shots'; shotIds: string[] }

/** Every unit's shots on a shoot day, Main Unit first, each unit in strip order. */
export function shotIdsForShootDay(sources: ScheduleExportSources, shootDayId: string): string[] {
  const unitsById = new Map(sources.units.map((u) => [u.id, u]))
  const dayUnits = sortShootDayUnitsForDisplay(
    sources.shootDayUnits.filter((u) => u.shoot_day_id === shootDayId && !u.deleted_at),
    unitsById
  )
  return dayUnits.flatMap((u) => shotIdsInStripOrder(sources.strips, shootDayId, u.id))
}

/** A shoot day (all units and locations), a location, a scene, or chosen shots. */
export async function exportFloorPlansPdf(args: {
  productionId: string
  actor?: ScheduleExportActor
  request: FloorPlanExportRequest
  /** Cast booking colours by person id. */
  actorColors?: Map<string, string>
}): Promise<ScheduleExportResult> {
  const [sources, floorPlans] = await Promise.all([
    loadScheduleExportSources(args.productionId, args.actor),
    loadFloorPlansForExport(args.productionId, args.actor),
  ])
  const request = args.request
  let scope: FloorPlanExportScope
  let label: string
  let token: string
  let entityId: string | null = null
  if (request.kind === 'day') {
    const day = sources.shootDays.find((d) => d.id === request.shootDayId)
    if (!day) throw new Error('Shoot day not found')
    scope = { kind: 'day', shotOrder: shotIdsForShootDay(sources, day.id) }
    label = [day.day_number != null ? `Day ${day.day_number}` : null, day.shoot_date].filter(Boolean).join(' | ')
    token = day.shoot_date
    entityId = day.id
  } else if (request.kind === 'location') {
    const location = sources.locations.find((l) => l.id === request.locationId)
    if (!location) throw new Error('Location not found')
    scope = { kind: 'location', locationId: location.id }
    label = location.name
    token = `location-${sanitizeForFilename(location.name)}`
    entityId = location.id
  } else if (request.kind === 'scene') {
    const scene = sources.scenes.find((s) => s.id === request.sceneId)
    if (!scene) throw new Error('Scene not found')
    scope = { kind: 'scene', sceneId: scene.id }
    label = `Scene ${scene.scene_number}`
    token = `scene-${sanitizeForFilename(scene.scene_number)}`
    entityId = scene.id
  } else {
    if (request.shotIds.length === 0) throw new Error('Choose at least one shot.')
    const numbers = request.shotIds
      .map((id) => sources.shots.find((s) => s.id === id)?.shot_number)
      .filter((n): n is string => !!n)
    scope = { kind: 'shots', shotIds: request.shotIds }
    label = numbers.length === 1 ? `Shot ${numbers[0]}` : `Shots ${numbers.join(', ')}`
    token = numbers.length === 1 ? `shot-${sanitizeForFilename(numbers[0]!)}` : 'selected-shots'
  }
  const data = buildFloorPlanPdfData({
    productionName: sources.productionName,
    scopeLabel: label,
    scope,
    plans: floorPlans.plans,
    setups: floorPlans.setups,
    scenes: sources.scenes,
    shots: sources.shots,
    locations: sources.locations,
    actorColors: args.actorColors,
  })
  return fileAndOffer({
    productionId: args.productionId,
    fileName: `floor-plans-${token}.pdf`,
    bytes: new Uint8Array(await generateFloorPlanPdf(data)),
    entityType: DOCUMENT_ENTITY_TYPES.floorPlanExport,
    entityId,
    title: 'Export floor plans',
  })
}
