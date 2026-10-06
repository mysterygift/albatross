import { describe, expect, it } from 'vitest'
import {
  buildSceneLines,
  charactersForRun,
  computeLineOwners,
  formatEighths,
  formatRun,
  linesForRange,
  nudgeSelection,
  planSelection,
  rangeForRun,
  toRuns,
  type LayoutPage,
} from './scriptSectionLayout'

/** 16 lines per page → 2 lines per eighth with the line-snapped splitter. */
function page(id: string, pageNumber: string, pageIndex: number, lines: string[]): LayoutPage {
  return { id, page_number: pageNumber, page_index: pageIndex, content: lines.join('\n') }
}

const P14 = page('p14', '14', 0, [
  'INT. HARBOUR OFFICE - NIGHT',
  'Charts everywhere. Maggie sits at the radio.',
  'MAGGIE',
  'Kestrel, this is North Shore.',
  'Static. She checks the clock.',
  'The door bangs open. Tom, soaked.',
  'TOM',
  "Nobody's going out in this.",
  'MAGGIE',
  'Danny went out at six.',
  'Tom stops dripping on the lino.',
  'He takes that in.',
  'TOM',
  'On his own?',
  'She hands him the logbook.',
  'He reads the last entry twice.',
])
const P15 = page('p15', '15', 1, [
  'TOM',
  "That's not his handwriting.",
  'The radio crackles.',
  'A voice, broken up.',
  'DANNY (V.O.)',
  'North Shore... taking water.',
  'Maggie is already on her feet.',
  'She grabs her coat.',
])
const pages = [P14, P15]
const lines = buildSceneLines(pages)

describe('buildSceneLines', () => {
  it('flattens pages into lines with offsets that round-trip to the page text', () => {
    expect(lines).toHaveLength(24)
    const line = lines[3]!
    expect(P14.content!.slice(line.startOffset, line.endOffset).trimEnd()).toBe('Kestrel, this is North Shore.')
    expect(lines[16]!.pageNumber).toBe('15')
    expect(lines[16]!.lineInPage).toBe(0)
    expect(lines[16]!.startOffset).toBe(0)
  })

  it('assigns each line to an eighth span', () => {
    expect(lines[0]!.startEighth).toBe(0)
    expect(lines[15]!.endEighth).toBeLessThanOrEqual(8)
    expect(lines[15]!.endEighth).toBeGreaterThan(lines[15]!.startEighth)
    for (let i = 1; i < 16; i++) expect(lines[i]!.startEighth).toBeGreaterThanOrEqual(lines[i - 1]!.startEighth)
  })
})

describe('ranges ↔ lines', () => {
  it('round-trips a run through rangeForRun and linesForRange, across a page break', () => {
    const range = rangeForRun(lines, { from: 12, to: 19 })
    expect(range.start_page).toBe('14')
    expect(range.end_page).toBe('15')
    expect(linesForRange(lines, pages, range)).toEqual([12, 13, 14, 15, 16, 17, 18, 19])
    expect(formatRun(lines, { from: 12, to: 19 })).toMatch(/^p14 \d\/8 – p15 \d\/8$/)
  })

  it('resolves ranges stored without offsets from their eighths', () => {
    const covered = linesForRange(lines, pages, { start_page: '14', start_eighth: 0, end_page: '14', end_eighth: 8 })
    expect(covered).toEqual(Array.from({ length: 16 }, (_, i) => i))
  })

  it('ignores ranges on pages outside the scene', () => {
    expect(linesForRange(lines, pages, { start_page: '99', start_eighth: 0, end_page: '99', end_eighth: 8 })).toEqual([])
  })
})

function ownersOf(layout: Record<string, [number, number]>) {
  return computeLineOwners(
    lines,
    pages,
    Object.entries(layout).map(([id, [from, to]]) => ({ id, ranges: [rangeForRun(lines, { from, to })] }))
  )
}

describe('planSelection', () => {
  const owners = ownersOf({ a: [0, 5], b: [6, 11], c: [12, 17], d: [18, 23] })

  it('leaves neighbours alone when the selection stays inside the section', () => {
    const plan = planSelection(owners, 'b', { from: 6, to: 11 }, lines)
    expect(plan.effects).toEqual([])
    expect(plan.updates).toEqual([])
  })

  it('takes overlapped lines from both neighbours (most recent selection wins)', () => {
    const plan = planSelection(owners, 'b', { from: 4, to: 13 }, lines)
    expect(plan.removals).toEqual([])
    expect(plan.updates).toEqual(
      expect.arrayContaining([
        { sectionId: 'a', run: { from: 0, to: 3 } },
        { sectionId: 'c', run: { from: 14, to: 17 } },
      ])
    )
    expect(plan.effects.map((e) => e.kind).sort()).toEqual(['trimmed', 'trimmed'])
  })

  it('removes a neighbour that sits entirely inside the selection', () => {
    const plan = planSelection(owners, 'b', { from: 6, to: 18 }, lines)
    expect(plan.removals).toEqual(['c'])
    expect(plan.updates).toEqual([{ sectionId: 'd', run: { from: 19, to: 23 } }])
  })

  it('hands released lines to the adjacent section on each side', () => {
    const plan = planSelection(owners, 'b', { from: 8, to: 9 }, lines)
    expect(plan.updates).toEqual(
      expect.arrayContaining([
        { sectionId: 'a', run: { from: 0, to: 7 } },
        { sectionId: 'c', run: { from: 10, to: 17 } },
      ])
    )
    expect(plan.effects.filter((e) => e.kind === 'received')).toHaveLength(2)
    expect(plan.effects.some((e) => e.kind === 'unsectioned')).toBe(false)
  })

  it('leaves released lines unsectioned when there is no section next to them', () => {
    const plan = planSelection(owners, 'a', { from: 3, to: 5 }, lines)
    expect(plan.effects).toEqual([{ kind: 'unsectioned', lines: { from: 0, to: 2 } }])
  })

  it('splits a neighbour when a new selection lands inside it', () => {
    const plan = planSelection(owners, null, { from: 14, to: 15 }, lines)
    expect(plan.updates).toEqual([{ sectionId: 'c', run: { from: 12, to: 13 } }])
    expect(plan.splits).toEqual([{ sourceSectionId: 'c', run: { from: 16, to: 17 } }])
  })

  it('reaches a neighbour across blank lines no section covers', () => {
    const blankPage = page('pb', '20', 0, ['ONE', 'one', '', '', 'TWO', 'two'])
    const blankLines = buildSceneLines([blankPage])
    const blankOwners = computeLineOwners(blankLines, [blankPage], [
      { id: 'x', ranges: [rangeForRun(blankLines, { from: 0, to: 1 })] },
      { id: 'y', ranges: [rangeForRun(blankLines, { from: 4, to: 5 })] },
    ])
    const shrink = planSelection(blankOwners, 'y', { from: 5, to: 5 }, blankLines)
    expect(shrink.updates).toEqual([{ sectionId: 'x', run: { from: 0, to: 4 } }])
    const grow = planSelection(blankOwners, 'x', { from: 0, to: 0 }, blankLines)
    expect(grow.effects).toEqual([
      { kind: 'received', sectionId: 'y', given: { from: 1, to: 1 }, result: { from: 1, to: 5 } },
    ])
  })
})

describe('nudgeSelection', () => {
  it('moves edges by whole eighths and never crosses the other edge', () => {
    const sel = { from: 6, to: 9 }
    const back = nudgeSelection(lines, sel, 'start', -1)
    expect(back.from).toBeLessThan(6)
    expect(lines[back.from]!.startEighth).toBe(lines[6]!.startEighth - 1)
    const forward = nudgeSelection(lines, sel, 'end', 1)
    expect(forward.to).toBeGreaterThan(9)
    expect(nudgeSelection(lines, { from: 6, to: 6 }, 'start', 1)).toEqual({ from: 6, to: 6 })
  })
})

describe('helpers', () => {
  it('groups indexes into runs', () => {
    expect(toRuns([5, 1, 2, 3, 7, 6])).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 7 },
    ])
  })

  it('formats eighths like a breakdown sheet', () => {
    expect(formatEighths(3)).toBe('3/8 pg')
    expect(formatEighths(10)).toBe('1 2/8 pg')
    expect(formatEighths(16)).toBe('2 pg')
  })

  it('reads characters from a run and keeps existing cast links', () => {
    const chars = charactersForRun(lines, { from: 0, to: 7 }, [{ character_name: 'Tom', person_id: 'person-tom' }])
    expect(chars).toEqual([
      { character_name: 'MAGGIE', person_id: null },
      { character_name: 'TOM', person_id: 'person-tom' },
    ])
  })
})
