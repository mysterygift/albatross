/**
 * Shared PDF layout helpers: paper sizes, text wrapping, and a page cursor with title bar,
 * stat strip, table, card and footer primitives. Built on pdf-lib StandardFonts (WinAnsi).
 *
 * Text is always wrapped, never truncated: cells and cards grow to fit their content.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export type PdfFont = PDFFont
export type PdfPage = PDFPage
export type PdfColor = ReturnType<typeof rgb>

// ---------------------------------------------------------------------------
// Paper
// ---------------------------------------------------------------------------

export type PaperSize = 'a4' | 'letter'

export const PAPER_SIZES: Record<PaperSize, { label: string; width: number; height: number }> = {
  a4: { label: 'A4', width: 595.28, height: 841.89 },
  letter: { label: 'US Letter', width: 612, height: 792 },
}

export const DEFAULT_PAPER_SIZE: PaperSize = 'a4'

export function isPaperSize(value: unknown): value is PaperSize {
  return value === 'a4' || value === 'letter'
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

export const COLOR_TEXT = rgb(0, 0, 0)
export const COLOR_MUTED = rgb(0.4, 0.4, 0.4)
export const COLOR_RULE = rgb(0.65, 0.65, 0.65)
export const COLOR_INK = rgb(0.07, 0.07, 0.07)
export const COLOR_FRAME = rgb(0.27, 0.27, 0.27)
export const COLOR_ROW_RULE = rgb(0.8, 0.8, 0.8)
export const COLOR_BADGE_TEXT = rgb(1, 1, 1)
export const COLOR_SECTION_FILL = rgb(0.88, 0.88, 0.88)
export const COLOR_HEADER_FILL = rgb(0.937, 0.937, 0.937)
export const COLOR_ALERT = rgb(0.63, 0, 0)

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** StandardFonts use WinAnsi; strip bidi/zero-width controls and unmapped code points. */
export function textForPdf(text: string): string {
  return text
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, '')
}

export function drawPdfText(
  page: PdfPage,
  text: string,
  options: Parameters<PdfPage['drawText']>[1]
): void {
  page.drawText(textForPdf(text), options)
}

/** Right-aligned text ending at `xRight`; never starts left of `minX`. */
export function drawTextRight(
  page: PdfPage,
  text: string,
  y: number,
  size: number,
  font: PdfFont,
  xRight: number,
  minX = 0
): void {
  const safe = textForPdf(text)
  const width = font.widthOfTextAtSize(safe, size)
  drawPdfText(page, safe, { x: Math.max(minX, xRight - width), y, size, font })
}

/** Thin horizontal rule at exactly `y`. */
export function drawHorizontalRule(
  page: PdfPage,
  y: number,
  xStart: number,
  xEnd: number,
  color: PdfColor = COLOR_RULE,
  thickness = 0.5
): void {
  page.drawRectangle({ x: xStart, y, width: xEnd - xStart, height: thickness, color })
}

/**
 * Word-wrap `text` to `maxWidth`. Newlines start new paragraphs; a single token wider than the
 * line is broken by character so nothing overflows or is cut off.
 */
export function wrapLines(text: string, maxWidth: number, font: PdfFont, size: number): string[] {
  const lines: string[] = []
  for (const paragraph of textForPdf(text).trim().split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) continue
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        line = next
        continue
      }
      if (line) {
        lines.push(line)
        line = ''
      }
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word
        continue
      }
      let chunk = ''
      for (const char of word) {
        const nextChunk = `${chunk}${char}`
        if (chunk && font.widthOfTextAtSize(nextChunk, size) > maxWidth) {
          lines.push(chunk)
          chunk = char
        } else {
          chunk = nextChunk
        }
      }
      line = chunk
    }
    if (line) lines.push(line)
  }
  return lines
}

/** Like `wrapLines` but caps at `maxLines`, ending the last line with an ellipsis. */
export function wrapLinesLimited(
  text: string,
  maxWidth: number,
  font: PdfFont,
  size: number,
  maxLines: number
): string[] {
  const all = wrapLines(text.trim(), maxWidth, font, size)
  if (all.length <= maxLines) return all.length ? all : ['']
  const out = all.slice(0, maxLines)
  let last = out[maxLines - 1]!
  while (last.length > 1 && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) {
    last = last.slice(0, -1)
  }
  out[maxLines - 1] = `${last}...`
  return out
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

/** `2026-10-14` -> `Wednesday, 14 October 2026`. Locale-independent; the day never shifts. */
export function formatLongDate(iso: string): string {
  const date = parseIsoDate(iso)
  if (!date) return iso
  return `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** An instant -> `13 Oct 2026 18:40` in the machine's local time. */
export function formatIssuedStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getDate()} ${MONTHS[date.getMonth()]!.slice(0, 3)} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// ---------------------------------------------------------------------------
// Layout cursor
// ---------------------------------------------------------------------------

export interface PdfLayoutOptions {
  paper?: PaperSize
  /** Page margin on all sides, in points. */
  margin?: number
  /** Space kept clear above the bottom margin for the footer. */
  footerReserve?: number
}

/** A paragraph inside a cell, with optional small uppercase label. */
export interface TextBlock {
  text: string
  bold?: boolean
  color?: PdfColor
  size?: number
  /** Small uppercase grey label; on its own line unless `inline`. */
  label?: string
  labelColor?: PdfColor
  inline?: boolean
}

export interface StatLine {
  text: string
  size?: number
  bold?: boolean
}

export interface StatCell {
  label: string
  /** Relative width within the strip. */
  weight?: number
  lines: StatLine[]
}

export interface TableColumn {
  header: string
  /** Relative width; columns share the table width in proportion. */
  weight: number
  align?: 'left' | 'center' | 'right'
}

export type TableCell = string | { text: string; bold?: boolean; color?: PdfColor }

export interface NumberedRow {
  badge: string
  /** Middle and right columns. */
  columns: [TextBlock[], TextBlock[]]
}

export interface FooterOptions {
  /** Left-hand text, e.g. the confidentiality notice. Wraps rather than truncates. */
  left: string
  showPageNumbers?: boolean
}

const BODY = 9
const LABEL = 7
const LINE_RATIO = 1.3
const CELL_PAD_X = 7
const CELL_PAD_Y = 5
const TABLE_PAD_X = 5
const TABLE_PAD_Y = 3

type DrawItem = {
  text: string
  size: number
  bold: boolean
  color: PdfColor
  /** Horizontal offset from the cell's left padding edge. */
  dx: number
  /** Inline label drawn at the start of this line. */
  label?: { text: string; color: PdfColor }
}

export class PdfLayout {
  readonly doc: PDFDocument
  readonly font: PdfFont
  readonly bold: PdfFont
  readonly pageWidth: number
  readonly pageHeight: number
  readonly margin: number
  readonly contentWidth: number
  readonly yMin: number
  page: PdfPage
  /** Y of the next line to draw (top of free space). */
  y: number
  /** Called after every page break, to draw a running header. */
  onNewPage: ((layout: PdfLayout) => void) | null = null

  private constructor(
    doc: PDFDocument,
    font: PdfFont,
    bold: PdfFont,
    paper: PaperSize,
    margin: number,
    footerReserve: number
  ) {
    this.doc = doc
    this.font = font
    this.bold = bold
    const size = PAPER_SIZES[paper]
    this.pageWidth = size.width
    this.pageHeight = size.height
    this.margin = margin
    this.contentWidth = size.width - margin * 2
    this.yMin = margin + footerReserve
    this.page = doc.addPage([size.width, size.height])
    this.y = size.height - margin
  }

  static async create(options: PdfLayoutOptions = {}): Promise<PdfLayout> {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    return new PdfLayout(
      doc,
      font,
      bold,
      options.paper ?? DEFAULT_PAPER_SIZE,
      options.margin ?? 30,
      options.footerReserve ?? 22
    )
  }

  get xLeft(): number {
    return this.margin
  }

  get xRight(): number {
    return this.pageWidth - this.margin
  }

  lineHeight(size: number): number {
    return size * LINE_RATIO
  }

  /** Start a new page and run the running-header hook. */
  addPage(): void {
    this.page = this.doc.addPage([this.pageWidth, this.pageHeight])
    this.y = this.pageHeight - this.margin
    this.onNewPage?.(this)
  }

  /** Break to a new page unless `height` fits. Returns true when it broke. */
  ensureSpace(height: number): boolean {
    if (this.y - height >= this.yMin) return false
    this.addPage()
    return true
  }

  gap(points: number): void {
    this.y -= points
  }

  text(
    text: string,
    x: number,
    baseline: number,
    options: { size?: number; bold?: boolean; color?: PdfColor } = {}
  ): void {
    drawPdfText(this.page, text, {
      x,
      y: baseline,
      size: options.size ?? BODY,
      font: options.bold ? this.bold : this.font,
      color: options.color ?? COLOR_INK,
    })
  }

  textWidth(text: string, size: number, bold = false): number {
    return (bold ? this.bold : this.font).widthOfTextAtSize(textForPdf(text), size)
  }

  textRight(
    text: string,
    baseline: number,
    xRight: number,
    options: { size?: number; bold?: boolean; color?: PdfColor } = {}
  ): void {
    const width = this.textWidth(text, options.size ?? BODY, options.bold)
    this.text(text, Math.max(this.margin, xRight - width), baseline, options)
  }

  wrap(text: string, maxWidth: number, size = BODY, bold = false): string[] {
    return wrapLines(text, maxWidth, bold ? this.bold : this.font, size)
  }

  private frame(x: number, yTop: number, width: number, height: number): void {
    this.page.drawRectangle({
      x,
      y: yTop - height,
      width,
      height,
      borderColor: COLOR_FRAME,
      borderWidth: 0.8,
    })
  }

  /**
   * Document masthead: title on the left, `right` (the document name) on the right, a sub line,
   * then a heavy rule.
   */
  masthead(args: {
    title: string
    right: string
    subLeft?: string | null
    subRight?: string | null
  }): void {
    const titleSize = 16
    const subSize = 9
    const rightW = this.textWidth(args.right, titleSize, true)
    const titleLines = this.wrap(args.title, this.contentWidth - rightW - 14, titleSize, true)
    const lines = titleLines.length > 0 ? titleLines : ['']
    this.ensureSpace(lines.length * this.lineHeight(titleSize) + 40)
    const firstBaseline = this.y - titleSize
    this.textRight(args.right, firstBaseline, this.xRight, { size: titleSize, bold: true })
    lines.forEach((line, i) => {
      this.text(line, this.xLeft, firstBaseline - i * this.lineHeight(titleSize), {
        size: titleSize,
        bold: true,
      })
    })
    this.y -= lines.length * this.lineHeight(titleSize) + 1

    const subRight = args.subRight?.trim() ?? ''
    const subLeft = args.subLeft?.trim() ?? ''
    if (subLeft || subRight) {
      const subRightW = subRight ? this.textWidth(subRight, subSize) : 0
      const leftLines = subLeft
        ? this.wrap(subLeft, this.contentWidth - subRightW - 14, subSize)
        : []
      const baseline = this.y - subSize
      if (subRight) this.textRight(subRight, baseline, this.xRight, { size: subSize, color: COLOR_MUTED })
      leftLines.forEach((line, i) => {
        this.text(line, this.xLeft, baseline - i * this.lineHeight(subSize), {
          size: subSize,
          color: COLOR_MUTED,
        })
      })
      this.y -= Math.max(leftLines.length, 1) * this.lineHeight(subSize) + 1
    }
    this.page.drawRectangle({
      x: this.xLeft,
      y: this.y - 2,
      width: this.contentWidth,
      height: 2,
      color: COLOR_INK,
    })
    this.y -= 2 + 7
  }

  /** Compact header for continuation pages: bold title, grey detail, rule. */
  runningHeader(title: string, detail: string): void {
    const size = 9
    const baseline = this.y - size
    this.text(title, this.xLeft, baseline, { size, bold: true })
    this.textRight(detail, baseline, this.xRight, { size: 8, color: COLOR_MUTED })
    this.y -= size + 4
    drawHorizontalRule(this.page, this.y, this.xLeft, this.xRight)
    this.y -= 6
  }

  /**
   * Shaded section bar. `keepWith` is the height of the content that must fit under it on the
   * same page, so a heading is never stranded at the foot of a page.
   */
  sectionBar(title: string, keepWith = 40): void {
    const height = 15
    this.ensureSpace(height + keepWith)
    this.y -= 6
    this.page.drawRectangle({
      x: this.xLeft,
      y: this.y - height,
      width: this.contentWidth,
      height,
      color: COLOR_SECTION_FILL,
    })
    this.text(title.toUpperCase(), this.xLeft + 6, this.y - height + 4.5, { size: 9, bold: true })
    this.y -= height
  }

  /** Lay out text blocks to `width`, returning positioned lines and the total height. */
  private layoutBlocks(blocks: TextBlock[], width: number): { items: DrawItem[]; height: number } {
    const items: DrawItem[] = []
    let height = 0
    for (const block of blocks) {
      if (!block.text.trim()) continue
      const size = block.size ?? BODY
      const bold = block.bold === true
      const color = block.color ?? COLOR_INK
      const labelColor = block.labelColor ?? COLOR_MUTED
      let indent = 0
      if (block.label && !block.inline) {
        items.push({
          text: block.label.toUpperCase(),
          size: LABEL,
          bold: false,
          color: labelColor,
          dx: 0,
        })
        height += this.lineHeight(LABEL)
      } else if (block.label) {
        indent = this.textWidth(block.label.toUpperCase(), LABEL) + 4
      }
      const lines = this.wrap(block.text, width - indent, size, bold)
      lines.forEach((line, i) => {
        items.push({
          text: line,
          size,
          bold,
          color,
          dx: indent,
          label:
            i === 0 && block.label && block.inline
              ? { text: block.label.toUpperCase(), color: labelColor }
              : undefined,
        })
        height += this.lineHeight(size)
      })
    }
    return { items, height }
  }

  /** Draw laid-out lines with the top of the first line at `yTop`. */
  private drawItems(items: DrawItem[], x: number, yTop: number): void {
    let cursor = yTop
    for (const item of items) {
      const baseline = cursor - item.size * 1.05
      if (item.label) {
        this.text(item.label.text, x, baseline, { size: LABEL, color: item.label.color })
      }
      this.text(item.text, x + item.dx, baseline, {
        size: item.size,
        bold: item.bold,
        color: item.color,
      })
      cursor -= this.lineHeight(item.size)
    }
  }

  /** Boxed header strip: equal-ish cells, each a small label over large values. */
  statStrip(cells: StatCell[]): void {
    if (cells.length === 0) return
    const totalWeight = cells.reduce((sum, c) => sum + (c.weight ?? 1), 0)
    const widths = cells.map((c) => ((c.weight ?? 1) / totalWeight) * this.contentWidth)
    const measured = cells.map((cell, i) => {
      const blocks: TextBlock[] = cell.lines.map((line) => ({
        text: line.text,
        size: line.size,
        bold: line.bold,
      }))
      const layout = this.layoutBlocks(blocks, widths[i]! - CELL_PAD_X * 2)
      return { cell, layout, height: layout.height + this.lineHeight(LABEL) + CELL_PAD_Y * 2 }
    })
    const rowH = Math.max(...measured.map((m) => m.height))
    this.ensureSpace(rowH + 8)
    this.frame(this.xLeft, this.y, this.contentWidth, rowH)
    let x = this.xLeft
    measured.forEach((m, i) => {
      if (i > 0) {
        this.page.drawRectangle({
          x,
          y: this.y - rowH,
          width: 0.8,
          height: rowH,
          color: COLOR_FRAME,
        })
      }
      const textX = x + CELL_PAD_X
      this.text(m.cell.label.toUpperCase(), textX, this.y - CELL_PAD_Y - LABEL, {
        size: LABEL,
        color: COLOR_MUTED,
      })
      this.drawItems(
        m.layout.items,
        textX,
        this.y - CELL_PAD_Y - this.lineHeight(LABEL)
      )
      x += widths[i]!
    })
    this.y -= rowH + 2
  }

  /**
   * Table whose rows grow to fit wrapped cells. Rows never split across pages, and the header
   * repeats on each new page.
   */
  table(args: { columns: TableColumn[]; rows: TableCell[][]; fontSize?: number }): void {
    const { columns, rows } = args
    if (rows.length === 0) return
    const size = args.fontSize ?? BODY
    const totalWeight = columns.reduce((sum, c) => sum + c.weight, 0)
    const widths = columns.map((c) => (c.weight / totalWeight) * this.contentWidth)

    const headerLines = columns.map((c, i) => this.wrap(c.header, widths[i]! - TABLE_PAD_X * 2, size, true))
    const headerH =
      Math.max(1, ...headerLines.map((l) => l.length)) * this.lineHeight(size) + TABLE_PAD_Y * 2

    const cellText = (cell: TableCell) => (typeof cell === 'string' ? cell : cell.text)
    const cellBold = (cell: TableCell) => typeof cell !== 'string' && cell.bold === true
    const measure = (row: TableCell[]) => {
      const lines = row.map((cell, i) =>
        this.wrap(cellText(cell), widths[i]! - TABLE_PAD_X * 2, size, cellBold(cell))
      )
      const height =
        Math.max(1, ...lines.map((l) => l.length)) * this.lineHeight(size) + TABLE_PAD_Y * 2
      return { lines, height }
    }

    const drawHeader = () => {
      this.page.drawRectangle({
        x: this.xLeft,
        y: this.y - headerH,
        width: this.contentWidth,
        height: headerH,
        color: COLOR_HEADER_FILL,
      })
      let x = this.xLeft
      columns.forEach((col, i) => {
        headerLines[i]!.forEach((line, n) => {
          this.drawAligned(
            line,
            x,
            widths[i]!,
            this.y - TABLE_PAD_Y - size * 1.05 - n * this.lineHeight(size),
            size,
            true,
            col.align,
            COLOR_INK
          )
        })
        x += widths[i]!
      })
      this.y -= headerH
    }

    this.ensureSpace(headerH + measure(rows[0]!).height)
    drawHeader()

    for (const row of rows) {
      const { lines, height } = measure(row)
      if (this.y - height < this.yMin) {
        this.addPage()
        drawHeader()
      }
      let x = this.xLeft
      row.forEach((cell, i) => {
        const color = typeof cell !== 'string' && cell.color ? cell.color : COLOR_INK
        lines[i]!.forEach((line, n) => {
          this.drawAligned(
            line,
            x,
            widths[i]!,
            this.y - TABLE_PAD_Y - size * 1.05 - n * this.lineHeight(size),
            size,
            cellBold(cell),
            columns[i]!.align,
            color
          )
        })
        x += widths[i]!
      })
      drawHorizontalRule(this.page, this.y - height, this.xLeft, this.xRight, COLOR_ROW_RULE, 0.6)
      this.y -= height
    }
    this.y -= 4
  }

  private drawAligned(
    line: string,
    cellX: number,
    cellW: number,
    baseline: number,
    size: number,
    bold: boolean,
    align: TableColumn['align'],
    color: PdfColor
  ): void {
    const width = this.textWidth(line, size, bold)
    let x = cellX + TABLE_PAD_X
    if (align === 'right') x = cellX + cellW - TABLE_PAD_X - width
    else if (align === 'center') x = cellX + (cellW - width) / 2
    this.text(line, x, baseline, { size, bold, color })
  }

  /**
   * Bordered grid of text cells, `columns` across, row by row. Each row is as tall as its tallest
   * cell and never splits across pages.
   */
  blockGrid(cells: TextBlock[][], columns: number): void {
    if (cells.length === 0) return
    const cols = Math.max(1, Math.min(columns, cells.length))
    const cellW = this.contentWidth / cols
    for (let i = 0; i < cells.length; i += cols) {
      const rowCells = cells.slice(i, i + cols)
      const laid = rowCells.map((blocks) => this.layoutBlocks(blocks, cellW - CELL_PAD_X * 2))
      const rowH = Math.max(...laid.map((l) => l.height)) + CELL_PAD_Y * 2
      this.ensureSpace(rowH)
      this.frame(this.xLeft, this.y, this.contentWidth, rowH)
      for (let j = 0; j < cols; j += 1) {
        const x = this.xLeft + j * cellW
        // Dividers are drawn for every column, so a short last row keeps its empty cell.
        if (j > 0) {
          this.page.drawRectangle({
            x,
            y: this.y - rowH,
            width: 0.8,
            height: rowH,
            color: COLOR_FRAME,
          })
        }
        const l = laid[j]
        if (l) this.drawItems(l.items, x + CELL_PAD_X, this.y - CELL_PAD_Y)
      }
      this.y -= rowH
    }
    this.y -= 4
  }

  /** Rows with a round number badge and two text columns. Rows never split across pages. */
  numberedRows(rows: NumberedRow[]): void {
    const badgeCol = 22
    const gap = 6
    const colW = (this.contentWidth - CELL_PAD_X * 2 - badgeCol - gap * 2) / 2
    const radius = 8.5
    for (const row of rows) {
      const left = this.layoutBlocks(row.columns[0], colW)
      const right = this.layoutBlocks(row.columns[1], colW)
      const rowH = Math.max(left.height, right.height, radius * 2) + CELL_PAD_Y * 2
      this.ensureSpace(rowH)
      this.frame(this.xLeft, this.y, this.contentWidth, rowH)
      const x0 = this.xLeft + CELL_PAD_X
      const cy = this.y - CELL_PAD_Y - radius
      this.page.drawCircle({ x: x0 + radius, y: cy, size: radius, color: COLOR_INK })
      const badgeSize = 8.5
      const badgeW = this.textWidth(row.badge, badgeSize, true)
      this.text(row.badge, x0 + radius - badgeW / 2, cy - badgeSize * 0.35, {
        size: badgeSize,
        bold: true,
        color: COLOR_BADGE_TEXT,
      })
      this.drawItems(left.items, x0 + badgeCol + gap, this.y - CELL_PAD_Y)
      this.drawItems(right.items, x0 + badgeCol + gap * 2 + colW, this.y - CELL_PAD_Y)
      this.y -= rowH
    }
    this.y -= 4
  }

  /** Footer on every page: rule, `left` text (wrapped), and `Page X of Y`. Call once, at the end. */
  applyFooters(options: FooterOptions): void {
    const pages = this.doc.getPages()
    const size = 7.5
    const lineH = this.lineHeight(size)
    const total = pages.length
    pages.forEach((page, index) => {
      const label =
        options.showPageNumbers === false ? '' : textForPdf(`Page ${index + 1} of ${total}`)
      const labelW = label ? this.font.widthOfTextAtSize(label, size) : 0
      const leftLines = this.wrap(options.left, this.contentWidth - labelW - 16, size)
      const baseline = this.margin - 4
      leftLines.forEach((line, n) => {
        drawPdfText(page, line, {
          x: this.xLeft,
          y: baseline + (leftLines.length - 1 - n) * lineH,
          size,
          font: this.font,
          color: COLOR_MUTED,
        })
      })
      if (label) {
        drawPdfText(page, label, {
          x: this.xRight - labelW,
          y: baseline + (leftLines.length - 1) * lineH,
          size,
          font: this.font,
          color: COLOR_MUTED,
        })
      }
      drawHorizontalRule(
        page,
        baseline + Math.max(leftLines.length, 1) * lineH + 1,
        this.xLeft,
        this.xRight,
        rgb(0.73, 0.73, 0.73)
      )
    })
  }
}
