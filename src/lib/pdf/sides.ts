/**
 * SB7 — Daily Sides PDF.
 *
 * Renders a printable sides document from the SB6 sides draft model. Uses pdf-lib (same engine and
 * conventions as the call sheet / equipment list). Read-only: this module derives nothing from the
 * DB and never mutates script sections. Where exact page/eighth ranges are unavailable, the section
 * is rendered with its best-available script text and range metadata and flagged as estimated.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { textForPdf } from '@/lib/pdf/callSheet'
import { sceneSlugline } from '@/lib/schedule/sceneDisplay'
import type {
  SidesDraftModel,
  SidesPreviewGroup,
  SidesSectionEntry,
} from '@/lib/db/sidesBuilderService'

const MARGIN = 54
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const Y_MIN = MARGIN + 28
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const FONT_TITLE = 16
const FONT_HEADER = 11
const FONT_SECTION = 10
const FONT_BODY = 9
const FONT_META = 8
const FONT_SCRIPT = 8
const FONT_FOOTER = 8
const LINE_STEP = 11
const SCRIPT_LINE_STEP = 9.5
const GRAY = rgb(0.45, 0.45, 0.45)
const DARK = rgb(0.15, 0.15, 0.15)
const AMBER = rgb(0.72, 0.45, 0.05)

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

function wrapLines(text: string, maxWidth: number, font: PdfFont, size: number): string[] {
  const lines: string[] = []
  for (const paragraph of textForPdf(text).split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next
      } else {
        if (line) lines.push(line)
        // Hard-break words wider than the column so nothing overflows.
        let chunk = w
        while (font.widthOfTextAtSize(chunk, size) > maxWidth && chunk.length > 1) {
          let cut = chunk.length
          while (cut > 1 && font.widthOfTextAtSize(chunk.slice(0, cut), size) > maxWidth) cut -= 1
          lines.push(chunk.slice(0, cut))
          chunk = chunk.slice(cut)
        }
        line = chunk
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

/**
 * Generate a printable sides PDF from the presentation model. Read-only; mutates no data.
 */
export async function generateSidesPdf(data: SidesPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  const newPage = (): void => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
  }

  const ensure = (needed: number): void => {
    if (y - needed < Y_MIN) newPage()
  }

  const drawText = (
    text: string,
    options: { x?: number; size?: number; font?: PdfFont; color?: ReturnType<typeof rgb> } = {}
  ): void => {
    page.drawText(textForPdf(text), {
      x: options.x ?? MARGIN,
      y,
      size: options.size ?? FONT_BODY,
      font: options.font ?? font,
      color: options.color ?? rgb(0, 0, 0),
    })
  }

  const drawWrapped = (
    text: string,
    options: {
      x?: number
      width?: number
      size?: number
      font?: PdfFont
      color?: ReturnType<typeof rgb>
      step?: number
    } = {}
  ): void => {
    const x = options.x ?? MARGIN
    const width = options.width ?? CONTENT_WIDTH - (x - MARGIN)
    const size = options.size ?? FONT_BODY
    const f = options.font ?? font
    const step = options.step ?? LINE_STEP
    for (const line of wrapLines(text, width, f, size)) {
      ensure(step)
      if (line !== '') page.drawText(textForPdf(line), { x, y, size, font: f, color: options.color ?? rgb(0, 0, 0) })
      y -= step
    }
  }

  // ---------- Header ----------
  drawText('SIDES', { size: FONT_TITLE, font: bold, color: DARK })
  y -= 18
  drawText(data.productionTitle, { size: FONT_HEADER, font: bold, color: DARK })
  y -= 14

  const metaParts: string[] = []
  if (data.shootDate) metaParts.push(data.shootDate)
  if (data.unitName) metaParts.push(`Unit: ${data.unitName}`)
  if (data.scriptVersionLabels.length > 0) {
    metaParts.push(`Script: ${data.scriptVersionLabels.join(', ')}`)
  }
  metaParts.push(`Est. eighths: ~${data.totalEstimatedEighths}/8`)
  if (metaParts.length > 0) {
    drawText(metaParts.join('  ·  '), { size: FONT_META, font, color: GRAY })
    y -= 12
  }
  drawText(`Generated: ${data.generatedAt}`, { size: FONT_FOOTER, font, color: GRAY })
  y -= 14

  // ---------- Warnings summary ----------
  if (data.warnings.length > 0) {
    drawText('Warnings', { size: FONT_SECTION, font: bold, color: AMBER })
    y -= 13
    for (const warning of data.warnings) {
      drawWrapped(`• ${warning.message}`, { x: MARGIN + 6, size: FONT_META, color: AMBER, step: 10 })
    }
    y -= 6
  }

  // ---------- Sections by episode / scene ----------
  if (data.groups.length === 0) {
    ensure(LINE_STEP)
    drawText('No sections selected for this sides export.', { size: FONT_BODY, font, color: GRAY })
    y -= LINE_STEP
  }

  for (const group of data.groups) {
    if (group.episodeName) {
      ensure(16)
      drawText(group.episodeName, { size: FONT_HEADER, font: bold, color: DARK })
      y -= 15
    }

    for (const scene of group.scenes) {
      ensure(16)
      const heading = scene.heading ? ` — ${scene.heading}` : ''
      drawText(`Sc ${scene.sceneNumber}${heading}`, { size: FONT_SECTION, font: bold, color: DARK })
      y -= 14

      if (scene.collatedScriptText && scene.collatedScriptText.trim() !== '') {
        y -= 2
        drawWrapped(scene.collatedScriptText, {
          x: MARGIN + 6,
          width: CONTENT_WIDTH - 6,
          size: FONT_SCRIPT,
          font: mono,
          step: SCRIPT_LINE_STEP,
        })
        if (scene.sections.some((s) => s.isEstimated)) {
          drawWrapped('Best-effort text; exact range unavailable.', {
            x: MARGIN + 6,
            size: FONT_META,
            color: AMBER,
            step: 10,
          })
        }
      } else {
        drawWrapped('No script text available (best-effort).', {
          x: MARGIN + 6,
          size: FONT_META,
          color: GRAY,
          step: 10,
        })
      }
      y -= 4
    }
  }

  return doc.save()
}
