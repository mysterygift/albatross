import { describe, expect, it } from 'vitest'

import { blocksFromPageText } from './scriptElements'

describe('script elements from page text (SS6)', () => {
  it('splits PDF-spaced page text into heading, action, speeches and transitions', () => {
    const page = [
      'INT. EDIT SUITE - NIGHT',
      'Monitors glow. ELENA scrubs through a single frame.',
      'MARCUS waits at the door.',
      '',
      'MARCUS',
      'You have been on that frame',
      'since lunch.',
      '',
      "ELENA (CONT'D)",
      '(not looking up)',
      'She says the line before she turns.',
      '',
      'Marcus sets a coffee down.',
      'CUT TO:',
      '(MORE)',
    ].join('\n')
    const blocks = blocksFromPageText(page)
    expect(blocks.map((b) => [b.element_type, b.character_name])).toEqual([
      ['scene_heading', null],
      ['action', null],
      ['dialogue', 'MARCUS'],
      ['dialogue', 'ELENA'],
      ['action', null],
      ['transition', null],
    ])
    expect(blocks[2]!.text).toBe('You have been on that frame\nsince lunch.')
    expect(blocks[3]!.text).toBe('(not looking up)\nShe says the line before she turns.')
  })

  it('ignores page-break continuation lines', () => {
    expect(blocksFromPageText('INT. PIER - DAY\n\nWaves.\n\nCONTINUED:\n\nFADE OUT.').map((b) => b.element_type)).toEqual([
      'scene_heading',
      'action',
      'transition',
    ])
    expect(blocksFromPageText('')).toEqual([])
  })
})
