import { describe, expect, it } from 'vitest'

import { segmentByCoverage } from './segments'

describe('segmentByCoverage', () => {
  it('splits overlapping slices and lists every covering id', () => {
    expect(
      segmentByCoverage([
        { start: 0, end: 10, id: 'a' },
        { start: 5, end: 15, id: 'b' },
      ])
    ).toEqual([
      { start: 0, end: 5, ids: ['a'] },
      { start: 5, end: 10, ids: ['a', 'b'] },
      { start: 10, end: 15, ids: ['b'] },
    ])
  })

  it('handles nested slices and leaves gaps uncovered', () => {
    expect(
      segmentByCoverage([
        { start: 0, end: 20, id: 'outer' },
        { start: 5, end: 8, id: 'inner' },
        { start: 30, end: 32, id: 'later' },
      ])
    ).toEqual([
      { start: 0, end: 5, ids: ['outer'] },
      { start: 5, end: 8, ids: ['outer', 'inner'] },
      { start: 8, end: 20, ids: ['outer'] },
      { start: 30, end: 32, ids: ['later'] },
    ])
  })

  it('merges adjacent runs with the same cover and ignores empty slices', () => {
    expect(
      segmentByCoverage([
        { start: 0, end: 4, id: 'a' },
        { start: 4, end: 9, id: 'a' },
        { start: 6, end: 6, id: 'b' },
      ])
    ).toEqual([{ start: 0, end: 9, ids: ['a'] }])
  })
})
