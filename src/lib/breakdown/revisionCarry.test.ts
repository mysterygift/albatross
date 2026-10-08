import { describe, expect, it } from 'vitest'

import { carryTagsToNewDraft, type CarryTagInput } from './revisionCarry'
import { rangeText } from './selection'

const oldPages = [{ id: 'o1', page_number: '1', page_index: 0, content: 'EXT. BEACH - DAY\n\nMary opens a red umbrella.\n\nA dog barks.' }]

function tagOn(text: string, occurrence = 0): CarryTagInput {
  const content = oldPages[0]!.content
  let at = -1
  for (let i = 0; i <= occurrence; i++) at = content.indexOf(text, at + 1)
  return { id: text, start_page_id: 'o1', start_offset: at, end_page_id: 'o1', end_offset: at + text.length, tagged_text: text }
}

function textOf(pages: Array<{ id: string; content: string }>, carry: ReturnType<typeof carryTagsToNewDraft> extends Map<string, infer T> ? T : never) {
  return carry.outcome === 'unmatched' ? null : rangeText(pages, carry.range)
}

describe('carryTagsToNewDraft', () => {
  it('carries tags on unchanged lines even when lines are added above', () => {
    const newPages = [{ id: 'n1', page_number: '1', page_index: 0, content: 'EXT. BEACH - DAY\n\nThunder.\n\nMary opens a red umbrella.\n\nA dog barks.' }]
    const out = carryTagsToNewDraft({ oldPages, newPages }, [tagOn('umbrella'), tagOn('dog')])
    expect(out.get('umbrella')).toMatchObject({ outcome: 'carried', notes: [] })
    expect(textOf(newPages, out.get('umbrella')!)).toBe('umbrella')
    expect(textOf(newPages, out.get('dog')!)).toBe('dog')
  })

  it('marks a tag on a reworded line as moved', () => {
    const newPages = [{ id: 'n1', page_number: '1', page_index: 0, content: 'EXT. BEACH - DAY\n\nMary slowly opens a red umbrella.\n\nA dog barks.' }]
    const out = carryTagsToNewDraft({ oldPages, newPages }, [tagOn('umbrella')])
    expect(out.get('umbrella')).toMatchObject({ outcome: 'moved', notes: ['Its line was reworded'] })
    expect(textOf(newPages, out.get('umbrella')!)).toBe('umbrella')
  })

  it('finds words that moved to another line, across pages, and reports cut ones', () => {
    const newPages = [
      { id: 'n1', page_number: '1', page_index: 0, content: 'EXT. BEACH - DAY\n\nThe wind howls.' },
      { id: 'n2', page_number: '2', page_index: 1, content: 'Mary drops the umbrella in the sand.' },
    ]
    const out = carryTagsToNewDraft({ oldPages, newPages }, [tagOn('umbrella'), tagOn('dog')])
    const moved = out.get('umbrella')!
    expect(moved.outcome).toBe('moved')
    if (moved.outcome !== 'unmatched') expect(moved.range).toMatchObject({ startPageId: 'n2', endPageId: 'n2' })
    expect(out.get('dog')).toEqual({ outcome: 'unmatched', notes: ['Its words are no longer in the scene'] })
  })
})
