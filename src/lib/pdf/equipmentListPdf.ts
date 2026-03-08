/**
 * Equipment list PDF: printable checklist for on-set use.
 * Uses pdf-lib (same as call sheet, DooD). Read-only; does not modify list or registry.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { Equipment, EquipmentList, EquipmentListItem } from '@/lib/db/types'

const MARGIN = 54
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const Y_MIN = MARGIN + 40
const ROW_HEIGHT = 14
const FONT_TITLE = 16
const FONT_HEADER = 11
const FONT_BODY = 9
const FONT_TABLE = 8
const FONT_FOOTER = 8
const GRAY = rgb(0.45, 0.45, 0.45)

/** Short UUID for display (first 8 chars). */
function shortUuid(itemUuid: string): string {
  return itemUuid.slice(0, 8)
}

/** Placeholder for null/empty values in PDF. */
function orDash(value: string | null | undefined): string {
  return value?.trim() ? value : '—'
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

  const checkboxSize = 10
  const colOut = checkboxSize + 4
  const colIn = checkboxSize + 4
  const colName = 100
  const colCategory = 52
  const colSerial = 52
  const colUuid = 42
  const colNotes = PAGE_WIDTH - MARGIN * 2 - colOut - colIn - colName - colCategory - colSerial - colUuid

  const columns = [
    { label: 'OUT', width: colOut },
    { label: 'IN', width: colIn },
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
      y: yVal - 0.25,
      width: tableWidth,
      height: 0.5,
      color: GRAY,
    })
  }

  const drawCheckbox = (x: number, yVal: number): void => {
    page.drawRectangle({
      x,
      y: yVal - 1,
      width: checkboxSize,
      height: checkboxSize,
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 0.75,
    })
  }

  const drawTableHeader = (): void => {
    drawRule(y)
    y -= ROW_HEIGHT
    let x = xStart
    for (const col of columns) {
      page.drawText(col.label, {
        x,
        y,
        size: FONT_TABLE,
        font: bold,
        color: rgb(0.2, 0.2, 0.2),
      })
      x += col.width
    }
    y -= ROW_HEIGHT
    drawRule(y)
    y -= 4
  }

  const maxChars = (w: number) => Math.max(2, Math.floor(w / 5))

  drawTableHeader()

  for (const item of listItems) {
    if (y < Y_MIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
      drawTableHeader()
    }

    const eq = equipmentById.get(item.equipment_id)
    const name = orDash(eq?.name).slice(0, maxChars(colName))
    const category = orDash(eq ? eq.category.replace(/_/g, ' ') : null).slice(0, maxChars(colCategory))
    const serial = orDash(eq?.serial_number ?? null).slice(0, maxChars(colSerial))
    const uuidShort = eq ? shortUuid(eq.item_uuid) : '—'
    const notes = orDash(item.notes ?? eq?.notes ?? null).slice(0, maxChars(colNotes))

    let x = xStart
    drawCheckbox(x, y)
    x += colOut
    drawCheckbox(x, y)
    x += colIn
    page.drawText(name, { x, y, size: FONT_TABLE, font })
    x += colName
    page.drawText(category, { x, y, size: FONT_TABLE, font })
    x += colCategory
    page.drawText(serial, { x, y, size: FONT_TABLE, font })
    x += colSerial
    page.drawText(uuidShort, { x, y, size: FONT_TABLE, font })
    x += colUuid
    page.drawText(notes, { x, y, size: FONT_TABLE, font })

    y -= ROW_HEIGHT
  }

  page.drawText(
    `Generated: ${new Date().toLocaleString()}`,
    { x: MARGIN, y: 24, size: FONT_FOOTER, font, color: GRAY }
  )

  return doc.save()
}
