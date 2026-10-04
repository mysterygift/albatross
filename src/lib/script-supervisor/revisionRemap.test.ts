import { describe, expect, it } from 'vitest'

import {
  lineSimilarity,
  matchElements,
  normaliseLine,
  remapAnnotation,
  remapTramline,
  type RemapElement,
} from './revisionRemap'

let n = 0
const el = (prefix: string, element_type: RemapElement['element_type'], text: string, character_name: string | null = null): RemapElement => ({
  id: `${prefix}${n}`,
  sort_index: n++,
  element_type,
  character_name,
  text,
})

function drafts() {
  n = 0
  const v1 = [
    el('a', 'scene_heading', 'INT. EDIT SUITE - NIGHT'),
    el('a', 'action', 'Monitors glow.'),
    el('a', 'dialogue', 'There is no cutaway.', 'ELENA'),
    el('a', 'dialogue', 'Since lunch.', 'MARCUS'),
    el('a', 'action', 'Beat.'),
    el('a', 'dialogue', 'Every take but one.', 'ELENA'),
    el('a', 'action', 'Marcus pulls up a chair.'),
  ]
  n = 0
  const v2 = [
    el('b', 'scene_heading', 'INT. EDIT SUITE - NIGHT'),
    el('b', 'action', 'Monitors  glow.'), // spacing only
    el('b', 'dialogue', 'There’s no cutaway. Nobody shot one.', 'ELENA (CONT’D)'), // reworded, CONT'D
    // "Since lunch." cut
    el('b', 'action', 'Beat.'),
    el('b', 'action', 'She rewinds again.'), // new
    el('b', 'dialogue', 'Every take but one.', 'ELENA'),
    el('b', 'action', 'Marcus pulls up a chair.'),
  ]
  return { v1, v2 }
}

describe('revision remap (SS10)', () => {
  it('normalises text and scores reworded lines', () => {
    expect(normaliseLine('  “So  use it.” — fine… ')).toBe('"so use it." - fine...')
    expect(lineSimilarity('There is no cutaway.', 'There’s no cutaway. Nobody shot one.')).toBeGreaterThanOrEqual(0.5)
    expect(lineSimilarity('Since lunch.', 'She rewinds again.')).toBe(0)
  })

  it('matches unchanged lines in order and reworded lines by the same speaker', () => {
    const { v1, v2 } = drafts()
    const m = matchElements(v1, v2)
    expect(m.get('a0')).toEqual({ newId: 'b0', exact: true })
    expect(m.get('a1')).toEqual({ newId: 'b1', exact: true })
    expect(m.get('a2')).toEqual({ newId: 'b2', exact: false })
    expect(m.has('a3')).toBe(false)
    expect(m.get('a4')).toEqual({ newId: 'b3', exact: true })
    expect(m.get('a5')).toEqual({ newId: 'b5', exact: true })
    expect(m.get('a6')).toEqual({ newId: 'b6', exact: true })
  })

  it('pairs repeated lines in sequence', () => {
    n = 0
    const v1 = [el('a', 'action', 'Beat.'), el('a', 'dialogue', 'One.', 'A'), el('a', 'action', 'Beat.')]
    n = 0
    const v2 = [el('b', 'action', 'Beat.'), el('b', 'dialogue', 'One.', 'A'), el('b', 'action', 'Beat.')]
    expect([...matchElements(v1, v2).entries()].map(([k, v]) => [k, v.newId])).toEqual([['a0', 'b0'], ['a1', 'b1'], ['a2', 'b2']])
  })

  it('carries an untouched tramline unchanged', () => {
    const { v1, v2 } = drafts()
    const m = matchElements(v1, v2)
    const r = remapTramline({ startSortIndex: 5, endSortIndex: 6, segments: new Map([['a6', 'off']]) }, v1, v2, m)
    expect(r).toEqual({ outcome: 'carried', startElementId: 'b5', endElementId: 'b6', segments: [{ elementId: 'b6', state: 'off' }], notes: [] })
  })

  it('moves a tramline over cut, reworded and new lines, marking new lines not covered', () => {
    const { v1, v2 } = drafts()
    const m = matchElements(v1, v2)
    const r = remapTramline({ startSortIndex: 1, endSortIndex: 6, segments: new Map([['a3', 'off'], ['a2', 'off']]) }, v1, v2, m)
    expect(r.outcome).toBe('moved')
    if (r.outcome === 'unmatched') throw new Error('expected a placed tramline')
    expect([r.startElementId, r.endElementId]).toEqual(['b1', 'b6'])
    expect(r.segments).toEqual([
      { elementId: 'b2', state: 'off' },
      { elementId: 'b4', state: 'not_covered' },
    ])
    expect(r.notes).toEqual([
      '1 line it covered was cut',
      '1 line was reworded',
      '1 off-camera or gap mark could not be placed',
      '1 new line inside its run is marked not covered',
    ])
  })

  it('shrinks a tramline whose first line was cut', () => {
    const { v1, v2 } = drafts()
    const r = remapTramline({ startSortIndex: 3, endSortIndex: 5, segments: new Map() }, v1, v2, matchElements(v1, v2))
    expect(r).toMatchObject({ outcome: 'moved', startElementId: 'b3', endElementId: 'b5' })
  })

  it('reports a tramline whose lines were all cut as unmatched', () => {
    const { v1, v2 } = drafts()
    const r = remapTramline({ startSortIndex: 3, endSortIndex: 3, segments: new Map() }, v1, v2, matchElements(v1, v2))
    expect(r).toEqual({ outcome: 'unmatched', notes: ['None of the lines it covered are in the new draft'] })
  })

  it('places notes on the same line, flagging reworded and cut lines', () => {
    const { v1, v2 } = drafts()
    const m = matchElements(v1, v2)
    expect(remapAnnotation('a5', m)).toEqual({ outcome: 'carried', elementId: 'b5', notes: [] })
    expect(remapAnnotation('a2', m)).toEqual({ outcome: 'moved', elementId: 'b2', notes: ['Its line was reworded'] })
    expect(remapAnnotation('a3', m)).toEqual({ outcome: 'unmatched', notes: ['Its line was cut from the new draft'] })
  })
})
