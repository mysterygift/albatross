import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'

import { generateDailyProgressReportPdf } from './dailyProgressReport'
import type { DailyProgressReportData } from '@/lib/script-supervisor/dailyProgressReport'

function data(over: Partial<DailyProgressReportData> = {}): DailyProgressReportData {
  return {
    productionName: 'The Pier',
    heading: 'Daily Progress Report · Day 14 of 32',
    dateLabel: '2026-10-07',
    unitName: null,
    times: [
      { label: 'Unit call', value: '07:30' },
      { label: 'First shot', value: '08:10' },
      { label: 'Lunch', value: '13:00 – 14:00' },
    ],
    grid: [
      { label: 'Scenes', script: '4', previously: '1', today: '1', toDate: '2', toDo: '2' },
      { label: 'Pages', script: '3 7/8', previously: '6/8', today: '1 6/8', toDate: '2 4/8', toDo: '1 3/8' },
    ],
    scenes: [{ sceneNumber: '23', title: 'Edit suite', pages: '1 3/8', status: 'Completed today', scheduled: true }],
    completedToday: ['23'],
    wildTracks: ['Slate 5 · Sc 23 · Room tone'],
    remarks: 'Rain delay',
    footnotes: [],
    scriptSupervisorName: null,
    ...over,
  }
}

describe('daily progress report PDF', () => {
  it('renders a one-page A4 PDF', async () => {
    const bytes = await generateDailyProgressReportPdf(data())
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    const { width, height } = doc.getPage(0).getSize()
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
  })

  it('flows long content onto further pages', async () => {
    const scenes = Array.from({ length: 80 }, (_, i) => ({
      sceneNumber: String(i + 1), title: `Scene ${i + 1} with a long title that needs trimming to fit`, pages: '1', status: 'Not shot', scheduled: true,
    }))
    const bytes = await generateDailyProgressReportPdf(data({ scenes, remarks: 'A long remark. '.repeat(200) }))
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
  })
})
