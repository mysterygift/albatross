import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

import { generateMarkedUpScriptPdf, markedUpPdfText, planForPdf, type MarkedUpScriptPdfInput } from './markedUpScript'
import { layoutLinedScript, type LiningElement, type LiningTramline } from '@/lib/script-supervisor/lining'
import type { FontKind } from '@/lib/script-supervisor/markedUpScript'

const el = (i: number, type: LiningElement['element_type'], page: string, text: string): LiningElement => ({
  id: `e${i}`, scene_id: 's', sort_index: i, element_type: type, character_name: type === 'dialogue' ? 'ELENA' : null, text, page_number: page,
})
const tram = (over: Partial<LiningTramline>): LiningTramline => ({
  id: 't', slateId: 'sl', slateLabel: '212', slateCreatedAt: '2026-10-07T10:00', shotType: 'master', shotCode: 'WS', description: null,
  camera: '', printTakeNumbers: [3], startElementId: 'e1', endElementId: 'e3', startSortIndex: 1, endSortIndex: 3, segments: new Map(), ...over,
})

function input(rows = 4): MarkedUpScriptPdfInput {
  const elements = [el(0, 'scene_heading', '31', 'INT. EDIT SUITE – NIGHT')]
  for (let i = 1; i < rows; i++) elements.push(el(i, i % 2 ? 'action' : 'dialogue', String(31 + Math.floor(i / 20)), `“Line” ${i} … with curly quotes and an ellipsis. `.repeat(3)))
  return {
    productionName: 'The Pier',
    subtitle: 'Day 14 · 2026-10-07',
    scenes: [{ sceneNumber: '23', sceneTitle: 'Edit suite', layout: layoutLinedScript(elements, [tram({}), tram({ id: 'u', slateId: 's2', slateLabel: '213', shotType: 'single', slateCreatedAt: '2026-10-07T11:00', segments: new Map([['e2', 'off']]) })]) }],
  }
}

describe('marked-up script PDF (SS9)', () => {
  it('renders one A4 page per planned page', async () => {
    const bytes = await generateMarkedUpScriptPdf(input())
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    const { width, height } = doc.getPage(0).getSize()
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
  })

  it('page count matches the plan built with the real fonts', async () => {
    const big = input(160)
    const bytes = await generateMarkedUpScriptPdf(big)
    const doc = await PDFDocument.create()
    const fonts = {
      mono: await doc.embedFont(StandardFonts.Courier),
      monoBold: await doc.embedFont(StandardFonts.CourierBold),
      sans: await doc.embedFont(StandardFonts.Helvetica),
    }
    const plan = planForPdf(big, (t, size, f: FontKind) => fonts[f].widthOfTextAtSize(t, size))
    expect(plan.pages.length).toBeGreaterThan(1)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(plan.pages.length)
  })

  it('cleans text for the standard fonts', () => {
    expect(markedUpPdfText('“So use it.” … – ok')).toBe('"So use it." ... - ok')
  })
})
