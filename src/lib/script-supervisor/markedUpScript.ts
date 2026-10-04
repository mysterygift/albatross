/**
 * Marked-up script export plan (SS9). Pure: turns the same `LinedScriptLayout` the Script view draws into
 * A4 pages of positioned text, lanes and tramline cells, so the PDF renderer only paints what this plan says
 * and a test can check the export against the on-screen lining.
 *
 * - Lanes keep the on-screen order (shot order, then camera). When a scene has more tramlines than fit across
 *   the page, the scene is printed again for each further group of lanes ("Tramlines 20–38 of 38"), so no
 *   tramline is dropped.
 * - A block that does not fit in the space left moves to the next page; a block taller than a whole page is
 *   split by line. A tramline running through a split block keeps going (caps only at its real start and end).
 * - Script page changes are marked with a dashed rule and "Page N", as on screen.
 * - Coordinates are PDF points with the origin at the bottom left.
 */
import type { SlateShotType } from '@/lib/db/types'
import { formatAnnotationChip, type AnnotationView } from './annotations'
import type { CellState, LinedScriptLayout, LiningColumn, LiningRow } from './lining'

export const MARKED_UP_PAGE = { width: 595.28, height: 841.89 } as const

const MARGIN_X = 36
const MARGIN_TOP = 40
const MARGIN_BOTTOM = 48
/** Title, sub-title and legend above the lane labels. */
export const MARKED_UP_HEADER_HEIGHT = 50
/** Band holding the vertical tramline labels and their colour dots. */
export const MARKED_UP_LABEL_BAND = 92
const STRIP_W = 14
const GUTTER = 8
const TEXT_W_PREFERRED = 330
const TEXT_W_MIN = 290
const LANE_W_PREFERRED = 16
const LANE_W_MIN = 11

export const SCRIPT_FONT_SIZE = 9
const LINE_H = 11
export const NOTE_FONT_SIZE = 7.5
const NOTE_LINE_H = 9.5
const NOTE_GAP = 2
const BLOCK_PAD = 3
const PAGE_BREAK_H = 14

export type FontKind = 'mono' | 'monoBold' | 'sans'
/** Width of `text` in points. */
export type TextMeasure = (text: string, size: number, font: FontKind) => number

/** Courier is monospaced (600/1000 em); sans is an estimate. The renderer passes real font metrics. */
export const approximateMeasure: TextMeasure = (text, size, font) => text.length * size * (font === 'sans' ? 0.52 : 0.6)

export type MarkedUpSceneInput = {
  sceneNumber: string
  sceneTitle: string | null
  layout: LinedScriptLayout
  /** Notes by element id (SS8), drawn under their line. */
  annotations?: ReadonlyMap<string, readonly AnnotationView[]>
}

export type MarkedUpPlanOptions = {
  measure?: TextMeasure
  /** Applied to every string before measuring (e.g. WinAnsi clean-up for standard PDF fonts). */
  sanitize?: (text: string) => string
}

export type PlanLane = {
  /** Index into `layout.columns`. */
  columnIndex: number
  tramlineId: string
  slateId: string
  label: string
  shotType: SlateShotType | null
  /** Centre of the lane. */
  x: number
}

export type PlanLine = { text: string; x: number; y: number; font: FontKind; size: number; kind: 'script' | 'note' }

export type PlanCell = { state: CellState | null; isStart: boolean; isEnd: boolean }

export type PlanPiece = {
  elementId: string
  sortIndex: number
  /** Top and bottom edge of this piece of the block. */
  top: number
  bottom: number
  lines: PlanLine[]
  coverage: number | null
  /** Fewer than two tramlines while the scene has some lining (shaded, as on screen). */
  underCovered: boolean
  /** Aligned with the page's lanes. Start/end caps only on the piece holding the element's first/last line. */
  cells: PlanCell[]
  firstPiece: boolean
  lastPiece: boolean
}

export type PlanPage = {
  sceneNumber: string
  sceneTitle: string | null
  /** True when the scene started on an earlier page. */
  continued: boolean
  /** Set when the scene's tramlines are split over more than one pass. */
  laneGroup: { index: number; count: number; from: number; to: number; total: number } | null
  /** Script page number at the top of this page. */
  scriptPage: string | null
  stripX: number
  textX: number
  textWidth: number
  laneAreaX: number
  laneWidth: number
  lanes: PlanLane[]
  /** Label band: labels run upward from `labelBottom`, dots sit just below it. */
  labelTop: number
  labelBottom: number
  /** Longest label length (points) the band allows. */
  labelMaxLength: number
  /** Top of the first row. */
  rowsTop: number
  pieces: PlanPiece[]
  /**
   * Script page changes. `cells` (aligned with lanes) carry a tramline across the gap when it runs on into the
   * next page, so lines stay continuous as they do on a paper script.
   */
  pageBreaks: Array<{ y: number; label: string; top: number; bottom: number; cells: PlanCell[] }>
  /** Whole-scene figures, repeated on each page of the scene. */
  summary: { tramlines: number; underCovered: number }
}

export type MarkedUpPlan = { pages: PlanPage[] }

type Geometry = { textWidth: number; laneWidth: number; perGroup: number }

/** Text width and lane width for `n` lanes; `perGroup` lanes fit on one pass. */
export function laneGeometry(n: number): Geometry {
  const usable = MARKED_UP_PAGE.width - MARGIN_X * 2 - STRIP_W - GUTTER
  const preferredLanes = Math.floor((usable - TEXT_W_PREFERRED) / LANE_W_PREFERRED)
  if (n <= preferredLanes) return { textWidth: TEXT_W_PREFERRED, laneWidth: LANE_W_PREFERRED, perGroup: Math.max(n, 1) }
  const maxLanes = Math.floor((usable - TEXT_W_MIN) / LANE_W_MIN)
  const groups = Math.ceil(n / maxLanes)
  const perGroup = Math.ceil(n / groups)
  const laneWidth = Math.min(LANE_W_PREFERRED, Math.max(LANE_W_MIN, Math.floor(((usable - TEXT_W_MIN) / perGroup) * 10) / 10))
  return { textWidth: usable - laneWidth * perGroup, laneWidth, perGroup }
}

function wrapText(text: string, width: number, size: number, font: FontKind, measure: TextMeasure): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) continue
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (measure(next, size, font) <= width) {
        line = next
        continue
      }
      if (line) out.push(line)
      // A single word wider than the column is broken by character.
      let rest = word
      while (measure(rest, size, font) > width && rest.length > 1) {
        let cut = rest.length - 1
        while (cut > 1 && measure(rest.slice(0, cut), size, font) > width) cut -= 1
        out.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      line = rest
    }
    if (line) out.push(line)
  }
  return out
}

type RelLine = { text: string; dx: number; font: FontKind; size: number; height: number; kind: 'script' | 'note'; align?: 'right' }

/** Text lines for one element relative to the text column, laid out like the Script view. */
function elementLines(
  row: LiningRow,
  notes: readonly AnnotationView[],
  textWidth: number,
  measure: TextMeasure,
  clean: (s: string) => string
): RelLine[] {
  const el = row.element
  const size = SCRIPT_FONT_SIZE
  const lines: RelLine[] = []
  const push = (texts: string[], dx: number, font: FontKind, align?: 'right') => {
    for (const text of texts) lines.push({ text, dx, font, size, height: LINE_H, kind: 'script', align })
  }
  if (el.element_type === 'scene_heading') {
    push(wrapText(clean(el.text).toUpperCase(), textWidth, size, 'monoBold', measure), 0, 'monoBold')
  } else if (el.element_type === 'transition') {
    push(wrapText(clean(el.text).toUpperCase(), textWidth, size, 'mono', measure), 0, 'mono', 'right')
  } else if (el.element_type === 'dialogue') {
    const indent = textWidth * 0.18
    const width = textWidth * 0.72
    push([clean(el.character_name ?? '').toUpperCase()], indent + width * 0.22, 'mono')
    push(wrapText(clean(el.text), width, size, 'mono', measure), indent, 'mono')
  } else {
    push(wrapText(clean(el.text), textWidth, size, 'mono', measure), 0, 'mono')
  }
  if (lines.length === 0) lines.push({ text: '', dx: 0, font: 'mono', size, height: LINE_H, kind: 'script' })

  notes.forEach((n, i) => {
    const wrapped = wrapText(clean(formatAnnotationChip(n)), textWidth - 10, NOTE_FONT_SIZE, 'sans', measure)
    wrapped.forEach((text, j) =>
      lines.push({
        text,
        dx: 10,
        font: 'sans',
        size: NOTE_FONT_SIZE,
        height: NOTE_LINE_H + (i === 0 && j === 0 ? NOTE_GAP : 0),
        kind: 'note',
      })
    )
  })
  return lines
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  if (list.length === 0) return [[]]
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function planScene(scene: MarkedUpSceneInput, measure: TextMeasure, clean: (s: string) => string): PlanPage[] {
  const { layout } = scene
  const columns = layout.columns
  const geo = laneGeometry(columns.length)
  const groups = chunk(
    columns.map((c, i) => ({ c, i })),
    geo.perGroup
  )
  const underCovered = layout.rows.filter((r) => r.coverage != null && r.coverage < 2).length
  const summary = { tramlines: columns.length, underCovered: columns.length > 0 ? underCovered : 0 }

  const stripX = MARGIN_X
  const textX = stripX + STRIP_W
  const laneAreaX = textX + geo.textWidth + GUTTER
  const labelTop = MARKED_UP_PAGE.height - MARGIN_TOP - MARKED_UP_HEADER_HEIGHT
  const labelBottom = labelTop - MARKED_UP_LABEL_BAND + 14
  const rowsTop = labelTop - MARKED_UP_LABEL_BAND
  const floor = MARGIN_BOTTOM

  const pages: PlanPage[] = []
  groups.forEach((group, groupIndex) => {
    const lanes: PlanLane[] = group.map(({ c, i }: { c: LiningColumn; i: number }, k) => ({
      columnIndex: i,
      tramlineId: c.tramlineId,
      slateId: c.slateId,
      label: clean(c.label),
      shotType: c.shotType,
      x: laneAreaX + geo.laneWidth * (k + 0.5),
    }))
    const laneGroup =
      groups.length > 1
        ? { index: groupIndex, count: groups.length, from: group[0]!.i + 1, to: group[group.length - 1]!.i + 1, total: columns.length }
        : null

    let page: PlanPage | null = null
    let y = rowsTop
    const startPage = (scriptPage: string | null): PlanPage => {
      const next: PlanPage = {
        sceneNumber: scene.sceneNumber,
        sceneTitle: scene.sceneTitle,
        continued: pages.some((p) => p.sceneNumber === scene.sceneNumber && p.laneGroup?.index === laneGroup?.index),
        laneGroup,
        scriptPage,
        stripX,
        textX,
        textWidth: geo.textWidth,
        laneAreaX,
        laneWidth: geo.laneWidth,
        lanes,
        labelTop,
        labelBottom,
        labelMaxLength: labelTop - labelBottom - 4,
        rowsTop,
        pieces: [],
        pageBreaks: [],
        summary,
      }
      pages.push(next)
      y = rowsTop
      return next
    }

    layout.rows.forEach((row, rowIndex) => {
      const scriptPage = row.element.page_number
      if (!page) page = startPage(scriptPage)
      const lines = elementLines(row, scene.annotations?.get(row.element.id) ?? [], geo.textWidth, measure, clean)
      const blockHeight = BLOCK_PAD * 2 + lines.reduce((sum, l) => sum + l.height, 0)
      const fullPage = rowsTop - floor

      if (row.pageBreakBefore && rowIndex > 0) {
        if (y - PAGE_BREAK_H - Math.min(blockHeight, fullPage) < floor) {
          page = startPage(scriptPage)
        } else {
          const prev = layout.rows[rowIndex - 1]!
          page.pageBreaks.push({
            y: y - PAGE_BREAK_H / 2,
            label: `Page ${scriptPage ?? ''}`.trim(),
            top: y,
            bottom: y - PAGE_BREAK_H,
            cells: group.map(({ i }) => {
              const above = prev.cells[i]!
              const below = row.cells[i]!
              const continues = !!above.state && !!below.state && !below.isStart && !above.isEnd
              return { state: continues ? below.state : null, isStart: false, isEnd: false }
            }),
          })
          y -= PAGE_BREAK_H
        }
      }
      // Move the whole block on when it would fit on a fresh page.
      if (y - blockHeight < floor && blockHeight <= fullPage && y < rowsTop) page = startPage(scriptPage)

      let index = 0
      let first = true
      while (index < lines.length) {
        if (y - BLOCK_PAD - lines[index]!.height - BLOCK_PAD < floor && y < rowsTop) page = startPage(scriptPage)
        const top = y
        let cursor = top - BLOCK_PAD
        const placed: PlanLine[] = []
        while (index < lines.length) {
          const l = lines[index]!
          if (placed.length > 0 && cursor - l.height - BLOCK_PAD < floor) break
          cursor -= l.height
          const width = measure(l.text, l.size, l.font)
          placed.push({
            text: l.text,
            x: l.align === 'right' ? textX + geo.textWidth - width : textX + l.dx,
            y: cursor + (l.kind === 'note' ? 2 : 2.5),
            font: l.font,
            size: l.size,
            kind: l.kind,
          })
          index += 1
        }
        const bottom = cursor - BLOCK_PAD
        const last = index >= lines.length
        page.pieces.push({
          elementId: row.element.id,
          sortIndex: row.element.sort_index,
          top,
          bottom,
          lines: placed,
          coverage: row.coverage,
          underCovered: columns.length > 0 && row.coverage != null && row.coverage < 2,
          cells: group.map(({ i }) => {
            const cell = row.cells[i]!
            return { state: cell.state, isStart: cell.isStart && first, isEnd: cell.isEnd && last }
          }),
          firstPiece: first,
          lastPiece: last,
        })
        y = bottom
        first = false
      }
    })
    if (!page) startPage(null)
  })
  return pages
}

/** Pages for one or more scenes, each scene starting on a new page. */
export function planMarkedUpScript(scenes: readonly MarkedUpSceneInput[], options: MarkedUpPlanOptions = {}): MarkedUpPlan {
  const measure = options.measure ?? approximateMeasure
  const clean = options.sanitize ?? ((s: string) => s)
  return { pages: scenes.flatMap((s) => planScene(s, measure, clean)) }
}

/**
 * Tramline colours for print (UK convention: red/orange masters, blue singles, black multiples, green inserts).
 * Darker than the screen colours so every line reaches at least 3:1 against white paper.
 */
export const PRINT_TRAMLINE_HEX: Record<SlateShotType | 'none', string> = {
  master: '#c2410c',
  single: '#2f5fb3',
  multiple: '#1a1a1a',
  insert: '#3f7a5c',
  other: '#6b7280',
  none: '#6b7280',
}

/** WCAG contrast ratio of a #rrggbb colour against white. */
export function contrastOnWhite(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
  return 1.05 / (l + 0.05)
}

/** File name for a marked-up script export. */
export function markedUpScriptFileName(scope: { sceneNumber: string } | { dayNumber: number | null; shootDate: string }): string {
  if ('sceneNumber' in scope) return `marked-up-script-sc-${scope.sceneNumber.replace(/[^\w-]+/g, '') || 'scene'}.pdf`
  return `marked-up-script-${scope.dayNumber != null ? `day-${scope.dayNumber}-` : ''}${scope.shootDate}.pdf`
}
