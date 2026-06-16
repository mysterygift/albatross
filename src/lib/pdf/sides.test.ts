import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'

import { buildSidesPdfData, generateSidesPdf } from '@/lib/pdf/sides'
import {
  buildSidesDraftModel,
  defaultSidesFilters,
  type SidesBuilderSource,
  type SidesSectionEntry,
} from '@/lib/db/sidesBuilderService'
import type { Scene, ScriptSection, ScriptSectionRange } from '@/lib/db/types'

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

function scene(over: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    production_id: 'prod-1',
    episode_id: null,
    scene_number: '1',
    title: null,
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

function range(over: Partial<ScriptSectionRange> = {}): ScriptSectionRange {
  return {
    id: 'range-1',
    section_id: 'sec-1',
    start_page: '12',
    start_eighth: 0,
    end_page: '13',
    end_eighth: 4,
    start_offset: null,
    end_offset: null,
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
    locationId: null,
    locationName: 'KITCHEN',
    ranges: [range()],
    characterNames: ['JANE'],
    linkedShotNumbers: ['1A'],
    scriptText: 'INT. KITCHEN - DAY\nJane enters.',
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
    scriptPagesByVersionId: {},
    sb5Warnings: [],
    ...over,
  }
}

describe('buildSidesPdfData', () => {
  it('maps core sides draft fields into the presentation model', () => {
    const src = source({
      entries: [
        entry({
          section: section({ id: 'sec-1', label: 'Opening', notes: 'Watch continuity' }),
        }),
      ],
    })
    const model = buildSidesDraftModel(src, defaultSidesFilters(), { overrides: {} })

    const data = buildSidesPdfData({
      productionTitle: 'My Film',
      shootDate: src.shootDate,
      unitName: src.unitName,
      scriptVersionLabels: ['Blue'],
      model,
      generatedAt: new Date('2026-06-01T09:00:00Z'),
    })

    expect(data.productionTitle).toBe('My Film')
    expect(data.shootDate).toBe('2026-06-01')
    expect(data.unitName).toBe('Main Unit')
    expect(data.scriptVersionLabels).toEqual(['Blue'])
    expect(typeof data.generatedAt).toBe('string')
    expect(data.generatedAt.length).toBeGreaterThan(0)

    expect(data.groups).toHaveLength(1)
    const sceneGroup = data.groups[0]!.scenes[0]!
    expect(sceneGroup.sceneNumber).toBe('1')
    expect(sceneGroup.heading).toBe('INT. KITCHEN - DAY')

    const pdfSection = sceneGroup.sections[0]!
    expect(pdfSection.label).toBe('Opening')
    expect(pdfSection.rangeText).toContain('pp 12 0/8 -> 13 4/8')
    expect(pdfSection.characterNames).toEqual(['JANE'])
    expect(pdfSection.linkedShotNumbers).toEqual(['1A'])
    expect(pdfSection.notes).toBe('Watch continuity')
    expect(pdfSection.scriptText).toContain('Jane enters.')
    expect(sceneGroup.collatedScriptText).toContain('Jane enters.')
    expect(pdfSection.isEstimated).toBe(false)
  })

  it('flags estimated sections and falls back to range metadata only', () => {
    const src = source({
      entries: [
        entry({
          section: section({ id: 'sec-est', label: 'No text' }),
          scriptText: null,
          isEstimated: true,
          ranges: [range({ start_page: null, end_page: null })],
        }),
      ],
    })
    const model = buildSidesDraftModel(src, defaultSidesFilters(), { overrides: {} })
    const data = buildSidesPdfData({
      productionTitle: 'My Film',
      shootDate: src.shootDate,
      unitName: src.unitName,
      scriptVersionLabels: [],
      model,
    })

    const pdfSection = data.groups[0]!.scenes[0]!.sections[0]!
    expect(pdfSection.isEstimated).toBe(true)
    expect(pdfSection.scriptText).toBeNull()
    expect(pdfSection.rangeText).toContain('?')
  })
})

describe('generateSidesPdf', () => {
  it('renders a valid, non-empty PDF for a populated draft', async () => {
    const src = source()
    const model = buildSidesDraftModel(src, defaultSidesFilters(), { overrides: {} })
    const data = buildSidesPdfData({
      productionTitle: 'My Film',
      shootDate: src.shootDate,
      unitName: src.unitName,
      scriptVersionLabels: ['Blue'],
      model,
    })

    const bytes = await generateSidesPdf(data)
    expect(bytes.byteLength).toBeGreaterThan(500)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
  })
})
