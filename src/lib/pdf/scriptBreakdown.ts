/**
 * Script breakdown PDFs, on the shared layout kit:
 *  - scene sheets: one page per scene, laid out like a paper breakdown sheet (header fields, then a box per
 *    category with its label on the category's highlight colour);
 *  - department list: every element by category with the scenes it is in, its status and a tick box, for
 *    handing to heads of department.
 * Read-only: renders data built by sceneSheet.ts / matching.ts.
 */
import { rgb } from 'pdf-lib'
import { BREAKDOWN_CATEGORIES } from '@/lib/breakdown/categories'
import { BREAKDOWN_STATUS_LABEL, type BreakdownStatus } from '@/lib/breakdown/matching'
import { formatSheetDate, type SceneSheet } from '@/lib/breakdown/sceneSheet'
import type { BreakdownCategory } from '@/lib/db/types'
import {
  COLOR_INK,
  COLOR_MUTED,
  DEFAULT_PAPER_SIZE,
  PdfLayout,
  formatIssuedStamp,
  type PaperSize,
  type PdfColor,
  type StatCell,
  type TableCell,
  type TextBlock,
} from '@/lib/pdf/layoutKit'

const SEP = ' | '
const EMPTY = '-'
const STATUS_COLOR: Record<BreakdownStatus, PdfColor> = {
  sourced: rgb(0.05, 0.45, 0.25),
  partial: rgb(0.62, 0.38, 0),
  needed: COLOR_INK,
}

export function hexToPdfColor(hex: string): PdfColor {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return COLOR_MUTED
  return rgb(parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255)
}

function value(text: string | null | undefined, size = 11): StatCell['lines'] {
  return [{ text: text?.trim() || EMPTY, bold: true, size }]
}

function sheetTitle(productionTitle: string): string {
  return `SCRIPT BREAKDOWN${SEP}${productionTitle}`
}

export interface SceneBreakdownPdfParams {
  sheets: SceneSheet[]
  paperSize?: PaperSize
  issuedAt?: Date
}

/** One page per scene. */
export async function generateSceneBreakdownPdf(params: SceneBreakdownPdfParams): Promise<Uint8Array> {
  const layout = await PdfLayout.create({ paper: params.paperSize ?? DEFAULT_PAPER_SIZE })
  const issued = `Issued ${formatIssuedStamp(params.issuedAt ?? new Date())}`
  let current: SceneSheet | null = null
  layout.onNewPage = (l) => {
    if (current) l.runningHeader(sheetTitle(current.header.productionTitle), `Scene ${current.header.sceneNumber} (continued)`)
  }

  params.sheets.forEach((sheet, index) => {
    const h = sheet.header
    if (index > 0) {
      current = null
      layout.addPage()
    }
    current = sheet
    layout.masthead({
      title: sheetTitle(h.productionTitle),
      right: `SCENE ${h.sceneNumber}`,
      subLeft: [
        `Scene ${h.sceneOrdinal} / ${h.sceneCount}`,
        formatSheetDate(h.breakdownDate) ? `Broken down ${formatSheetDate(h.breakdownDate)}` : null,
        [h.intExt, h.dayNight].filter(Boolean).join(' / ') || null,
      ]
        .filter(Boolean)
        .join(SEP),
      subRight: issued,
    })
    layout.statStrip([
      { label: 'Production no.', lines: value(h.productionCode) },
      { label: 'Production title', weight: 1.4, lines: value(h.productionTitle) },
      { label: 'Breakdown page no.', lines: value(String(h.breakdownPageNo)) },
    ])
    layout.statStrip([
      { label: 'Scene no.', lines: value(h.sceneNumber, 14) },
      { label: 'Scene name', weight: 1.4, lines: value(h.sceneName) },
      { label: 'Script page no.', lines: value(h.scriptPages) },
    ])
    layout.statStrip([
      { label: 'Description', weight: 2.4, lines: [{ text: h.description ?? EMPTY }] },
      { label: 'Page count', lines: value(h.pageCount) },
      { label: 'Location name', weight: 1.4, lines: value(h.locationName) },
    ])
    layout.gap(6)

    const cells: TextBlock[][] = sheet.categories.map((cat) => {
      const fill = hexToPdfColor(cat.colour)
      const head: TextBlock = { label: cat.label, labelFill: fill, labelColor: COLOR_INK, text: cat.items.length === 0 ? ' ' : '' }
      if (cat.items.length === 0) return [{ ...head, text: EMPTY, color: COLOR_MUTED }]
      const [first, ...rest] = cat.items.map<TextBlock>((item) => ({
        text: `${item.name}${item.occurrences > 1 ? ` x${item.occurrences}` : ''}${item.status === 'needed' ? '' : ` - ${BREAKDOWN_STATUS_LABEL[item.status]}`}`,
        color: STATUS_COLOR[item.status],
      }))
      return [{ ...head, ...first! }, ...rest]
    })
    layout.blockGrid(cells, 3, 92)
  })

  const first = params.sheets[0]
  layout.applyFooters({
    left: first ? [first.header.productionTitle, 'Script breakdown'].join(SEP) : 'Script breakdown',
  })
  return layout.doc.save()
}

export type BreakdownReportRow = {
  name: string
  /** Scene numbers the element is tagged in, in script order. */
  scenes: string[]
  status: BreakdownStatus
  detail: string
  notes: string | null
}

export interface BreakdownReportPdfParams {
  productionTitle: string
  /** Script version label, e.g. "Pink revision". */
  versionLabel?: string | null
  rowsByCategory: ReadonlyMap<BreakdownCategory, BreakdownReportRow[]>
  paperSize?: PaperSize
  issuedAt?: Date
}

/** Every element by category: the department list handed to heads of department. */
export async function generateBreakdownReportPdf(params: BreakdownReportPdfParams): Promise<Uint8Array> {
  const layout = await PdfLayout.create({ paper: params.paperSize ?? DEFAULT_PAPER_SIZE })
  layout.onNewPage = (l) => l.runningHeader(sheetTitle(params.productionTitle), 'Department list')
  layout.masthead({
    title: sheetTitle(params.productionTitle),
    right: 'DEPARTMENT LIST',
    subLeft: params.versionLabel ? `Script: ${params.versionLabel}` : null,
    subRight: `Issued ${formatIssuedStamp(params.issuedAt ?? new Date())}`,
  })

  let any = false
  for (const info of BREAKDOWN_CATEGORIES) {
    const rows = params.rowsByCategory.get(info.key) ?? []
    if (rows.length === 0) continue
    any = true
    const sourced = rows.filter((r) => r.status === 'sourced').length
    layout.sectionBar(`${info.label} (${sourced}/${rows.length} sourced)`, 40)
    layout.page.drawRectangle({ x: layout.xLeft, y: layout.y, width: 5, height: 15, color: hexToPdfColor(info.colour) })
    layout.gap(3)
    layout.table({
      columns: [
        { header: 'Done', weight: 30, align: 'center' },
        { header: 'Element', weight: 150 },
        { header: 'Scenes', weight: 90 },
        { header: 'Status', weight: 120 },
        { header: 'Notes', weight: 145 },
      ],
      rows: rows.map((r): TableCell[] => [
        { checkbox: true },
        { text: r.name, bold: true },
        r.scenes.join(', ') || EMPTY,
        { text: r.detail ? `${BREAKDOWN_STATUS_LABEL[r.status]}: ${r.detail}` : BREAKDOWN_STATUS_LABEL[r.status], color: STATUS_COLOR[r.status] },
        r.notes?.trim() || { text: EMPTY, color: COLOR_MUTED },
      ]),
      fontSize: 8,
    })
  }
  if (!any) {
    layout.text('Nothing has been tagged in this script yet.', layout.xLeft, layout.y - 9, { color: COLOR_MUTED })
  }
  layout.applyFooters({ left: [params.productionTitle, 'Script breakdown department list'].join(SEP) })
  return layout.doc.save()
}
