import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'

import { buildSceneSheet } from '@/lib/breakdown/sceneSheet'
import { generateBreakdownReportPdf, generateSceneBreakdownPdf, hexToPdfColor } from './scriptBreakdown'

function sheet(sceneNumber: string, ordinal: number) {
  return buildSceneSheet({
    production: { name: 'Whiteridge', production_code: 'WR/26-A' },
    scene: { id: `s${ordinal}`, scene_number: sceneNumber, title: 'EXT. BEACH - DAY', description: 'Mary loses her umbrella “again”', int_ext: 'EXT', day_night: 'DAY', page_eighths: 5, location_id: null },
    sceneOrdinal: ordinal,
    sceneCount: 2,
    pages: [{ page_number: '4', page_index: 0, eighths: 5 }],
    locations: [],
    tags: [{ element_id: 'e1', updated_at: '2026-10-01T10:00:00Z' }],
    elementsById: new Map([['e1', { id: 'e1', category: 'props' as const, name: 'Red umbrella' }]]),
    matchesByElementId: new Map([['e1', { status: 'partial' as const, detail: 'On order' }]]),
  })
}

describe('script breakdown PDFs', () => {
  it('renders one page per scene', async () => {
    const bytes = await generateSceneBreakdownPdf({ sheets: [sheet('3', 1), sheet('4A', 2)], issuedAt: new Date(2026, 9, 7) })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
  })

  it('renders the department list, including an empty one', async () => {
    const rows = new Map([
      ['props' as const, [{ name: 'Red umbrella', scenes: ['3', '12'], status: 'needed' as const, detail: 'Not sourced yet', notes: 'Must be vintage' }]],
    ])
    expect((await PDFDocument.load(await generateBreakdownReportPdf({ productionTitle: 'Whiteridge', rowsByCategory: rows }))).getPageCount()).toBe(1)
    expect((await PDFDocument.load(await generateBreakdownReportPdf({ productionTitle: 'Whiteridge', rowsByCategory: new Map() }))).getPageCount()).toBe(1)
  })

  it('converts category colours', () => {
    expect(hexToPdfColor('#ff0000')).toEqual(expect.objectContaining({ red: 1, green: 0, blue: 0 }))
  })
})
