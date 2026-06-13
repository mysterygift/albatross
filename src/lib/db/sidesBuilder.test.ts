import { describe, expect, it } from 'vitest'

import {
  applySidesFilters,
  buildSidesDraftModel,
  compareSidesEntries,
  defaultSidesFilters,
  groupSidesEntries,
  isSectionSelected,
  validateSidesDraft,
  type SidesBuilderSource,
  type SidesSectionEntry,
} from './sidesBuilderService'
import type { Scene, ScriptSection } from './types'

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
    unitId: 'unit-1',
    locationId: scn.location_id,
    locationName: null,
    ranges: [],
    characterNames: [],
    linkedShotNumbers: [],
    scriptText: 'Some script text',
    origin: 'included',
    isPartialScene: false,
    isViaShotsOnly: false,
    isEstimated: false,
    estimatedEighths: 4,
    startPageSort: 0,
    ...over,
  }
}

function source(over: Partial<SidesBuilderSource> = {}): SidesBuilderSource {
  return {
    shootDayId: 'sd-1',
    productionId: 'prod-1',
    unitId: 'unit-1',
    shootDate: '2026-06-01',
    unitName: 'Main Unit',
    scheduledSceneIds: ['scene-1'],
    scriptVersionIds: ['sv-1'],
    scriptVersionLabelsById: { 'sv-1': 'v1' },
    latestScriptVersionIdByEpisodeScope: { '': 'sv-1' },
    totalEstimatedEighths: 4,
    entries: [entry()],
    sb5Warnings: [],
    ...over,
  }
}

function validateSource(
  over: Partial<
    Pick<
      SidesBuilderSource,
      'entries' | 'sb5Warnings' | 'scriptVersionLabelsById' | 'latestScriptVersionIdByEpisodeScope'
    >
  > = {}
) {
  return {
    entries: [entry()],
    sb5Warnings: [],
    scriptVersionLabelsById: { 'sv-1': 'White', 'sv-2': 'Blue' },
    latestScriptVersionIdByEpisodeScope: { '': 'sv-2' },
    ...over,
  }
}

describe('sides builder service (SB6)', () => {
  describe('buildSidesDraftModel', () => {
    it('builds a draft from the source with all sections selected by default', () => {
      const src = source({
        entries: [
          entry({ section: section({ id: 'sec-1' }) }),
          entry({ section: section({ id: 'sec-2', scene_id: 'scene-1' }) }),
        ],
      })
      const model = buildSidesDraftModel(src, defaultSidesFilters(), { overrides: {} })

      expect(model.selectedSectionIds.sort()).toEqual(['sec-1', 'sec-2'])
      expect(model.filteredEntries).toHaveLength(2)
      expect(model.totalEstimatedEighths).toBe(8)
      expect(model.groups).toHaveLength(1)
      expect(model.validation).toEqual([])
    })
  })

  describe('applySidesFilters', () => {
    it('filters by scene', () => {
      const entries = [
        entry({ section: section({ id: 'a', scene_id: 'scene-1' }), scene: scene({ id: 'scene-1' }) }),
        entry({ section: section({ id: 'b', scene_id: 'scene-2' }), scene: scene({ id: 'scene-2', scene_number: '2' }) }),
      ]
      const result = applySidesFilters(entries, { ...defaultSidesFilters(), sceneId: 'scene-2' })
      expect(result.map((e) => e.sectionId)).toEqual(['b'])
    })

    it('filters by character', () => {
      const entries = [
        entry({ section: section({ id: 'a' }), characterNames: ['JANE'] }),
        entry({ section: section({ id: 'b' }), characterNames: ['JOHN'] }),
      ]
      const result = applySidesFilters(entries, { ...defaultSidesFilters(), characterName: 'JOHN' })
      expect(result.map((e) => e.sectionId)).toEqual(['b'])
    })

    it('linked-shot-only mode keeps only included-origin sections', () => {
      const entries = [
        entry({ section: section({ id: 'a' }), origin: 'included' }),
        entry({ section: section({ id: 'b' }), origin: 'fallback' }),
      ]
      const result = applySidesFilters(entries, { ...defaultSidesFilters(), linkedShotOnly: true })
      expect(result.map((e) => e.sectionId)).toEqual(['a'])
    })

    it('full-scheduled-scenes mode keeps only fallback-origin sections', () => {
      const entries = [
        entry({ section: section({ id: 'a' }), origin: 'included' }),
        entry({ section: section({ id: 'b' }), origin: 'fallback' }),
      ]
      const result = applySidesFilters(entries, {
        ...defaultSidesFilters(),
        fullScheduledScenesOnly: true,
      })
      expect(result.map((e) => e.sectionId)).toEqual(['b'])
    })

    it('does not mutate the input entries', () => {
      const entries = [entry({ section: section({ id: 'a' }) })]
      const before = JSON.stringify(entries)
      applySidesFilters(entries, { ...defaultSidesFilters(), sceneId: 'other' })
      expect(JSON.stringify(entries)).toBe(before)
    })
  })

  describe('manual include/exclude', () => {
    it('excludes a section when override is false without mutating entries', () => {
      const src = source({
        entries: [
          entry({ section: section({ id: 'sec-1' }) }),
          entry({ section: section({ id: 'sec-2' }) }),
        ],
      })
      const model = buildSidesDraftModel(src, defaultSidesFilters(), {
        overrides: { 'sec-2': false },
      })
      expect(model.selectedSectionIds).toEqual(['sec-1'])
      // both still appear in the include/exclude list
      expect(model.filteredEntries).toHaveLength(2)
      // source data untouched
      expect(src.entries.map((e) => e.sectionId)).toEqual(['sec-1', 'sec-2'])
    })

    it('isSectionSelected defaults to true', () => {
      expect(isSectionSelected('x', { overrides: {} })).toBe(true)
      expect(isSectionSelected('x', { overrides: { x: false } })).toBe(false)
      expect(isSectionSelected('x', { overrides: { x: true } })).toBe(true)
    })
  })

  describe('validateSidesDraft', () => {
    it('blocks when no sections are selected', () => {
      const result = validateSidesDraft(validateSource(), [])
      expect(result).toHaveLength(1)
      expect(result[0]!.code).toBe('no_sections_selected')
      expect(result[0]!.blocking).toBe(true)
    })

    it('warns on mixed script versions (non-blocking)', () => {
      const selected = [
        entry({ section: section({ id: 'a', script_version_id: 'sv-1' }) }),
        entry({ section: section({ id: 'b', script_version_id: 'sv-2' }) }),
      ]
      const result = validateSidesDraft(validateSource(), selected)
      const mixed = result.find((w) => w.code === 'mixed_script_versions')
      expect(mixed).toBeTruthy()
      expect(mixed!.blocking).toBe(false)
      expect(mixed!.message).toContain('White')
      expect(mixed!.message).toContain('Blue')
    })

    it('warns when selected sections use outdated script revisions', () => {
      const selected = [
        entry({ section: section({ id: 'a', script_version_id: 'sv-1' }) }),
      ]
      const result = validateSidesDraft(validateSource(), selected)
      expect(result.some((w) => w.code === 'outdated_script_versions')).toBe(true)
    })

    it('warns when a selected section is omitted (non-blocking)', () => {
      const selected = [entry({ section: section({ id: 'a', status: 'omitted' }) })]
      const result = validateSidesDraft(validateSource(), selected)
      const omitted = result.find((w) => w.code === 'omitted_section_selected')
      expect(omitted).toBeTruthy()
      expect(omitted!.blocking).toBe(false)
      expect(omitted!.sectionId).toBe('a')
    })

    it('warns when a selected section has no script text', () => {
      const selected = [entry({ section: section({ id: 'a' }), scriptText: '   ' })]
      const result = validateSidesDraft(validateSource(), selected)
      expect(result.some((w) => w.code === 'section_no_script_text')).toBe(true)
    })

    it('warns when a selected section is estimated only', () => {
      const selected = [entry({ section: section({ id: 'a' }), isEstimated: true })]
      const result = validateSidesDraft(validateSource(), selected)
      expect(result.some((w) => w.code === 'section_estimated_only')).toBe(true)
    })

    it('surfaces SB5 shot-without-section warnings', () => {
      const selected = [entry({ section: section({ id: 'a' }) })]
      const result = validateSidesDraft(
        validateSource({
          sb5Warnings: [
            { code: 'shot_no_linked_section', message: 'x', shotId: 'shot-9' },
          ],
        }),
        selected
      )
      const shotWarning = result.find((w) => w.code === 'shot_scheduled_no_section')
      expect(shotWarning).toBeTruthy()
      expect(shotWarning!.shotId).toBe('shot-9')
    })
  })

  describe('preview grouping order', () => {
    it('orders by episode (sort order, null last) then scene then range', () => {
      const ep1Scene2 = entry({
        section: section({ id: 's-ep1-sc2' }),
        scene: scene({ id: 'scene-ep1-2', scene_number: '2', episode_id: 'ep-1' }),
        episodeId: 'ep-1',
        episodeName: 'Episode 1',
        episodeSortOrder: 1,
        startPageSort: 0,
      })
      const ep1Scene1 = entry({
        section: section({ id: 's-ep1-sc1' }),
        scene: scene({ id: 'scene-ep1-1', scene_number: '1', episode_id: 'ep-1' }),
        episodeId: 'ep-1',
        episodeName: 'Episode 1',
        episodeSortOrder: 1,
        startPageSort: 0,
      })
      const noEpisode = entry({
        section: section({ id: 's-noep' }),
        scene: scene({ id: 'scene-noep', scene_number: '1', episode_id: null }),
        episodeId: null,
        episodeName: null,
        episodeSortOrder: null,
        startPageSort: 0,
      })
      const ep2 = entry({
        section: section({ id: 's-ep2' }),
        scene: scene({ id: 'scene-ep2', scene_number: '1', episode_id: 'ep-2' }),
        episodeId: 'ep-2',
        episodeName: 'Episode 2',
        episodeSortOrder: 2,
        startPageSort: 0,
      })

      const groups = groupSidesEntries([noEpisode, ep2, ep1Scene2, ep1Scene1])
      expect(groups.map((g) => g.episodeId)).toEqual(['ep-1', 'ep-2', null])
      // within episode 1, scene 1 comes before scene 2
      expect(groups[0]!.scenes.map((s) => s.scene.scene_number)).toEqual(['1', '2'])
    })

    it('orders sections within a scene by start page eighth', () => {
      const a = entry({ section: section({ id: 'late' }), startPageSort: 16 })
      const b = entry({ section: section({ id: 'early' }), startPageSort: 0 })
      const sorted = [a, b].sort(compareSidesEntries)
      expect(sorted.map((e) => e.sectionId)).toEqual(['early', 'late'])
    })
  })
})
