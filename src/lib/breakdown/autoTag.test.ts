import { describe, expect, it } from 'vitest'

import { buildSceneLines } from '@/lib/db/scriptSectionLayout'
import { locationFromHeading, suggestSceneTags } from './autoTag'
import { rangeText } from './selection'

const pages = [{ id: 'p1', page_number: '1', page_index: 0, content: 'EXT. BEACH - DAY\n\nMary runs.\n\nMARY\nWait!\n\nTOM (O.S.)\nOver here.\n\nMARY (CONT\'D)\nTom?' }]
const lines = buildSceneLines(pages)

describe('suggestSceneTags', () => {
  it('suggests the heading location and the first cue of each character', () => {
    const suggestions = suggestSceneTags(lines, new Map())
    expect(suggestions.map((s) => [s.category, s.text])).toEqual([
      ['locations', 'BEACH'],
      ['cast', 'MARY'],
      ['cast', 'TOM'],
    ])
    expect(suggestions.map((s) => rangeText(pages, s.range))).toEqual(['BEACH', 'MARY', 'TOM'])
  })

  it('leaves out names already tagged in that category', () => {
    const suggestions = suggestSceneTags(lines, new Map([['cast', new Set(['Mary'])]]))
    expect(suggestions.map((s) => s.text)).toEqual(['BEACH', 'TOM'])
  })

  it('reads the location from a full heading', () => {
    expect(locationFromHeading("INT. JOHN'S FLAT - KITCHEN - NIGHT")).toBe("JOHN'S FLAT - KITCHEN")
    expect(locationFromHeading('Mary runs.')).toBeNull()
  })
})
