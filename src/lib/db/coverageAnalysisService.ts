/**
 * SB9 — Coverage analysis & validation service.
 *
 * Pure, read-only analysis of script-section coverage across scenes, shoot days, and sides
 * exports. Composes SB4 link data, SB5 shoot-day summaries, and SB6 sides selection without
 * mutating source data. Used by SB6/SB7 export validation and read-only coverage UI panels.
 */
import { getEffectiveDataSourceForProduction } from './projectDataSource'
import { getSceneById, listShotsByScene } from './repositories/schedule'
import {
  getLinkedSectionCountsByShotIds,
  getLinkedShotCountsBySectionIds,
  listSectionsByIds,
  listRangesBySectionIds,
  listSectionsByScene,
} from './repositories/scriptSections'
import {
  getLatestScriptVersionForScope,
  listScriptVersionsByProduction,
} from './repositories/scriptVersions'
import { formatScriptVersionLabel } from './scriptSectionReconciliationService'
import type { SidesSectionEntry, SidesBuilderSource, SidesValidationWarning } from './sidesBuilderService'
import {
  deriveShootDayScriptSections,
  type DeriveShootDayScriptSectionsOptions,
  type ShootDaySectionWarning,
  type ShootDayScriptSectionsSummary,
} from './shootDayScriptSectionsService'
import type { Scene, ScriptSection, ScriptSectionRange, Shot } from './types'

const EIGHTHS_PER_PAGE = 8

function parseLeadingPageNumber(page: string | null): number | null {
  if (page == null) return null
  const match = /^\s*(\d+)/.exec(page)
  if (!match) return null
  return Number.parseInt(match[1], 10)
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type CoverageSeverity = 'info' | 'warning' | 'blocking'

export type CoverageIssueCode =
  | 'section_without_linked_shot'
  | 'shot_without_linked_section'
  | 'scene_no_sections'
  | 'scheduled_shot_no_section'
  | 'scheduled_section_not_in_sides'
  | 'sides_section_not_scheduled'
  | 'omitted_section_in_sides'
  | 'mixed_script_versions'
  | 'older_version_link'
  | 'partial_scene_coverage'
  | 'estimated_range_coverage'
  | 'scene_fallback_full_scene'
  | 'omitted_section_skipped'
  | 'no_sections_selected'
  | 'section_no_script_text'

export type CoverageIssue = {
  code: CoverageIssueCode
  severity: CoverageSeverity
  message: string
  sectionId?: string
  shotId?: string
  sceneId?: string
}

export type SceneCoverageInput = {
  scene: Scene
  sections: readonly ScriptSection[]
  shots: readonly Shot[]
  linkedShotCountBySectionId: ReadonlyMap<string, number>
  linkedSectionCountByShotId: ReadonlyMap<string, number>
  rangesBySectionId: ReadonlyMap<string, ScriptSectionRange[]>
  latestVersionIdByEpisodeId: ReadonlyMap<string | null, string>
  scriptVersionLabelsById?: ReadonlyMap<string, string>
}

export type SceneCoverageSummary = {
  sceneId: string
  totalSections: number
  coveredSections: number
  uncoveredSections: number
  linkedShots: number
  unlinkedShots: number
  coveragePercent: number
  isPartialScene: boolean
  issues: CoverageIssue[]
}

export type ShootDayCoverageInput = {
  summary: ShootDayScriptSectionsSummary
  sectionsById: Readonly<Record<string, ScriptSection>>
  selectedSectionIds?: readonly string[]
}

export type ShootDayCoverageSummary = {
  shootDayId: string
  scheduledScenes: number
  includedSections: number
  fallbackSections: number
  missingSections: number
  selectedSidesSections: number
  unscheduledSelectedSections: number
  totalEstimatedEighths: number
  blockingExportIssues: CoverageIssue[]
  issues: CoverageIssue[]
}

export type ShootDayCoverageLoadResult = {
  coverage: ShootDayCoverageSummary
  includedSectionIds: string[]
  fallbackSectionIds: string[]
  partialSceneIds: string[]
  sectionsScheduledViaShotsOnly: string[]
}

export type ExportCoverageInput = {
  source: Pick<
    SidesBuilderSource,
    | 'entries'
    | 'sb5Warnings'
    | 'scriptVersionLabelsById'
    | 'latestScriptVersionIdByEpisodeScope'
  >
  selectedEntries: readonly SidesSectionEntry[]
  summary?: ShootDayScriptSectionsSummary
  sectionsById?: Readonly<Record<string, ScriptSection>>
}

// ─── Eighth helpers ───────────────────────────────────────────────────────────

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

function sumSectionEighths(
  sectionIds: readonly string[],
  rangesBySection: ReadonlyMap<string, ScriptSectionRange[]>
): { total: number; hasEstimated: boolean } {
  let total = 0
  let hasEstimated = false
  for (const sectionId of sectionIds) {
    const ranges = rangesBySection.get(sectionId) ?? []
    if (ranges.length === 0) {
      hasEstimated = true
      continue
    }
    for (const range of ranges) {
      const span = rangeSpanEighths(range)
      total += span.eighths
      if (span.estimated) hasEstimated = true
    }
  }
  return { total, hasEstimated }
}

function sectionHasEstimatedRanges(
  sectionId: string,
  rangesBySection: ReadonlyMap<string, ScriptSectionRange[]>
): boolean {
  const ranges = rangesBySection.get(sectionId) ?? []
  if (ranges.length === 0) return true
  return ranges.some((r) => rangeSpanEighths(r).estimated)
}

function issueKey(issue: CoverageIssue): string {
  return `${issue.code}:${issue.sectionId ?? ''}:${issue.shotId ?? ''}:${issue.sceneId ?? ''}`
}

function dedupeIssues(issues: CoverageIssue[]): CoverageIssue[] {
  const seen = new Set<string>()
  const result: CoverageIssue[] = []
  for (const issue of issues) {
    const key = issueKey(issue)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(issue)
  }
  return result
}

function severityForCode(code: CoverageIssueCode): CoverageSeverity {
  if (code === 'no_sections_selected') return 'blocking'
  if (code === 'scene_fallback_full_scene' || code === 'omitted_section_skipped') return 'info'
  return 'warning'
}

// ─── SB5 warning mapper ───────────────────────────────────────────────────────

export function mapSb5WarningToCoverageIssue(warning: ShootDaySectionWarning): CoverageIssue {
  const codeMap: Record<ShootDaySectionWarning['code'], CoverageIssueCode> = {
    scene_no_sections: 'scene_no_sections',
    scene_fallback_full_scene: 'scene_fallback_full_scene',
    shot_no_linked_section: 'scheduled_shot_no_section',
    mixed_script_version: 'mixed_script_versions',
    outdated_script_version: 'older_version_link',
    estimated_range: 'estimated_range_coverage',
    omitted_section_skipped: 'omitted_section_skipped',
  }
  const code = codeMap[warning.code]
  return {
    code,
    severity: severityForCode(code),
    message: warning.message,
    sceneId: warning.sceneId,
    shotId: warning.shotId,
    sectionId: warning.sectionId,
  }
}

// ─── Scene coverage ───────────────────────────────────────────────────────────

export function analyzeSceneCoverage(input: SceneCoverageInput): SceneCoverageSummary {
  const activeSections = input.sections.filter((s) => s.status !== 'omitted')
  const linkedSections = activeSections.filter(
    (s) => (input.linkedShotCountBySectionId.get(s.id) ?? 0) > 0
  )
  const uncoveredSections = activeSections.filter(
    (s) => (input.linkedShotCountBySectionId.get(s.id) ?? 0) === 0
  )
  const linkedShots = input.shots.filter(
    (s) => (input.linkedSectionCountByShotId.get(s.id) ?? 0) > 0
  )
  const unlinkedShots = input.shots.filter(
    (s) => (input.linkedSectionCountByShotId.get(s.id) ?? 0) === 0
  )

  const totalSections = activeSections.length
  const coveredSections = linkedSections.length
  const coveragePercent =
    totalSections === 0 ? 0 : Math.round((coveredSections / totalSections) * 100)

  const issues: CoverageIssue[] = []

  for (const section of uncoveredSections) {
    issues.push({
      code: 'section_without_linked_shot',
      severity: 'warning',
      message: 'Section has no linked shots.',
      sectionId: section.id,
      sceneId: input.scene.id,
    })
  }

  for (const shot of unlinkedShots) {
    issues.push({
      code: 'shot_without_linked_section',
      severity: 'warning',
      message: 'Shot has no linked script section.',
      shotId: shot.id,
      sceneId: input.scene.id,
    })
  }

  for (const section of activeSections) {
    if (sectionHasEstimatedRanges(section.id, input.rangesBySectionId)) {
      issues.push({
        code: 'estimated_range_coverage',
        severity: 'warning',
        message: 'Section range is estimated/best-effort.',
        sectionId: section.id,
        sceneId: input.scene.id,
      })
    }
  }

  const latestVersionId = input.latestVersionIdByEpisodeId.get(input.scene.episode_id ?? null)
  for (const section of linkedSections) {
    if (latestVersionId && section.script_version_id !== latestVersionId) {
      const label =
        input.scriptVersionLabelsById?.get(section.script_version_id) ??
        section.script_version_id
      issues.push({
        code: 'older_version_link',
        severity: 'warning',
        message: `Linked section (${label}) references an older script revision.`,
        sectionId: section.id,
        sceneId: input.scene.id,
      })
    }
  }

  const distinctVersions = new Set(activeSections.map((s) => s.script_version_id))
  if (distinctVersions.size > 1) {
    issues.push({
      code: 'mixed_script_versions',
      severity: 'warning',
      message: 'Sections in this scene span more than one script version.',
      sceneId: input.scene.id,
    })
  }

  const linkedSectionIds = linkedSections.map((s) => s.id)
  let isPartialScene = false
  const fullEighths = input.scene.page_eighths ?? null
  if (linkedSectionIds.length > 0 && fullEighths != null && fullEighths > 0) {
    const { total } = sumSectionEighths(linkedSectionIds, input.rangesBySectionId)
    if (total < fullEighths) {
      isPartialScene = true
      issues.push({
        code: 'partial_scene_coverage',
        severity: 'warning',
        message: 'Shot-linked sections cover less than the full scene page length.',
        sceneId: input.scene.id,
      })
    }
  }

  return {
    sceneId: input.scene.id,
    totalSections,
    coveredSections,
    uncoveredSections: uncoveredSections.length,
    linkedShots: linkedShots.length,
    unlinkedShots: unlinkedShots.length,
    coveragePercent,
    isPartialScene,
    issues: dedupeIssues(issues),
  }
}

// ─── Shoot-day coverage ───────────────────────────────────────────────────────

export function analyzeShootDayCoverage(input: ShootDayCoverageInput): ShootDayCoverageSummary {
  const { summary, sectionsById, selectedSectionIds } = input
  const scheduledSectionIds = new Set([
    ...summary.includedSectionIds,
    ...summary.fallbackSectionIds,
  ])
  const missingSceneIds = summary.warnings
    .filter((w) => w.code === 'scene_no_sections')
    .map((w) => w.sceneId)
    .filter(Boolean) as string[]

  const issues: CoverageIssue[] = summary.warnings.map(mapSb5WarningToCoverageIssue)

  for (const sceneId of summary.partialSceneIds) {
    issues.push({
      code: 'partial_scene_coverage',
      severity: 'warning',
      message: 'Scheduled scene has partial shot-linked coverage.',
      sceneId,
    })
  }

  if (summary.scriptVersionIds.length > 1) {
    const hasMixed = issues.some((i) => i.code === 'mixed_script_versions')
    if (!hasMixed) {
      issues.push({
        code: 'mixed_script_versions',
        severity: 'warning',
        message: 'Scheduled sections span more than one script version.',
      })
    }
  }

  let selectedSidesSections = 0
  let unscheduledSelectedSections = 0

  if (selectedSectionIds) {
    selectedSidesSections = selectedSectionIds.length
    const selectedSet = new Set(selectedSectionIds)

    for (const sectionId of scheduledSectionIds) {
      if (!selectedSet.has(sectionId)) {
        issues.push({
          code: 'scheduled_section_not_in_sides',
          severity: 'warning',
          message: 'Scheduled section is not selected for sides.',
          sectionId,
        })
      }
    }

    for (const sectionId of selectedSectionIds) {
      if (!scheduledSectionIds.has(sectionId)) {
        unscheduledSelectedSections++
        issues.push({
          code: 'sides_section_not_scheduled',
          severity: 'warning',
          message: 'Selected sides section is not scheduled for this shoot day.',
          sectionId,
        })
      }
    }

    for (const sectionId of selectedSectionIds) {
      const section = sectionsById[sectionId]
      if (section?.status === 'omitted') {
        issues.push({
          code: 'omitted_section_in_sides',
          severity: 'warning',
          message: 'An omitted section is selected for sides.',
          sectionId,
        })
      }
    }
  }

  const deduped = dedupeIssues(issues)
  const blockingExportIssues = deduped.filter((i) => i.severity === 'blocking')

  return {
    shootDayId: summary.shootDayId,
    scheduledScenes: summary.sceneIds.length,
    includedSections: summary.includedSectionIds.length,
    fallbackSections: summary.fallbackSectionIds.length,
    missingSections: missingSceneIds.length,
    selectedSidesSections,
    unscheduledSelectedSections,
    totalEstimatedEighths: summary.totalEstimatedEighths,
    blockingExportIssues,
    issues: deduped,
  }
}

// ─── Export coverage ──────────────────────────────────────────────────────────

export function analyzeExportCoverage(input: ExportCoverageInput): CoverageIssue[] {
  const { source, selectedEntries } = input

  if (selectedEntries.length === 0) {
    return [
      {
        code: 'no_sections_selected',
        severity: 'blocking',
        message: 'No sections selected. Select at least one section before exporting.',
      },
    ]
  }

  const issues: CoverageIssue[] = []

  if (input.summary && input.sectionsById) {
    const shootDay = analyzeShootDayCoverage({
      summary: input.summary,
      sectionsById: input.sectionsById,
      selectedSectionIds: selectedEntries.map((e) => e.sectionId),
    })
    issues.push(...shootDay.issues)
  } else {
    const scheduledSectionIds = new Set(source.entries.map((e) => e.sectionId))
    const selectedIds = selectedEntries.map((e) => e.sectionId)

    for (const sectionId of scheduledSectionIds) {
      if (!selectedIds.includes(sectionId)) {
        issues.push({
          code: 'scheduled_section_not_in_sides',
          severity: 'warning',
          message: 'Scheduled section is not selected for sides.',
          sectionId,
        })
      }
    }

    for (const entry of selectedEntries) {
      if (!scheduledSectionIds.has(entry.sectionId)) {
        issues.push({
          code: 'sides_section_not_scheduled',
          severity: 'warning',
          message: 'Selected sides section is not scheduled for this shoot day.',
          sectionId: entry.sectionId,
        })
      }
    }
  }

  for (const entry of selectedEntries) {
    if (entry.section.status === 'omitted') {
      issues.push({
        code: 'omitted_section_in_sides',
        severity: 'warning',
        message: 'An omitted section is selected for the sides draft.',
        sectionId: entry.sectionId,
      })
    }
    if (!entry.scriptText || entry.scriptText.trim() === '') {
      issues.push({
        code: 'section_no_script_text',
        severity: 'warning',
        message: 'A selected section has no script text available.',
        sectionId: entry.sectionId,
      })
    }
    if (entry.isEstimated) {
      issues.push({
        code: 'estimated_range_coverage',
        severity: 'warning',
        message: 'A selected section has estimated/best-effort page ranges only.',
        sectionId: entry.sectionId,
      })
    }
  }

  const distinctVersions = new Set(selectedEntries.map((e) => e.section.script_version_id))
  if (distinctVersions.size > 1) {
    const labels = [...distinctVersions]
      .map((id) => source.scriptVersionLabelsById[id] ?? id)
      .join(', ')
    issues.push({
      code: 'mixed_script_versions',
      severity: 'warning',
      message: `Selected sections span more than one script version (${labels}).`,
    })
  }

  const outdatedLabels = new Set<string>()
  for (const entry of selectedEntries) {
    const scopeKey = entry.episodeId ?? ''
    const latestId = source.latestScriptVersionIdByEpisodeScope[scopeKey]
    if (latestId && entry.section.script_version_id !== latestId) {
      outdatedLabels.add(
        source.scriptVersionLabelsById[entry.section.script_version_id] ??
          entry.section.script_version_id
      )
    }
  }
  if (outdatedLabels.size > 0) {
    issues.push({
      code: 'older_version_link',
      severity: 'warning',
      message: `Selected sections include older script revisions (${[...outdatedLabels].join(', ')}). Review before exporting.`,
    })
  }

  for (const warning of source.sb5Warnings) {
    if (warning.code === 'shot_no_linked_section') {
      issues.push({
        code: 'scheduled_shot_no_section',
        severity: 'warning',
        message: 'A scheduled shot has no linked script section.',
        shotId: warning.shotId,
      })
    }
  }

  return dedupeIssues(issues)
}

// ─── SB6 validation bridge ────────────────────────────────────────────────────

const COVERAGE_TO_SIDES_CODE: Partial<Record<CoverageIssueCode, SidesValidationWarning['code']>> = {
  no_sections_selected: 'no_sections_selected',
  section_no_script_text: 'section_no_script_text',
  estimated_range_coverage: 'section_estimated_only',
  mixed_script_versions: 'mixed_script_versions',
  older_version_link: 'outdated_script_versions',
  omitted_section_in_sides: 'omitted_section_selected',
  scheduled_shot_no_section: 'shot_scheduled_no_section',
}

export function toSidesValidationWarnings(issues: CoverageIssue[]): SidesValidationWarning[] {
  const result: SidesValidationWarning[] = []
  for (const issue of issues) {
    const code = COVERAGE_TO_SIDES_CODE[issue.code]
    if (!code) continue
    result.push({
      code,
      message: issue.message,
      blocking: issue.severity === 'blocking',
      sectionId: issue.sectionId,
      shotId: issue.shotId,
    })
  }
  return result
}

export function getBlockingExportIssues(issues: CoverageIssue[]): CoverageIssue[] {
  return issues.filter((i) => i.severity === 'blocking')
}

// ─── Impure loaders ───────────────────────────────────────────────────────────

function emptySceneCoverage(sceneId: string): SceneCoverageSummary {
  return {
    sceneId,
    totalSections: 0,
    coveredSections: 0,
    uncoveredSections: 0,
    linkedShots: 0,
    unlinkedShots: 0,
    coveragePercent: 0,
    isPartialScene: false,
    issues: [],
  }
}

export async function loadSceneCoverage(sceneId: string): Promise<SceneCoverageSummary> {
  const scene = await getSceneById(sceneId)
  if (!scene) return emptySceneCoverage(sceneId)

  const effectiveSource = await getEffectiveDataSourceForProduction(scene.production_id)
  if (effectiveSource === 'remote_server') return emptySceneCoverage(sceneId)

  const sections = await listSectionsByScene(sceneId)
  const shots = await listShotsByScene(sceneId)
  const sectionIds = sections.map((s) => s.id)
  const shotIds = shots.map((s) => s.id)

  const [linkedShotCountBySectionId, linkedSectionCountByShotId, rangesMap] = await Promise.all([
    getLinkedShotCountsBySectionIds(sectionIds),
    getLinkedSectionCountsByShotIds(shotIds),
    listRangesBySectionIds(sectionIds),
  ])

  const versions = await listScriptVersionsByProduction(scene.production_id)
  const scriptVersionLabelsById = new Map(versions.map((v) => [v.id, formatScriptVersionLabel(v)]))
  const latestVersionIdByEpisodeId = new Map<string | null, string>()
  const latest = await getLatestScriptVersionForScope(scene.production_id, scene.episode_id)
  if (latest) latestVersionIdByEpisodeId.set(scene.episode_id ?? null, latest.id)

  return analyzeSceneCoverage({
    scene,
    sections,
    shots,
    linkedShotCountBySectionId,
    linkedSectionCountByShotId,
    rangesBySectionId: rangesMap,
    latestVersionIdByEpisodeId,
    scriptVersionLabelsById,
  })
}

export async function loadShootDayCoverage(
  shootDayId: string,
  options?: DeriveShootDayScriptSectionsOptions,
  selectedSectionIds?: readonly string[]
): Promise<ShootDayCoverageLoadResult> {
  const summary = await deriveShootDayScriptSections(shootDayId, options)
  const ids = [...new Set([...summary.includedSectionIds, ...summary.fallbackSectionIds])]
  const sections = await listSectionsByIds(ids)
  const sectionsById: Record<string, ScriptSection> = {}
  for (const section of sections) {
    sectionsById[section.id] = section
  }

  return {
    coverage: analyzeShootDayCoverage({
      summary,
      sectionsById,
      selectedSectionIds,
    }),
    includedSectionIds: summary.includedSectionIds,
    fallbackSectionIds: summary.fallbackSectionIds,
    partialSceneIds: summary.partialSceneIds,
    sectionsScheduledViaShotsOnly: summary.sectionsScheduledViaShotsOnly,
  }
}

/** Reconstruct an SB5-shaped summary from a hydrated SB6 source for pure coverage analysis. */
export function buildSummaryFromSidesSource(source: SidesBuilderSource): ShootDayScriptSectionsSummary {
  const partialSceneIds = [
    ...new Set(source.entries.filter((e) => e.isPartialScene).map((e) => e.scene.id)),
  ]
  return {
    shootDayId: source.shootDayId,
    productionId: source.productionId,
    unitId: source.unitId,
    sceneIds: source.scheduledSceneIds,
    scriptVersionIds: source.scriptVersionIds,
    includedSectionIds: source.entries.filter((e) => e.origin === 'included').map((e) => e.sectionId),
    fallbackSectionIds: source.entries.filter((e) => e.origin === 'fallback').map((e) => e.sectionId),
    linkedShotIds: [],
    totalEstimatedEighths: source.totalEstimatedEighths,
    partialSceneIds,
    sectionsScheduledViaShotsOnly: source.entries
      .filter((e) => e.isViaShotsOnly)
      .map((e) => e.sectionId),
    characterNames: [],
    personIds: [],
    warnings: source.sb5Warnings,
  }
}

export function analyzeSidesBuilderCoverage(
  source: SidesBuilderSource,
  selectedSectionIds: readonly string[]
): ShootDayCoverageSummary {
  const sectionsById = Object.fromEntries(source.entries.map((e) => [e.sectionId, e.section]))
  return analyzeShootDayCoverage({
    summary: buildSummaryFromSidesSource(source),
    sectionsById,
    selectedSectionIds,
  })
}
