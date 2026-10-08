/**
 * Shooting schedule PDF: the stripboard as a printable schedule, one section per shoot day + unit.
 * Columns and row text match the call sheet's shooting schedule (`buildMainScheduleColumns`,
 * `scheduleStripCells`); banner strips (call, lunch, move, note, wrap) span the table on a grey fill.
 */
import {
  isSpecialScheduleStrip,
  scheduleStripCells,
  specialScheduleSetLine,
} from '@/lib/call-sheets/scheduleStripRow'
import type { CallSheetStrip } from '@/lib/pdf/callSheet'
import { buildMainScheduleColumns, type MainScheduleColKey } from '@/lib/pdf/callSheetScheduleColumns'
import {
  COLOR_MUTED,
  COLOR_SECTION_FILL,
  DEFAULT_PAPER_SIZE,
  PdfLayout,
  formatIssuedStamp,
  formatLongDate,
  type PaperSize,
  type TableCell,
  type TableColumn,
  type TableRow,
} from '@/lib/pdf/layoutKit'
import type { ShootingScheduleData, ShootingScheduleSection } from '@/lib/schedule/shootingScheduleExport'

const SEP = ' | '
const TABLE_FONT = 7

export interface ShootingSchedulePdfOptions {
  paperSize?: PaperSize
  /** Issue stamp; defaults to now. */
  issuedAt?: Date
}

function dayLabel(section: ShootingScheduleSection, totalDays: number | null): string | null {
  if (section.dayNumber == null) return null
  return totalDays != null && totalDays >= section.dayNumber
    ? `Day ${section.dayNumber} of ${totalDays}`
    : `Day ${section.dayNumber}`
}

/** Section heading, e.g. `Day 3 of 20 | Wednesday, 14 October 2026 | Second Unit`. */
export function shootingScheduleSectionTitle(section: ShootingScheduleSection, totalDays: number | null): string {
  return [dayLabel(section, totalDays), formatLongDate(section.shootDate), section.unitName]
    .filter(Boolean)
    .join(SEP)
}

function stripRow(strip: CallSheetStrip, keys: MainScheduleColKey[]): TableRow {
  if (isSpecialScheduleStrip(strip.strip_type)) {
    return { span: specialScheduleSetLine(strip), bold: true, fill: COLOR_SECTION_FILL }
  }
  const c = scheduleStripCells(strip)
  return keys.map((key): TableCell => {
    if (key === 'synopsis') return { text: c.setHeading, bold: true, detail: c.setDetail ?? undefined }
    if (key === 'scsh') return { text: c.scsh, bold: true }
    return c[key]
  })
}

/** Rows in strip order, with IF TIME PERMITS strips grouped after a banner, as on the call sheet. */
function sectionRows(section: ShootingScheduleSection, keys: MainScheduleColKey[]): TableRow[] {
  const primary = section.rows.filter((s) => !s.ifTimePermits)
  const itp = section.rows.filter((s) => s.ifTimePermits)
  const rows = primary.map((s) => stripRow(s, keys))
  if (itp.length > 0) {
    rows.push({ span: 'IF TIME PERMITS', bold: true })
    rows.push(...itp.map((s) => stripRow(s, keys)))
  }
  return rows
}

export async function generateShootingSchedulePdf(
  data: ShootingScheduleData,
  options: ShootingSchedulePdfOptions = {}
): Promise<Uint8Array> {
  const layout = await PdfLayout.create({ paper: options.paperSize ?? DEFAULT_PAPER_SIZE })
  const showTime = data.sections.some((section) => section.rows.some((s) => !!s.estTime?.trim()))
  const scheduleColumns = buildMainScheduleColumns(
    { includeEpisodesInSchedule: data.includeEpisodes, showTime },
    layout.contentWidth
  )
  const columns: TableColumn[] = scheduleColumns.map((c) => ({ header: c.label, weight: c.w }))
  const keys = scheduleColumns.map((c) => c.key)

  let current: ShootingScheduleSection | null = null
  layout.onNewPage = (l) => {
    l.runningHeader(
      ['SHOOTING SCHEDULE', data.scopeLabel].join(SEP),
      current ? `${shootingScheduleSectionTitle(current, data.totalShootDays)} (cont'd)` : data.productionName
    )
  }

  layout.masthead({
    title: data.productionName,
    right: 'SHOOTING SCHEDULE',
    subLeft: data.scopeLabel,
    subRight: `Issued ${formatIssuedStamp(options.issuedAt ?? new Date())}`,
  })

  if (data.sections.length === 0) {
    layout.gap(12)
    layout.text('Nothing is scheduled for this selection yet.', layout.xLeft, layout.y - 9, { color: COLOR_MUTED })
    layout.gap(20)
  }

  for (const section of data.sections) {
    current = section
    layout.sectionBar(shootingScheduleSectionTitle(section, data.totalShootDays), 50)
    layout.table({ columns, rows: sectionRows(section, keys), fontSize: TABLE_FONT })
    if (section.totalsLine) {
      layout.ensureSpace(14)
      layout.textRight(section.totalsLine, layout.y - 8, layout.xRight, { size: 8, color: COLOR_MUTED })
      layout.gap(14)
    }
  }

  layout.applyFooters({ left: [data.productionName, 'Shooting schedule', data.scopeLabel].join(SEP) })
  return layout.doc.save()
}
