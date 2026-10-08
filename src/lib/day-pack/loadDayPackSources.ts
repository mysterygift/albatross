/**
 * What goes in a day pack for one shoot day + unit, and the state of each document:
 *
 * - Call sheet and movement order: the latest saved PDF (they are curated on their own pages).
 * - Sides: the latest Sides Builder export for the unit, else default sides generated on the fly.
 * - Risk assessments: every RAMS covering the unit, rendered fresh.
 * - Shooting schedule, shot list and storyboard: generated for this day + unit.
 *
 * Nothing is rendered until `render()` is called, and nothing here writes to the database.
 */
import { isSpecialScheduleStrip } from '@/lib/call-sheets/scheduleStripRow'
import { getCallSheetByShootDayAndUnit } from '@/lib/db/repositories/call-sheets'
import { getDocumentById, listDocumentsByEntity } from '@/lib/db/repositories/document'
import { listRiskAssessmentsByShootDay } from '@/lib/db/repositories/risk-assessments'
import { getLatestScheduleChangeForDayUnit } from '@/lib/db/repositories/schedule-changes'
import { listSidesExportsByShootDay } from '@/lib/db/repositories/sidesExports'
import { analyzeExportCoverage, getBlockingExportIssues } from '@/lib/db/coverageAnalysisService'
import { buildSidesDraftModel, defaultSidesFilters, loadSidesBuilderSource } from '@/lib/db/sidesBuilderService'
import { renderShootDaySidesPdf } from '@/lib/db/sidesExportService'
import type { Document, StoryboardImage } from '@/lib/db/types'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { readAppDataBytes } from '@/lib/files/appDataObjectUrl'
import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'
import { readStoryboardImageBytes } from '@/lib/files/storyboard'
import { getMovementOrderPdfFileName } from '@/lib/movement-orders/fileNaming'
import { formatIssuedStamp } from '@/lib/pdf/layoutKit'
import { generateShootingSchedulePdf } from '@/lib/pdf/shootingSchedule'
import { buildShotListPdfData, generateShotListPdf } from '@/lib/pdf/shotList'
import { buildStoryboardPdfData, generateStoryboardPdf } from '@/lib/pdf/storyboard'
import { renderRiskAssessmentPdf } from '@/lib/risk-assessments/exportRiskAssessmentPdf'
import { getRamsSignOffStatus } from '@/lib/risk-assessments/ramsSignOff'
import {
  loadScheduleExportSources,
  loadStoryboardImagesForExport,
  type ScheduleExportActor,
  type ScheduleExportSources,
} from '@/lib/schedule/scheduleExportSources'
import { buildShootingScheduleData, shotIdsInStripOrder } from '@/lib/schedule/shootingScheduleExport'

export const DAY_PACK_DOC_KINDS = [
  'call_sheet',
  'movement_order',
  'sides',
  'shooting_schedule',
  'shot_list',
  'risk_assessments',
  'storyboard',
] as const

export type DayPackDocKind = (typeof DAY_PACK_DOC_KINDS)[number]

export const DAY_PACK_DOC_LABELS: Record<DayPackDocKind, string> = {
  call_sheet: 'Call sheet',
  movement_order: 'Movement order',
  sides: 'Script sides',
  shooting_schedule: 'Shooting schedule',
  shot_list: 'Shot list',
  risk_assessments: 'Risk assessments',
  storyboard: 'Storyboard',
}

/**
 * - `ready`: a saved or rendered document is available.
 * - `stale`: saved before the latest change to the day + unit; still sendable.
 * - `generated`: no saved version, so a default one is generated (sides).
 * - `missing`: needs action on another page first.
 * - `empty`: nothing to include for this day + unit.
 */
export type DayPackDocStatus = 'ready' | 'stale' | 'generated' | 'missing' | 'empty'

/** One base (un-watermarked) PDF; `stem` names it, e.g. `call-sheet` or `rams-harbour`. */
export type DayPackBaseFile = { stem: string; bytes: Uint8Array }

export type DayPackSource = {
  kind: DayPackDocKind
  label: string
  status: DayPackDocStatus
  detail: string
  /** A caution that does not block sending (e.g. RAMS not signed off). */
  warning: string | null
  render: () => Promise<DayPackBaseFile[]>
}

export type DayPackContext = {
  productionId: string
  productionName: string
  shootDayId: string
  shootDayUnitId: string
  shootDate: string
  dayNumber: number | null
  totalShootDays: number | null
  unitName: string
}

export type DayPackSources = { context: DayPackContext; sources: DayPackSource[] }

/** Whether a document can go in the pack (missing and empty ones cannot). */
export function isSendable(source: Pick<DayPackSource, 'status'>): boolean {
  return source.status === 'ready' || source.status === 'stale' || source.status === 'generated'
}

const NOTHING = async (): Promise<DayPackBaseFile[]> => []

function savedDetail(doc: Document): string {
  return `Saved ${formatIssuedStamp(new Date(doc.created_at))}`
}

/** A saved document's entry: ready, or stale when the day + unit changed after it was saved. */
function savedSource(
  kind: DayPackDocKind,
  stem: string,
  doc: Document | null,
  latestChange: string | null,
  missingDetail: string,
  savedLabel?: string
): DayPackSource {
  const label = DAY_PACK_DOC_LABELS[kind]
  if (!doc) return { kind, label, status: 'missing', detail: missingDetail, warning: null, render: NOTHING }
  const stale = latestChange != null && doc.created_at < latestChange
  const detail = [savedLabel, savedDetail(doc)].filter(Boolean).join(' | ')
  return {
    kind,
    label,
    status: stale ? 'stale' : 'ready',
    detail: stale ? `${detail}. The day has changed since: consider saving it again.` : detail,
    warning: null,
    render: async () => [{ stem, bytes: await readAppDataBytes(doc.file_path) }],
  }
}

async function sidesSource(
  context: DayPackContext,
  unitId: string,
  dayUnitCount: number,
  latestChange: string | null
): Promise<DayPackSource> {
  const kind: DayPackDocKind = 'sides'
  const label = DAY_PACK_DOC_LABELS[kind]
  const exports = await listSidesExportsByShootDay(context.shootDayId)
  // An export made with no unit covers the whole day, which only makes sense on a one-unit day.
  const saved = exports.find((e) => e.document_id && (e.unit_id === unitId || (e.unit_id == null && dayUnitCount <= 1)))
  const savedDoc = saved?.document_id ? await getDocumentById(saved.document_id) : null
  if (savedDoc) {
    return savedSource(kind, 'sides', savedDoc, latestChange, '', saved?.export_label ?? undefined)
  }

  const source = await loadSidesBuilderSource(context.shootDayId, { shootDayUnitId: context.shootDayUnitId })
  if (source.entries.length === 0) {
    return {
      kind,
      label,
      status: 'empty',
      detail: 'No script sections for the scenes on this unit (import a script and mark its sections).',
      warning: null,
      render: NOTHING,
    }
  }
  const model = buildSidesDraftModel(source, defaultSidesFilters(), { overrides: {} })
  const blocking = getBlockingExportIssues(
    analyzeExportCoverage({
      source,
      selectedEntries: source.entries.filter((e) => model.selectedSectionIds.includes(e.sectionId)),
    })
  )
  if (blocking.length > 0) {
    return { kind, label, status: 'missing', detail: blocking[0]!.message, warning: null, render: NOTHING }
  }
  return {
    kind,
    label,
    status: 'generated',
    detail: 'No saved sides for this unit: default sides for every scene on it will be generated (not curated).',
    warning: null,
    render: async () => [
      {
        stem: 'sides',
        bytes: await renderShootDaySidesPdf({ source, model, productionTitle: context.productionName }),
      },
    ],
  }
}

async function riskAssessmentsSource(context: DayPackContext): Promise<DayPackSource> {
  const kind: DayPackDocKind = 'risk_assessments'
  const label = DAY_PACK_DOC_LABELS[kind]
  const covering = (await listRiskAssessmentsByShootDay(context.shootDayId)).filter((ra) =>
    ra.shoot_day_unit_ids.includes(context.shootDayUnitId)
  )
  if (covering.length === 0) {
    return {
      kind,
      label,
      status: 'missing',
      detail: `No risk assessment covers ${context.unitName} on this day.`,
      warning: null,
      render: NOTHING,
    }
  }
  const signOff = getRamsSignOffStatus(covering, context.shootDayUnitId)
  return {
    kind,
    label,
    status: 'ready',
    detail: `${covering.length} ${covering.length === 1 ? 'risk assessment' : 'risk assessments'}: ${covering
      .map((ra) => ra.location_name || 'Untitled')
      .join(', ')}`,
    warning: signOff === 'unapproved' ? 'Not signed off yet: at least one is still a draft.' : null,
    render: async () => {
      const used = new Map<string, number>()
      const files: DayPackBaseFile[] = []
      for (const ra of covering) {
        const { bytes } = await renderRiskAssessmentPdf(ra.id)
        const base = `rams-${sanitizeForFilename(ra.location_name || 'risk-assessment')}`
        const n = (used.get(base) ?? 0) + 1
        used.set(base, n)
        files.push({ stem: n === 1 ? base : `${base}-${n}`, bytes })
      }
      return files
    },
  }
}

function scheduleSources(
  sched: ScheduleExportSources,
  context: DayPackContext,
  images: StoryboardImage[]
): DayPackSource[] {
  const scopeLabel = [context.dayNumber != null ? `Day ${context.dayNumber}` : null, context.unitName]
    .filter(Boolean)
    .join(' | ')
  const scheduleData = buildShootingScheduleData({
    productionName: sched.productionName,
    scopeLabel,
    shootDays: sched.shootDays,
    shootDayUnits: sched.shootDayUnits,
    units: sched.units,
    strips: sched.strips,
    scenes: sched.scenes,
    shots: sched.shots,
    locations: sched.locations,
    castPeople: sched.cast,
    castBySceneId: sched.castBySceneId,
    castByShotId: sched.castByShotId,
    includeEpisodes: sched.includeEpisodes,
    episodes: sched.episodes,
    shootDayIds: [context.shootDayId],
    shootDayUnitId: context.shootDayUnitId,
  })
  const shotOrder = shotIdsInStripOrder(sched.strips, context.shootDayId, context.shootDayUnitId)
  const shotListData = buildShotListPdfData({
    productionName: sched.productionName,
    scopeLabel,
    scenes: sched.scenes,
    shots: sched.shots,
    locations: sched.locations,
    castPeople: sched.cast,
    castBySceneId: sched.castBySceneId,
    castByShotId: sched.castByShotId,
    shotOrder,
  })

  const storyboardData = buildStoryboardPdfData({
    productionName: sched.productionName,
    scopeLabel,
    scenes: sched.scenes,
    shots: sched.shots,
    images,
    locations: sched.locations,
    shotOrder,
  })
  const panelCount = storyboardData.scenes.reduce((sum, s) => sum + s.panels.length, 0)
  const shotCount = shotListData.scenes.reduce((sum, s) => sum + s.shots.length, 0)
  // Call and wrap strips alone are not a schedule.
  const stripCount = scheduleData.sections.reduce(
    (sum, s) => sum + s.rows.filter((r) => !isSpecialScheduleStrip(r.strip_type)).length,
    0
  )
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return [
    {
      kind: 'shooting_schedule' as const,
      label: DAY_PACK_DOC_LABELS.shooting_schedule,
      status: stripCount > 0 ? ('ready' as const) : ('empty' as const),
      detail: stripCount > 0 ? `Generated: ${plural(stripCount, 'strip', 'strips')}` : 'Nothing scheduled on this unit.',
      warning: null,
      render: async () => [{ stem: 'shooting-schedule', bytes: await generateShootingSchedulePdf(scheduleData) }],
    },
    {
      kind: 'shot_list' as const,
      label: DAY_PACK_DOC_LABELS.shot_list,
      status: shotCount > 0 ? ('ready' as const) : ('empty' as const),
      detail: shotCount > 0 ? `Generated: ${plural(shotCount, 'shot', 'shots')}` : 'No shots scheduled on this unit.',
      warning: null,
      render: async () => [{ stem: 'shot-list', bytes: await generateShotListPdf(shotListData) }],
    },
    {
      kind: 'storyboard' as const,
      label: DAY_PACK_DOC_LABELS.storyboard,
      status: panelCount > 0 ? ('ready' as const) : ('empty' as const),
      detail:
        panelCount > 0
          ? `Generated: ${plural(panelCount, 'panel', 'panels')}`
          : 'No storyboard panels for the shots on this unit.',
      warning: null,
      render: async () => [
        {
          stem: 'storyboard',
          bytes: await generateStoryboardPdf(storyboardData, { readImage: readStoryboardImageBytes }),
        },
      ],
    },
  ]
}

export async function loadDayPackSources(args: {
  productionId: string
  shootDayId: string
  shootDayUnitId: string
  actor?: ScheduleExportActor
  /** Already loaded by the caller (e.g. for recipients); loaded here otherwise. */
  sched?: ScheduleExportSources
}): Promise<DayPackSources> {
  const sched = args.sched ?? (await loadScheduleExportSources(args.productionId, args.actor))
  const day = sched.shootDays.find((d) => d.id === args.shootDayId)
  const dayUnit = sched.shootDayUnits.find((u) => u.id === args.shootDayUnitId && u.shoot_day_id === args.shootDayId)
  if (!day || !dayUnit) throw new Error('Shoot day or unit not found')
  const unitName = sched.units.find((u) => u.id === dayUnit.unit_id)?.name ?? 'Main Unit'
  const dayUnitCount = sched.shootDayUnits.filter((u) => u.shoot_day_id === day.id && !u.deleted_at).length

  const context: DayPackContext = {
    productionId: args.productionId,
    productionName: sched.productionName,
    shootDayId: day.id,
    shootDayUnitId: dayUnit.id,
    shootDate: day.shoot_date,
    dayNumber: day.day_number ?? null,
    totalShootDays: sched.shootDays.length || null,
    unitName,
  }

  const latestChange = await getLatestScheduleChangeForDayUnit(day.id, dayUnit.id)

  const callSheet = await getCallSheetByShootDayAndUnit(day.id, dayUnit.id)
  const callSheetDoc = callSheet?.generated_document_id ? await getDocumentById(callSheet.generated_document_id) : null
  const movementOrderFileName = getMovementOrderPdfFileName(day.shoot_date, unitName)
  const movementOrderDoc =
    (await listDocumentsByEntity(DOCUMENT_ENTITY_TYPES.movementOrder, day.id)).find(
      (d) => d.file_name === movementOrderFileName
    ) ?? null

  const [sides, risk, generated] = await Promise.all([
    sidesSource(context, dayUnit.unit_id, dayUnitCount, latestChange),
    riskAssessmentsSource(context),
    loadStoryboardImagesForExport(args.productionId, args.actor).then((images) =>
      scheduleSources(sched, context, images)
    ),
  ])
  const byKind = new Map<DayPackDocKind, DayPackSource>([
    [
      'call_sheet',
      savedSource('call_sheet', 'call-sheet', callSheetDoc, latestChange, `No saved call sheet for ${unitName} on this day.`),
    ],
    [
      'movement_order',
      savedSource(
        'movement_order',
        'movement-order',
        movementOrderDoc,
        latestChange,
        `No saved movement order for ${unitName} on this day.`
      ),
    ],
    ['sides', sides],
    ['risk_assessments', risk],
    ...generated.map((s) => [s.kind, s] as [DayPackDocKind, DayPackSource]),
  ])
  return { context, sources: DAY_PACK_DOC_KINDS.map((kind) => byKind.get(kind)!) }
}
