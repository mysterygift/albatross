import { describe, it, expect } from 'vitest'
import { applyStripboardParams, parseStripboardParams } from './stripboardUrlState'

const sp = (s: string) => new URLSearchParams(s)

describe('parseStripboardParams', () => {
  it('returns defaults for empty params', () => {
    expect(parseStripboardParams(sp(''))).toEqual({
      q: '',
      locationId: undefined,
      bloc: 'all',
      day: null,
    })
  })
  it('parses all params', () => {
    expect(parseStripboardParams(sp('q=int&loc=L1&bloc=b1&day=d9'))).toEqual({
      q: 'int',
      locationId: 'L1',
      bloc: 'b1',
      day: 'd9',
    })
  })
  it('maps loc=none to null', () => {
    expect(parseStripboardParams(sp('loc=none')).locationId).toBeNull()
  })
  it('ignores a legacy view param from old bookmarks', () => {
    expect(parseStripboardParams(sp('view=board&q=x'))).toEqual({
      q: 'x',
      locationId: undefined,
      bloc: 'all',
      day: null,
    })
  })
})

describe('applyStripboardParams', () => {
  it('omits defaults', () => {
    const next = applyStripboardParams(sp('q=x&loc=L1&bloc=b1&day=d1'), {
      q: '',
      locationId: undefined,
      bloc: 'all',
      day: null,
    })
    expect(next.toString()).toBe('')
  })
  it('encodes null location as none and keeps unrelated params', () => {
    const next = applyStripboardParams(sp('foo=1'), { locationId: null, day: 'd2' })
    expect(next.get('loc')).toBe('none')
    expect(next.get('day')).toBe('d2')
    expect(next.get('foo')).toBe('1')
  })
  it('round trips', () => {
    const state = { q: 'a b', locationId: null, bloc: 'b2', day: 'd3' }
    const next = applyStripboardParams(sp(''), state)
    expect(parseStripboardParams(next)).toEqual(state)
  })
  it('keeps keys absent from the patch', () => {
    const next = applyStripboardParams(sp('q=abc&bloc=b1'), { day: 'd4' })
    expect(next.get('q')).toBe('abc')
    expect(next.get('bloc')).toBe('b1')
    expect(next.get('day')).toBe('d4')
  })
})
