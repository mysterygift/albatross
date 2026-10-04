/**
 * Continuity sheets PDF (Script Supervisor SS9). A4, pdf-lib, one sheet per slate in shot order.
 * Data comes from `buildContinuitySheets`; styled like the Daily Progress Report (print mint for rules only).
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'

import { textForPdf } from '@/lib/pdf/callSheet'
import type { ContinuitySheet, ContinuitySheetsData } from '@/lib/script-supervisor/continuitySheets'

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

type Ctx = { doc: PDFDocument; page: PDFPage; y: number; font: PDFFont; bold: PDFFont }

function t(s: string): string {
  return textForPdf(s.replace(/…/g, '...'))
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
  ctx.y = PAGE_HEIGHT - MARGIN
}

function ensure(ctx: Ctx, height: number): void {
  if (ctx.y - height < Y_MIN) newPage(ctx)
}

function label(ctx: Ctx, text: string): void {
  ensure(ctx, 18)
  ctx.page.drawText(t(text.toUpperCase()), { x: MARGIN, y: ctx.y, size: 7.5, font: ctx.bold, color: MUTED })
  ctx.y -= 12
}

function paragraph(ctx: Ctx, text: string, opts: { size?: number; color?: typeof TEXT; indent?: number; font?: PDFFont } = {}): void {
  const size = opts.size ?? 9
  const indent = opts.indent ?? 0
  for (const line of wrap(text, CONTENT_WIDTH - indent, opts.font ?? ctx.font, size)) {
    ensure(ctx, size + 4)
    ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y, size, font: opts.font ?? ctx.font, color: opts.color ?? TEXT })
    ctx.y -= size + 3.5
  }
}

type Col = { label: string; width: number; align?: 'left' | 'right' }

/** Rows wrap in the last column (remarks); other columns are trimmed. */
function table(ctx: Ctx, cols: Col[], rows: string[][]): void {
  const size = 8.5
  const lineH = 11
  const pad = 4
  const drawHeader = () => {
    ensure(ctx, lineH + 6)
    let x = MARGIN
    for (const col of cols) {
      const text = fit(col.label, col.width - pad * 2, ctx.bold, size)
      const w = ctx.bold.widthOfTextAtSize(text, size)
      ctx.page.drawText(text, { x: col.align === 'right' ? x + col.width - pad - w : x + pad, y: ctx.y, size, font: ctx.bold, color: MUTED })
      x += col.width
    }
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y - 4 }, end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y - 4 }, thickness: 0.5, color: RULE })
    ctx.y -= lineH + 3
  }
  drawHeader()
  rows.forEach((cells, r) => {
    const last = cols.length - 1
    const wrapped = wrap(cells[last] ?? '', cols[last]!.width - pad * 2, ctx.font, size)
    const height = Math.max(1, wrapped.length) * lineH + 3
    if (ctx.y - height < Y_MIN) {
      newPage(ctx)
      drawHeader()
    }
    if (r % 2 === 1) ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - height + lineH - 1, width: CONTENT_WIDTH, height, color: ZEBRA })
    let x = MARGIN
    cells.forEach((cell, i) => {
      const col = cols[i]!
      if (i === last) {
        wrapped.forEach((line, j) => ctx.page.drawText(line, { x: x + pad, y: ctx.y - j * lineH, size, font: ctx.font, color: TEXT }))
      } else {
        const text = fit(cell, col.width - pad * 2, i === 0 ? ctx.bold : ctx.font, size)
        const font = i === 0 ? ctx.bold : ctx.font
        const w = font.widthOfTextAtSize(text, size)
        ctx.page.drawText(text, { x: col.align === 'right' ? x + col.width - pad - w : x + pad, y: ctx.y, size, font, color: TEXT })
      }
      x += col.width
    })
    ctx.y -= height
  })
}

function drawSheet(ctx: Ctx, sheet: ContinuitySheet, first: boolean): void {
  // Keep the heading with the slate's fields.
  ensure(ctx, 130)
  if (!first) {
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 4 }, end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y + 4 }, thickness: 0.75, color: MINT })
    ctx.y -= 14
  }
  ctx.page.drawText(fit(sheet.heading, CONTENT_WIDTH * 0.55, ctx.bold, 13), { x: MARGIN, y: ctx.y, size: 13, font: ctx.bold, color: TEXT })
  const printed = t(sheet.printed)
  ctx.page.drawText(printed, {
    x: MARGIN + CONTENT_WIDTH - ctx.bold.widthOfTextAtSize(printed, 10),
    y: ctx.y,
    size: 10,
    font: ctx.bold,
    color: TEXT,
  })
  ctx.y -= 15
  if (sheet.subheading) {
    ctx.page.drawText(fit(sheet.subheading, CONTENT_WIDTH, ctx.font, 10), { x: MARGIN, y: ctx.y, size: 10, font: ctx.font, color: MUTED })
    ctx.y -= 14
  }
  ctx.y -= 2

  // Fields: five columns of label over value.
  const perRow = 5
  const colW = CONTENT_WIDTH / perRow
  for (let i = 0; i < sheet.fields.length; i += perRow) {
    ensure(ctx, 26)
    sheet.fields.slice(i, i + perRow).forEach((f, j) => {
      const x = MARGIN + j * colW
      ctx.page.drawText(t(f.label), { x, y: ctx.y, size: 7.5, font: ctx.font, color: MUTED })
      ctx.page.drawText(fit(f.value, colW - 8, ctx.bold, 9.5), { x, y: ctx.y - 11, size: 9.5, font: ctx.bold, color: TEXT })
    })
    ctx.y -= 26
  }

  ctx.y -= 2
  label(ctx, 'Takes')
  if (sheet.takes.length === 0) paragraph(ctx, 'No takes logged.', { color: MUTED })
  else {
    table(
      ctx,
      [
        { label: 'Take', width: 40 },
        { label: 'Duration', width: 58, align: 'right' },
        { label: 'Status', width: 74 },
        { label: 'NG reason', width: 78 },
        { label: 'Remarks', width: CONTENT_WIDTH - 40 - 58 - 74 - 78 },
      ],
      sheet.takes.map((r) => [r.take, r.duration, r.status, r.ngReason, r.remarks])
    )
  }

  ctx.y -= 4
  label(ctx, 'Script notes')
  if (sheet.scriptNotes.length === 0) paragraph(ctx, 'None.', { color: MUTED })
  for (const n of sheet.scriptNotes) {
    paragraph(ctx, n.text)
    if (n.line) paragraph(ctx, `On: ${n.line}`, { size: 8, color: MUTED, indent: 10 })
  }

  ctx.y -= 4
  label(ctx, 'Slate notes')
  paragraph(ctx, sheet.slateNotes ?? 'None.', { color: sheet.slateNotes ? TEXT : MUTED })

  ctx.y -= 4
  label(ctx, 'Continuity photos')
  paragraph(ctx, sheet.photos === 'None' ? 'None.' : sheet.photos, { color: sheet.photos === 'None' ? MUTED : TEXT })
  ctx.y -= 10
}

export async function generateContinuitySheetsPdf(data: ContinuitySheetsData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(t(`${data.productionName} - ${data.heading}`))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ctx: Ctx = { doc, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN, font, bold }

  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y + 10, width: 36, height: 3, color: MINT })
  ctx.y -= 8
  ctx.page.drawText(t(data.heading), { x: MARGIN, y: ctx.y, size: 16, font: bold, color: TEXT })
  ctx.y -= 18
  const sub = [data.productionName, data.dateLabel, `${data.sheets.length} ${data.sheets.length === 1 ? 'slate' : 'slates'}`].join('  ·  ')
  ctx.page.drawText(fit(sub, CONTENT_WIDTH, font, 10), { x: MARGIN, y: ctx.y, size: 10, font, color: MUTED })
  ctx.y -= 28

  if (data.sheets.length === 0) paragraph(ctx, 'No slates logged on this day.', { color: MUTED })
  data.sheets.forEach((s, i) => drawSheet(ctx, s, i === 0))

  const pages = doc.getPages()
  pages.forEach((p, i) => {
    const left = data.scriptSupervisorName ? `Script supervisor: ${data.scriptSupervisorName}` : 'Script supervisor'
    p.drawText(t(left), { x: MARGIN, y: MARGIN - 12, size: 8, font, color: MUTED })
    const right = `Page ${i + 1} of ${pages.length}`
    p.drawText(right, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(right, 8), y: MARGIN - 12, size: 8, font, color: MUTED })
  })
  return doc.save()
}
