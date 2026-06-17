/**
 * SB5 — Shoot-day script section integration service.
 *
 * Derives the script sections required for a shoot day from scheduled stripboard strips, the
 * shots they reference, and the existing shot<->script-section links (SB4). When a scheduled
 * scene has no shot-linked sections it falls back to that scene's full-scene section(s). The
 * service is read-only: it computes a typed summary (included/fallback sections, linked shots,
 * total estimated eighths, partial-scene flags, characters, and lightweight warnings) and does
 * not write anything, build sides, generate PDFs, or apply manual overrides.
 *
 * Scope notes:
 * - Derivation is local-only. For productions whose effective data source is `remote_server`
 *   the SB1 tables have no remote endpoint yet, so a neutral empty summary is returned.
 * - The eighth model mirrors scriptSectionGenerationService (8 eighths per page; a section's
 *   coverage is the span between its range start/end expressed as global eighths).
 */
import { getEffectiveDataSourceForProduction } from './projectDataSource'
import { getLatestScriptVersionForScope, getScriptVersionById } from './repositories/scriptVersions'
import { formatScriptVersionLabel } from './scriptSectionReconciliationService'
import { getSceneById, getShootDayById, getShotById } from './repositories/schedule'
import { getShootDayUnitById } from './repositories/shoot-day-units'
import {
  listCharactersBySectionIds,
  listRangesBySectionIds,
  listSectionsByScene,
  listSectionsByShotIds,
} from './repositories/scriptSections'
import { listStripsByShootDay, listStripsForDayUnit } from './repositories/stripboard-strips'
import type {
  Scene,
  ScriptSection,
  ScriptSectionRange,
  Shot,
  StripboardStrip,
} from './types'

const EIGHTHS_PER_PAGE = 8

// ─── Public types ─────────────────────────────────────────────────────────────

export type ShootDaySectionWarningCode =
  | 'scene_no_sections'
  | 'scene_fallback_full_scene'
  | 'shot_no_linked_section'
  | 'mixed_script_version'
  | 'outdated_script_version'
  | 'estimated_range'
  | 'omitted_section_skipped'

export type ShootDaySectionWarning = {
  code: ShootDaySectionWarningCode
  message: string
  sceneId?: string
  shotId?: string
  sectionId?: string
}

export type ShootDayScriptSectionsSummary = {
  shootDayId: string
  productionId: string
  /** Underlying units.id when scoped to a single shoot-day unit, else null. */
  unitId: string | null
  sceneIds: string[]
  scriptVersionIds: string[]
  /** Sections reached through shot<->section links on scheduled shots. */
  includedSectionIds: string[]
  /** Full-scene sections used when a scheduled scene had no shot-linked sections. */
  fallbackSectionIds: string[]
  /** Scheduled shots that contributed at least one linked section. */
  linkedShotIds: string[]
  totalEstimatedEighths: number
  /** Scenes whose shot-linked sections cover less than the scene's full page length. */
  partialSceneIds: string[]
  /** Included sections whose scene is reachable only via shots (not a direct SCENE strip). */
  sectionsScheduledViaShotsOnly: string[]
  characterNames: string[]
  personIds: string[]
  warnings: ShootDaySectionWarning[]
}

export type DeriveShootDayScriptSectionsOptions = {
  /** Restrict derivation to a single shoot-day unit (multi-unit days). */
  shootDayUnitId?: string | null
}

// ─── Pure eighth-model helpers ──────────────────────────────────────────────

/** Best-effort parse of a (possibly non-numeric, e.g. '12A') display page to a leading integer. */
function parsePageNumber(page: string | null): number | null {
  if (page == null) return null
  const match = /^\s*(\d+)/.exec(page)
  if (!match) return null
  return Number.parseInt(match[1], 10)
}

/** Eighth span for a single range, plus whether the bounds were estimated/best-effort. */
function rangeSpanEighths(range: ScriptSectionRange): { eighths: number; estimated: boolean } {
  const startPage = parsePageNumber(range.start_page)
  const endPage = parsePageNumber(range.end_page)
  if (startPage == null || endPage == null) {
    return { eighths: 0, estimated: true }
  }
  const startEighth = range.start_eighth ?? 0
  const endEighth = range.end_eighth ?? 0
  const startGlobal = (startPage - 1) * EIGHTHS_PER_PAGE + startEighth
  const endGlobal = (endPage - 1) * EIGHTHS_PER_PAGE + endEighth
  const span = endGlobal - startGlobal
  return { eighths: span > 0 ? span : 0, estimated: false }
}

/** Sum the eighth coverage of the given sections, and collect sections with estimated ranges. */
function sumSectionEighths(
  sectionIds: readonly string[],
  rangesBySection: Map<string, ScriptSectionRange[]>
): { total: number; estimatedSectionIds: Set<string> } {
  let total = 0
  const estimatedSectionIds = new Set<string>()
  for (const sectionId of sectionIds) {
    const ranges = rangesBySection.get(sectionId) ?? []
    if (ranges.length === 0) {
      estimatedSectionIds.add(sectionId)
      continue
    }
    for (const range of ranges) {
      const { eighths, estimated } = rangeSpanEighths(range)
      total += eighths
      if (estimated) estimatedSectionIds.add(sectionId)
    }
  }
  return { total, estimatedSectionIds }
}

// ─── Schedule context ────────────────────────────────────────────────────────

type ScheduleContext = {
  /** Scheduled shot ids (SCHEDULED SHOT strips), de-duped, sorted. */
  shotIds: string[]
  shotById: Map<string, Shot>
  /** Scene ids reached only via a direct SCENE strip (obvious from stripboard scene data). */
  directSceneIds: Set<string>
  /** Scene ids reached via scheduled shots (shot.scene_id). */
  shotSceneIds: Set<string>
  /** Union of all scheduled scene ids, sorted. */
  sceneIds: string[]
}

function isScheduledContentStrip(strip: StripboardStrip): boolean {
  return strip.strip_status === 'SCHEDULED' && strip.deleted_at == null
}

async function loadScheduleContext(
  shootDayId: string,
  options?: DeriveShootDayScriptSectionsOptions
): Promise<ScheduleContext> {
  const shootDayUnitId = options?.shootDayUnitId ?? null
  const strips = shootDayUnitId
    ? await listStripsForDayUnit(shootDayId, shootDayUnitId)
    : await listStripsByShootDay(shootDayId)

  const scheduled = strips.filter(isScheduledContentStrip)

  const shotIdSet = new Set<string>()
  const directSceneIds = new Set<string>()
  for (const strip of scheduled) {
    if (strip.strip_type === 'SHOT' && strip.shot_id) {
      shotIdSet.add(strip.shot_id)
    } else if (strip.strip_type === 'SCENE' && strip.scene_id) {
      directSceneIds.add(strip.scene_id)
    }
  }

  const shotIds = [...shotIdSet].sort()
  const shotById = new Map<string, Shot>()
  const shotSceneIds = new Set<string>()
  const shots = await Promise.all(shotIds.map((id) => getShotById(id)))
  for (const shot of shots) {
    if (!shot) continue
    shotById.set(shot.id, shot)
    shotSceneIds.add(shot.scene_id)
  }

  const sceneIds = [...new Set<string>([...directSceneIds, ...shotSceneIds])].sort()
  return { shotIds, shotById, directSceneIds, shotSceneIds, sceneIds }
}

// ─── Named helpers (per SB5 requirements) ────────────────────────────────────

/** Scenes scheduled on the shoot day (via SHOT strips' shots or direct SCENE strips). */
export async function listScheduledScenesForShootDay(
  shootDayId: string,
  options?: DeriveShootDayScriptSectionsOptions
): Promise<Scene[]> {
  const ctx = await loadScheduleContext(shootDayId, options)
  const scenes = await Promise.all(ctx.sceneIds.map((id) => getSceneById(id)))
  return scenes.filter((s): s is Scene => s != null)
}

/** Scheduled shots whose scenes are on the shoot day. */
export async function listLinkedShotsForScheduledScenes(
  shootDayId: string,
  options?: DeriveShootDayScriptSectionsOptions
): Promise<Shot[]> {
  const ctx = await loadScheduleContext(shootDayId, options)
  return ctx.shotIds.map((id) => ctx.shotById.get(id)).filter((s): s is Shot => s != null)
}

/** Active script sections linked to the given shots, de-duped by section id. */
export async function listRequiredSectionsByLinkedShots(
  shotIds: string[]
): Promise<ScriptSection[]> {
  const sectionsByShot = await listSectionsByShotIds(shotIds)
  const seen = new Set<string>()
  const result: ScriptSection[] = []
  for (const shotId of shotIds) {
    for (const section of sectionsByShot.get(shotId) ?? []) {
      if (seen.has(section.id)) continue
      seen.add(section.id)
      result.push(section)
    }
  }
  return result
}

/**
 * Full-scene fallback sections for a scene with no shot-linked sections. Deterministic heuristic:
 * the section(s) whose range covers the largest eighth span (the generated whole-scene section);
 * if no section has measurable coverage, all of the scene's active sections.
 */
export async function listFallbackFullSceneSections(sceneId: string): Promise<ScriptSection[]> {
  const sections = await listSectionsByScene(sceneId)
  if (sections.length === 0) return []
  const rangesBySection = await listRangesBySectionIds(sections.map((s) => s.id))
  let maxSpan = 0
  const spanBySection = new Map<string, number>()
  for (const section of sections) {
    const { total } = sumSectionEighths([section.id], rangesBySection)
    spanBySection.set(section.id, total)
    if (total > maxSpan) maxSpan = total
  }
  if (maxSpan <= 0) return sections
  return sections.filter((s) => spanBySection.get(s.id) === maxSpan)
}

/** Total estimated eighths covered by the given sections. */
export async function calculateTotalEighths(sectionIds: string[]): Promise<number> {
  if (sectionIds.length === 0) return 0
  const rangesBySection = await listRangesBySectionIds(sectionIds)
  return sumSectionEighths(sectionIds, rangesBySection).total
}

/**
 * True when the scene has shot-linked sections but their combined coverage is less than the
 * scene's full page length (scenes.page_eighths). Returns false when scene length is unknown.
 */
export async function identifyPartialSceneCoverage(
  sceneId: string,
  sectionIds: string[]
): Promise<boolean> {
  if (sectionIds.length === 0) return false
  const scene = await getSceneById(sceneId)
  const fullEighths = scene?.page_eighths ?? null
  if (fullEighths == null || fullEighths <= 0) return false
  const covered = await calculateTotalEighths(sectionIds)
  return covered < fullEighths
}

/**
 * Included sections whose scene is reachable only through scheduled shots (shot.scene_id) and not
 * through a direct SCENE strip — i.e. not obvious from stripboard scene data alone.
 */
export function identifySectionsScheduledViaShots(
  includedSections: readonly ScriptSection[],
  directSceneIds: ReadonlySet<string>
): string[] {
  return includedSections
    .filter((section) => !directSceneIds.has(section.scene_id))
    .map((section) => section.id)
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

function emptySummary(
  shootDayId: string,
  productionId: string,
  unitId: string | null
): ShootDayScriptSectionsSummary {
  return {
    shootDayId,
    productionId,
    unitId,
    sceneIds: [],
    scriptVersionIds: [],
    includedSectionIds: [],
    fallbackSectionIds: [],
    linkedShotIds: [],
    totalEstimatedEighths: 0,
    partialSceneIds: [],
    sectionsScheduledViaShotsOnly: [],
    characterNames: [],
    personIds: [],
    warnings: [],
  }
}

export async function deriveShootDayScriptSections(
  shootDayId: string,
  options?: DeriveShootDayScriptSectionsOptions
): Promise<ShootDayScriptSectionsSummary> {
  const shootDay = await getShootDayById(shootDayId)
  if (!shootDay) throw new Error('Shoot day not found')
  const productionId = shootDay.production_id

  let unitId: string | null = null
  if (options?.shootDayUnitId) {
    const dayUnit = await getShootDayUnitById(options.shootDayUnitId)
    unitId = dayUnit?.unit_id ?? null
  }

  // Local-only: remote-server productions have no SB1 endpoint yet (see file header).
  if ((await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
    return emptySummary(shootDayId, productionId, unitId)
  }

  const ctx = await loadScheduleContext(shootDayId, options)
  const warnings: ShootDaySectionWarning[] = []

  // Shot-linked sections, tracking which scenes received shot coverage and which shots linked.
  const sectionsByShot = await listSectionsByShotIds(ctx.shotIds)
  const includedById = new Map<string, ScriptSection>()
  const linkedShotIds: string[] = []
  const scenesWithShotSections = new Set<string>()
  for (const shotId of ctx.shotIds) {
    const linked = (sectionsByShot.get(shotId) ?? []).filter((section) => {
      if (section.status === 'omitted') {
        warnings.push({
          code: 'omitted_section_skipped',
          message: 'Linked section is omitted and was excluded.',
          shotId,
          sectionId: section.id,
        })
        return false
      }
      return true
    })
    if (linked.length === 0) {
      warnings.push({
        code: 'shot_no_linked_section',
        message: 'Scheduled shot has no linked script section.',
        shotId,
      })
      continue
    }
    linkedShotIds.push(shotId)
    for (const section of linked) {
      includedById.set(section.id, section)
      scenesWithShotSections.add(section.scene_id)
    }
  }
  const includedSections = [...includedById.values()]

  // Per scheduled scene: report missing sections, or fall back to full-scene sections.
  const fallbackById = new Map<string, ScriptSection>()
  for (const sceneId of ctx.sceneIds) {
    if (scenesWithShotSections.has(sceneId)) continue
    const sceneSections = await listSectionsByScene(sceneId)
    if (sceneSections.length === 0) {
      warnings.push({
        code: 'scene_no_sections',
        message: 'Scheduled scene has no script sections.',
        sceneId,
      })
      continue
    }
    const fallback = await listFallbackFullSceneSections(sceneId)
    for (const section of fallback) fallbackById.set(section.id, section)
    warnings.push({
      code: 'scene_fallback_full_scene',
      message: 'Scheduled scene has no shot-linked sections; using full-scene fallback.',
      sceneId,
    })
  }
  const fallbackSections = [...fallbackById.values()]

  const includedSectionIds = includedSections.map((s) => s.id).sort()
  const fallbackSectionIds = fallbackSections.map((s) => s.id).sort()
  const allSectionIds = [...new Set([...includedSectionIds, ...fallbackSectionIds])]

  // Eighth coverage + estimated-range warnings (single ranges load).
  const rangesBySection = await listRangesBySectionIds(allSectionIds)
  const { total: totalEstimatedEighths, estimatedSectionIds } = sumSectionEighths(
    allSectionIds,
    rangesBySection
  )
  for (const sectionId of [...estimatedSectionIds].sort()) {
    warnings.push({
      code: 'estimated_range',
      message: 'Linked section range is estimated/best-effort.',
      sectionId,
    })
  }

  // Mixed script versions and outdated revision warnings across included sections.
  const allIncludedAndFallback = [...includedSections, ...fallbackSections]
  const distinctVersionIds = [...new Set(allIncludedAndFallback.map((s) => s.script_version_id))]
  const versionsForLabels = await Promise.all(distinctVersionIds.map((id) => getScriptVersionById(id)))
  const labelByVersionId = new Map(
    versionsForLabels.filter(Boolean).map((v) => [v!.id, formatScriptVersionLabel(v!)])
  )

  const baselineVersion = includedSections[0]?.script_version_id ?? null
  if (baselineVersion != null) {
    for (const section of includedSections) {
      if (section.script_version_id !== baselineVersion) {
        const baselineLabel = labelByVersionId.get(baselineVersion) ?? baselineVersion
        const sectionLabel = labelByVersionId.get(section.script_version_id) ?? section.script_version_id
        warnings.push({
          code: 'mixed_script_version',
          message: `Linked section (${sectionLabel}) belongs to a different script version than other included sections (${baselineLabel}).`,
          sectionId: section.id,
        })
      }
    }
  }

  const latestByEpisode = new Map<string | null, string>()
  for (const ep of [...new Set(allIncludedAndFallback.map((s) => s.episode_id ?? null))]) {
    const latest = await getLatestScriptVersionForScope(productionId, ep)
    if (latest) latestByEpisode.set(ep, latest.id)
  }
  for (const section of includedSections) {
    const latestId = latestByEpisode.get(section.episode_id ?? null)
    if (latestId && section.script_version_id !== latestId) {
      const sectionLabel = labelByVersionId.get(section.script_version_id) ?? section.script_version_id
      const latest = await getLatestScriptVersionForScope(productionId, section.episode_id)
      const latestLabel = latest ? formatScriptVersionLabel(latest) : latestId
      warnings.push({
        code: 'outdated_script_version',
        message: `Linked section (${sectionLabel}) references an older script revision; latest is ${latestLabel}.`,
        sectionId: section.id,
      })
    }
  }

  // Partial-scene coverage among shot-covered scenes.
  const partialSceneIds: string[] = []
  for (const sceneId of [...scenesWithShotSections].sort()) {
    const sceneSectionIds = includedSections
      .filter((s) => s.scene_id === sceneId)
      .map((s) => s.id)
    if (await identifyPartialSceneCoverage(sceneId, sceneSectionIds)) {
      partialSceneIds.push(sceneId)
    }
  }

  const sectionsScheduledViaShotsOnly = identifySectionsScheduledViaShots(
    includedSections,
    ctx.directSceneIds
  ).sort()

  // Characters across included + fallback sections.
  const charactersBySection = await listCharactersBySectionIds(allSectionIds)
  const characterNames = new Set<string>()
  const personIds = new Set<string>()
  for (const list of charactersBySection.values()) {
    for (const character of list) {
      if (character.character_name) characterNames.add(character.character_name)
      if (character.person_id) personIds.add(character.person_id)
    }
  }

  const scriptVersionIds = [
    ...new Set([...includedSections, ...fallbackSections].map((s) => s.script_version_id)),
  ].sort()

  return {
    shootDayId,
    productionId,
    unitId,
    sceneIds: ctx.sceneIds,
    scriptVersionIds,
    includedSectionIds,
    fallbackSectionIds,
    linkedShotIds: linkedShotIds.sort(),
    totalEstimatedEighths,
    partialSceneIds,
    sectionsScheduledViaShotsOnly,
    characterNames: [...characterNames].sort(),
    personIds: [...personIds].sort(),
    warnings,
  }
}
