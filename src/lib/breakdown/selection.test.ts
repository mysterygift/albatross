// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { domRangeToPageRange, rangeText, snapRangeToWords } from './selection'

const pages = [
  { id: 'p1', content: 'EXT. BEACH - DAY\n\nMary opens a red umbrella.' },
  { id: 'p2', content: 'The umbrella flies.' },
]

describe('snapRangeToWords', () => {
  it('expands a partial selection to whole words and trims punctuation', () => {
    const at = pages[0]!.content.indexOf('ed umbr')
    expect(snapRangeToWords(pages, { startPageId: 'p1', startOffset: at, endPageId: 'p1', endOffset: at + 7 })).toEqual({
      startPageId: 'p1',
      startOffset: at - 1,
      endPageId: 'p1',
      endOffset: at + 11,
    })
    const dot = pages[0]!.content.indexOf('umbrella.')
    const snapped = snapRangeToWords(pages, { startPageId: 'p1', startOffset: dot - 1, endPageId: 'p1', endOffset: dot + 9 })!
    expect(rangeText(pages, snapped)).toBe('umbrella')
  })

  it('returns null for whitespace-only selections', () => {
    expect(snapRangeToWords(pages, { startPageId: 'p1', startOffset: 16, endPageId: 'p1', endOffset: 18 })).toBeNull()
  })

  it('keeps ranges that cross a page', () => {
    const at = pages[0]!.content.indexOf('red')
    const snapped = snapRangeToWords(pages, { startPageId: 'p1', startOffset: at, endPageId: 'p2', endOffset: 3 })!
    expect(rangeText(pages, snapped)).toBe('red umbrella.\nThe')
  })
})

describe('domRangeToPageRange', () => {
  function render(): HTMLElement {
    const root = document.createElement('div')
    root.innerHTML = `
      <div><span>1/8</span><span data-page-id="p1" data-line-start="0"><span data-chunk-start="0">EXT. </span><mark data-chunk-start="5">BEACH</mark><span data-chunk-start="10"> - DAY</span></span></div>
      <div><span></span><span data-page-id="p1" data-line-start="17">&nbsp;</span></div>
      <div><span></span><span data-page-id="p1" data-line-start="18">Mary opens a red umbrella.</span></div>`
    document.body.appendChild(root)
    return root
  }

  it('maps points inside highlighted runs and plain text to page offsets', () => {
    const root = render()
    const mark = root.querySelector('mark')!
    const plain = root.querySelectorAll('[data-page-id]')[2]!
    const range = document.createRange()
    range.setStart(mark.firstChild!, 2)
    range.setEnd(plain.firstChild!, 4)
    expect(domRangeToPageRange(range, root)).toEqual({ startPageId: 'p1', startOffset: 7, endPageId: 'p1', endOffset: 22 })
  })

  it('clamps a start in the gutter to the start of the line text', () => {
    const root = render()
    const gutter = root.querySelector('span')!
    const plain = root.querySelectorAll('[data-page-id]')[2]!
    const range = document.createRange()
    range.setStart(gutter.firstChild!, 0)
    range.setEnd(plain.firstChild!, 4)
    expect(domRangeToPageRange(range, root)).toMatchObject({ startOffset: 0, endOffset: 22 })
  })
})
