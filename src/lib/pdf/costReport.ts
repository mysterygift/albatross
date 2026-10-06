import { rgb } from 'pdf-lib'
import {
  COLOR_ALERT,
  COLOR_HEADER_FILL,
  COLOR_INK,
  COLOR_MUTED,
  COLOR_ROW_RULE,
  DEFAULT_PAPER_SIZE,
  PdfLayout,
  formatIssuedStamp,
  type PaperSize,
  type PdfColor,
  type StatCell,
  type TableCell,
} from '@/lib/pdf/layoutKit'

const SEP = ' | '
/** Shown where an amount does not apply, so a gap reads as a gap rather than a layout error. */
const EMPTY_CELL = '-'

export type CostReportLayoutKind = 'chart' | 'groups'

/** One ledger line: an account, an expanded line item under it, or a closing total. */
export interface CostReportRow {
  kind: 'account' | 'lineItem' | 'total'
  code: string
  name: string
  /** Nesting depth in the chart of accounts; indents the name. */
  depth: number
  /** Header (non-postable) account: bold and tinted. */
  isRollup: boolean
  archived: boolean
  /** 6-digit hex band colour for the left bar and rollup tint. */
  bandHex: string | null
  /** Muted note after the name, e.g. `3 line items`. */
  detail: string | null
  budget: number | null
  actual: number | null
  variance: number | null
  /** 0-1; shown as a whole percentage. */
  percentSpent: number | null
}

export interface CostReportSection {
  /** Section bar above the ledger, kept on the same page as its first rows. */
  title: string
  rows: CostReportRow[]
}

export interface CostReportAmountRow {
  name: string
  budget: number
  actual: number
  variance: number
}

export interface CostReportTaxCredits {
  schemes: Array<{ name: string; qualifyingSpend: number; creditAmount: number }>
  warnings: string[]
  totalQualifyingSpend: number
  totalTaxCredits: number
  netCostAfterCredits: number
}

export interface CostReportVatReclaim {
  paid: number
  reclaimable: number
  reclaimed: number
  outstanding: number
}

export interface CostReportData {
  productionName: string
  /** e.g. `Revision 2 | Live`. */
  revisionLabel: string | null
  /** ISO instant; shown as the issue stamp. */
  generatedAt: string
  layout: CostReportLayoutKind
  /** Currency code the amounts are shown in. */
  currency: string
  openAllowCount: number
  totalEstimated: number
  totalActual: number
  variance: number
  uncodedTotal: number
  sections: CostReportSection[]
  /** Shown when `sections` has nothing to list. */
  emptyMessage: string
  subtotals: CostReportAmountRow[]
  subtotalBeforeDerived: CostReportAmountRow | null
  derived: { fringes: number; contingency: number }
  taxCredits: CostReportTaxCredits | null
  vatReclaim: CostReportVatReclaim | null
  totals: {
    budgetInclDerived: number
    actual: number
    variance: number
    netCostAfterCredits: number | null
    totalVat: number | null
  }
}

export interface CostReportPdfOptions {
  paperSize?: PaperSize
  /** Formats an amount in the report currency (symbol, grouping, decimals). */
  formatAmount: (amount: number) => string
}

// ---------------------------------------------------------------------------
// Text and colour helpers
// ---------------------------------------------------------------------------

/**
 * Standard PDF fonts cannot draw the euro sign through `textForPdf`, and some locales use thin
 * spaces or a true minus in grouped amounts; normalise so no amount loses a character.
 */
function pdfMoney(text: string): string {
  return text
    .replace(/[\u202F\u2007\u2009]/g, ' ')
    .replace(/\u2212/g, '-')
    .replace(/\u20AC\s*/g, 'EUR ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex)
  if (!m) return null
  return [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255]
}

/** `hex` blended over white at `alpha`, so a band colour can tint a row without hiding text. */
function tint(hex: string | null, alpha: number): PdfColor | null {
  const parsed = hex ? hexToRgb(hex) : null
  if (!parsed) return null
  const [r, g, b] = parsed.map((c) => 1 - (1 - c) * alpha) as [number, number, number]
  return rgb(r, g, b)
}

const COLOR_LINE_ITEM_FILL = rgb(0.975, 0.975, 0.975)

// ---------------------------------------------------------------------------
// Ledger table
// ---------------------------------------------------------------------------

const LEDGER_SIZE = 8.5
const LEDGER_PAD_X = 5
const LEDGER_PAD_Y = 3
const BAND_WIDTH = 2.5
const INDENT_PER_DEPTH = 8
/** Code | Account | Budget | Actual | Variance | % */
const LEDGER_WEIGHTS = [9, 37, 17, 17, 17, 7]
const LEDGER_HEADERS = ['Code', 'Account', 'Budget', 'Actual', 'Variance', '%']

interface MeasuredRow {
  row: CostReportRow
  nameLines: string[]
  /** `detail` did not fit after the last name line, so it takes a line of its own. */
  detailOwnLine: boolean
  height: number
  /** Must share a page with the row after it (a rollup with its first child, a row with its total). */
  keepWithNext: boolean
}

function percentText(value: number | null): string {
  return value != null ? `${Math.round(value * 100)}%` : EMPTY_CELL
}

function ledgerTable(
  layout: PdfLayout,
  rows: CostReportRow[],
  money: (n: number) => string,
  sectionTitle: string
): void {
  const totalWeight = LEDGER_WEIGHTS.reduce((a, b) => a + b, 0)
  const widths = LEDGER_WEIGHTS.map((w) => (w / totalWeight) * layout.contentWidth)
  const colX = widths.map((_, i) => layout.xLeft + widths.slice(0, i).reduce((a, b) => a + b, 0))
  const lineH = layout.lineHeight(LEDGER_SIZE)
  const headerH = lineH + LEDGER_PAD_Y * 2

  const measure = (row: CostReportRow, next: CostReportRow | undefined): MeasuredRow => {
    const bold = row.isRollup || row.kind === 'total'
    const indent = row.kind === 'total' ? 0 : (row.depth + (row.kind === 'lineItem' ? 1 : 0)) * INDENT_PER_DEPTH
    const maxW = widths[1]! - LEDGER_PAD_X * 2 - indent
    const nameLines = layout.wrap(row.name, maxW, LEDGER_SIZE, bold)
    if (nameLines.length === 0) nameLines.push('')
    let detailOwnLine = false
    if (row.detail) {
      const last = nameLines[nameLines.length - 1]!
      const used = layout.textWidth(last, LEDGER_SIZE, bold) + layout.textWidth(` ${row.detail}`, LEDGER_SIZE)
      detailOwnLine = used > maxW
    }
    const lines = nameLines.length + (detailOwnLine ? 1 : 0)
    return {
      row,
      nameLines,
      detailOwnLine,
      height: lines * lineH + LEDGER_PAD_Y * 2,
      keepWithNext: next != null && (row.isRollup || next.kind === 'total'),
    }
  }
  const measured = rows.map((row, i) => measure(row, rows[i + 1]))

  const needFor = (index: number): number => {
    const m = measured[index]!
    return m.height + (m.keepWithNext ? (measured[index + 1]?.height ?? 0) : 0)
  }

  const drawHeader = () => {
    layout.page.drawRectangle({
      x: layout.xLeft,
      y: layout.y - headerH,
      width: layout.contentWidth,
      height: headerH,
      color: COLOR_HEADER_FILL,
    })
    const baseline = layout.y - LEDGER_PAD_Y - LEDGER_SIZE * 1.05
    LEDGER_HEADERS.forEach((header, i) => {
      const right = i >= 2
      const x = right
        ? colX[i]! + widths[i]! - LEDGER_PAD_X - layout.textWidth(header, LEDGER_SIZE, true)
        : colX[i]! + LEDGER_PAD_X
      layout.text(header, x, baseline, { size: LEDGER_SIZE, bold: true })
    })
    layout.y -= headerH
  }

  const drawRow = (m: MeasuredRow) => {
    const { row } = m
    const bold = row.isRollup || row.kind === 'total'
    const textColor = row.archived || row.kind === 'lineItem' ? COLOR_MUTED : COLOR_INK
    const top = layout.y
    const fill =
      row.kind === 'total'
        ? COLOR_HEADER_FILL
        : row.kind === 'lineItem'
          ? COLOR_LINE_ITEM_FILL
          : row.isRollup
            ? tint(row.bandHex, row.archived ? 0.08 : 0.16)
            : null
    if (fill) {
      layout.page.drawRectangle({
        x: layout.xLeft,
        y: top - m.height,
        width: layout.contentWidth,
        height: m.height,
        color: fill,
      })
    }
    if (row.kind === 'account') {
      const band = tint(row.bandHex, row.archived ? 0.4 : 0.85)
      if (band) {
        layout.page.drawRectangle({
          x: layout.xLeft,
          y: top - m.height,
          width: BAND_WIDTH,
          height: m.height,
          color: band,
        })
      }
    }

    const baseline = (n: number) => top - LEDGER_PAD_Y - LEDGER_SIZE * 1.05 - n * lineH
    if (row.code) {
      // Accounts sit clear of their band bar.
      const codeX = colX[0]! + LEDGER_PAD_X + (row.kind === 'account' ? BAND_WIDTH : 0)
      layout.text(row.code, codeX, baseline(0), { size: LEDGER_SIZE, bold, color: textColor })
    }
    const indent = row.kind === 'total' ? 0 : (row.depth + (row.kind === 'lineItem' ? 1 : 0)) * INDENT_PER_DEPTH
    const nameX = colX[1]! + LEDGER_PAD_X + indent
    m.nameLines.forEach((line, n) => {
      layout.text(line, nameX, baseline(n), { size: LEDGER_SIZE, bold, color: textColor })
    })
    if (row.detail) {
      const last = m.nameLines.length - 1
      const detailX = m.detailOwnLine
        ? nameX
        : nameX + layout.textWidth(`${m.nameLines[last]!} `, LEDGER_SIZE, bold)
      layout.text(row.detail, detailX, baseline(m.detailOwnLine ? m.nameLines.length : last), {
        size: LEDGER_SIZE,
        color: COLOR_MUTED,
      })
    }

    // A line item only has an estimate, so its other cells stay blank rather than showing dashes.
    const blank = row.kind === 'lineItem' ? '' : EMPTY_CELL
    const amounts: Array<{ text: string; color: PdfColor }> = [
      { text: row.budget != null ? money(row.budget) : blank, color: textColor },
      { text: row.actual != null ? money(row.actual) : blank, color: textColor },
      {
        text: row.variance != null ? money(row.variance) : '',
        color: row.variance != null && row.variance < 0 ? COLOR_ALERT : textColor,
      },
      { text: row.kind === 'lineItem' ? '' : percentText(row.percentSpent), color: textColor },
    ]
    amounts.forEach((cell, i) => {
      if (!cell.text) return
      const col = i + 2
      layout.text(
        cell.text,
        colX[col]! + widths[col]! - LEDGER_PAD_X - layout.textWidth(cell.text, LEDGER_SIZE, bold),
        baseline(0),
        { size: LEDGER_SIZE, bold, color: cell.color }
      )
    })

    layout.page.drawRectangle({
      x: layout.xLeft,
      y: top - m.height,
      width: layout.contentWidth,
      height: row.kind === 'total' ? 0.9 : 0.6,
      color: row.kind === 'total' ? COLOR_MUTED : COLOR_ROW_RULE,
    })
    layout.y -= m.height
  }

  if (measured.length === 0) return
  layout.sectionBar(sectionTitle, headerH + needFor(0))
  drawHeader()
  measured.forEach((m, i) => {
    if (layout.y - needFor(i) < layout.yMin) {
      layout.addPage()
      drawHeader()
    }
    drawRow(m)
  })
  layout.gap(4)
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export async function generateCostReportPDF(
  data: CostReportData,
  options: CostReportPdfOptions
): Promise<Uint8Array> {
  const layout = await PdfLayout.create({ paper: options.paperSize ?? DEFAULT_PAPER_SIZE })
  const money = (n: number) => pdfMoney(options.formatAmount(n))
  const alertIfNegative = (n: number): PdfColor | undefined => (n < 0 ? COLOR_ALERT : undefined)
  const amountCell = (n: number, bold = false): TableCell => ({ text: money(n), bold, color: alertIfNegative(n) })

  const generated = new Date(data.generatedAt)
  const stamp = `Generated ${formatIssuedStamp(Number.isNaN(generated.getTime()) ? new Date() : generated)}`

  layout.onNewPage = (l) => {
    l.runningHeader(['COST REPORT', data.revisionLabel].filter(Boolean).join(SEP), data.productionName)
  }

  layout.masthead({
    title: data.productionName || 'Cost Report',
    right: 'COST REPORT',
    subLeft: [
      data.revisionLabel,
      data.layout === 'groups' ? 'By groups' : 'Chart of accounts',
      `Amounts in ${data.currency}`,
    ]
      .filter(Boolean)
      .join(SEP),
    subRight: stamp,
  })

  // Header strip: the three headline numbers, plus open allows when there are any.
  const strip: StatCell[] = [
    { label: 'Total estimated', lines: [{ text: money(data.totalEstimated), bold: true, size: 14 }] },
    {
      label: 'Total actual',
      lines: [
        { text: money(data.totalActual), bold: true, size: 14 },
        ...(data.uncodedTotal > 0 ? [{ text: `Uncoded spend ${money(data.uncodedTotal)}` }] : []),
      ],
    },
    { label: 'Variance', lines: [{ text: money(data.variance), bold: true, size: 14 }] },
  ]
  if (data.openAllowCount > 0) {
    strip.push({
      label: 'Open allows',
      weight: 0.6,
      lines: [{ text: String(data.openAllowCount), bold: true, size: 14 }],
    })
  }
  layout.statStrip(strip)

  // Ledger: one chart of accounts, or one block per cost report group.
  const hasRows = data.sections.some((s) => s.rows.length > 0)
  if (!hasRows) {
    layout.sectionBar(data.layout === 'groups' ? 'Groups' : 'Chart of accounts', 30)
    layout.blockGrid([[{ text: data.emptyMessage, color: COLOR_MUTED }]], 1)
  } else {
    for (const section of data.sections) {
      ledgerTable(layout, section.rows, money, section.title)
    }
  }

  // Subtotals.
  if (data.subtotals.length > 0 || data.subtotalBeforeDerived) {
    layout.sectionBar('Subtotals', 50)
    const rows: TableCell[][] = data.subtotals.map((t) => [
      t.name,
      money(t.budget),
      money(t.actual),
      amountCell(t.variance),
    ])
    if (data.subtotalBeforeDerived) {
      const s = data.subtotalBeforeDerived
      rows.push([
        { text: s.name, bold: true },
        { text: money(s.budget), bold: true },
        { text: money(s.actual), bold: true },
        amountCell(s.variance, true),
      ])
    }
    layout.table({
      columns: [
        { header: 'Subtotal', weight: 43 },
        { header: 'Budget', weight: 19, align: 'right' },
        { header: 'Actual', weight: 19, align: 'right' },
        { header: 'Variance', weight: 19, align: 'right' },
      ],
      rows,
    })
  }

  // Derived budget overlays.
  const derivedRows: TableCell[][] = []
  if (data.derived.fringes > 0) derivedRows.push(['Fringes (derived)', money(data.derived.fringes)])
  if (data.derived.contingency > 0) derivedRows.push(['Contingency (derived)', money(data.derived.contingency)])
  if (derivedRows.length > 0) {
    layout.sectionBar('Derived (budget overlays)', 50)
    layout.table({
      columns: [
        { header: 'Overlay', weight: 70 },
        { header: 'Amount', weight: 30, align: 'right' },
      ],
      rows: derivedRows,
    })
  }

  // Tax credits and relief.
  if (data.taxCredits) {
    const tax = data.taxCredits
    layout.sectionBar('Tax credits & relief', 80)
    if (tax.schemes.length > 0) {
      layout.table({
        columns: [
          { header: 'Scheme', weight: 50 },
          { header: 'Qualifying spend', weight: 25, align: 'right' },
          { header: 'Credit', weight: 25, align: 'right' },
        ],
        rows: tax.schemes.map((s) => [s.name, money(s.qualifyingSpend), money(s.creditAmount)]),
      })
    }
    layout.statStrip([
      { label: 'Qualifying spend', lines: [{ text: money(tax.totalQualifyingSpend), bold: true, size: 12 }] },
      { label: 'Tax credits', lines: [{ text: money(tax.totalTaxCredits), bold: true, size: 12 }] },
      { label: 'Net cost after credits', lines: [{ text: money(tax.netCostAfterCredits), bold: true, size: 12 }] },
    ])
    if (tax.warnings.length > 0) {
      layout.gap(4)
      layout.blockGrid(
        tax.warnings.map((w) => [{ label: 'Warning', labelColor: COLOR_ALERT, text: w }]),
        1
      )
    }
  }

  // VAT reclaim.
  if (data.vatReclaim) {
    const vat = data.vatReclaim
    layout.sectionBar('VAT reclaim', 50)
    layout.statStrip([
      { label: 'VAT paid', lines: [{ text: money(vat.paid), bold: true, size: 12 }] },
      { label: 'VAT reclaimable', lines: [{ text: money(vat.reclaimable), bold: true, size: 12 }] },
      { label: 'VAT reclaimed', lines: [{ text: money(vat.reclaimed), bold: true, size: 12 }] },
      { label: 'Outstanding', lines: [{ text: money(vat.outstanding), bold: true, size: 12 }] },
    ])
  }

  // Final totals.
  const totalRows: TableCell[][] = [
    [{ text: 'Total budget incl. derived', bold: true }, { text: money(data.totals.budgetInclDerived), bold: true }],
    ['Total actual (expenses only)', money(data.totals.actual)],
  ]
  if (data.totals.netCostAfterCredits != null) {
    totalRows.push(['Net cost after tax credits', money(data.totals.netCostAfterCredits)])
  }
  if (data.totals.totalVat != null) {
    totalRows.push(['Total VAT (informational)', money(data.totals.totalVat)])
  }
  totalRows.push([
    { text: 'Variance vs estimated', bold: true },
    amountCell(data.totals.variance, true),
  ])
  layout.sectionBar('Totals', 70)
  layout.table({
    columns: [
      { header: 'Summary', weight: 70 },
      { header: 'Amount', weight: 30, align: 'right' },
    ],
    rows: totalRows,
  })

  layout.applyFooters({
    left: `${data.productionName || 'Cost report'}. CONFIDENTIAL - DO NOT SHARE.`,
  })
  return layout.doc.save()
}
