/**
 * Equipment list PDF: printable out/in checklist for prep, on-set use and returns.
 * Read-only: renders a saved list; does not modify the list or the registry.
 */
import { formatEquipmentCategoryLabel } from '@/features/equipment/formatEquipmentLabel'
import {
  COLOR_MUTED,
  DEFAULT_PAPER_SIZE,
  PdfLayout,
  formatIssuedStamp,
  formatLongDate,
  type PaperSize,
  type StatCell,
  type TableCell,
  type TableColumn,
} from '@/lib/pdf/layoutKit'
import type { Equipment, EquipmentList, EquipmentListItem } from '@/lib/db/types'

const SEP = ' | '
/** Shown in table cells with nothing to say, so a gap reads as a gap rather than a layout error. */
const EMPTY_CELL = '-'
const TABLE_FONT = 8

const COLUMNS: TableColumn[] = [
  { header: 'Out', weight: 27, align: 'center' },
  { header: 'In', weight: 27, align: 'center' },
  { header: 'Qty', weight: 27, align: 'center' },
  { header: 'Item', weight: 142 },
  { header: 'Category', weight: 94 },
  { header: 'Serial', weight: 72 },
  { header: 'ID', weight: 48 },
  { header: 'Notes', weight: 125 },
]

export interface EquipmentListPdfShootDay {
  /** ISO date, e.g. `2026-10-14`. */
  shootDate: string
  dayNumber: number | null
  totalShootDays: number | null
}

export interface EquipmentListPdfParams {
  productionName: string
  list: EquipmentList
  listItems: EquipmentListItem[]
  /** Map equipment_id -> Equipment for each list item. */
  equipmentById: Map<string, Equipment>
  /** The shoot day the list is for, when it has one. */
  shootDay?: EquipmentListPdfShootDay | null
  paperSize?: PaperSize
  /** Issue stamp; defaults to now. */
  issuedAt?: Date
}

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Short ID for display (last 8 chars, matching the equipment list table in the app). */
export function shortItemId(itemUuid: string): string {
  return itemUuid.length >= 8 ? itemUuid.slice(-8) : itemUuid
}

function dayLabel(day: EquipmentListPdfShootDay): string | null {
  if (day.dayNumber == null) return null
  return day.totalShootDays != null && day.totalShootDays >= day.dayNumber
    ? `Day ${day.dayNumber} of ${day.totalShootDays}`
    : `Day ${day.dayNumber}`
}

function muted(text: string): TableCell {
  return { text, color: COLOR_MUTED }
}

/** One checklist row. List-item notes win over the registry item's notes. */
export function equipmentListRow(item: EquipmentListItem, eq: Equipment | undefined): TableCell[] {
  const notes = present(item.notes) ?? present(eq?.notes) ?? ''
  if (!eq) {
    return [
      { checkbox: true },
      { checkbox: true },
      { text: String(item.quantity), bold: true },
      muted('Item no longer in the registry'),
      muted(EMPTY_CELL),
      muted(EMPTY_CELL),
      muted(EMPTY_CELL),
      notes,
    ]
  }
  const serial = present(eq.serial_number)
  return [
    { checkbox: true },
    { checkbox: true },
    { text: String(item.quantity), bold: true },
    { text: eq.name, bold: true },
    present(eq.category) ? formatEquipmentCategoryLabel(eq.category) : muted(EMPTY_CELL),
    serial ?? muted(EMPTY_CELL),
    muted(shortItemId(eq.item_uuid)),
    notes,
  ]
}

/**
 * Generate a printable PDF checklist for an equipment list.
 * Rows follow list sort_order. Export is read-only; does not mutate any data.
 */
export async function generateEquipmentListPdf(params: EquipmentListPdfParams): Promise<Uint8Array> {
  const { productionName, list, listItems, equipmentById, shootDay } = params
  const layout = await PdfLayout.create({ paper: params.paperSize ?? DEFAULT_PAPER_SIZE })
  const day = shootDay ? dayLabel(shootDay) : null
  const department = present(list.department)

  layout.onNewPage = (l) => {
    l.runningHeader(['EQUIPMENT LIST', list.name, day].filter(Boolean).join(SEP), productionName)
  }

  layout.masthead({
    title: productionName,
    right: 'EQUIPMENT LIST',
    subRight: `Issued ${formatIssuedStamp(params.issuedAt ?? new Date())}`,
  })

  // Header strip: which list, which day, how much to count.
  const units = listItems.reduce((sum, item) => sum + item.quantity, 0)
  const strip: StatCell[] = [
    {
      label: 'List',
      weight: 1.5,
      lines: [
        { text: list.name, bold: true, size: 13 },
        ...(department ? [{ text: `Department: ${department}` }] : []),
      ],
    },
  ]
  if (shootDay) {
    strip.push({
      label: 'Shoot date',
      weight: 1.2,
      lines: [
        { text: formatLongDate(shootDay.shootDate), bold: true, size: 11 },
        ...(day ? [{ text: day, bold: true, size: 14 }] : []),
      ],
    })
  }
  strip.push({
    label: 'Items',
    weight: 0.8,
    lines: [
      { text: String(listItems.length), bold: true, size: 20 },
      { text: `${units} ${units === 1 ? 'unit' : 'units'} in total` },
    ],
  })
  layout.statStrip(strip)

  const listNotes = present(list.notes)
  if (listNotes) {
    layout.sectionBar('Notes', 30)
    layout.gap(4)
    layout.blockGrid([[{ text: listNotes }]], 1)
  }

  layout.sectionBar('Equipment', 50)
  layout.gap(4)
  if (listItems.length === 0) {
    layout.text('No equipment on this list.', layout.xLeft, layout.y - 9, { color: COLOR_MUTED })
    layout.gap(18)
  } else {
    layout.table({
      columns: COLUMNS,
      rows: listItems.map((item) => equipmentListRow(item, equipmentById.get(item.equipment_id))),
      fontSize: TABLE_FONT,
    })
  }

  // Hand-written sign-off for the kit leaving and coming back.
  layout.sectionBar('Sign-off', 80)
  layout.gap(4)
  layout.writeInGrid(
    ['Checked out by', 'Date / time', 'Signature', 'Returned by', 'Date / time', 'Signature'],
    3
  )

  layout.applyFooters({
    left: [productionName, list.name, day].filter(Boolean).join(SEP),
  })
  return layout.doc.save()
}
