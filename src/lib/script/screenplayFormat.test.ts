import { describe, expect, it } from 'vitest'

import {
  SCREENPLAY_LAYOUT,
  cleanSceneHeading,
  formatSceneForScreenplay,
  paginateScreenplay,
  screenplayElementsFromText,
  screenplayIndentChars,
  wrapToWidth,
  type ScreenplayBlock,
  type ScreenplayRow,
} from './screenplayFormat'

const SCENE = [
  '12 INT. EDIT SUITE - NIGHT 12',
  '',
  'Monitors glow. ELENA scrubs through a single frame.',
  '',
  'MARCUS (V.O.)',
  'You have been on that frame',
  'since lunch.',
  '',
  "ELENA (CONT'D)",
  '(not looking up)',
  'She says the line before she turns.',
  '',
  'Back to work.',
  '',
  'CUT TO:',
].join('\n')

const rowsOf = (blocks: ScreenplayBlock[]): ScreenplayRow[] => blocks.flatMap((b) => b.rows)

describe('screenplay element classification', () => {
  it('splits script text into heading, action, cue, parenthetical, dialogue and transition', () => {
    expect(screenplayElementsFromText(SCENE).map((e) => [e.type, e.lines])).toEqual([
      ['scene_heading', ['12 INT. EDIT SUITE - NIGHT 12']],
      ['action', ['Monitors glow. ELENA scrubs through a single frame.']],
      ['character', ['MARCUS (V.O.)']],
      ['dialogue', ['You have been on that frame', 'since lunch.']],
      ['character', ["ELENA (CONT'D)"]],
      ['parenthetical', ['(not looking up)']],
      ['dialogue', ['She says the line before she turns.']],
      ['action', ['Back to work.']],
      ['transition', ['CUT TO:']],
    ])
  })

  it('keeps a parenthetical that wraps across source lines together', () => {
    const els = screenplayElementsFromText('JANE\n(quietly, to\nherself)\nNot again.\n(beat)\nNever.')
    expect(els.map((e) => [e.type, e.lines.length])).toEqual([
      ['character', 1],
      ['parenthetical', 2],
      ['dialogue', 1],
      ['parenthetical', 1],
      ['dialogue', 1],
    ])
  })

  it('splits a trailing transition and drops source page-break furniture', () => {
    const els = screenplayElementsFromText('Waves crash.\nSMASH CUT TO:\n\n(MORE)\n\nCONTINUED:')
    expect(els.map((e) => e.type)).toEqual(['action', 'transition'])
  })

  it('strips margin scene numbers and continuation tags from headings', () => {
    expect(cleanSceneHeading('12A int. pier - day (CONTINUED) 12A')).toBe('INT. PIER - DAY')
    expect(cleanSceneHeading('EXT. ROAD - NIGHT')).toBe('EXT. ROAD - NIGHT')
  })
})

describe('screenplay layout', () => {
  it('uses the standard column positions', () => {
    const { columns } = SCREENPLAY_LAYOUT
    expect(columns.scene_heading.left).toBe(108)
    expect(columns.action.left).toBe(108)
    expect(columns.dialogue.left).toBe(180)
    expect(columns.parenthetical.left).toBe(216)
    expect(columns.character.left).toBe(252)
    expect(screenplayIndentChars('dialogue')).toBe(10)
    expect(screenplayIndentChars('parenthetical')).toBe(15)
    expect(screenplayIndentChars('character')).toBe(20)
  })

  it('wraps to a width and hard-breaks long words', () => {
    expect(wrapToWidth('one two three four', 9)).toEqual(['one two', 'three', 'four'])
    expect(wrapToWidth('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('formats a scene: numbered heading, notes, then elements with source line breaks kept', () => {
    const blocks = formatSceneForScreenplay({
      sceneNumber: '12',
      heading: 'INT. EDIT SUITE - NIGHT',
      text: SCENE,
      notes: ['Best-effort text'],
    })
    expect(blocks.map((b) => b.kind)).toEqual(['scene_heading', 'note', 'action', 'speech', 'speech', 'action', 'transition'])
    expect(blocks[0]!.rows).toEqual([{ type: 'scene_heading', text: 'INT. EDIT SUITE - NIGHT', sceneNumber: '12' }])
    expect(blocks[3]!.rows).toEqual([
      { type: 'character', text: 'MARCUS (V.O.)' },
      { type: 'dialogue', text: 'You have been on that frame' },
      { type: 'dialogue', text: 'since lunch.' },
    ])
    expect(blocks[6]!.rows).toEqual([{ type: 'transition', text: 'CUT TO:' }])
  })

  it("prefers the script's own heading over the computed slugline prepended by collation", () => {
    const blocks = formatSceneForScreenplay({
      sceneNumber: '4',
      heading: 'INT. KITCHEN - DAY',
      text: "INT. KITCHEN - DAY\n\nINT. JANE'S KITCHEN - DAY\n\nJane enters.",
    })
    expect(blocks[0]!.rows[0]!.text).toBe("INT. JANE'S KITCHEN - DAY")
    expect(blocks.filter((b) => b.kind === 'scene_heading')).toHaveLength(1)
  })

  it('falls back to the computed heading when the text has none, and reflows over-long lines', () => {
    const long = 'Jane '.repeat(30).trim()
    const blocks = formatSceneForScreenplay({ sceneNumber: '7', heading: 'Ext. Park - Day', text: `JANE\n${long}` })
    expect(blocks[0]!.rows[0]!.text).toBe('EXT. PARK - DAY')
    const dialogue = rowsOf(blocks).filter((r) => r.type === 'dialogue')
    expect(dialogue.length).toBeGreaterThan(1)
    expect(dialogue.every((r) => r.text.length <= SCREENPLAY_LAYOUT.columns.dialogue.width)).toBe(true)
  })

  it('hangs wrapped parenthetical lines one character in', () => {
    const blocks = formatSceneForScreenplay({
      sceneNumber: '1',
      heading: null,
      text: 'JANE\n(turning back to the window, very slowly)\nNo.',
    })
    const paren = rowsOf(blocks).filter((r) => r.type === 'parenthetical')
    expect(paren.length).toBe(2)
    expect(paren[1]!.text.startsWith(' ')).toBe(true)
    expect(paren.every((r) => r.text.length <= SCREENPLAY_LAYOUT.columns.parenthetical.width)).toBe(true)
  })
})

describe('screenplay pagination', () => {
  const action = (n: number): ScreenplayBlock => ({
    kind: 'action',
    rows: Array.from({ length: n }, (_, i) => ({ type: 'action', text: `line ${i}` })),
    spaceBefore: 1,
  })
  const heading: ScreenplayBlock = {
    kind: 'scene_heading',
    rows: [{ type: 'scene_heading', text: 'INT. ROOM - DAY', sceneNumber: '1' }],
    spaceBefore: 1,
  }
  const speech = (n: number, cue = 'JANE'): ScreenplayBlock => ({
    kind: 'speech',
    rows: [
      { type: 'character', text: cue },
      ...Array.from({ length: n }, (_, i) => ({ type: 'dialogue' as const, text: `word ${i}` })),
    ],
    spaceBefore: 1,
  })

  it('separates blocks with one blank line and never starts a page with a blank', () => {
    const pages = paginateScreenplay([heading, action(2), speech(1)], { linesPerPage: 20 })
    expect(pages).toHaveLength(1)
    expect(pages[0]!.rows.map((r) => r.type)).toEqual([
      'scene_heading',
      'blank',
      'action',
      'action',
      'blank',
      'character',
      'dialogue',
    ])
  })

  it('does not leave a scene heading alone at the bottom of a page', () => {
    // 8 lines of action + blank + heading = 10, but the heading needs 2 following lines.
    const pages = paginateScreenplay([action(8), heading, action(4)], { linesPerPage: 10 })
    expect(pages[0]!.rows.some((r) => r.type === 'scene_heading')).toBe(false)
    expect(pages[1]!.rows[0]!.type).toBe('scene_heading')
  })

  it("splits long dialogue with (MORE) and a (CONT'D) cue", () => {
    const pages = paginateScreenplay([action(2), speech(10, 'MARCUS (V.O.)')], { linesPerPage: 10 })
    const first = pages[0]!.rows
    expect(first[first.length - 1]).toEqual({ type: 'more', text: '(MORE)' })
    expect(first.length).toBe(10)
    expect(pages[1]!.rows[0]).toEqual({ type: 'character', text: "MARCUS (V.O.) (CONT'D)" })
    const spoken = pages.flatMap((p) => p.rows).filter((r) => r.type === 'dialogue')
    expect(spoken).toHaveLength(10)
  })

  it('moves a speech whole when too little of it would fit', () => {
    const pages = paginateScreenplay([action(6), speech(6)], { linesPerPage: 10 })
    expect(pages[0]!.rows.some((r) => r.type === 'character')).toBe(false)
    expect(pages[1]!.rows[0]).toEqual({ type: 'character', text: 'JANE' })
  })

  it('never ends a page on a parenthetical', () => {
    const block: ScreenplayBlock = {
      kind: 'speech',
      rows: [
        { type: 'character', text: 'JANE' },
        { type: 'dialogue', text: 'a' },
        { type: 'dialogue', text: 'b' },
        { type: 'dialogue', text: 'c' },
        { type: 'parenthetical', text: '(beat)' },
        { type: 'dialogue', text: 'd' },
        { type: 'dialogue', text: 'e' },
        { type: 'dialogue', text: 'f' },
      ],
      spaceBefore: 1,
    }
    const pages = paginateScreenplay([action(3), block], { linesPerPage: 10 })
    const first = pages[0]!.rows
    expect(first[first.length - 2]!.type).not.toBe('parenthetical')
    expect(pages[1]!.rows[1]).toEqual({ type: 'parenthetical', text: '(beat)' })
  })

  it('splits long action across pages and honours a shorter first page', () => {
    const pages = paginateScreenplay([action(25)], { linesPerPage: 10, firstPageLines: 5 })
    expect(pages.map((p) => p.rows.length)).toEqual([5, 10, 10])
  })

  it('labels each page with the group of its first block', () => {
    const a = { ...action(8), group: 'Episode 1' }
    const b = { ...action(8), group: 'Episode 2' }
    const pages = paginateScreenplay([a, b], { linesPerPage: 10 })
    expect(pages.map((p) => p.group)).toEqual(['Episode 1', 'Episode 2'])
  })
})
