import { describe, it, expect } from 'vitest'
import { applyStripboardParams, parseStripboardParams } from './stripboardUrlState'

const sp = (s: string) => new URLSearchParams(s)

describe('parseStripboardParams', () => {
  it('returns defaults for empty params', () => {
    expect(parseStripboardParams(sp(''))).toEqual({
      view: null,
      q: '',
      locationId: undefined,
      bloc: 'all',
      day: null,
    })
  })
  it('parses all params', () => {
    expect(parseStripboardParams(sp('view=day&q=int&loc=L1&bloc=b1&day=d9'))).toEqual({
      view: 'day',
      q: 'int',
      locationId: 'L1',
      bloc: 'b1',
      day: 'd9',
    })
  })
  it('maps loc=none to null and ignores invalid view', () => {
    const r = parseStripboardParams(sp('view=sideways&loc=none'))
    expect(r.view).toBeNull()
    expect(r.locationId).toBeNull()
  })
})

describe('applyStripboardParams', () => {
  it('omits defaults', () => {
    const next = applyStripboardParams(sp('view=day&q=x&loc=L1&bloc=b1&day=d1'), {
      view: 'board',
      q: '',
      locationId: undefined,
      bloc: 'all',
      day: null,
    })
    expect(next.toString()).toBe('')
  })
  it('encodes null location as none and keeps unrelated params', () => {
    const next = applyStripboardParams(sp('foo=1'), { locationId: null, view: 'day' })
    expect(next.get('loc')).toBe('none')
    expect(next.get('view')).toBe('day')
    expect(next.get('foo')).toBe('1')
  })
  it('round trips', () => {
    const state = { view: 'day' as const, q: 'a b', locationId: null, bloc: 'b2', day: 'd3' }
    const next = applyStripboardParams(sp(''), state)
    expect(parseStripboardParams(next)).toEqual(state)
  })
  it('keeps keys absent from the patch', () => {
    const next = applyStripboardParams(sp('q=abc&bloc=b1'), { view: 'day' })
    expect(next.get('q')).toBe('abc')
    expect(next.get('bloc')).toBe('b1')
  })
})
