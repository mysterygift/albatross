import { describe, expect, it } from 'vitest'

import {
  collateSceneScriptText,
  extractScriptTextForRange,
} from './sidesScriptCollation'
import type { Scene, ScriptPage, ScriptSection, ScriptSectionRange } from './types'

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

function scene(over: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    production_id: 'prod-1',
    episode_id: null,
    scene_number: '2',
    title: null,
    description: null,
    int_ext: 'EXT',
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
    label: 'Beat A',
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
    start_page: '2',
    start_eighth: 0,
    end_page: '2',
    end_eighth: 1,
    start_offset: null,
    end_offset: null,
    ...soft,
    ...over,
  }
}

function page(over: Partial<ScriptPage> = {}): ScriptPage {
  return {
    id: 'page-1',
    script_version_id: 'sv-1',
    scene_id: 'scene-1',
    page_number: '2',
    page_index: 1,
    content:
      '2 EXT. ROAD - DAY 2\n\nMuddy fur, mixed with red.\n\nJANE\nHello there.\n\nMore action here.',
    eighths: 8,
    ...soft,
    ...over,
  }
}

describe('sidesScriptCollation', () => {
  it('extracts only the range slice from a page', () => {
    const text = extractScriptTextForRange([page()], range())
    expect(text).toBeTruthy()
    expect(text).toContain('EXT. ROAD - DAY')
    expect(text).not.toContain('More action here')
  })

  it('collates adjacent section ranges once without repeating slices', () => {
    const pages = { 'sv-1': [page()] }
    const sc = scene()
    const collated = collateSceneScriptText(
      sc,
      [
        {
          section: section({ id: 'sec-1' }),
          ranges: [range({ section_id: 'sec-1', start_eighth: 0, end_eighth: 1 })],
          scriptText: null,
          origin: 'included',
        },
        {
          section: section({ id: 'sec-2' }),
          ranges: [
            range({
              id: 'range-2',
              section_id: 'sec-2',
              start_eighth: 1,
              end_eighth: 2,
            }),
          ],
          scriptText: null,
          origin: 'included',
        },
      ],
      pages,
      'ROAD'
    )

    expect(collated).toContain('EXT. ROAD - DAY')
    expect(collated).toContain('Muddy fur')
    const muddyCount = collated!.split('Muddy fur').length - 1
    expect(muddyCount).toBe(1)
  })
})
