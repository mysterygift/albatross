import { describe, expect, it } from 'vitest'

import {
  enrichRangeWithPageOffsets,
  offsetsForEighthRangeInContent,
  splitPageIntoEighths,
  splitSceneContentAcrossPages,
  splitSceneContentFromPdfElements,
} from './scriptEighthSplitService'

describe('splitPageIntoEighths', () => {
  it('returns no spans for empty content', () => {
    expect(splitPageIntoEighths('')).toEqual([])
    expect(splitPageIntoEighths('   \n\n  ')).toEqual([])
  })

  it('splits lines into eighths without cutting mid-line', () => {
    const lines = Array.from({ length: 16 }, (_, i) => `Line ${i + 1}`)
    const content = lines.join('\n')
    const spans = splitPageIntoEighths(content)
    expect(spans.length).toBeGreaterThan(0)
    expect(spans.length).toBeLessThanOrEqual(8)
    for (const span of spans) {
      expect(span.endEighth).toBeGreaterThan(span.startEighth)
      expect(span.endOffset).toBeGreaterThan(span.startOffset)
    }
  })

  it('snaps boundaries to blank lines when nearby', () => {
    const content = [
      'JANE',
      'Hello there.',
      '',
      'More action.',
      'JOHN',
      'Hi.',
      '',
      'End.',
    ].join('\n')
    const spans = splitPageIntoEighths(content)
    expect(spans.length).toBeGreaterThan(0)
    const fullText = content
    for (const span of spans) {
      const slice = fullText.slice(span.startOffset, span.endOffset)
      expect(slice).not.toMatch(/\n[^\n]*\n[^\n]/) // no partial line fragments at edges
    }
  })

  it('maps offsets to character positions in the original content', () => {
    const content = 'INT. ROOM - DAY\nJANE\nHello.'
    const spans = splitPageIntoEighths(content)
    expect(spans[0]!.startOffset).toBe(0)
    expect(content.slice(spans[0]!.startOffset, spans[0]!.endOffset)).toContain('INT')
  })

  it('offsetsForEighthRangeInContent returns slice for an eighth sub-range', () => {
    const content = ['INT. ROOM - DAY', 'JANE', 'Hello.', '', 'More action.'].join('\n')
    const offsets = offsetsForEighthRangeInContent(content, 0, spansEnd(content, 0))
    expect(offsets).not.toBeNull()
    expect(content.slice(offsets!.start_offset, offsets!.end_offset)).toContain('INT')
  })
})

function spansEnd(content: string, index: number): number {
  const spans = splitPageIntoEighths(content)
  return spans[index]?.endEighth ?? 1
}

describe('enrichRangeWithPageOffsets', () => {
  it('recomputes offsets from page content when missing', () => {
    const content = 'INT. ROOM - DAY\nJANE\nHello.'
    const enriched = enrichRangeWithPageOffsets(
      { start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 8 },
      [{ page_number: '1', page_index: 0, content }],
      (p) => (p === '1' ? 1 : null)
    )
    expect(enriched.start_offset).not.toBeNull()
    expect(enriched.end_offset).not.toBeNull()
    expect(content.slice(enriched.start_offset!, enriched.end_offset!)).toContain('INT')
  })

  it('preserves existing offsets', () => {
    const enriched = enrichRangeWithPageOffsets(
      { start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 4, start_offset: 5, end_offset: 10 },
      [{ page_number: '1', page_index: 0, content: 'text' }],
      () => 1
    )
    expect(enriched.start_offset).toBe(5)
    expect(enriched.end_offset).toBe(10)
  })
})

describe('splitSceneContentAcrossPages', () => {
  it('splits multi-page scenes proportionally', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`)
    const slices = splitSceneContentAcrossPages(lines.join('\n'), '10', '11')
    expect(slices).toHaveLength(2)
    expect(slices[0]!.pageNumber).toBe('10')
    expect(slices[1]!.pageNumber).toBe('11')
  })
})

describe('splitSceneContentFromPdfElements', () => {
  it('groups elements by page', () => {
    const slices = splitSceneContentFromPdfElements(
      [
        { type: 'scene_heading', text: 'INT. ROOM - DAY', page: 5 },
        { type: 'action', text: 'JANE walks.', page: 5 },
        { type: 'scene_heading', text: 'EXT. YARD - NIGHT', page: 6 },
      ],
      'fallback',
      '5',
      '6'
    )
    expect(slices).toHaveLength(2)
    expect(slices[0]!.pageNumber).toBe('5')
    expect(slices[0]!.content).toContain('INT. ROOM')
    expect(slices[1]!.pageNumber).toBe('6')
  })

  it('falls back to proportional split when elements absent', () => {
    const slices = splitSceneContentFromPdfElements(undefined, 'A\nB\nC', '1', '1')
    expect(slices).toHaveLength(1)
    expect(slices[0]!.content).toContain('A')
  })
})
