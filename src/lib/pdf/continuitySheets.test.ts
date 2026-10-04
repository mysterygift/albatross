import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'

import { generateContinuitySheetsPdf } from './continuitySheets'
import type { ContinuitySheet, ContinuitySheetsData } from '@/lib/script-supervisor/continuitySheets'

const sheet = (n: number, over: Partial<ContinuitySheet> = {}): ContinuitySheet => ({
  slateId: `s${n}`,
  heading: `Slate ${n} · Sc 23`,
  subheading: 'MS Elena',
  fields: ['Shot type', 'Camera', 'Lens', 'Stop', 'Filter', 'Sound', 'Int / Ext', 'Day / Night', 'Camera roll', 'Sound roll'].map((label) => ({ label, value: '—' })),
  takes: [
    { take: '1', duration: '0:12', status: 'NG', ngReason: 'Focus', remarks: '' },
    { take: '2', duration: '1:35', status: 'Print', ngReason: '', remarks: 'A long remark about the performance. '.repeat(6) },
  ],
  printed: 'Print 2',
  scriptNotes: [{ line: 'ELENA: There is no cutaway.', text: 'T2 · Ad-lib: + “Nobody ever does.”' }],
  slateNotes: null,
  photos: '2 photos (Wardrobe)',
  ...over,
})

const data = (sheets: ContinuitySheet[]): ContinuitySheetsData => ({
  productionName: 'The Pier', heading: 'Continuity sheets · Day 14 of 32', dateLabel: '2026-10-07', scriptSupervisorName: null, sheets,
})

describe('continuity sheets PDF (SS9)', () => {
  it('renders an A4 PDF', async () => {
    const doc = await PDFDocument.load(await generateContinuitySheetsPdf(data([sheet(217)])))
    expect(doc.getPageCount()).toBe(1)
    expect(Math.round(doc.getPage(0).getSize().width)).toBe(595)
  })

  it('flows a full day of slates over several pages', async () => {
    const sheets = Array.from({ length: 24 }, (_, i) => sheet(200 + i))
    const doc = await PDFDocument.load(await generateContinuitySheetsPdf(data(sheets)))
    expect(doc.getPageCount()).toBeGreaterThan(3)
  })

  it('renders an empty day', async () => {
    const doc = await PDFDocument.load(await generateContinuitySheetsPdf(data([])))
    expect(doc.getPageCount()).toBe(1)
  })
})
