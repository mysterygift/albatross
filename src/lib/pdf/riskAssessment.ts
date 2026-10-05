/**
 * Risk assessment (RAMS) PDF: A4 landscape, pdf-lib (same approach as the call sheet / equipment list).
 * Read-only: renders a saved RAMS; does not modify any data.
 */
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { embedStandardFont } from '@/lib/pdf/layoutKit'
import type { PDFFont, PDFPage } from 'pdf-lib'
import { textForPdf } from '@/lib/pdf/callSheet'
import type { RiskAssessmentFull } from '@/lib/db/repositories/risk-assessments'
import { splitLines } from '@/lib/risk-assessments/content'
import {
  RISK_BAND_COLORS,
  RISK_BAND_LABELS,
  RISK_SCALE,
  formatRiskFactor,
  riskBand,
  riskFactor,
  type RiskBand,
} from '@/lib/risk-assessments/riskMatrix'

const PAGE_WIDTH = 841.89
const PAGE_HEIGHT = 595.28
const MARGIN = 36
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const Y_MIN = MARGIN + 24
const LINE = 11
const FONT_TITLE = 18
const FONT_SECTION = 11
const FONT_BODY = 8.5
const FONT_SMALL = 7.5
const CELL = 17
const MATRIX_LABEL_W = 20
const MATRIX_W = MATRIX_LABEL_W + CELL * 5
const MATRIX_GAP = 14
const MATRIX_AREA_W = MATRIX_W * 2 + MATRIX_GAP
const MATRIX_H = 138
const HAZARD_HEADER_H = 22
const TEXT_GAP = 12

const INK = rgb(0.12, 0.12, 0.12)
const MUTED = rgb(0.4, 0.4, 0.4)
const RULE = rgb(0.72, 0.72, 0.72)

export interface RiskAssessmentPdfParams {
  productionName: string
  /** e.g. "Day 4 - 2026-06-09". */
  shootDayLabel: string
  /** Names of the units the RAMS covers. */
  unitNames: string[]
  riskAssessment: RiskAssessmentFull
}

type Rgb = ReturnType<typeof rgb>

function bandRgb(band: RiskBand): { bg: Rgb; fg: Rgb } {
  const c = RISK_BAND_COLORS[band].rgb
  return {
    bg: rgb(c.bg[0] / 255, c.bg[1] / 255, c.bg[2] / 255),
    fg: rgb(c.fg[0] / 255, c.fg[1] / 255, c.fg[2] / 255),
  }
}

/** Band background mixed towards white (unselected matrix cells). */
function dimmedBg(band: RiskBand, amount = 0.62): Rgb {
  const c = RISK_BAND_COLORS[band].rgb.bg
  const mix = (v: number) => (v + (255 - v) * amount) / 255
  return rgb(mix(c[0]), mix(c[1]), mix(c[2]))
}

function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const lines: string[] = []
  for (const paragraph of textForPdf(text).split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) continue
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next
        continue
      }
      if (line) lines.push(line)
      line = ''
      // Single overlong token: hard-wrap by character width.
      let chunk = ''
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) chunk += ch
        else {
          if (chunk) lines.push(chunk)
          chunk = ch
        }
      }
      line = chunk
    }
    if (line) lines.push(line)
  }
  return lines
}

function formatApprovedAt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

type DrawLine = { text: string; x: number; bold?: boolean; muted?: boolean; gapBefore?: number }

export async function generateRiskAssessmentPdf(params: RiskAssessmentPdfParams): Promise<Uint8Array> {
  const { productionName, shootDayLabel, unitNames, riskAssessment: ra } = params
  const doc = await PDFDocument.create()
  const font = await embedStandardFont(doc, StandardFonts.Helvetica)
  const bold = await embedStandardFont(doc, StandardFonts.HelveticaBold)

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
  }
  const ensureSpace = (height: number) => {
    if (y - height < Y_MIN) newPage()
  }
  const text = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color: Rgb = INK) => {
    const t = textForPdf(s)
    if (t) page.drawText(t, { x, y: yy, size, font: f, color })
  }

  // ---------- Title + status banner ----------
  text('RISK ASSESSMENT (RAMS)', MARGIN, y - FONT_TITLE + 4, FONT_TITLE, bold)
  text(productionName, MARGIN, y - FONT_TITLE - 10, FONT_BODY + 1, font, MUTED)
  y -= FONT_TITLE + 20

  const approved = ra.status === 'approved'
  const bannerBand = bandRgb(approved ? 'tolerable' : 'severe')
  page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_WIDTH, height: 18, color: bannerBand.bg })
  const bannerText = approved
    ? `APPROVED - by ${ra.approved_by ?? 'unknown'}, ${formatApprovedAt(ra.approved_at)}`
    : 'DRAFT - NOT APPROVED'
  text(bannerText, MARGIN + 8, y - 13, FONT_BODY + 1.5, bold, bannerBand.fg)
  y -= 18 + 12

  // ---------- Details ----------
  const sectionHeading = (title: string) => {
    ensureSpace(LINE + 14)
    text(title.toUpperCase(), MARGIN, y - FONT_SECTION, FONT_SECTION, bold)
    page.drawRectangle({ x: MARGIN, y: y - FONT_SECTION - 4, width: CONTENT_WIDTH, height: 0.6, color: RULE })
    y -= FONT_SECTION + 10
  }

  sectionHeading('Details')
  const labelW = 88
  const leftColW = 330
  const detailRows: [string, string][] = [
    ['Date', shootDayLabel],
    ['Units', unitNames.length > 0 ? unitNames.join(', ') : '-'],
    ['Location', ra.location_name || '-'],
    ['Responsible person', ra.responsible_person_name || '-'],
  ]
  const leftLines = detailRows.map(([label, value]) => ({
    label,
    lines: wrapText(value, leftColW - labelW, font, FONT_BODY),
  }))
  const leftH = leftLines.reduce((h, r) => h + Math.max(1, r.lines.length) * LINE + 3, 0)
  const actX = MARGIN + leftColW + 24
  const actW = CONTENT_WIDTH - leftColW - 24
  const activityLines = wrapText(ra.activities || '-', actW, font, FONT_BODY)
  const detailsH = Math.max(leftH, (activityLines.length + 1) * LINE + 3)
  ensureSpace(detailsH)
  let ly = y - FONT_BODY
  for (const row of leftLines) {
    text(row.label, MARGIN, ly, FONT_BODY, bold)
    const lines = row.lines.length > 0 ? row.lines : ['']
    lines.forEach((l, i) => text(l, MARGIN + labelW, ly - i * LINE, FONT_BODY))
    ly -= Math.max(1, lines.length) * LINE + 3
  }
  text('Activities', actX, y - FONT_BODY, FONT_BODY, bold)
  activityLines.forEach((l, i) => text(l, actX, y - FONT_BODY - (i + 1) * LINE, FONT_BODY))
  y -= detailsH + 8

  // ---------- Safety contacts ----------
  sectionHeading('Safety contacts')
  const faW = CONTENT_WIDTH * 0.46
  const boxGap = 10
  const infoW = (CONTENT_WIDTH - faW - boxGap * 2) / 2
  const pad = 6

  const firstAiders = ra.first_aiders
  const faCols = [
    { label: 'Name', w: (faW - pad * 2) * 0.34 },
    { label: 'Phone', w: (faW - pad * 2) * 0.26 },
    { label: 'Email', w: (faW - pad * 2) * 0.4 },
  ]
  const faRows = firstAiders.map((a) => [a.name, a.phone, a.email].map((v, i) => wrapText(v || '-', faCols[i]!.w - 4, font, FONT_SMALL + 0.5)))
  const faBodyH = faRows.length === 0
    ? LINE
    : faRows.reduce((h, r) => h + Math.max(...r.map((c) => Math.max(1, c.length))) * (LINE - 1) + 2, 0)
  const faH = pad + LINE + 4 + LINE + faBodyH + pad

  const infoRows = (name: string | null, address: string | null, phone: string | null, w: number) =>
    ([['Name', name], ['Address', address], ['Phone', phone]] as const).map(([label, value]) => ({
      label,
      lines: wrapText(value || '-', w - pad * 2 - 44, font, FONT_SMALL + 0.5),
    }))
  const hosp = infoRows(ra.hospital_name, ra.hospital_address, ra.hospital_phone, infoW)
  const pol = infoRows(ra.police_name, ra.police_address, ra.police_phone, infoW)
  const infoBodyH = (rows: ReturnType<typeof infoRows>) =>
    rows.reduce((h, r) => h + Math.max(1, r.lines.length) * (LINE - 1) + 2, 0)
  const infoH = (rows: ReturnType<typeof infoRows>) => pad + LINE + 4 + infoBodyH(rows) + pad
  const contactsH = Math.max(faH, infoH(hosp), infoH(pol))

  ensureSpace(contactsH)
  const boxTop = y
  const drawBox = (x: number, w: number, title: string) => {
    page.drawRectangle({ x, y: boxTop - contactsH, width: w, height: contactsH, borderColor: RULE, borderWidth: 0.8 })
    text(title, x + pad, boxTop - pad - FONT_BODY, FONT_BODY + 0.5, bold)
  }
  // First aiders table
  drawBox(MARGIN, faW, 'First aiders')
  let fy = boxTop - pad - LINE - 4
  let fx = MARGIN + pad
  for (const col of faCols) {
    text(col.label, fx, fy - FONT_SMALL, FONT_SMALL, bold, MUTED)
    fx += col.w
  }
  fy -= LINE
  if (faRows.length === 0) {
    text('None listed', MARGIN + pad, fy - FONT_SMALL, FONT_SMALL + 0.5, font, MUTED)
  } else {
    for (const row of faRows) {
      const rowLines = Math.max(...row.map((c) => Math.max(1, c.length)))
      let cx = MARGIN + pad
      row.forEach((cell, ci) => {
        cell.forEach((l, li) => text(l, cx, fy - FONT_SMALL - li * (LINE - 1), FONT_SMALL + 0.5))
        cx += faCols[ci]!.w
      })
      fy -= rowLines * (LINE - 1) + 2
    }
  }
  // Hospital + police boxes
  const drawInfo = (x: number, title: string, rows: ReturnType<typeof infoRows>) => {
    drawBox(x, infoW, title)
    let iy = boxTop - pad - LINE - 4
    for (const r of rows) {
      text(r.label, x + pad, iy - FONT_SMALL, FONT_SMALL, bold, MUTED)
      const lines = r.lines.length > 0 ? r.lines : ['']
      lines.forEach((l, li) => text(l, x + pad + 44, iy - FONT_SMALL - li * (LINE - 1), FONT_SMALL + 0.5))
      iy -= Math.max(1, lines.length) * (LINE - 1) + 2
    }
  }
  drawInfo(MARGIN + faW + boxGap, 'Nearest hospital', hosp)
  drawInfo(MARGIN + faW + boxGap * 2 + infoW, 'Nearest police station', pol)
  y -= contactsH + 14

  // ---------- Hazards ----------
  sectionHeading('Hazards')
  if (ra.hazards.length === 0) {
    text('No hazards recorded.', MARGIN, y - FONT_BODY, FONT_BODY, font, MUTED)
    y -= LINE + 6
  }

  const drawMatrix = (x: number, yTop: number, title: string, severity: number, probability: number) => {
    text(title, x, yTop - FONT_SMALL - 1, FONT_SMALL + 0.5, bold)
    const gx = x + MATRIX_LABEL_W
    const gTop = yTop - 14
    // Probability axis (rows, 5 at top).
    for (let i = 0; i < 5; i++) {
      const ry = gTop - (i + 1) * CELL
      text(String(5 - i), gx - 8, ry + CELL / 2 - 2.5, FONT_SMALL, font, MUTED)
    }
    const probLabel = 'Probability'
    const probW = bold.widthOfTextAtSize(probLabel, FONT_SMALL - 0.5)
    page.drawText(probLabel, {
      x: x + 8,
      y: gTop - (CELL * 5) / 2 - probW / 2,
      size: FONT_SMALL - 0.5,
      font: bold,
      color: MUTED,
      rotate: degrees(90),
    })
    let selected: { cx: number; cy: number; band: RiskBand; factor: number } | null = null
    for (let r = 0; r < 5; r++) {
      for (const s of RISK_SCALE) {
        const p = 5 - r
        const factor = riskFactor(s, p)
        const band = riskBand(factor)
        const cx = gx + (s - 1) * CELL
        const cy = gTop - (r + 1) * CELL
        if (s === severity && p === probability) {
          selected = { cx, cy, band, factor }
          continue
        }
        page.drawRectangle({ x: cx, y: cy, width: CELL, height: CELL, color: dimmedBg(band), borderColor: rgb(1, 1, 1), borderWidth: 0.6 })
        const label = String(factor)
        const lw = font.widthOfTextAtSize(label, FONT_SMALL)
        text(label, cx + (CELL - lw) / 2, cy + CELL / 2 - 2.5, FONT_SMALL, font, rgb(0.25, 0.25, 0.25))
      }
    }
    if (selected) {
      const { bg, fg } = bandRgb(selected.band)
      page.drawRectangle({ x: selected.cx, y: selected.cy, width: CELL, height: CELL, color: bg, borderColor: rgb(0.05, 0.05, 0.05), borderWidth: 1.8 })
      const label = String(selected.factor)
      const lw = bold.widthOfTextAtSize(label, FONT_SMALL + 1)
      text(label, selected.cx + (CELL - lw) / 2, selected.cy + CELL / 2 - 3, FONT_SMALL + 1, bold, fg)
    }
    // Severity axis.
    const axisY = gTop - CELL * 5 - 9
    for (const s of RISK_SCALE) {
      text(String(s), gx + (s - 1) * CELL + CELL / 2 - 2, axisY, FONT_SMALL, font, MUTED)
    }
    const sevW = bold.widthOfTextAtSize('Severity', FONT_SMALL - 0.5)
    text('Severity', gx + (CELL * 5) / 2 - sevW / 2, axisY - 9, FONT_SMALL - 0.5, bold, MUTED)
    // Result pill.
    const factor = riskFactor(severity, probability)
    const { bg, fg } = bandRgb(riskBand(factor))
    const pillW = CELL * 5
    const pillY = axisY - 11 - 15
    page.drawRectangle({ x: gx, y: pillY, width: pillW, height: 15, color: bg })
    const pillText = formatRiskFactor(factor)
    const pw = bold.widthOfTextAtSize(pillText, FONT_SMALL + 1)
    text(pillText, gx + (pillW - pw) / 2, pillY + 4.5, FONT_SMALL + 1, bold, fg)
  }

  const drawHazardHeader = (name: string, beforeFactor: number | null, afterFactor: number | null) => {
    const hy = y - HAZARD_HEADER_H
    if (beforeFactor == null || afterFactor == null) {
      page.drawRectangle({ x: MARGIN, y: hy, width: CONTENT_WIDTH, height: HAZARD_HEADER_H, color: rgb(0.9, 0.9, 0.9) })
      text(`${name || 'Hazard'} (continued)`, MARGIN + 8, hy + 7, FONT_BODY + 1, bold)
    } else {
      const before = bandRgb(riskBand(beforeFactor))
      const after = bandRgb(riskBand(afterFactor))
      const segW = 150
      // Left: name on the "before" band colour.
      page.drawRectangle({ x: MARGIN, y: hy, width: CONTENT_WIDTH - segW, height: HAZARD_HEADER_H, color: before.bg })
      const title = textForPdf(name || 'Untitled hazard')
      let shown = title
      const maxTitleW = CONTENT_WIDTH - segW - 16 - 120
      while (shown.length > 1 && bold.widthOfTextAtSize(shown, FONT_BODY + 2) > maxTitleW) shown = shown.slice(0, -1)
      if (shown !== title) shown = `${shown.slice(0, -1)}...`
      text(shown, MARGIN + 8, hy + 7, FONT_BODY + 2, bold, before.fg)
      const beforeLabel = `Before: ${formatRiskFactor(beforeFactor)}`
      const bw = bold.widthOfTextAtSize(beforeLabel, FONT_BODY)
      text(beforeLabel, MARGIN + CONTENT_WIDTH - segW - bw - 8, hy + 7.5, FONT_BODY, bold, before.fg)
      // Right: "after" band colour segment.
      page.drawRectangle({ x: MARGIN + CONTENT_WIDTH - segW, y: hy, width: segW, height: HAZARD_HEADER_H, color: after.bg })
      text(`After: ${formatRiskFactor(afterFactor)}`, MARGIN + CONTENT_WIDTH - segW + 8, hy + 7.5, FONT_BODY, bold, after.fg)
    }
    y = hy
  }

  const textColW = CONTENT_WIDTH - MATRIX_AREA_W - TEXT_GAP

  ra.hazards.forEach((h) => {
    // Build the left-column lines.
    const out: DrawLine[] = []
    const section = (label: string, body: string, asList: boolean) => {
      out.push({ text: label.toUpperCase(), x: 0, bold: true, muted: true, gapBefore: out.length > 0 ? 4 : 0 })
      const items = asList ? splitLines(body) : [body.trim()].filter(Boolean)
      if (items.length === 0) out.push({ text: '-', x: 0, muted: true })
      for (const item of items) {
        if (asList) {
          const wrapped = wrapText(item, textColW - 10, font, FONT_BODY)
          wrapped.forEach((l, i) => out.push({ text: l, x: i === 0 ? 0 : 10 }))
          if (wrapped.length > 0) out[out.length - wrapped.length]!.text = `- ${out[out.length - wrapped.length]!.text}`
        } else {
          for (const l of wrapText(item, textColW, font, FONT_BODY)) out.push({ text: l, x: 0 })
        }
      }
    }
    section('Hazard', h.description, false)
    section('Risks', h.risks, true)
    section('Potential outcomes', h.outcomes, true)
    section('Control measures', h.control_measures, true)
    const people = [h.at_risk_crew ? 'Crew' : '', h.at_risk_cast ? 'Cast' : '', h.at_risk_public ? 'General public' : ''].filter(Boolean)
    section('People at risk', people.join(', '), false)

    const beforeFactor = riskFactor(h.severity_before, h.probability_before)
    const afterFactor = riskFactor(h.severity_after, h.probability_after)

    // Keep the header, the matrices and the first few lines together.
    ensureSpace(HAZARD_HEADER_H + Math.min(MATRIX_H, 60) + 14)
    drawHazardHeader(h.name, beforeFactor, afterFactor)
    let bodyTop = y - 8
    // The matrices need MATRIX_H of room under the header.
    if (bodyTop - MATRIX_H < Y_MIN) {
      newPage()
      drawHazardHeader(h.name, beforeFactor, afterFactor)
      bodyTop = y - 8
    }
    const matrixX = MARGIN + CONTENT_WIDTH - MATRIX_AREA_W
    drawMatrix(matrixX, bodyTop, 'BEFORE CONTROLS', h.severity_before, h.probability_before)
    drawMatrix(matrixX + MATRIX_W + MATRIX_GAP, bodyTop, 'AFTER CONTROLS', h.severity_after, h.probability_after)

    let ty = bodyTop
    let flowedToNewPage = false
    const matrixBottom = bodyTop - MATRIX_H
    for (const line of out) {
      const gap = line.gapBefore ?? 0
      if (ty - gap - LINE < Y_MIN) {
        // Close the current page section of the block, continue on the next page.
        newPage()
        drawHazardHeader(h.name, null, null)
        ty = y - 8
        flowedToNewPage = true
      }
      ty -= gap + LINE
      text(line.text, MARGIN + (line.x ?? 0), ty + 3, line.bold ? FONT_SMALL : FONT_BODY, line.bold ? bold : font, line.muted ? MUTED : INK)
    }
    // The matrices only sit on the block's first page; text may have flowed past them.
    const blockBottom = (flowedToNewPage ? ty : Math.min(ty, matrixBottom)) - 4
    page.drawLine({ start: { x: MARGIN, y: blockBottom }, end: { x: MARGIN + CONTENT_WIDTH, y: blockBottom }, thickness: 0.6, color: RULE })
    y = blockBottom - 12
  })

  // ---------- Legend ----------
  ensureSpace(24)
  let lx = MARGIN
  const legendY = y - 8
  for (const band of ['tolerable', 'moderate', 'severe'] as const) {
    const { bg } = bandRgb(band)
    page.drawRectangle({ x: lx, y: legendY - 2, width: 10, height: 10, color: bg })
    const label = `${RISK_BAND_LABELS[band]} (${band === 'tolerable' ? '1-6' : band === 'moderate' ? '8-10' : '12-25'})`
    text(label, lx + 14, legendY, FONT_SMALL + 0.5, font, MUTED)
    lx += 14 + font.widthOfTextAtSize(textForPdf(label), FONT_SMALL + 0.5) + 18
  }
  text('Risk factor = severity x probability (each rated 1-5).', lx, legendY, FONT_SMALL + 0.5, font, MUTED)

  // ---------- Footer on every page ----------
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    const left = textForPdf(`${productionName}  |  Risk assessment  |  ${shootDayLabel}`)
    p.drawText(left, { x: MARGIN, y: MARGIN - 6, size: FONT_SMALL, font, color: MUTED })
    const pageLabel = `Page ${i + 1} of ${pages.length}`
    const w = font.widthOfTextAtSize(pageLabel, FONT_SMALL)
    p.drawText(pageLabel, { x: PAGE_WIDTH - MARGIN - w, y: MARGIN - 6, size: FONT_SMALL, font, color: MUTED })
    if (!approved) {
      const draft = 'DRAFT - NOT APPROVED'
      const dw = bold.widthOfTextAtSize(draft, FONT_SMALL)
      p.drawText(draft, {
        x: (PAGE_WIDTH - dw) / 2,
        y: MARGIN - 6,
        size: FONT_SMALL,
        font: bold,
        color: bandRgb('severe').bg,
      })
    }
  })

  return doc.save()
}
