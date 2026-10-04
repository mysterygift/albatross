import { describe, expect, it } from 'vitest'

import { layoutLinedScript, type LinedScriptLayout, type LiningElement, type LiningTramline } from './lining'
import {
  MARKED_UP_PAGE,
  PRINT_TRAMLINE_HEX,
  contrastOnWhite,
  laneGeometry,
  markedUpScriptFileName,
  planMarkedUpScript,
  type MarkedUpPlan,
} from './markedUpScript'
import type { AnnotationView } from './annotations'

const el = (sort_index: number, element_type: LiningElement['element_type'], page_number: string, text = `Line ${sort_index}.`): LiningElement => ({
  id: `e${sort_index}`,
  scene_id: 's23',
  sort_index,
  element_type,
  character_name: element_type === 'dialogue' ? 'ELENA' : null,
  text,
  page_number,
})

const tram = (over: Partial<LiningTramline>): LiningTramline => ({
  id: 't', slateId: 'sl', slateLabel: '1', slateCreatedAt: '2026-10-07T10:00', shotType: 'master', shotCode: null,
  description: null, camera: '', printTakeNumbers: [], startElementId: 'e0', endElementId: 'e0', startSortIndex: 0, endSortIndex: 0,
  segments: new Map(), ...over,
})

/**
 * The acceptance check for SS9: every element appears once, in order, and each lane's cells on paper carry the
 * same state as the on-screen layout, with caps only at the tramline's real start and end.
 */
function expectPlanMatchesLayout(plan: MarkedUpPlan, layout: LinedScriptLayout): void {
  // Lanes across every pass, in order, are exactly the on-screen columns.
  const groups = new Map<number, string[]>()
  for (const page of plan.pages) groups.set(page.laneGroup?.index ?? 0, page.lanes.map((l) => l.label))
  expect([...groups.keys()].sort().flatMap((k) => groups.get(k)!)).toEqual(layout.columns.map((c) => c.label))

  for (const groupIndex of groups.keys()) {
    const pages = plan.pages.filter((p) => (p.laneGroup?.index ?? 0) === groupIndex)
    const pieces = pages.flatMap((p) => p.pieces.map((piece) => ({ piece, lanes: p.lanes })))
    const elementOrder = pieces.filter((x) => x.piece.firstPiece).map((x) => x.piece.elementId)
    expect(elementOrder).toEqual(layout.rows.map((r) => r.element.id))

    for (const row of layout.rows) {
      const parts = pieces.filter((x) => x.piece.elementId === row.element.id)
      expect(parts[0]!.piece.firstPiece).toBe(true)
      expect(parts[parts.length - 1]!.piece.lastPiece).toBe(true)
      parts.forEach(({ piece, lanes }, partIndex) => {
        expect(piece.coverage).toBe(row.coverage)
        lanes.forEach((lane, i) => {
          const screen = row.cells[lane.columnIndex]!
          const paper = piece.cells[i]!
          expect(paper.state).toBe(screen.state)
          expect(paper.isStart).toBe(screen.isStart && partIndex === 0)
          expect(paper.isEnd).toBe(screen.isEnd && partIndex === parts.length - 1)
        })
      })
    }
  }
}

function allInsidePage(plan: MarkedUpPlan): boolean {
  return plan.pages.every((p) =>
    p.pieces.every((piece) => piece.bottom >= 40 && piece.top <= p.rowsTop && piece.lines.every((l) => l.x >= 0 && l.x <= MARKED_UP_PAGE.width))
  )
}

describe('marked-up script plan (SS9)', () => {
  const elements = [el(0, 'scene_heading', '31', 'INT. EDIT SUITE - NIGHT'), el(1, 'action', '31'), el(2, 'dialogue', '31'), el(3, 'dialogue', '32'), el(4, 'action', '32')]
  const tramlines = [
    tram({ id: 'single', slateId: 's2', slateLabel: '213', slateCreatedAt: '2026-10-07T11:00', shotType: 'single', shotCode: 'MS', description: 'Elena', startSortIndex: 2, endSortIndex: 3, segments: new Map([['e2', 'off']]) }),
    tram({ id: 'master', slateId: 's1', slateLabel: '212', printTakeNumbers: [1, 3], shotCode: 'WS', startSortIndex: 1, endSortIndex: 4, segments: new Map([['e4', 'not_covered']]) }),
  ]

  it('matches the on-screen lining: lanes, labels, cell states, caps and coverage', () => {
    const layout = layoutLinedScript(elements, tramlines)
    const plan = planMarkedUpScript([{ sceneNumber: '23', sceneTitle: 'Edit suite', layout }])
    expect(plan.pages).toHaveLength(1)
    expect(plan.pages[0]!.lanes.map((l) => l.label)).toEqual(['212/1,3 WS', '213 MS Elena'])
    expect(plan.pages[0]!.summary).toEqual({ tramlines: 2, underCovered: 2 })
    expect(plan.pages[0]!.pieces.filter((p) => p.underCovered).map((p) => p.elementId)).toEqual(['e1', 'e4'])
    expectPlanMatchesLayout(plan, layout)
  })

  it('marks the script page change and lays dialogue out like the Script view', () => {
    const layout = layoutLinedScript(elements, tramlines)
    const page = planMarkedUpScript([{ sceneNumber: '23', sceneTitle: null, layout }]).pages[0]!
    expect(page.scriptPage).toBe('31')
    expect(page.pageBreaks.map((b) => b.label)).toEqual(['Page 32'])
    // 212 runs on over the page change; 213 (off camera on e2, on for e3) carries on too.
    expect(page.pageBreaks[0]!.cells.map((c) => c.state)).toEqual(['on', 'on'])
    const dialogue = page.pieces.find((p) => p.elementId === 'e2')!
    expect(dialogue.lines.map((l) => l.text)).toEqual(['ELENA', 'Line 2.'])
    expect(dialogue.lines[0]!.x).toBeGreaterThan(dialogue.lines[1]!.x)
    const heading = page.pieces.find((p) => p.elementId === 'e0')!
    expect(heading.lines[0]).toMatchObject({ text: 'INT. EDIT SUITE - NIGHT', font: 'monoBold' })
  })

  it('prints notes under their line', () => {
    const layout = layoutLinedScript(elements, tramlines)
    const note: AnnotationView = {
      id: 'a1', elementId: 'e2', kind: 'ad_lib', text: '+ "Nobody ever does."', slateId: 's2', slateLabel: '213', takeIds: ['t3'], takeNumbers: [3], createdAt: 't',
    }
    const page = planMarkedUpScript([{ sceneNumber: '23', sceneTitle: null, layout, annotations: new Map([['e2', [note]]]) }]).pages[0]!
    const lines = page.pieces.find((p) => p.elementId === 'e2')!.lines
    expect(lines.filter((l) => l.kind === 'note').map((l) => l.text)).toEqual(['T3 · 213 · Ad-lib: + "Nobody ever does."'])
  })

  it('flows a long scene over pages without breaking any tramline', () => {
    const long: LiningElement[] = [el(0, 'scene_heading', '1', 'EXT. PIER - DAY')]
    for (let i = 1; i <= 90; i++) {
      long.push(el(i, i % 3 === 0 ? 'action' : 'dialogue', String(1 + Math.floor(i / 12)), 'A line of dialogue long enough to wrap onto a second line in the column. '.repeat(1 + (i % 2))))
    }
    // One huge action block taller than a page is split.
    long.push(el(91, 'action', '9', 'Everything happens at once. '.repeat(400)))
    const layout = layoutLinedScript(long, [
      tram({ id: 'a', slateId: 'a', slateLabel: '1', startSortIndex: 1, endSortIndex: 91, segments: new Map([['e40', 'off'], ['e41', 'not_covered']]) }),
      tram({ id: 'b', slateId: 'b', slateLabel: '2', slateCreatedAt: '2026-10-07T11:00', shotType: 'single', startSortIndex: 5, endSortIndex: 60 }),
    ])
    const plan = planMarkedUpScript([{ sceneNumber: '1', sceneTitle: null, layout }])
    expect(plan.pages.length).toBeGreaterThan(3)
    expect(plan.pages.slice(1).every((p) => p.continued)).toBe(true)
    expect(plan.pages.flatMap((p) => p.pieces).filter((p) => p.elementId === 'e91').length).toBeGreaterThan(1)
    expect(allInsidePage(plan)).toBe(true)
    expectPlanMatchesLayout(plan, layout)
  })

  it('prints extra passes when there are more tramlines than fit across the page', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      tram({ id: `t${i}`, slateId: `s${i}`, slateLabel: String(100 + i), slateCreatedAt: `2026-10-07T10:${String(i).padStart(2, '0')}`, startSortIndex: 1, endSortIndex: 1 + (i % 4) })
    )
    const layout = layoutLinedScript(elements, many)
    const plan = planMarkedUpScript([{ sceneNumber: '23', sceneTitle: null, layout }])
    const groups = [...new Set(plan.pages.map((p) => p.laneGroup?.index))]
    expect(groups).toEqual([0, 1])
    expect(plan.pages[0]!.laneGroup).toMatchObject({ from: 1, total: 30 })
    expect(plan.pages[plan.pages.length - 1]!.laneGroup).toMatchObject({ to: 30, total: 30 })
    expectPlanMatchesLayout(plan, layout)
    // Lanes stay inside the page.
    for (const p of plan.pages) expect(p.laneAreaX + p.laneWidth * p.lanes.length).toBeLessThanOrEqual(MARKED_UP_PAGE.width - 36 + 0.01)
  })

  it('sizes lanes: preferred width when they fit, narrower before splitting', () => {
    expect(laneGeometry(4)).toMatchObject({ textWidth: 330, laneWidth: 16 })
    const tight = laneGeometry(15)
    expect(tight.perGroup).toBe(15)
    expect(tight.laneWidth).toBeLessThan(16)
    expect(tight.laneWidth).toBeGreaterThanOrEqual(11)
    expect(laneGeometry(60).perGroup).toBeLessThan(60)
  })

  it('prints an unlined scene as plain pages with no lanes', () => {
    const layout = layoutLinedScript(elements, [])
    const plan = planMarkedUpScript([{ sceneNumber: '23', sceneTitle: null, layout }])
    expect(plan.pages[0]!.lanes).toEqual([])
    expect(plan.pages[0]!.summary).toEqual({ tramlines: 0, underCovered: 0 })
    expect(plan.pages[0]!.pieces.some((p) => p.underCovered)).toBe(false)
  })

  it('starts each scene on a new page', () => {
    const layout = layoutLinedScript(elements, tramlines)
    const plan = planMarkedUpScript([
      { sceneNumber: '23', sceneTitle: null, layout },
      { sceneNumber: '24', sceneTitle: null, layout },
    ])
    expect(plan.pages.map((p) => [p.sceneNumber, p.continued])).toEqual([['23', false], ['24', false]])
  })

  it('uses print colours with at least 3:1 contrast on white', () => {
    for (const hex of Object.values(PRINT_TRAMLINE_HEX)) expect(contrastOnWhite(hex)).toBeGreaterThanOrEqual(3)
  })

  it('names files by scene or day', () => {
    expect(markedUpScriptFileName({ sceneNumber: '23A' })).toBe('marked-up-script-sc-23A.pdf')
    expect(markedUpScriptFileName({ dayNumber: 14, shootDate: '2026-10-07' })).toBe('marked-up-script-day-14-2026-10-07.pdf')
  })
})
