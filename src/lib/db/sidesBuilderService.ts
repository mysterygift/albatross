/**
 * SB6 — Daily Sides Builder service.
 *
 * Assembles a shoot-day sides draft model from the SB5 schedule-integration summary
 * (`deriveShootDayScriptSections`). The impure `loadSidesBuilderSource` hydrates the SB5 summary
 * into a typed, display-ready `SidesBuilderSource` (sections + scenes + ranges + characters +
 * best-effort script text + linked shots). Everything else in this module is a set of pure,
 * deterministic helpers that filter, resolve manual include/exclude selections, group the preview,
 * and validate the draft before an export handoff.
 *
 * Scope notes:
 * - Read-only. This module never writes the DB, mutates script sections, generates PDFs, or
 *   creates document attachments. Manual include/exclude state is held by the caller (local draft).
 * - Best-effort: page/eighth data and script text are derived from the existing SB1 model and are
 *   flagged as estimated where exact ranges are unavailable. No new parsing behaviour is added.
 * - The eighth model mirrors SB5 (8 eighths per page; a section's coverage is the span between its
 *   range start/end expressed as global eighths).
 */
import { getEpisodeById } from './repositories/episodes'
import { getLocationById } from './repositories/location'
import { getSceneById, getShootDayById } from './repositories/schedule'
import { getShootDayUnitById } from './repositories/shoot-day-units'
import { listScriptPagesByScriptVersion } from './repositories/scriptPages'
import {
  listSectionsByIds,
  listCharactersBySectionIds,
  listRangesBySectionIds,
  listShotsBySection,
} from './repositories/scriptSections'
import {
  getLatestScriptVersionForScope,
  listScriptVersionsByProduction,
} from './repositories/scriptVersions'
import { formatScriptVersionLabel } from './scriptSectionReconciliationService'
import {
  collateSceneScriptText,
  extractScriptTextForRange,
  joinScenePagesFullText,
  scenePagesForVersion,
} from './sidesScriptCollation'
import { getUnitById } from './repositories/units'
import {
  analyzeExportCoverage,
  toSidesValidationWarnings,
} from './coverageAnalysisService'
import {
  deriveShootDayScriptSections,
  type DeriveShootDayScriptSectionsOptions,
  type ShootDaySectionWarning,
  type ShootDayScriptSectionsSummary,
} from './shootDayScriptSectionsService'
import type { Scene, ScriptPage, ScriptSection, ScriptSectionRange } from './types'

const EIGHTHS_PER_PAGE = 8

// ─── Public types ─────────────────────────────────────────────────────────────

/** Whether a section was reached via shot<->section links (`included`) or full-scene fallback. */
export type SidesSectionOrigin = 'included' | 'fallback'

export type SidesSectionEntry = {
  sectionId: string
  /** Carries status (omitted check), label, scene_id, script_version_id, notes. */
  section: ScriptSection
  /** Owning scene: heading/title/scene_number/episode_id/location_id/page_eighths. */
  scene: Scene
  episodeId: string | null
  episodeName: string | null
  /** For deterministic episode ordering; null episodes sort last. */
  episodeSortOrder: number | null
  unitId: string | null
  locationId: string | null
  locationName: string | null
  ranges: ScriptSectionRange[]
  characterNames: string[]
  /** Shot numbers for shots linked to this section (display reference). */
  linkedShotNumbers: string[]
  /** Best-effort range-sliced script text for this section, or null when unavailable. */
  scriptText: string | null
  origin: SidesSectionOrigin
  isPartialScene: boolean
  isViaShotsOnly: boolean
  /** True when no range resolves to a parseable page number (page/eighth data is best-effort). */
  isEstimated: boolean
  /** Estimated eighth coverage for this section (0 when unknown). */
  estimatedEighths: number
  /** Global start eighth used only for deterministic ordering; large when unknown. */
  startPageSort: number
}

export type SidesBuilderSource = {
  shootDayId: string
  productionId: string
  unitId: string | null
  shootDate: string | null
  unitName: string | null
  scheduledSceneIds: string[]
  scriptVersionIds: string[]
  /** Resolved display labels keyed by script version id. */
  scriptVersionLabelsById: Record<string, string>
  /** Latest script version id per episode scope (null key stored as empty string). */
  latestScriptVersionIdByEpisodeScope: Record<string, string>
  totalEstimatedEighths: number
  entries: SidesSectionEntry[]
  /** Script pages keyed by script version id (for range-based collation). */
  scriptPagesByVersionId: Record<string, ScriptPage[]>
  /** Pass-through SB5 warnings (incl. shot_no_linked_section, omitted_section_skipped). */
  sb5Warnings: ShootDaySectionWarning[]
}

export type SidesFilters = {
  unitId: string | null
  episodeId: string | null
  sceneId: string | null
  characterName: string | null
  locationId: string | null
  linkedShotOnly: boolean
  fullScheduledScenesOnly: boolean
}

/** Local draft selection. Default = every entry included; an explicit `false` excludes a section. */
export type SidesSelectionState = { overrides: Record<string, boolean> }

export type SidesPreviewScene = {
  scene: Scene
  entries: SidesSectionEntry[]
  /** Deduped script body for all selected sections in this scene. */
  collatedScriptText: string | null
}

export type SidesPreviewGroup = {
  episodeId: string | null
  episodeName: string | null
  scenes: SidesPreviewScene[]
}

export type SidesValidationCode =
  | 'no_sections_selected'
  | 'section_no_script_text'
  | 'section_estimated_only'
  | 'mixed_script_versions'
  | 'outdated_script_versions'
  | 'omitted_section_selected'
  | 'shot_scheduled_no_section'

export type SidesValidationWarning = {
  code: SidesValidationCode
  message: string
  /** Only `no_sections_selected` blocks the export handoff. */
  blocking: boolean
  sectionId?: string
  shotId?: string
}

export type SidesDraftModel = {
  selectedSectionIds: string[]
  filteredEntries: SidesSectionEntry[]
  groups: SidesPreviewGroup[]
  totalEstimatedEighths: number
  validation: SidesValidationWarning[]
}

// ─── Pure eighth-model helpers ──────────────────────────────────────────────

/** Best-effort parse of a (possibly non-numeric, e.g. '12A') display page to a leading integer. */
export function parseLeadingPageNumber(page: string | null): number | null {
  if (page == null) return null
  const match = /^\s*(\d+)/.exec(page)
  if (!match) return null
  return Number.parseInt(match[1], 10)
}

function rangeSpanEighths(range: ScriptSectionRange): { eighths: number; estimated: boolean } {
  const startPage = parseLeadingPageNumber(range.start_page)
  const endPage = parseLeadingPageNumber(range.end_page)
  if (startPage == null || endPage == null) {
    return { eighths: 0, estimated: true }
  }
  const startGlobal = (startPage - 1) * EIGHTHS_PER_PAGE + (range.start_eighth ?? 0)
  const endGlobal = (endPage - 1) * EIGHTHS_PER_PAGE + (range.end_eighth ?? 0)
  const span = endGlobal - startGlobal
  return { eighths: span > 0 ? span : 0, estimated: false }
}

function rangeStartGlobalEighth(range: ScriptSectionRange): number | null {
  const startPage = parseLeadingPageNumber(range.start_page)
  if (startPage == null) return null
  return (startPage - 1) * EIGHTHS_PER_PAGE + (range.start_eighth ?? 0)
}

/** Coverage metadata for a section's ranges: total eighths, estimated flag, and ordering key. */
function summariseRanges(ranges: ScriptSectionRange[]): {
  estimatedEighths: number
  isEstimated: boolean
  startPageSort: number
} {
  if (ranges.length === 0) {
    return { estimatedEighths: 0, isEstimated: true, startPageSort: Number.MAX_SAFE_INTEGER }
  }
  let total = 0
  let estimated = false
  let startSort = Number.MAX_SAFE_INTEGER
  for (const range of ranges) {
    const span = rangeSpanEighths(range)
    total += span.eighths
    if (span.estimated) estimated = true
    const start = rangeStartGlobalEighth(range)
    if (start != null && start < startSort) startSort = start
  }
  return { estimatedEighths: total, isEstimated: estimated, startPageSort: startSort }
}

// ─── Pure draft helpers ──────────────────────────────────────────────────────

export function defaultSidesFilters(): SidesFilters {
  return {
    unitId: null,
    episodeId: null,
    sceneId: null,
    characterName: null,
    locationId: null,
    linkedShotOnly: false,
    fullScheduledScenesOnly: false,
  }
}

/** Apply local builder filters to the source entries. Never mutates the inputs. */
export function applySidesFilters(
  entries: readonly SidesSectionEntry[],
  filters: SidesFilters
): SidesSectionEntry[] {
  return entries.filter((entry) => {
    if (filters.unitId != null && entry.unitId !== filters.unitId) return false
    if (filters.episodeId != null && entry.episodeId !== filters.episodeId) return false
    if (filters.sceneId != null && entry.scene.id !== filters.sceneId) return false
    if (filters.characterName != null && !entry.characterNames.includes(filters.characterName)) {
      return false
    }
    if (filters.locationId != null && entry.locationId !== filters.locationId) return false
    if (filters.linkedShotOnly && entry.origin !== 'included') return false
    if (filters.fullScheduledScenesOnly && entry.origin !== 'fallback') return false
    return true
  })
}

/** A section is included in the draft unless its override is explicitly `false`. */
export function isSectionSelected(sectionId: string, selection: SidesSelectionState): boolean {
  return selection.overrides[sectionId] !== false
}

/** Deterministic preview ordering: episode (sort order, then name, null last) → scene → range. */
export function compareSidesEntries(a: SidesSectionEntry, b: SidesSectionEntry): number {
  const aEpisodeOrder = a.episodeSortOrder ?? Number.MAX_SAFE_INTEGER
  const bEpisodeOrder = b.episodeSortOrder ?? Number.MAX_SAFE_INTEGER
  if (aEpisodeOrder !== bEpisodeOrder) return aEpisodeOrder - bEpisodeOrder
  const aEpisodeName = a.episodeName ?? ''
  const bEpisodeName = b.episodeName ?? ''
  if (aEpisodeName !== bEpisodeName) return aEpisodeName.localeCompare(bEpisodeName)

  const aSceneNum = parseLeadingPageNumber(a.scene.scene_number)
  const bSceneNum = parseLeadingPageNumber(b.scene.scene_number)
  if (aSceneNum != null && bSceneNum != null && aSceneNum !== bSceneNum) {
    return aSceneNum - bSceneNum
  }
  if (a.scene.scene_number !== b.scene.scene_number) {
    return a.scene.scene_number.localeCompare(b.scene.scene_number)
  }

  if (a.startPageSort !== b.startPageSort) return a.startPageSort - b.startPageSort
  const aLabel = a.section.label ?? ''
  const bLabel = b.section.label ?? ''
  return aLabel.localeCompare(bLabel)
}

/** Group entries into episode → scene order for the preview (entries are sorted first). */
export function groupSidesEntries(entries: readonly SidesSectionEntry[]): SidesPreviewGroup[] {
  const sorted = [...entries].sort(compareSidesEntries)
  const groups: SidesPreviewGroup[] = []
  let currentGroup: SidesPreviewGroup | null = null
  let currentScene: SidesPreviewScene | null = null

  for (const entry of sorted) {
    if (!currentGroup || currentGroup.episodeId !== entry.episodeId) {
      currentGroup = { episodeId: entry.episodeId, episodeName: entry.episodeName, scenes: [] }
      groups.push(currentGroup)
      currentScene = null
    }
    if (!currentScene || currentScene.scene.id !== entry.scene.id) {
      currentScene = { scene: entry.scene, entries: [], collatedScriptText: null }
      currentGroup.scenes.push(currentScene)
    }
    currentScene.entries.push(entry)
  }
  return groups
}

/** Validation for the export handoff. Only `no_sections_selected` blocks. */
export function validateSidesDraft(
  source: Pick<
    SidesBuilderSource,
    | 'entries'
    | 'sb5Warnings'
    | 'scriptVersionLabelsById'
    | 'latestScriptVersionIdByEpisodeScope'
  >,
  selectedEntries: readonly SidesSectionEntry[]
): SidesValidationWarning[] {
  return toSidesValidationWarnings(
    analyzeExportCoverage({ source, selectedEntries })
  )
}

function enrichSidesGroupsWithCollatedScript(
  groups: SidesPreviewGroup[],
  scriptPagesByVersionId: Record<string, ScriptPage[]>
): SidesPreviewGroup[] {
  return groups.map((group) => ({
    ...group,
    scenes: group.scenes.map((sceneGroup) => ({
      ...sceneGroup,
      collatedScriptText: collateSceneScriptText(
        sceneGroup.scene,
        sceneGroup.entries,
        scriptPagesByVersionId,
        sceneGroup.entries[0]?.locationName ?? null
      ),
    })),
  }))
}

/** Build the full sides draft model from the source plus local filters and manual selection. */
export function buildSidesDraftModel(
  source: SidesBuilderSource,
  filters: SidesFilters,
  selection: SidesSelectionState
): SidesDraftModel {
  const filteredEntries = applySidesFilters(source.entries, filters)
  const selectedEntries = filteredEntries.filter((entry) =>
    isSectionSelected(entry.sectionId, selection)
  )
  const groups = enrichSidesGroupsWithCollatedScript(
    groupSidesEntries(selectedEntries),
    source.scriptPagesByVersionId ?? {}
  )
  const totalEstimatedEighths = selectedEntries.reduce((sum, e) => sum + e.estimatedEighths, 0)
  const validation = validateSidesDraft(source, selectedEntries)

  return {
    selectedSectionIds: selectedEntries.map((e) => e.sectionId),
    filteredEntries,
    groups,
    totalEstimatedEighths,
    validation,
  }
}

// ─── Impure source loader ────────────────────────────────────────────────────

type HydratedSidesData = {
  entries: SidesSectionEntry[]
  scriptPagesByVersionId: Record<string, ScriptPage[]>
}

/**
 * Hydrate the SB5 summary into a display-ready source for the sides builder. Read-only: derives
 * from existing SB1/SB5 data and never writes. Remote-server productions return an empty source.
 */
export async function loadSidesBuilderSource(
  shootDayId: string,
  options?: DeriveShootDayScriptSectionsOptions
): Promise<SidesBuilderSource> {
  const summary = await deriveShootDayScriptSections(shootDayId, options)

  const shootDay = await getShootDayById(shootDayId)
  const shootDate = shootDay?.shoot_date ?? null

  let unitName: string | null = null
  if (summary.unitId) {
    const unit = await getUnitById(summary.unitId)
    unitName = unit?.name ?? null
  } else if (options?.shootDayUnitId) {
    const dayUnit = await getShootDayUnitById(options.shootDayUnitId)
    if (dayUnit) {
      const unit = await getUnitById(dayUnit.unit_id)
      unitName = unit?.name ?? null
    }
  }

  const { entries, scriptPagesByVersionId } = await hydrateEntries(summary)

  const productionVersions = await listScriptVersionsByProduction(summary.productionId)
  const scriptVersionLabelsById: Record<string, string> = {}
  for (const v of productionVersions) {
    scriptVersionLabelsById[v.id] = formatScriptVersionLabel(v)
  }
  const episodeScopes = [...new Set(entries.map((e) => e.episodeId ?? null))]
  const latestScriptVersionIdByEpisodeScope: Record<string, string> = {}
  for (const ep of episodeScopes) {
    const latest = await getLatestScriptVersionForScope(summary.productionId, ep)
    if (latest) latestScriptVersionIdByEpisodeScope[ep ?? ''] = latest.id
  }

  return {
    shootDayId: summary.shootDayId,
    productionId: summary.productionId,
    unitId: summary.unitId,
    shootDate,
    unitName,
    scheduledSceneIds: summary.sceneIds,
    scriptVersionIds: summary.scriptVersionIds,
    scriptVersionLabelsById,
    latestScriptVersionIdByEpisodeScope,
    totalEstimatedEighths: summary.totalEstimatedEighths,
    entries,
    scriptPagesByVersionId,
    sb5Warnings: summary.warnings,
  }
}

async function hydrateEntries(summary: ShootDayScriptSectionsSummary): Promise<HydratedSidesData> {
  const originBySectionId = new Map<string, SidesSectionOrigin>()
  for (const id of summary.includedSectionIds) originBySectionId.set(id, 'included')
  for (const id of summary.fallbackSectionIds) {
    if (!originBySectionId.has(id)) originBySectionId.set(id, 'fallback')
  }
  const allSectionIds = [...originBySectionId.keys()]
  if (allSectionIds.length === 0) {
    return { entries: [], scriptPagesByVersionId: {} }
  }

  const sections = await listSectionsByIds(allSectionIds)
  const validSections = sections

  const [rangesBySection, charactersBySection] = await Promise.all([
    listRangesBySectionIds(allSectionIds),
    listCharactersBySectionIds(allSectionIds),
  ])

  const sceneIds = [...new Set(validSections.map((s) => s.scene_id))]
  const scenes = await Promise.all(sceneIds.map((id) => getSceneById(id)))
  const sceneById = new Map<string, Scene>()
  for (const scene of scenes) {
    if (scene) sceneById.set(scene.id, scene)
  }

  const episodeIds = [
    ...new Set(
      validSections
        .map((s) => sceneById.get(s.scene_id)?.episode_id ?? s.episode_id)
        .filter((id): id is string => id != null)
    ),
  ]
  const episodes = await Promise.all(episodeIds.map((id) => getEpisodeById(id)))
  const episodeById = new Map(episodes.filter((e) => e != null).map((e) => [e!.id, e!]))

  const locationIds = [
    ...new Set(
      sceneIds
        .map((id) => sceneById.get(id)?.location_id ?? null)
        .filter((id): id is string => id != null)
    ),
  ]
  const locations = await Promise.all(locationIds.map((id) => getLocationById(id)))
  const locationById = new Map(locations.filter((l) => l != null).map((l) => [l!.id, l!]))

  const scriptVersionIds = [...new Set(validSections.map((s) => s.script_version_id))]
  const pageLists = await Promise.all(
    scriptVersionIds.map((id) => listScriptPagesByScriptVersion(id))
  )
  const scriptPagesByVersionId: Record<string, ScriptPage[]> = {}
  scriptVersionIds.forEach((id, index) => {
    scriptPagesByVersionId[id] = pageLists[index] ?? []
  })

  const shotLists = await Promise.all(allSectionIds.map((id) => listShotsBySection(id)))
  const shotNumbersBySection = new Map<string, string[]>()
  allSectionIds.forEach((id, index) => {
    shotNumbersBySection.set(
      id,
      shotLists[index]!.map((shot) => shot.shot_number).sort((a, b) => a.localeCompare(b))
    )
  })

  const partialSceneIds = new Set(summary.partialSceneIds)
  const viaShotsOnly = new Set(summary.sectionsScheduledViaShotsOnly)

  const entries: SidesSectionEntry[] = []
  for (const section of validSections) {
    const scene = sceneById.get(section.scene_id)
    if (!scene) continue
    const ranges = rangesBySection.get(section.id) ?? []
    const { estimatedEighths, isEstimated, startPageSort } = summariseRanges(ranges)
    const episodeId = scene.episode_id ?? section.episode_id ?? null
    const episode = episodeId ? episodeById.get(episodeId) : undefined
    const locationId = scene.location_id ?? null
    const location = locationId ? locationById.get(locationId) : undefined
    const characterNames = (charactersBySection.get(section.id) ?? [])
      .map((c) => c.character_name)
      .filter((name): name is string => name != null && name.trim() !== '')

    const origin = originBySectionId.get(section.id) ?? 'included'
    const pages = scenePagesForVersion(
      scriptPagesByVersionId,
      section.script_version_id,
      section.scene_id
    )
    const primaryRange = ranges[0]
    let scriptText: string | null = null
    if (origin === 'fallback') {
      scriptText = joinScenePagesFullText(pages)
    } else if (primaryRange) {
      scriptText = extractScriptTextForRange(pages, primaryRange)
    }

    entries.push({
      sectionId: section.id,
      section,
      scene,
      episodeId,
      episodeName: episode?.name ?? null,
      episodeSortOrder: episode?.sort_order ?? null,
      unitId: summary.unitId,
      locationId,
      locationName: location?.name ?? null,
      ranges,
      characterNames: [...new Set(characterNames)].sort((a, b) => a.localeCompare(b)),
      linkedShotNumbers: shotNumbersBySection.get(section.id) ?? [],
      scriptText,
      origin,
      isPartialScene: partialSceneIds.has(section.scene_id),
      isViaShotsOnly: viaShotsOnly.has(section.id),
      isEstimated,
      estimatedEighths,
      startPageSort,
    })
  }

  return {
    entries: entries.sort(compareSidesEntries),
    scriptPagesByVersionId,
  }
}
