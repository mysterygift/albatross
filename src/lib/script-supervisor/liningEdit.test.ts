import { describe, expect, it } from 'vitest'

import { layoutLinedScript, type LiningElement, type LiningTramline } from './lining'
import {
  UNDO_LIMIT,
  characterRunElementIds,
  nextSegmentState,
  orderedRange,
  popUndo,
  pushUndo,
  snapRangeToLineable,
  type LiningUndoEntry,
} from './liningEdit'

const el = (sort_index: number, element_type: LiningElement['element_type'], character_name: string | null = null): LiningElement => ({
  id: `e${sort_index}`, scene_id: 's', sort_index, element_type, character_name, text: `line ${sort_index}`, page_number: '1',
})

const elements = [
  el(0, 'scene_heading'),
  el(1, 'action'),
  el(2, 'dialogue', 'MARCUS'),
  el(3, 'dialogue', 'ELENA'),
  el(4, 'dialogue', 'MARCUS'),
  el(5, 'dialogue', 'Elena'),
]

const tramline: LiningTramline = {
  id: 't', slateId: 'sl', slateLabel: '1', slateCreatedAt: 't', shotType: 'single', shotCode: null, description: null,
  camera: '', printTakeNumbers: [], startElementId: 'e1', endElementId: 'e5', startSortIndex: 1, endSortIndex: 5, segments: new Map(),
}

describe('lining edit helpers (SS7)', () => {
  it('cycles segments on → off → not covered → on', () => {
    expect([nextSegmentState('on'), nextSegmentState('off'), nextSegmentState('not_covered')]).toEqual(['off', 'not_covered', 'on'])
  })

  it('orders drawn runs and snaps headings out', () => {
    const rows = layoutLinedScript(elements, []).rows
    expect(orderedRange(4, 1)).toEqual({ start: 1, end: 4 })
    expect(snapRangeToLineable(rows, 0, 3)).toEqual({ start: 1, end: 3 })
    expect(snapRangeToLineable(rows, 0, 0)).toBeNull()
  })

  it('finds a character’s remaining speeches inside a tramline', () => {
    const rows = layoutLinedScript(elements, [tramline]).rows
    expect(characterRunElementIds(rows, 0, 3, 'elena')).toEqual(['e3', 'e5'])
    expect(characterRunElementIds(rows, 0, 4, 'MARCUS')).toEqual(['e4'])
  })

  it('keeps the last 20 undo steps', () => {
    let stack: LiningUndoEntry[] = []
    for (let i = 0; i < UNDO_LIMIT + 5; i++) stack = pushUndo(stack, { kind: 'deleted', tramlineId: String(i), label: String(i) })
    expect(stack).toHaveLength(UNDO_LIMIT)
    const { entry, rest } = popUndo(stack)
    expect(entry?.tramlineId).toBe(String(UNDO_LIMIT + 4))
    expect(rest).toHaveLength(UNDO_LIMIT - 1)
    expect(popUndo([]).entry).toBeNull()
  })
})
