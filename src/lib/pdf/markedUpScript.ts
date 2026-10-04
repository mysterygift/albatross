/**
 * Marked-up script PDF (Script Supervisor SS9). A4, pdf-lib. Paints a `MarkedUpPlan` and nothing else:
 * positions, lanes and cell states all come from `planMarkedUpScript`, which reads the same layout as the
 * on-screen Script view. Courier for script text, Helvetica for labels and notes.
 */
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'

import type { SlateShotType } from '@/lib/db/types'
import { textForPdf } from '@/lib/pdf/callSheet'
import {
  MARKED_UP_PAGE,
  PRINT_TRAMLINE_HEX,
  planMarkedUpScript,
  type FontKind,
  type MarkedUpPlan,
  type MarkedUpSceneInput,
  type PlanPage,
  type TextMeasure,
} from '@/lib/script-supervisor/markedUpScript'

const TEXT = rgb(0.1, 0.1, 0.1)
const MUTED = rgb(0.32, 0.32, 0.32)
const RULE = rgb(0.85, 0.86, 0.88)
const SHADE = rgb(0.94, 0.945, 0.95)
const MINT = rgb(0x2d / 255, 0x9d / 255, 0x78 / 255)

const LINE_W = 1.6
const CAP_W = 7
const CAP_INSET = 3

const LEGEND: Array<{ type: SlateShotType; label: string }> = [
  { type: 'master', label: 'Master / wide' },
  { type: 'single', label: 'Single' },
  { type: 'multiple', label: 'Multiple' },
  { type: 'insert', label: 'Insert / cutaway' },
]

/** WinAnsi-safe text for the standard fonts (ellipsis kept as three dots). */
export function markedUpPdfText(s: string): string {
  return textForPdf(s.replace(/…/g, '...'))
}

function hexToRgb(hex: string): RGB {
  return rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255)
}

function tramlineColour(shotType: SlateShotType | null): RGB {
  return hexToRgb(PRINT_TRAMLINE_HEX[shotType ?? 'none'])
}

function fit(text: string, maxWidth: number, font: PDFFont, size: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let s = text
  while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > maxWidth) s = s.slice(0, -1)
  return `${s}...`
}

type Fonts = { mono: PDFFont; monoBold: PDFFont; sans: PDFFont; sansBold: PDFFont }

function drawHeader(page: PDFPage, p: PlanPage, fonts: Fonts, productionName: string, subtitle: string | null): void {
  const top = MARKED_UP_PAGE.height - 40
  const right = MARKED_UP_PAGE.width - 36
  page.drawRectangle({ x: p.stripX, y: top + 6, width: 36, height: 3, color: MINT })
  const title = `Sc ${p.sceneNumber}${p.sceneTitle ? ` · ${p.sceneTitle}` : ''}${p.continued ? ' (cont.)' : ''}`
  page.drawText(fit(markedUpPdfText(title), right - p.stripX - 140, fonts.sansBold, 12), {
    x: p.stripX,
    y: top - 10,
    size: 12,
    font: fonts.sansBold,
    color: TEXT,
  })
  const counts = [
    `${p.summary.tramlines} ${p.summary.tramlines === 1 ? 'tramline' : 'tramlines'}`,
    p.summary.underCovered > 0 ? `${p.summary.underCovered} ${p.summary.underCovered === 1 ? 'block has' : 'blocks have'} fewer than two` : null,
    p.laneGroup ? `Tramlines ${p.laneGroup.from}-${p.laneGroup.to} of ${p.laneGroup.total}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')
  const countsW = fonts.sans.widthOfTextAtSize(counts, 8.5)
  page.drawText(counts, { x: right - countsW, y: top - 10, size: 8.5, font: fonts.sans, color: MUTED })

  const sub = [productionName, subtitle, p.scriptPage ? `Script page ${p.scriptPage}` : null].filter(Boolean).join('  ·  ')
  page.drawText(fit(markedUpPdfText(sub), right - p.stripX, fonts.sans, 9), { x: p.stripX, y: top - 24, size: 9, font: fonts.sans, color: MUTED })

  // Legend
  let x = p.stripX
  const ly = top - 38
  for (const l of LEGEND) {
    page.drawLine({ start: { x, y: ly + 3 }, end: { x: x + 12, y: ly + 3 }, thickness: 2, color: tramlineColour(l.type) })
    page.drawText(l.label, { x: x + 15, y: ly, size: 7.5, font: fonts.sans, color: MUTED })
    x += 15 + fonts.sans.widthOfTextAtSize(l.label, 7.5) + 12
  }
  page.drawLine({ start: { x, y: ly + 3 }, end: { x: x + 12, y: ly + 3 }, thickness: 2, color: MUTED, dashArray: [2.5, 2] })
  page.drawText('Off camera', { x: x + 15, y: ly, size: 7.5, font: fonts.sans, color: MUTED })
  x += 15 + fonts.sans.widthOfTextAtSize('Off camera', 7.5) + 12
  page.drawRectangle({ x, y: ly, width: 3, height: 8, color: MINT })
  page.drawText('2+ tramlines', { x: x + 7, y: ly, size: 7.5, font: fonts.sans, color: MUTED })
  x += 7 + fonts.sans.widthOfTextAtSize('2+ tramlines', 7.5) + 12
  page.drawLine({ start: { x: x + 1.5, y: ly }, end: { x: x + 1.5, y: ly + 8 }, thickness: 3, color: TEXT, dashArray: [2, 2] })
  page.drawText('Fewer than two', { x: x + 7, y: ly, size: 7.5, font: fonts.sans, color: MUTED })
}

function drawPage(page: PDFPage, p: PlanPage, fonts: Fonts): void {
  const laneRight = p.laneAreaX + p.laneWidth * p.lanes.length
  const lowest = p.pieces.length > 0 ? Math.min(...p.pieces.map((x) => x.bottom)) : p.rowsTop

  // Lane labels (upward) and colour dots.
  for (const lane of p.lanes) {
    const colour = tramlineColour(lane.shotType)
    const label = fit(lane.label, p.labelMaxLength, fonts.sans, 7)
    page.drawText(label, { x: lane.x + 2.5, y: p.labelBottom, size: 7, font: fonts.sans, color: TEXT, rotate: degrees(90) })
    page.drawCircle({ x: lane.x, y: p.labelBottom - 7, size: 2.6, color: colour })
  }
  if (p.lanes.length > 0) {
    page.drawLine({ start: { x: p.laneAreaX - 4, y: p.labelTop }, end: { x: p.laneAreaX - 4, y: lowest }, thickness: 0.5, color: RULE })
  }

  for (const piece of p.pieces) {
    if (piece.underCovered) {
      page.drawRectangle({ x: p.textX, y: piece.bottom, width: p.textWidth + 4, height: piece.top - piece.bottom, color: SHADE })
    }
    // Coverage strip
    if (piece.coverage != null) {
      const sx = p.stripX + 6
      if (piece.coverage >= 2) {
        page.drawRectangle({ x: sx - 1.5, y: piece.bottom + 1, width: 3, height: piece.top - piece.bottom - 2, color: MINT })
      } else {
        page.drawLine({ start: { x: sx, y: piece.top - 1 }, end: { x: sx, y: piece.bottom + 1 }, thickness: 3, color: TEXT, dashArray: [2, 2] })
      }
    }
    for (const line of piece.lines) {
      if (!line.text) continue
      const font = fonts[line.font]
      if (line.kind === 'note') {
        page.drawRectangle({ x: p.textX + 4, y: line.y + 1, width: 2.5, height: 2.5, color: MINT })
      }
      page.drawText(line.text, { x: line.x, y: line.y, size: line.size, font, color: TEXT })
    }
    piece.cells.forEach((cell, i) => {
      if (!cell.state || cell.state === 'not_covered') return
      const lane = p.lanes[i]!
      const colour = tramlineColour(lane.shotType)
      const top = piece.top - (cell.isStart ? CAP_INSET : 0)
      const bottom = piece.bottom + (cell.isEnd ? CAP_INSET : 0)
      if (cell.state === 'on') {
        page.drawLine({ start: { x: lane.x, y: top }, end: { x: lane.x, y: bottom }, thickness: LINE_W, color: colour })
      } else {
        page.drawLine({ start: { x: lane.x, y: top }, end: { x: lane.x, y: bottom }, thickness: LINE_W, color: colour, dashArray: [3, 2.5] })
      }
      const half = Math.min(CAP_W, p.laneWidth - 2) / 2
      if (cell.isStart) page.drawLine({ start: { x: lane.x - half, y: top }, end: { x: lane.x + half, y: top }, thickness: LINE_W, color: colour })
      if (cell.isEnd) page.drawLine({ start: { x: lane.x - half, y: bottom }, end: { x: lane.x + half, y: bottom }, thickness: LINE_W, color: colour })
    })
  }

  for (const brk of p.pageBreaks) {
    brk.cells.forEach((cell, i) => {
      if (!cell.state || cell.state === 'not_covered') return
      const lane = p.lanes[i]!
      page.drawLine({
        start: { x: lane.x, y: brk.top },
        end: { x: lane.x, y: brk.bottom },
        thickness: LINE_W,
        color: tramlineColour(lane.shotType),
        dashArray: cell.state === 'off' ? [3, 2.5] : undefined,
      })
    })
    const label = markedUpPdfText(brk.label)
    const w = fonts.mono.widthOfTextAtSize(label, 7.5)
    // Label at the right of the text column, rule across text and lanes.
    const labelX = p.textX + p.textWidth - w
    page.drawLine({ start: { x: p.textX, y: brk.y }, end: { x: labelX - 4, y: brk.y }, thickness: 0.6, color: MUTED, dashArray: [3, 3] })
    page.drawText(label, { x: labelX, y: brk.y - 2.5, size: 7.5, font: fonts.mono, color: MUTED })
    if (laneRight > p.laneAreaX) {
      page.drawLine({ start: { x: p.laneAreaX - 4, y: brk.y }, end: { x: laneRight, y: brk.y }, thickness: 0.6, color: MUTED, dashArray: [3, 3] })
    }
  }
}

export type MarkedUpScriptPdfInput = {
  productionName: string
  /** Shown after the production name, e.g. 'Day 14 · 2026-10-07' or 'Lined to 7 Oct 2026'. */
  subtitle: string | null
  scenes: MarkedUpSceneInput[]
}

/** Builds the plan with the PDF's real font metrics (the plan's coordinates are what gets drawn). */
export function planForPdf(input: MarkedUpScriptPdfInput, measure: TextMeasure): MarkedUpPlan {
  return planMarkedUpScript(input.scenes, { measure, sanitize: markedUpPdfText })
}

export async function generateMarkedUpScriptPdf(input: MarkedUpScriptPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(markedUpPdfText(`${input.productionName} - Marked-up script`))
  const fonts: Fonts = {
    mono: await doc.embedFont(StandardFonts.Courier),
    monoBold: await doc.embedFont(StandardFonts.CourierBold),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  const measure: TextMeasure = (text, size, font: FontKind) => fonts[font].widthOfTextAtSize(text, size)
  const plan = planForPdf(input, measure)
  const productionName = markedUpPdfText(input.productionName)
  const subtitle = input.subtitle ? markedUpPdfText(input.subtitle) : null

  for (const p of plan.pages) {
    const page = doc.addPage([MARKED_UP_PAGE.width, MARKED_UP_PAGE.height])
    drawHeader(page, p, fonts, productionName, subtitle)
    drawPage(page, p, fonts)
  }
  const pages = doc.getPages()
  pages.forEach((pg, i) => {
    pg.drawText('Marked-up script', { x: 36, y: 28, size: 8, font: fonts.sans, color: MUTED })
    const right = `Page ${i + 1} of ${pages.length}`
    pg.drawText(right, { x: MARKED_UP_PAGE.width - 36 - fonts.sans.widthOfTextAtSize(right, 8), y: 28, size: 8, font: fonts.sans, color: MUTED })
  })
  return doc.save()
}
