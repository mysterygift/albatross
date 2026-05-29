/**
 * Equipment list PDF: printable checklist for on-set use.
 * Uses pdf-lib (same as call sheet, DooD). Read-only; does not modify list or registry.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { formatEquipmentCategoryLabel } from '@/features/equipment/formatEquipmentLabel'
import { textForPdf } from '@/lib/pdf/callSheet'
import type { Equipment, EquipmentList, EquipmentListItem } from '@/lib/db/types'

const MARGIN = 54
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const Y_MIN = MARGIN + 40
const FONT_TITLE = 16
const FONT_HEADER = 11
const FONT_BODY = 9
const FONT_TABLE = 7
const FONT_FOOTER = 8
const TABLE_LINE_STEP = 7.5
const ROW_HEIGHT_MIN = 14
const TABLE_HEADER_ROW = 14
const NAME_MAX_LINES = 2
const GRAY = rgb(0.45, 0.45, 0.45)

type PdfFont = Awaited<ReturnType<PDFDocument['embedFont']>>

/** Short UUID for display (last 8 chars so demo IDs with shared prefix look unique). */
function shortUuid(itemUuid: string): string {
  return itemUuid.length >= 8 ? itemUuid.slice(-8) : itemUuid
}

/** Placeholder for null/empty values in PDF. */
function orDash(value: string | null | undefined): string {
  return value?.trim() ? value : '—'
}

export function wrapEquipmentListPdfLines(
  text: string,
  maxWidth: number,
  font: PdfFont,
  size: number
): string[] {
  const paragraphs = textForPdf(text).trim().split(/\n+/)
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) continue
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

export function wrapEquipmentListPdfLinesLimited(
  text: string,
  maxWidth: number,
  font: PdfFont,
  size: number,
  maxLines: number
): string[] {
  const all = wrapEquipmentListPdfLines(text.trim(), maxWidth, font, size)
  if (all.length <= maxLines) return all.length ? all : ['']
  const out = all.slice(0, maxLines)
  let last = out[maxLines - 1]!
  if (all.length > maxLines) {
    while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) {
      last = last.slice(0, -1)
    }
    out[maxLines - 1] = `${last}…`
  }
  return out
}

export interface EquipmentListPdfParams {
  productionName: string
  list: EquipmentList
  listItems: EquipmentListItem[]
  /** Map equipment_id -> Equipment for each list item. */
  equipmentById: Map<string, Equipment>
  /** Optional: shoot day label (e.g. "2025-03-15" or "Day 4") for header. */
  shootDayLabel?: string | null
}

/**
 * Generate a printable PDF checklist for an equipment list.
 * Rows follow list sort_order. Export is read-only; does not mutate any data.
 */
export async function generateEquipmentListPdf(params: EquipmentListPdfParams): Promise<Uint8Array> {
  const { productionName, list, listItems, equipmentById, shootDayLabel } = params
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const checkboxSize = 15
  const colOut = checkboxSize + 14
  const colIn = checkboxSize + 14
  const colQty = 22
  const colName = 100
  const colCategory = 58
  const colSerial = 58
  const colUuid = 48
  const colNotes = PAGE_WIDTH - MARGIN * 2 - colOut - colIn - colQty - colName - colCategory - colSerial - colUuid

  const columns = [
    { label: 'OUT', width: colOut },
    { label: 'IN', width: colIn },
    { label: 'Qty', width: colQty },
    { label: 'Name', width: colName },
    { label: 'Category', width: colCategory },
    { label: 'Serial', width: colSerial },
    { label: 'UUID', width: colUuid },
    { label: 'Notes', width: colNotes },
  ]
  const tableWidth = columns.reduce((s, c) => s + c.width, 0)
  const xStart = MARGIN

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  // ---------- Header ----------
  page.drawText('EQUIPMENT CHECKLIST', {
    x: MARGIN,
    y,
    size: FONT_TITLE,
    font: bold,
    color: rgb(0.15, 0.15, 0.15),
  })
  y -= 10

  page.drawText(productionName, {
    x: MARGIN,
    y,
    size: FONT_HEADER,
    font,
    color: GRAY,
  })
  y -= 12

  page.drawText(list.name, {
    x: MARGIN,
    y,
    size: FONT_HEADER,
    font: bold,
    color: rgb(0.2, 0.2, 0.2),
  })
  y -= 10

  const metaLines: string[] = []
  if (list.department) metaLines.push(`Department: ${list.department}`)
  if (shootDayLabel) metaLines.push(`Shoot day: ${shootDayLabel}`)
  if (metaLines.length > 0) {
    page.drawText(metaLines.join('  ·  '), {
      x: MARGIN,
      y,
      size: FONT_BODY,
      font,
      color: GRAY,
    })
    y -= 10
  }

  y -= 6
  page.drawText(`Generated: ${new Date().toLocaleString()}`, {
    x: MARGIN,
    y,
    size: FONT_FOOTER,
    font,
    color: GRAY,
  })
  y -= 16

  const drawRule = (yVal: number): void => {
    page.drawRectangle({
      x: xStart,
      y: yVal,
      width: tableWidth,
      height: 0.5,
      color: GRAY,
    })
  }

  const drawCheckbox = (x: number, rowTop: number, rowH: number): void => {
    const boxY = rowTop - (rowH - checkboxSize) / 2 - 1
    page.drawRectangle({
      x,
      y: boxY,
      width: checkboxSize,
      height: checkboxSize,
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 0.75,
    })
  }

  const drawTableHeader = (): void => {
    drawRule(y - 5)
    y -= TABLE_HEADER_ROW
    let x = xStart
    for (const col of columns) {
      page.drawText(col.label, {
        x,
        y,
        size: FONT_TABLE,
        font: bold,
        color: rgb(0.2, 0.2, 0.2),
      })
      x += col.width + 5
    }
    y -= 10
    drawRule(y + 4)
    y -= 20
  }

  const maxChars = (w: number) => Math.max(2, Math.floor(w / 5))

  drawTableHeader()

  for (const item of listItems) {
    const eq = equipmentById.get(item.equipment_id)
    const nameLines = wrapEquipmentListPdfLinesLimited(
      orDash(eq?.name),
      colName,
      font,
      FONT_TABLE,
      NAME_MAX_LINES
    )
    const rowH = Math.max(ROW_HEIGHT_MIN, 2 + nameLines.length * TABLE_LINE_STEP)

    if (y - rowH < Y_MIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
      drawTableHeader()
    }

    const category = orDash(eq ? formatEquipmentCategoryLabel(eq.category) : null).slice(0, maxChars(colCategory))
    const serial = orDash(eq?.serial_number ?? null).slice(0, maxChars(colSerial))
    const uuidShort = eq ? shortUuid(eq.item_uuid) : '—'
    const notes = orDash(item.notes ?? eq?.notes ?? null).slice(0, maxChars(colNotes))

    let x = xStart
    drawCheckbox(x, y, rowH)
    x += colOut
    drawCheckbox(x, y, rowH)
    x += colIn
    page.drawText(String(item.quantity), { x, y, size: FONT_TABLE, font })
    x += colQty
    const nameX = x
    let nameY = y
    for (const line of nameLines) {
      page.drawText(line, { x: nameX, y: nameY, size: FONT_TABLE, font })
      nameY -= TABLE_LINE_STEP
    }
    x += colName
    page.drawText(category, { x, y, size: FONT_TABLE, font })
    x += colCategory
    page.drawText(serial, { x, y, size: FONT_TABLE, font })
    x += colSerial
    page.drawText(uuidShort, { x, y, size: FONT_TABLE, font })
    x += colUuid
    page.drawText(notes, { x, y, size: FONT_TABLE, font })

    y -= rowH + 10
  }

  page.drawText(
    `Generated: ${new Date().toLocaleString()}`,
    { x: MARGIN, y: 24, size: FONT_FOOTER, font, color: GRAY }
  )

  return doc.save()
}
