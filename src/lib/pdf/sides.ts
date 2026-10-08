/**
 * SB7 — Daily Sides PDF.
 *
 * Renders a printable sides document from the SB6 sides draft model. Uses pdf-lib (same engine and
 * conventions as the call sheet / equipment list). Read-only: this module derives nothing from the
 * DB and never mutates script sections. Where exact page/eighth ranges are unavailable, the section
 * is rendered with its best-available script text and range metadata and flagged as estimated.
 *
 * Script text is set in standard screenplay format (Courier 12pt, US Letter, standard element
 * indents, scene numbers in both margins) via `@/lib/script/screenplayFormat`. Sides information
 * sits in a small running header and a compact block at the top of page one.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { textForPdf } from '@/lib/pdf/callSheet'
import { embedStandardFont, wrapLines } from '@/lib/pdf/layoutKit'
import { sceneSlugline } from '@/lib/schedule/sceneDisplay'
import {
  SCREENPLAY_LAYOUT as L,
  formatSceneForScreenplay,
  paginateScreenplay,
  type ScreenplayBlock,
  type ScreenplayRow,
} from '@/lib/script/screenplayFormat'
import type {
  SidesDraftModel,
  SidesPreviewGroup,
  SidesSectionEntry,
} from '@/lib/db/sidesBuilderService'

const FONT_HEADER = 8
const FONT_INFO_TITLE = 9
const FONT_INFO = 8
const FONT_NOTE = 8
const FONT_FOOTER = 7
const INFO_STEP = 11
/** Baseline of the running header and page number, 0.5" from the top edge. */
const HEADER_Y = L.pageHeight - 36 - 9
const FOOTER_Y = 30
/** Baseline of the first script line, 1" from the top edge. */
const BODY_TOP_Y = L.pageHeight - L.marginTop - 9
/** Fewest script lines left on page one, however long the warnings list is. */
const MIN_FIRST_PAGE_LINES = 20
const MAX_WARNING_LINES = 16
const GRAY = rgb(0.45, 0.45, 0.45)
const DARK = rgb(0.15, 0.15, 0.15)
const AMBER = rgb(0.72, 0.45, 0.05)
const RULE = rgb(0.75, 0.75, 0.75)
const BLACK = rgb(0, 0, 0)

export const SIDES_ESTIMATED_NOTE = 'Best-effort text; exact range unavailable.'
export const SIDES_NO_TEXT_NOTE = 'No script text available (best-effort).'

type PdfFont = Awaited<ReturnType<PDFDocument['embedFont']>>

// ─── Presentation-only model (decoupled from DB types, like CallSheetData) ──────

export interface SidesPdfSection {
  label: string
  /** Best-effort range metadata, e.g. "pp 12 0/8 -> 13 4/8"; null when no ranges. */
  rangeText: string | null
  isEstimated: boolean
  isPartialScene: boolean
  isViaShotsOnly: boolean
  isOmitted: boolean
  /** Best-effort selected script text, or null when unavailable. */
  scriptText: string | null
  characterNames: string[]
  linkedShotNumbers: string[]
  notes: string | null
}

export interface SidesPdfScene {
  sceneNumber: string
  heading: string | null
  sections: SidesPdfSection[]
  /** Deduped script body for all selected sections in this scene. */
  collatedScriptText: string | null
}

export interface SidesPdfGroup {
  episodeName: string | null
  scenes: SidesPdfScene[]
}

export interface SidesPdfWarning {
  message: string
  blocking: boolean
}

export interface SidesPdfData {
  productionTitle: string
  shootDate: string | null
  unitName: string | null
  scriptVersionLabels: string[]
  generatedAt: string
  totalEstimatedEighths: number
  groups: SidesPdfGroup[]
  warnings: SidesPdfWarning[]
}

// ─── Pure mappers (mirror the SB6 sheet's label/range presentation) ─────────────

/** Human label for a section: explicit label, else "Section". */
export function sidesSectionLabel(entry: SidesSectionEntry): string {
  const label = entry.section.label?.trim()
  if (label) return label
  return 'Section'
}

/** Best-effort page/eighth range metadata for a section, or null when no ranges. */
export function sidesRangeText(entry: SidesSectionEntry): string | null {
  if (entry.ranges.length === 0) return null
  const parts = entry.ranges.map((range) => {
    const start = range.start_page ?? '?'
    const end = range.end_page ?? '?'
    const startE = range.start_eighth ?? 0
    const endE = range.end_eighth ?? 0
    return `pp ${start} ${startE}/8 -> ${end} ${endE}/8`
  })
  return parts.join(', ')
}

function mapSection(entry: SidesSectionEntry): SidesPdfSection {
  return {
    label: sidesSectionLabel(entry),
    rangeText: sidesRangeText(entry),
    isEstimated: entry.isEstimated,
    isPartialScene: entry.isPartialScene,
    isViaShotsOnly: entry.isViaShotsOnly,
    isOmitted: entry.section.status === 'omitted',
    scriptText: entry.scriptText,
    characterNames: entry.characterNames,
    linkedShotNumbers: entry.linkedShotNumbers,
    notes: entry.section.notes,
  }
}

function mapGroup(group: SidesPreviewGroup): SidesPdfGroup {
  return {
    episodeName: group.episodeName,
    scenes: group.scenes.map((sceneGroup) => ({
      sceneNumber: sceneGroup.scene.scene_number,
      heading: sceneSlugline(sceneGroup.scene, sceneGroup.entries[0]?.locationName ?? null),
      collatedScriptText: sceneGroup.collatedScriptText,
      sections: sceneGroup.entries.map(mapSection),
    })),
  }
}

/**
 * Map the SB6 draft model plus shoot-day context into the presentation-only `SidesPdfData`.
 * Pure and deterministic; the draft model is already filtered/selected/sorted by SB6.
 */
export function buildSidesPdfData(params: {
  productionTitle: string
  shootDate: string | null
  unitName: string | null
  scriptVersionLabels: string[]
  model: SidesDraftModel
  generatedAt?: Date
}): SidesPdfData {
  const generated = params.generatedAt ?? new Date()
  return {
    productionTitle: params.productionTitle,
    shootDate: params.shootDate,
    unitName: params.unitName,
    scriptVersionLabels: params.scriptVersionLabels,
    generatedAt: generated.toLocaleString(),
    totalEstimatedEighths: params.model.totalEstimatedEighths,
    groups: params.model.groups.map(mapGroup),
    warnings: params.model.validation.map((w) => ({ message: w.message, blocking: w.blocking })),
  }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/** Script blocks for every selected scene, in order, with per-scene notes. */
export function sidesScreenplayBlocks(data: SidesPdfData): ScreenplayBlock[] {
  const blocks: ScreenplayBlock[] = []
  for (const group of data.groups) {
    for (const scene of group.scenes) {
      const text = scene.collatedScriptText?.trim() ? scene.collatedScriptText : null
      const notes: string[] = []
      if (!text) notes.push(SIDES_NO_TEXT_NOTE)
      else if (scene.sections.some((s) => s.isEstimated)) notes.push(SIDES_ESTIMATED_NOTE)
      blocks.push(
        ...formatSceneForScreenplay({
          sceneNumber: scene.sceneNumber,
          heading: scene.heading,
          text,
          notes,
          group: group.episodeName,
        })
      )
    }
  }
  return blocks
}

type InfoLine = { text: string; size: number; bold?: boolean; color: ReturnType<typeof rgb> }

function fitText(text: string, maxWidth: number, font: PdfFont, size: number): string {
  const clean = textForPdf(text)
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean
  let cut = clean.length
  while (cut > 0 && font.widthOfTextAtSize(`${clean.slice(0, cut)}...`, size) > maxWidth) cut -= 1
  return `${clean.slice(0, cut).trimEnd()}...`
}

/**
 * Generate a printable sides PDF from the presentation model. Read-only; mutates no data.
 */
export async function generateSidesPdf(data: SidesPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fonts = {
    mono: await embedStandardFont(doc, StandardFonts.Courier),
    sans: await embedStandardFont(doc, StandardFonts.Helvetica),
    bold: await embedStandardFont(doc, StandardFonts.HelveticaBold),
    italic: await embedStandardFont(doc, StandardFonts.HelveticaOblique),
  }
  const bodyWidth = L.bodyRight - L.bodyLeft

  // ---------- Page-one information block ----------
  const info: InfoLine[] = [
    { text: `${data.productionTitle} - Sides`, size: FONT_INFO_TITLE, bold: true, color: DARK },
  ]
  const metaParts: string[] = []
  if (data.shootDate) metaParts.push(data.shootDate)
  if (data.unitName) metaParts.push(`Unit: ${data.unitName}`)
  if (data.scriptVersionLabels.length > 0) metaParts.push(`Script: ${data.scriptVersionLabels.join(', ')}`)
  metaParts.push(`Est. eighths: ~${data.totalEstimatedEighths}/8`)
  for (const line of wrapLines(metaParts.join('  |  '), bodyWidth, fonts.sans, FONT_INFO)) {
    info.push({ text: line, size: FONT_INFO, color: GRAY })
  }
  const warningLines = data.warnings.flatMap((w) => wrapLines(`• ${w.message}`, bodyWidth, fonts.sans, FONT_INFO))
  if (warningLines.length > MAX_WARNING_LINES) {
    warningLines.length = MAX_WARNING_LINES - 1
    warningLines.push('• More warnings in the Sides Builder.')
  }
  for (const line of warningLines) info.push({ text: line, size: FONT_INFO, color: AMBER })
  if (data.groups.length === 0) {
    info.push({ text: 'No sections selected for this sides export.', size: FONT_INFO, color: GRAY })
  }
  const infoHeight = info.length * INFO_STEP + 16
  const firstPageLines = Math.max(MIN_FIRST_PAGE_LINES, L.linesPerPage - Math.ceil(infoHeight / L.lineHeight))
  const firstPageOffset = L.linesPerPage - firstPageLines

  const pages = paginateScreenplay(sidesScreenplayBlocks(data), { firstPageLines })

  const drawRow = (page: ReturnType<PDFDocument['addPage']>, row: ScreenplayRow, y: number): void => {
    if (row.type === 'blank') return
    if (row.type === 'note') {
      page.drawText(textForPdf(row.text), { x: L.bodyLeft, y, size: FONT_NOTE, font: fonts.italic, color: AMBER })
      return
    }
    const text = textForPdf(row.text)
    const size = L.fontSize
    const x =
      row.type === 'transition'
        ? L.bodyRight - fonts.mono.widthOfTextAtSize(text, size)
        : L.columns[row.type].left
    page.drawText(text, { x, y, size, font: fonts.mono, color: BLACK })
    if (row.type === 'scene_heading' && row.sceneNumber) {
      const num = textForPdf(row.sceneNumber)
      page.drawText(num, { x: L.sceneNumberLeft, y, size, font: fonts.mono, color: BLACK })
      page.drawText(num, { x: L.sceneNumberRight, y, size, font: fonts.mono, color: BLACK })
    }
  }

  pages.forEach((screenplayPage, pageIndex) => {
    const page = doc.addPage([L.pageWidth, L.pageHeight])

    // Running header: production / sides / date / unit / episode, and the page number top right.
    const pageNumber = `${pageIndex + 1}.`
    const pageNumberX = L.bodyRight - fonts.mono.widthOfTextAtSize(pageNumber, L.fontSize)
    page.drawText(pageNumber, { x: pageNumberX, y: HEADER_Y, size: L.fontSize, font: fonts.mono, color: BLACK })
    const headerParts = [data.productionTitle.toUpperCase(), 'SIDES', data.shootDate, data.unitName, screenplayPage.group]
      .filter((p): p is string => !!p && p.trim() !== '')
    page.drawText(fitText(headerParts.join('  |  '), pageNumberX - L.bodyLeft - 18, fonts.sans, FONT_HEADER), {
      x: L.bodyLeft,
      y: HEADER_Y + 2,
      size: FONT_HEADER,
      font: fonts.sans,
      color: GRAY,
    })
    page.drawText(textForPdf(`Generated ${data.generatedAt}`), {
      x: L.bodyLeft,
      y: FOOTER_Y,
      size: FONT_FOOTER,
      font: fonts.sans,
      color: GRAY,
    })

    let firstRowY = BODY_TOP_Y
    if (pageIndex === 0) {
      let y = BODY_TOP_Y
      for (const line of info) {
        page.drawText(fitText(line.text, bodyWidth, line.bold ? fonts.bold : fonts.sans, line.size), {
          x: L.bodyLeft,
          y,
          size: line.size,
          font: line.bold ? fonts.bold : fonts.sans,
          color: line.color,
        })
        y -= INFO_STEP
      }
      page.drawLine({
        start: { x: L.bodyLeft, y: y + 4 },
        end: { x: L.bodyRight, y: y + 4 },
        thickness: 0.5,
        color: RULE,
      })
      firstRowY = BODY_TOP_Y - firstPageOffset * L.lineHeight
    }

    screenplayPage.rows.forEach((row, i) => drawRow(page, row, firstRowY - i * L.lineHeight))
  })

  return doc.save()
}
