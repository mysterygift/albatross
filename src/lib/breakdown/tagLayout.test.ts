import { describe, expect, it } from 'vitest'

import { buildSceneLines } from '@/lib/db/scriptSectionLayout'
import { breakdownCategory } from './categories'
import { layoutTagsOnLines, type PlacedTag } from './tagLayout'

const pages = [
  { id: 'p1', page_number: '1', page_index: 0, content: 'EXT. BEACH - DAY\n\nMARY holds a red umbrella.' },
  { id: 'p2', page_number: '2', page_index: 1, content: 'The umbrella flies away.' },
]
const lines = buildSceneLines(pages)

function tag(id: string, category: PlacedTag['category'], start: [string, number], end: [string, number]): PlacedTag {
  return { id, category, start_page_id: start[0], start_offset: start[1], end_page_id: end[0], end_offset: end[1] }
}

describe('layoutTagsOnLines', () => {
  it('places a tag on the part of the line it covers', () => {
    const at = pages[0]!.content.indexOf('BEACH')
    const layout = layoutTagsOnLines(lines, [tag('t1', 'locations', ['p1', at], ['p1', at + 5])])
    expect(layout.get(0)).toEqual({
      segments: [{ start: 5, end: 10, tagIds: ['t1'], categories: ['locations'], colours: [breakdownCategory('locations').colour] }],
      categories: ['locations'],
      bandColours: [breakdownCategory('locations').colour],
    })
    expect(layout.has(1)).toBe(false)
  })

  it('stacks the colours of overlapping tags in category order', () => {
    const at = pages[0]!.content.indexOf('red umbrella')
    const layout = layoutTagsOnLines(lines, [
      tag('costume', 'costume', ['p1', at], ['p1', at + 12]),
      tag('prop', 'props', ['p1', at + 4], ['p1', at + 12]),
    ])
    const line = layout.get(2)!
    expect(line.segments.map((s) => [s.start, s.end, s.categories])).toEqual([
      [13, 17, ['costume']],
      [17, 25, ['props', 'costume']],
    ])
    expect(line.bandColours).toEqual([breakdownCategory('props').colour, breakdownCategory('costume').colour])
  })

  it('spreads a tag across a page break', () => {
    const layout = layoutTagsOnLines(lines, [tag('t', 'props', ['p1', pages[0]!.content.indexOf('umbrella')], ['p2', 12])])
    expect(layout.get(2)!.segments[0]).toMatchObject({ start: 17, end: 26 })
    expect(layout.get(3)!.segments[0]).toMatchObject({ start: 0, end: 12 })
  })
})
