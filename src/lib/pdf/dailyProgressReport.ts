/**
 * Daily Progress Report PDF (Script Supervisor SS5). A4, pdf-lib, read-only.
 * Data comes from `buildDailyProgressReport`; this file only lays it out.
 * Print mint (#2d9d78) is used for rules and fills only, never as text (3.4:1 on white).
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { embedStandardFont } from '@/lib/pdf/layoutKit'

import { textForPdf } from '@/lib/pdf/callSheet'
import type { DailyProgressReportData } from '@/lib/script-supervisor/dailyProgressReport'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const Y_MIN = MARGIN + 28

const TEXT = rgb(0.1, 0.1, 0.1)
const MUTED = rgb(0.32, 0.32, 0.32)
const RULE = rgb(0.85, 0.86, 0.88)
const ZEBRA = rgb(0.965, 0.97, 0.975)
const MINT = rgb(0x2d / 255, 0x9d / 255, 0x78 / 255)

type Ctx = { doc: PDFDocument; page: PDFPage; y: number; font: PDFFont; bold: PDFFont; pageNo: number }

function t(s: string): string {
  return textForPdf(s)
}

function wrap(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const lines: string[] = []
  for (const paragraph of t(text).split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next
      else {
        if (line) lines.push(line)
        line = w
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

function fit(text: string, maxWidth: number, font: PDFFont, size: number): string {
  let s = t(text)
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s
  while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > maxWidth) s = s.slice(0, -1)
  return `${s}...`
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  ctx.pageNo += 1
  ctx.y = PAGE_HEIGHT - MARGIN
}

function ensure(ctx: Ctx, height: number): void {
  if (ctx.y - height < Y_MIN) newPage(ctx)
}

function sectionTitle(ctx: Ctx, title: string): void {
  ensure(ctx, 30)
  ctx.y -= 8
  ctx.page.drawText(t(title.toUpperCase()), { x: MARGIN, y: ctx.y, size: 8.5, font: ctx.bold, color: MUTED })
  ctx.y -= 6
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y }, thickness: 0.75, color: RULE })
  ctx.y -= 12
}

type Col = { label: string; width: number; align?: 'left' | 'right' }

function table(ctx: Ctx, cols: Col[], rows: string[][], opts: { boldFirstCol?: boolean } = {}): void {
  const size = 9
  const rowH = 16
  const drawRow = (cells: string[], header: boolean, zebra: boolean) => {
    ensure(ctx, rowH)
    if (zebra) {
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 4.5, width: CONTENT_WIDTH, height: rowH, color: ZEBRA })
    }
    let x = MARGIN
    cells.forEach((cell, i) => {
      const col = cols[i]!
      const font = header || (opts.boldFirstCol && i === 0) ? ctx.bold : ctx.font
      const pad = 4
      const text = fit(cell, col.width - pad * 2, font, size)
      const w = font.widthOfTextAtSize(text, size)
      const tx = col.align === 'right' ? x + col.width - pad - w : x + pad
      ctx.page.drawText(text, { x: tx, y: ctx.y, size, font, color: header ? MUTED : TEXT })
      x += col.width
    })
    ctx.y -= rowH
  }
  drawRow(cols.map((c) => c.label), true, false)
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + rowH - 9 }, end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y + rowH - 9 }, thickness: 0.5, color: RULE })
  rows.forEach((r, i) => drawRow(r, false, i % 2 === 1))
}

function paragraph(ctx: Ctx, text: string, size = 9.5, color = TEXT): void {
  for (const line of wrap(text, CONTENT_WIDTH, ctx.font, size)) {
    ensure(ctx, size + 5)
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size, font: ctx.font, color })
    ctx.y -= size + 4
  }
}

export async function generateDailyProgressReportPdf(data: DailyProgressReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(t(`${data.productionName} - ${data.heading}`))
  const font = await embedStandardFont(doc, StandardFonts.Helvetica)
  const bold = await embedStandardFont(doc, StandardFonts.HelveticaBold)
  const ctx: Ctx = { doc, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN, font, bold, pageNo: 1 }

  // Header
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y + 10, width: 36, height: 3, color: MINT })
  ctx.y -= 8
  ctx.page.drawText(t(data.heading), { x: MARGIN, y: ctx.y, size: 16, font: bold, color: TEXT })
  ctx.y -= 18
  const sub = [data.productionName, data.dateLabel, data.unitName].filter(Boolean).join('  ·  ')
  ctx.page.drawText(fit(sub, CONTENT_WIDTH, font, 10), { x: MARGIN, y: ctx.y, size: 10, font, color: MUTED })
  ctx.y -= 10

  // Times: two columns of label / value
  sectionTitle(ctx, 'Times')
  const half = CONTENT_WIDTH / 2
  for (let i = 0; i < data.times.length; i += 2) {
    ensure(ctx, 15)
    for (let j = 0; j < 2; j++) {
      const item = data.times[i + j]
      if (!item) continue
      const x = MARGIN + j * half
      ctx.page.drawText(t(item.label), { x, y: ctx.y, size: 9.5, font, color: MUTED })
      ctx.page.drawText(fit(item.value, half - 130, bold, 9.5), { x: x + 120, y: ctx.y, size: 9.5, font: bold, color: TEXT })
    }
    ctx.y -= 15
  }

  // Progress grid
  sectionTitle(ctx, 'Progress')
  const labelW = 95
  const numW = (CONTENT_WIDTH - labelW) / 5
  table(
    ctx,
    [
      { label: '', width: labelW },
      { label: 'Script', width: numW, align: 'right' },
      { label: 'Previously', width: numW, align: 'right' },
      { label: 'Today', width: numW, align: 'right' },
      { label: 'To date', width: numW, align: 'right' },
      { label: 'To do', width: numW, align: 'right' },
    ],
    data.grid.map((g) => [g.label, g.script, g.previously, g.today, g.toDate, g.toDo]),
    { boldFirstCol: true }
  )

  // Scenes
  sectionTitle(ctx, 'Scenes')
  if (data.scenes.length === 0) {
    paragraph(ctx, 'No scenes scheduled or completed on this day.', 9.5, MUTED)
  } else {
    table(
      ctx,
      [
        { label: 'Scene', width: 52 },
        { label: 'Title', width: CONTENT_WIDTH - 52 - 56 - 170 },
        { label: 'Pages', width: 56, align: 'right' },
        { label: 'Status', width: 170 },
      ],
      data.scenes.map((s) => [s.sceneNumber, s.scheduled ? s.title : `${s.title} (not scheduled)`.trim(), s.pages, s.status]),
      { boldFirstCol: true }
    )
  }
  ctx.y -= 2
  paragraph(
    ctx,
    data.completedToday.length > 0 ? `Scenes completed today: ${data.completedToday.join(', ')}` : 'No scenes completed today.',
    9.5
  )

  if (data.wildTracks.length > 0) {
    sectionTitle(ctx, 'Wild tracks')
    for (const w of data.wildTracks) paragraph(ctx, w)
  }

  sectionTitle(ctx, 'Remarks')
  paragraph(ctx, data.remarks?.trim() ? data.remarks : 'None.', 9.5, data.remarks?.trim() ? TEXT : MUTED)

  if (data.footnotes.length > 0) {
    ctx.y -= 6
    for (const f of data.footnotes) paragraph(ctx, f, 8, MUTED)
  }

  // Footer on every page
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    const left = data.scriptSupervisorName ? `Script supervisor: ${data.scriptSupervisorName}` : 'Script supervisor'
    p.drawText(t(left), { x: MARGIN, y: MARGIN - 12, size: 8, font, color: MUTED })
    const right = `Page ${i + 1} of ${pages.length}`
    p.drawText(right, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(right, 8), y: MARGIN - 12, size: 8, font, color: MUTED })
  })

  return doc.save()
}
