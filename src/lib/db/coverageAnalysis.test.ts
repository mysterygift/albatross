import { describe, expect, it } from 'vitest'

import {
  analyzeExportCoverage,
  analyzeSceneCoverage,
  analyzeShootDayCoverage,
  mapSb5WarningToCoverageIssue,
} from './coverageAnalysisService'
import { validateSidesDraft, type SidesBuilderSource, type SidesSectionEntry } from './sidesBuilderService'
import type { Scene, ScriptSection, ScriptSectionRange, Shot } from './types'
import type { ShootDayScriptSectionsSummary } from './shootDayScriptSectionsService'

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

function scene(over: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    production_id: 'prod-1',
    episode_id: null,
    scene_number: '1',
    heading: 'INT. KITCHEN - DAY',
    title: 'Kitchen',
    description: null,
    int_ext: 'INT',
    day_night: 'DAY',
    page_eighths: 8,
    location_id: null,
    duration_minutes: null,
    ...soft,
    ...over,
  }
}

function section(over: Partial<ScriptSection> = {}): ScriptSection {
  return {
    id: 'sec-1',
    production_id: 'prod-1',
    script_version_id: 'sv-1',
    scene_id: 'scene-1',
    episode_id: null,
    label: 'Opening',
    section_type: 'dialogue',
    status: 'planned',
    notes: null,
    is_manual: 0,
    ranges_user_edited: 0,
    ...soft,
    ...over,
  }
}

function shot(over: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    scene_id: 'scene-1',
    shot_number: '1A',
    shot_description: null,
    subject: null,
    shot_size: null,
    support: null,
    lens: null,
    duration_seconds: null,
    estimated_shoot_minutes: null,
    camera_movement: null,
    notes: null,
    ...soft,
    ...over,
  }
}

function range(over: Partial<ScriptSectionRange> = {}): ScriptSectionRange {
  return {
    id: 'range-1',
    section_id: 'sec-1',
    start_page: '1',
    start_eighth: 0,
    end_page: '1',
    end_eighth: 4,
    start_offset: null,
    end_offset: null,
    ...soft,
    ...over,
  }
}

function summary(over: Partial<ShootDayScriptSectionsSummary> = {}): ShootDayScriptSectionsSummary {
  return {
    shootDayId: 'sd-1',
    productionId: 'prod-1',
    unitId: null,
    sceneIds: ['scene-1'],
    scriptVersionIds: ['sv-1'],
    includedSectionIds: ['sec-1'],
    fallbackSectionIds: [],
    linkedShotIds: ['shot-1'],
    totalEstimatedEighths: 4,
    partialSceneIds: [],
    sectionsScheduledViaShotsOnly: [],
    characterNames: [],
    personIds: [],
    warnings: [],
    ...over,
  }
}

function entry(over: Partial<SidesSectionEntry> = {}): SidesSectionEntry {
  const sec = over.section ?? section()
  const scn = over.scene ?? scene()
  return {
    sectionId: sec.id,
    section: sec,
    scene: scn,
    episodeId: scn.episode_id,
    episodeName: null,
    episodeSortOrder: null,
    unitId: null,
    locationId: null,
    locationName: null,
    ranges: [],
    characterNames: [],
    linkedShotNumbers: [],
    scriptText: 'Script text',
    origin: 'included',
    isPartialScene: false,
    isViaShotsOnly: false,
    isEstimated: false,
    estimatedEighths: 4,
    startPageSort: 0,
    ...over,
  }
}

function exportSource(over: Partial<SidesBuilderSource> = {}): Pick<
  SidesBuilderSource,
  'entries' | 'sb5Warnings' | 'scriptVersionLabelsById' | 'latestScriptVersionIdByEpisodeScope'
> {
  return {
    entries: [entry()],
    sb5Warnings: [],
    scriptVersionLabelsById: { 'sv-1': 'White', 'sv-2': 'Blue' },
    latestScriptVersionIdByEpisodeScope: { '': 'sv-2' },
    ...over,
  }
}

describe('coverage analysis service (SB9)', () => {
  describe('analyzeSceneCoverage', () => {
    it('detects section without linked shot', () => {
      const secA = section({ id: 'sec-a' })
      const secB = section({ id: 'sec-b' })
      const result = analyzeSceneCoverage({
        scene: scene(),
        sections: [secA, secB],
        shots: [shot()],
        linkedShotCountBySectionId: new Map([['sec-a', 1]]),
        linkedSectionCountByShotId: new Map([['shot-1', 1]]),
        rangesBySectionId: new Map([
          ['sec-a', [range({ section_id: 'sec-a' })]],
          ['sec-b', [range({ section_id: 'sec-b' })]],
        ]),
        latestVersionIdByEpisodeId: new Map([[null, 'sv-1']]),
      })
      expect(result.uncoveredSections).toBe(1)
      expect(result.issues.some((i) => i.code === 'section_without_linked_shot' && i.sectionId === 'sec-b')).toBe(
        true
      )
    })

    it('detects shot without linked section', () => {
      const result = analyzeSceneCoverage({
        scene: scene(),
        sections: [section()],
        shots: [shot({ id: 'shot-1' }), shot({ id: 'shot-2', shot_number: '1B' })],
        linkedShotCountBySectionId: new Map([['sec-1', 1]]),
        linkedSectionCountByShotId: new Map([['shot-1', 1]]),
        rangesBySectionId: new Map([['sec-1', [range()]]]),
        latestVersionIdByEpisodeId: new Map([[null, 'sv-1']]),
      })
      expect(result.unlinkedShots).toBe(1)
      expect(result.issues.some((i) => i.code === 'shot_without_linked_section' && i.shotId === 'shot-2')).toBe(
        true
      )
    })

    it('detects partial scene coverage', () => {
      const result = analyzeSceneCoverage({
        scene: scene({ page_eighths: 8 }),
        sections: [section()],
        shots: [shot()],
        linkedShotCountBySectionId: new Map([['sec-1', 1]]),
        linkedSectionCountByShotId: new Map([['shot-1', 1]]),
        rangesBySectionId: new Map([
          ['sec-1', [range({ start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 2 })]],
        ]),
        latestVersionIdByEpisodeId: new Map([[null, 'sv-1']]),
      })
      expect(result.isPartialScene).toBe(true)
      expect(result.issues.some((i) => i.code === 'partial_scene_coverage')).toBe(true)
    })

    it('calculates scene coverage percentage', () => {
      const result = analyzeSceneCoverage({
        scene: scene(),
        sections: [section({ id: 'a' }), section({ id: 'b' }), section({ id: 'c' })],
        shots: [],
        linkedShotCountBySectionId: new Map([
          ['a', 1],
          ['b', 1],
        ]),
        linkedSectionCountByShotId: new Map(),
        rangesBySectionId: new Map(),
        latestVersionIdByEpisodeId: new Map([[null, 'sv-1']]),
      })
      expect(result.totalSections).toBe(3)
      expect(result.coveredSections).toBe(2)
      expect(result.coveragePercent).toBe(67)
    })

    it('warns on mixed script versions in scene', () => {
      const result = analyzeSceneCoverage({
        scene: scene(),
        sections: [
          section({ id: 'a', script_version_id: 'sv-1' }),
          section({ id: 'b', script_version_id: 'sv-2' }),
        ],
        shots: [],
        linkedShotCountBySectionId: new Map(),
        linkedSectionCountByShotId: new Map(),
        rangesBySectionId: new Map(),
        latestVersionIdByEpisodeId: new Map([[null, 'sv-2']]),
      })
      expect(result.issues.some((i) => i.code === 'mixed_script_versions')).toBe(true)
    })

    it('warns on older-version link', () => {
      const result = analyzeSceneCoverage({
        scene: scene(),
        sections: [section({ script_version_id: 'sv-old' })],
        shots: [shot()],
        linkedShotCountBySectionId: new Map([['sec-1', 1]]),
        linkedSectionCountByShotId: new Map([['shot-1', 1]]),
        rangesBySectionId: new Map([['sec-1', [range()]]]),
        latestVersionIdByEpisodeId: new Map([[null, 'sv-latest']]),
        scriptVersionLabelsById: new Map([['sv-old', 'White']]),
      })
      expect(result.issues.some((i) => i.code === 'older_version_link')).toBe(true)
    })
  })

  describe('analyzeShootDayCoverage', () => {
    it('detects scheduled scene without script sections', () => {
      const result = analyzeShootDayCoverage({
        summary: summary({
          includedSectionIds: [],
          fallbackSectionIds: [],
          warnings: [
            {
              code: 'scene_no_sections',
              message: 'Scheduled scene has no script sections.',
              sceneId: 'scene-1',
            },
          ],
        }),
        sectionsById: {},
      })
      expect(result.missingSections).toBe(1)
      expect(result.issues.some((i) => i.code === 'scene_no_sections')).toBe(true)
    })

    it('detects scheduled shot without section', () => {
      const result = analyzeShootDayCoverage({
        summary: summary({
          warnings: [
            {
              code: 'shot_no_linked_section',
              message: 'Scheduled shot has no linked section.',
              shotId: 'shot-9',
            },
          ],
        }),
        sectionsById: { 'sec-1': section() },
      })
      expect(result.issues.some((i) => i.code === 'scheduled_shot_no_section' && i.shotId === 'shot-9')).toBe(
        true
      )
    })

    it('detects selected sides section not scheduled that day', () => {
      const result = analyzeShootDayCoverage({
        summary: summary({ includedSectionIds: ['sec-1'], fallbackSectionIds: [] }),
        sectionsById: { 'sec-1': section() },
        selectedSectionIds: ['sec-1', 'sec-other'],
      })
      expect(result.unscheduledSelectedSections).toBe(1)
      expect(
        result.issues.some((i) => i.code === 'sides_section_not_scheduled' && i.sectionId === 'sec-other')
      ).toBe(true)
    })

    it('detects scheduled section missing from sides', () => {
      const result = analyzeShootDayCoverage({
        summary: summary({
          includedSectionIds: ['sec-1', 'sec-2'],
          fallbackSectionIds: [],
        }),
        sectionsById: {
          'sec-1': section({ id: 'sec-1' }),
          'sec-2': section({ id: 'sec-2' }),
        },
        selectedSectionIds: ['sec-1'],
      })
      expect(
        result.issues.some((i) => i.code === 'scheduled_section_not_in_sides' && i.sectionId === 'sec-2')
      ).toBe(true)
    })

    it('maps SB5 warnings to coverage issues', () => {
      const issue = mapSb5WarningToCoverageIssue({
        code: 'outdated_script_version',
        message: 'Older revision.',
        sectionId: 'sec-1',
      })
      expect(issue.code).toBe('older_version_link')
      expect(issue.severity).toBe('warning')
    })
  })

  describe('analyzeExportCoverage', () => {
    it('detects omitted section included in sides', () => {
      const selected = [entry({ section: section({ id: 'a', status: 'omitted' }) })]
      const issues = analyzeExportCoverage({
        source: exportSource({ entries: selected }),
        selectedEntries: selected,
      })
      expect(issues.some((i) => i.code === 'omitted_section_in_sides')).toBe(true)
    })

    it('blocks when no sections selected', () => {
      const issues = analyzeExportCoverage({
        source: exportSource({ entries: [] }),
        selectedEntries: [],
      })
      expect(issues).toHaveLength(1)
      expect(issues[0]!.code).toBe('no_sections_selected')
      expect(issues[0]!.severity).toBe('blocking')
    })
  })

  describe('export validation integration', () => {
    it('validateSidesDraft delegates to coverage service with same blocking behaviour', () => {
      const result = validateSidesDraft(exportSource(), [])
      expect(result).toHaveLength(1)
      expect(result[0]!.code).toBe('no_sections_selected')
      expect(result[0]!.blocking).toBe(true)
    })

    it('validateSidesDraft warns on mixed script versions (non-blocking)', () => {
      const selected = [
        entry({ section: section({ id: 'a', script_version_id: 'sv-1' }) }),
        entry({ section: section({ id: 'b', script_version_id: 'sv-2' }) }),
      ]
      const result = validateSidesDraft(exportSource({ entries: selected }), selected)
      const mixed = result.find((w) => w.code === 'mixed_script_versions')
      expect(mixed).toBeTruthy()
      expect(mixed!.blocking).toBe(false)
    })

    it('validateSidesDraft surfaces shot-without-section warnings', () => {
      const selected = [entry({ section: section({ id: 'a' }) })]
      const result = validateSidesDraft(
        exportSource({
          entries: selected,
          sb5Warnings: [{ code: 'shot_no_linked_section', message: 'x', shotId: 'shot-9' }],
        }),
        selected
      )
      expect(result.some((w) => w.code === 'shot_scheduled_no_section' && w.shotId === 'shot-9')).toBe(true)
    })
  })
})
