import { describe, expect, it } from 'vitest'

import { layoutLinedScript, underCoveredElements, type LiningElement, type LiningTramline } from './lining'

const el = (sort_index: number, element_type: LiningElement['element_type'], page_number: string): LiningElement => ({
  id: `e${sort_index}`, scene_id: 's23', sort_index, element_type, character_name: null, text: `line ${sort_index}`, page_number,
})

const tram = (over: Partial<LiningTramline>): LiningTramline => ({
  id: 't', slateId: 'sl', slateLabel: '1', slateCreatedAt: '2026-10-07T10:00', shotType: 'master', shotCode: null,
  description: null, camera: '', printTakeNumbers: [], startElementId: 'e0', endElementId: 'e0', startSortIndex: 0, endSortIndex: 0, segments: new Map(), ...over,
})

describe('lined script layout (SS6)', () => {
  const elements = [el(0, 'scene_heading', '31'), el(1, 'action', '31'), el(2, 'dialogue', '31'), el(3, 'dialogue', '32'), el(4, 'action', '32')]

  it('orders lanes by shot order and marks on, off, caps and page breaks', () => {
    const layout = layoutLinedScript(elements, [
      tram({ id: 'single', slateId: 's2', slateLabel: '213', slateCreatedAt: '2026-10-07T11:00', shotType: 'single', shotCode: 'MS', description: 'Elena', startSortIndex: 2, endSortIndex: 3, segments: new Map([['e2', 'off']]) }),
      tram({ id: 'master', slateId: 's1', slateLabel: '212', printTakeNumbers: [1, 3], shotCode: 'WS', startSortIndex: 1, endSortIndex: 4, segments: new Map([['e4', 'not_covered']]) }),
    ])
    expect(layout.columns.map((c) => c.label)).toEqual(['212/1,3 WS', '213 MS Elena'])
    const grid = layout.rows.map((r) => [
      r.pageBreakBefore,
      r.coverage,
      ...r.cells.map((c) => (c.state ? `${c.state}${c.isStart ? '^' : ''}${c.isEnd ? 'v' : ''}` : '.')),
    ])
    expect(grid).toEqual([
      [false, null, '.', '.'],
      [false, 1, 'on^', '.'],
      [false, 2, 'on', 'off^'],
      [true, 2, 'on', 'onv'],
      [false, 0, 'not_coveredv', '.'],
    ])
    expect(underCoveredElements(layout).map((e) => e.id)).toEqual(['e1', 'e4'])
  })

  it('labels multi-camera lanes with their camera', () => {
    const layout = layoutLinedScript(elements, [tram({ id: 'b', camera: 'B', slateLabel: '23A', startSortIndex: 1, endSortIndex: 1 })])
    expect(layout.columns[0]!.label).toBe('23A (B)')
  })
})
