/**
 * Call sheet PDF: industry-standard film / HETV layout (A4 by default, Letter optional).
 * Uses pdf-lib.
 *
 * Page 1, top to bottom: title bar (production, unit, revision / issue stamp) → header strip
 * (date + day X of Y | crew call, meals, wrap | weather, sunrise/sunset) → key contacts →
 * locations + safety / nearest A&E → shooting schedule → principal cast → notes.
 * Later pages: departmental crew (two columns), health, safety & stunts, catering, radio, transport,
 * advanced schedule. Every continuation page repeats a compact running header; every page carries a
 * footer with the issue stamp and "Page X of Y".
 *
 * Nothing is silently truncated: cells wrap and rows grow instead.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { textForPdf, wrapLines, embedStandardFont } from '@/lib/pdf/layoutKit'
import type { CallSheetCastRow } from '@/lib/call-sheets/castRequirements'
import type { CallSheetCrewGroup, CallSheetCrewRow } from '@/lib/call-sheets/crewRequirements'
import { primaryContactShowsEmail } from '@/lib/call-sheets/primaryContacts'
import { formatCallSheetSynopsis, formatScheduleDnColumn } from '@/lib/call-sheets/scheduleStripRow'
import {
  buildMainScheduleColumns,
  buildAdvancedScheduleColumns,
  type AdvancedScheduleColDef,
  type MainScheduleColDef,
} from '@/lib/pdf/callSheetScheduleColumns'

export interface CallSheetStrip {
  strip_type: 'SCENE' | 'SHOT' | 'MOVE' | 'CALL' | 'LUNCH' | 'WRAP' | 'NOTE'
  scene_number?: string | null
  scene_heading?: string | null
  scene_title?: string | null
  scene_description?: string | null
  int_ext?: string | null
  day_night?: string | null
  page_eighths?: number | null
  shot_number?: string | null
  /** Shot list description; shown under scene title in SET / DESCRIPTION for SHOT rows. */
  shot_description?: string | null
  title?: string | null
  description?: string | null
  /** Location shorthand for LOC column; omit when locDitto. */
  locLabel?: string | null
  /** Same location as previous scene/shot row. */
  locDitto?: boolean
  castCompact?: string | null
  rowNotes?: string | null
  /** Derived from NOTE text / color_tag in stripboard; used for IF TIME PERMITS grouping. */
  ifTimePermits?: boolean
  /** Episode display for EP column; from scene episode when strip is SCENE/SHOT. */
  episodeLabel?: string | null
  /** Estimated time for the TIME column; the column only appears when at least one row has it. */
  estTime?: string | null
}

/** Next-day preview block for ADVANCED SCHEDULE (assembled from shoot_days + strips). */
export interface CallSheetAdvancedDay {
  shootDate: string
  dayNumber: number | null
  callTime: string | null
  parkingBaseAddress: string | null
  /** Short summary of location names for scheduled scenes (comma-separated). */
  locationSummary: string | null
  strips: CallSheetStrip[]
}

export interface CallSheetKeyContact {
  department: string
  name: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

export interface CallSheetLocation {
  name: string
  address: string | null
  what3words: string | null
  notes: string | null
}

/** Radio channel line when supplied by assembly; omitted from PDF when absent or empty. */
export interface CallSheetRadioChannel {
  channel: string
  purpose: string
}

/** Transport / movement row when supplied by assembly; omitted from PDF when absent or empty. */
export interface CallSheetTransportRow {
  driver?: string | null
  pickupTime?: string | null
  passenger?: string | null
  from?: string | null
  to?: string | null
  arrival?: string | null
}

/** Optional fields parsed from shoot_days.weather_json when present (no fabricated keys). */
export interface CallSheetWeatherStored {
  summary?: string | null
  high?: string | null
  low?: string | null
  wind?: string | null
  sunrise?: string | null
  sunset?: string | null
  tide?: string | null
}

export type CallSheetPaperSize = 'A4' | 'Letter'

export interface CallSheetData {
  productionName: string
  shootDate: string
  unitName: string
  dayNumber: number | null
  /** Total shoot days in the production; with `dayNumber` renders "Day X of Y". */
  totalDays?: number | null
  /** Draft / revision label (e.g. "Draft 2", "Rev B"); shown beside the issue stamp when set. */
  revisionLabel?: string | null
  /** Issue time shown in the title bar and footer; defaults to generation time. */
  issuedAt?: Date | string | null
  /** Defaults to A4. */
  paperSize?: CallSheetPaperSize
  callTime: string | null
  wrapTime: string | null
  dayNotes: string | null
  unitNotes: string | null
  keyContacts: CallSheetKeyContact[]
  /** AD / coordinator / office contacts for the top of page 1 only. */
  primaryContactsTop?: CallSheetKeyContact[]
  hospitalName: string | null
  hospitalAddress: string | null
  hospitalPhone?: string | null
  policeStationName: string | null
  policeStationAddress: string | null
  policeStationPhone?: string | null
  weatherSummary: string | null
  /** shoot_days.weather_manual */
  weatherManual?: string | null
  /** Live/API or manual; PDF falls back to `weatherStored.sunrise` when unset. */
  weatherSunrise: string | null
  /** Live/API or manual; PDF falls back to `weatherStored.sunset` when unset. */
  weatherSunset: string | null
  /** Parsed optional keys from shoot_days.weather_json. */
  weatherStored?: CallSheetWeatherStored | null
  parkingBaseAddress: string | null
  mealTimes: Array<{ name: string; time: string }>
  specialNotes: string | null
  schedule: CallSheetStrip[]
  castCalled: string[]
  castCalledRows?: CallSheetCastRow[]
  /** Booked crew grouped by canonical crew department (C1), HOD first. */
  crewGroups: CallSheetCrewGroup[]
  /** Optional department → call time, shown in each department's header bar. */
  crewCallTimes?: Record<string, string>
  locations: CallSheetLocation[]
  /** Background / supporting artists briefing; drawn under the cast when set. */
  backgroundNotes?: string | null
  /** Per-department special requirements (props, vehicles, animals, SFX, art); drawn when non-empty. */
  specialRequirements?: Array<{ department: string; text: string }>
  /** When set and non-empty, drawn as the radio channels table. */
  radioChannels?: CallSheetRadioChannel[]
  /** When set and non-empty, drawn as the transport table. */
  transportRows?: CallSheetTransportRow[]
  /** Upcoming shoot days (1–2) after `shootDate`, same unit when possible. */
  advancedScheduleDays?: CallSheetAdvancedDay[]
  /** From production; drives episodic masthead / schedule column behavior. */
  isEpisodicProduction?: boolean
  /** When true with episodic production, EP column is shown in schedule tables. */
  includeEpisodesInSchedule?: boolean
  /** Episodic only: shoot day bloc display name, or null to omit the title-bar line. */
  shootingBlocMastheadLabel?: string | null
}

// ---------- Page geometry & typography ----------
const PAPER: Record<CallSheetPaperSize, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
}
let PAGE_WIDTH = PAPER.A4[0]
let PAGE_HEIGHT = PAPER.A4[1]
const MARGIN = 36
/** Lowest y that body content may reach; the footer band sits below it. */
const Y_MIN = 52

function setPaper(size: CallSheetPaperSize | undefined): void {
  const [w, h] = PAPER[size ?? 'A4']
  PAGE_WIDTH = w
  PAGE_HEIGHT = h
}
const contentW = (): number => PAGE_WIDTH - 2 * MARGIN

const FS_TITLE = 15
const FS_BODY = 8
const FS_SMALL = 7
const FS_LABEL = 6.5
const FS_HEAD = 8
const FS_SCHED = 7
const FS_CAST = 7.5
const BOX_PAD = 4
const BAR_H = 13
const SECTION_GAP = 8
/** ASCII ditto: Unicode U+3003 is not encodable in pdf-lib StandardFonts (WinAnsi). */
const DITTO_MARK = '"'
const GRAY = rgb(0.45, 0.45, 0.45)
const BLACK = rgb(0, 0, 0)
const RULE_LIGHT = rgb(0.8, 0.8, 0.8)
const BORDER = rgb(0.35, 0.35, 0.35)
const FILL_BAR = rgb(0.88, 0.88, 0.88)
const FILL_SPECIAL = rgb(0.93, 0.93, 0.93)
const ALERT = rgb(0.7, 0, 0)

type Page = ReturnType<PDFDocument['getPages']>[0]
type PdfFont = Awaited<ReturnType<PDFDocument['embedFont']>>
type Rgb = ReturnType<typeof rgb>

interface Ctx {
  doc: PDFDocument
  font: PdfFont
  bold: PdfFont
  data: CallSheetData
  page: Page
  /** Current top-of-free-space y (PDF origin is bottom-left). */
  y: number
}

export { textForPdf }

/** Extract optional string fields from stored weather JSON (only keys that exist). */
export function parseCallSheetWeatherJson(raw: string | null): CallSheetWeatherStored | null {
  if (!raw?.trim()) return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const pick = (k: string): string | null => {
      const v = o[k]
      if (v == null) return null
      if (typeof v === 'string' && v.trim()) return v
      if (typeof v === 'number' && Number.isFinite(v)) return String(v)
      return null
    }
    const out: CallSheetWeatherStored = {}
    for (const k of ['summary', 'high', 'low', 'wind', 'sunrise', 'sunset', 'tide'] as const) {
      const s = pick(k)
      if (s) out[k] = s
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

// ---------- Formatting ----------
function formatShootDate(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  // Date-only ISO strings parse as UTC midnight; format in UTC so the day never shifts.
  return new Date(t).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function formatIssueStamp(issuedAt: Date | string | null | undefined): string {
  const d = issuedAt instanceof Date ? issuedAt : issuedAt ? new Date(issuedAt) : new Date()
  const when = Number.isNaN(d.getTime()) ? new Date() : d
  return when
    .toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '')
}

function dayLabel(data: Pick<CallSheetData, 'dayNumber' | 'totalDays'>): string | null {
  if (data.dayNumber == null) return null
  const total = data.totalDays
  return total != null && total >= data.dayNumber
    ? `Day ${data.dayNumber} of ${total}`
    : `Day ${data.dayNumber}`
}

function joinBar(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p && p.trim() !== '').join(' | ')
}

function mealTimeByPattern(meals: Array<{ name: string; time: string }>, re: RegExp): string | null {
  const m = meals.find((x) => re.test(x.name.trim().toLowerCase()))
  return m?.time?.trim() ? m.time : null
}

// ---------- Text primitives ----------
function txt(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  opts: { bold?: boolean; color?: Rgb } = {},
): void {
  ctx.page.drawText(textForPdf(text), {
    x,
    y,
    size,
    font: opts.bold ? ctx.bold : ctx.font,
    color: opts.color ?? BLACK,
  })
}

function txtRight(
  ctx: Ctx,
  text: string,
  xRight: number,
  y: number,
  size: number,
  opts: { bold?: boolean; color?: Rgb } = {},
): void {
  const safe = textForPdf(text)
  const w = (opts.bold ? ctx.bold : ctx.font).widthOfTextAtSize(safe, size)
  txt(ctx, safe, Math.max(MARGIN, xRight - w), y, size, opts)
}

function rule(ctx: Ctx, y: number, x0: number, x1: number, color: Rgb = GRAY, thickness = 0.5): void {
  ctx.page.drawRectangle({ x: x0, y: y - thickness / 2, width: x1 - x0, height: thickness, color })
}

function fillRect(ctx: Ctx, x: number, yBottom: number, w: number, h: number, color: Rgb): void {
  ctx.page.drawRectangle({ x, y: yBottom, width: w, height: h, color })
}

// ---------- Page flow ----------
function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  ctx.y = PAGE_HEIGHT - MARGIN
  drawRunningHeader(ctx)
}

/** Starts a new page (with running header) when `h` points will not fit. Returns true if it did. */
function ensure(ctx: Ctx, h: number): boolean {
  if (ctx.y - h >= Y_MIN) return false
  newPage(ctx)
  return true
}

/** Compact header for every continuation page; page 1 uses the full title block instead. */
function drawRunningHeader(ctx: Ctx): void {
  const { data } = ctx
  const label = "CALL SHEET (cont'd)"
  const labelW = ctx.bold.widthOfTextAtSize(label, 9)
  const nameLines = wrapLines(data.productionName, contentW() - labelW - 12, ctx.bold, 9)
  const lines = nameLines.length ? nameLines : ['']
  const top = ctx.y - 9
  lines.forEach((ln, i) => txt(ctx, ln, MARGIN, top - i * 11, 9, { bold: true }))
  txtRight(ctx, label, PAGE_WIDTH - MARGIN, top, 9, { bold: true })
  ctx.y = top - (lines.length - 1) * 11 - 11
  txt(
    ctx,
    joinBar([dayLabel(data), formatShootDate(data.shootDate), `Unit: ${data.unitName}`]),
    MARGIN,
    ctx.y,
    FS_SMALL,
  )
  ctx.y -= 5
  rule(ctx, ctx.y, MARGIN, PAGE_WIDTH - MARGIN, GRAY, 0.75)
  ctx.y -= 8
}

function applyFooters(ctx: Ctx, issuedStamp: string): void {
  const pages = ctx.doc.getPages()
  const prod = ctx.data.productionName?.trim()
  const conf = `${prod ? `${prod}. ` : ''}CONFIDENTIAL - DO NOT SHARE.`
  const confLines = wrapLines(conf, contentW(), ctx.font, FS_LABEL)
  const revision = ctx.data.revisionLabel?.trim()
  pages.forEach((page, i) => {
    ctx.page = page
    rule(ctx, 20 + confLines.length * 7.5 + 12, MARGIN, PAGE_WIDTH - MARGIN, RULE_LIGHT)
    txt(ctx, joinBar([revision, `Issued ${issuedStamp}`]), MARGIN, 20, FS_LABEL, { color: GRAY })
    txtRight(ctx, `Page ${i + 1} of ${pages.length}`, PAGE_WIDTH - MARGIN, 20, FS_LABEL, { color: GRAY })
    confLines.forEach((ln, j) => {
      txt(ctx, ln, MARGIN, 29 + (confLines.length - 1 - j) * 7.5, FS_LABEL, { color: GRAY })
    })
  })
}

function sectionBar(ctx: Ctx, title: string): void {
  fillRect(ctx, MARGIN, ctx.y - BAR_H, contentW(), BAR_H, FILL_BAR)
  txt(ctx, title.toUpperCase(), MARGIN + BOX_PAD, ctx.y - BAR_H + 4, FS_HEAD, { bold: true })
  ctx.y -= BAR_H + 2
}

// ---------- Boxed text blocks ----------
type BlockLine = { text: string; size?: number; bold?: boolean; color?: Rgb; gap?: number }
type LaidLine = { text: string; size: number; bold: boolean; color: Rgb; dy: number }
type Box = { x: number; w: number; lines: BlockLine[] }

function layoutBlock(ctx: Ctx, lines: BlockLine[], width: number): { rows: LaidLine[]; height: number } {
  const rows: LaidLine[] = []
  let cursor = BOX_PAD
  for (const line of lines) {
    const size = line.size ?? FS_BODY
    const font = line.bold ? ctx.bold : ctx.font
    cursor += line.gap ?? 0
    for (const text of wrapLines(line.text, width - 2 * BOX_PAD, font, size)) {
      rows.push({ text, size, bold: !!line.bold, color: line.color ?? BLACK, dy: cursor + size })
      cursor += size + 1.8
    }
  }
  return { rows, height: cursor + BOX_PAD - 1 }
}

/** Draws side-by-side outlined boxes of equal height at the current y. */
function drawBoxes(ctx: Ctx, boxes: Box[]): void {
  const live = boxes.filter((b) => b.lines.length > 0)
  if (live.length === 0) return
  const laid = live.map((b) => layoutBlock(ctx, b.lines, b.w))
  const h = Math.max(...laid.map((l) => l.height))
  ensure(ctx, h)
  live.forEach((b, i) => {
    ctx.page.drawRectangle({
      x: b.x,
      y: ctx.y - h,
      width: b.w,
      height: h,
      borderColor: BORDER,
      borderWidth: 0.6,
    })
    for (const r of laid[i]!.rows) {
      txt(ctx, r.text, b.x + BOX_PAD, ctx.y - r.dy, r.size, { bold: r.bold, color: r.color })
    }
  })
  ctx.y -= h
}

/** Splits the content width between a left and right box; a missing side gives the other full width. */
function twoBoxes(left: BlockLine[], right: BlockLine[], leftShare: number): Box[] {
  const cw = contentW()
  if (left.length && !right.length) return [{ x: MARGIN, w: cw, lines: left }]
  if (!left.length && right.length) return [{ x: MARGIN, w: cw, lines: right }]
  const lw = cw * leftShare
  return [
    { x: MARGIN, w: lw, lines: left },
    { x: MARGIN + lw, w: cw - lw, lines: right },
  ]
}

const label = (text: string, color: Rgb = GRAY, gap?: number): BlockLine => ({
  text: text.toUpperCase(),
  size: FS_LABEL,
  bold: true,
  color,
  gap,
})

// ---------- Page 1: title, header strip, contacts, locations & safety ----------
function drawTitleBlock(ctx: Ctx, issuedStamp: string): void {
  const { data } = ctx
  const right = 'CALL SHEET'
  const rightW = ctx.bold.widthOfTextAtSize(right, FS_TITLE)
  const nameLines = wrapLines(data.productionName, contentW() - rightW - 16, ctx.bold, FS_TITLE)
  const lines = nameLines.length ? nameLines : ['']
  const top = ctx.y - FS_TITLE
  lines.forEach((ln, i) => txt(ctx, ln, MARGIN, top - i * 17, FS_TITLE, { bold: true }))
  txtRight(ctx, right, PAGE_WIDTH - MARGIN, top, FS_TITLE, { bold: true })
  ctx.y = top - (lines.length - 1) * 17 - 13

  const bloc = data.shootingBlocMastheadLabel?.trim()
  txt(ctx, joinBar([`Unit: ${data.unitName}`, bloc ? `Shooting bloc: ${bloc}` : null]), MARGIN, ctx.y, FS_BODY)
  txtRight(
    ctx,
    joinBar([data.revisionLabel?.trim(), `Issued ${issuedStamp}`]),
    PAGE_WIDTH - MARGIN,
    ctx.y,
    FS_BODY,
    { color: GRAY },
  )
  ctx.y -= 6
  rule(ctx, ctx.y, MARGIN, PAGE_WIDTH - MARGIN, BLACK, 1.25)
  ctx.y -= 6
}

function weatherLines(data: CallSheetData): BlockLine[] {
  const w = data.weatherStored ?? null
  const out: BlockLine[] = []
  const forecast = data.weatherSummary?.trim()
  const stored = w?.summary?.trim()
  const summary = [forecast, stored && stored !== forecast ? stored : null].filter(Boolean).join(' | ')
  if (summary) out.push({ text: summary, size: FS_BODY, bold: true })
  const temp = joinBar([
    w?.high?.trim() ? `High ${w.high.trim()}` : null,
    w?.low?.trim() ? `Low ${w.low.trim()}` : null,
    w?.wind?.trim() ? `Wind ${w.wind.trim()}` : null,
    w?.tide?.trim() ? `Tide ${w.tide.trim()}` : null,
  ])
  if (temp) out.push({ text: temp, size: FS_BODY })
  const sunrise = (data.weatherSunrise?.trim() || w?.sunrise?.trim() || '').trim()
  const sunset = (data.weatherSunset?.trim() || w?.sunset?.trim() || '').trim()
  const sun = joinBar([sunrise ? `Sunrise ${sunrise}` : null, sunset ? `Sunset ${sunset}` : null])
  if (sun) out.push({ text: sun, size: FS_BODY })
  if (data.weatherManual?.trim()) out.push({ text: data.weatherManual.trim(), size: FS_SMALL, color: GRAY })
  return out.length ? [label('Weather'), ...out] : []
}

function drawHeaderStrip(ctx: Ctx): void {
  const { data } = ctx
  const cw = contentW()
  const wx = weatherLines(data)

  const dayLines: BlockLine[] = [
    label('Shoot date'),
    { text: formatShootDate(data.shootDate), size: 10, bold: true },
  ]
  const day = dayLabel(data)
  if (day) dayLines.push({ text: day, size: 12, bold: true, gap: 3 })

  const call = data.callTime?.trim()
  const callLines: BlockLine[] = [
    label('Crew call'),
    { text: call || 'TBC', size: 24, bold: true },
  ]
  const times = joinBar([
    ...['breakfast', 'lunch'].map((m) => {
      const t = mealTimeByPattern(data.mealTimes, new RegExp(m))
      return t ? `${m[0]!.toUpperCase()}${m.slice(1)} ${t}` : null
    }),
    data.wrapTime?.trim() ? `Wrap (est.) ${data.wrapTime.trim()}` : null,
  ])
  if (times) callLines.push({ text: times, size: FS_BODY, gap: 2 })

  const shares = wx.length ? [0.3, 0.38, 0.32] : [0.4, 0.6]
  const widths = shares.map((s) => cw * s)
  const boxes: Box[] = [
    { x: MARGIN, w: widths[0]!, lines: dayLines },
    { x: MARGIN + widths[0]!, w: widths[1]!, lines: callLines },
  ]
  if (wx.length) boxes.push({ x: MARGIN + widths[0]! + widths[1]!, w: widths[2]!, lines: wx })
  drawBoxes(ctx, boxes)
}

function drawKeyContacts(ctx: Ctx): void {
  const contacts = ctx.data.primaryContactsTop ?? []
  if (contacts.length === 0) return
  const perRow = 3
  const w = contentW() / perRow
  for (let i = 0; i < contacts.length; i += perRow) {
    const boxes: Box[] = contacts.slice(i, i + perRow).map((c, j) => {
      const lines: BlockLine[] = [label(c.department)]
      lines.push({ text: c.name?.trim() || '-', bold: true })
      if (c.phone?.trim()) lines.push({ text: c.phone.trim() })
      if (primaryContactShowsEmail(c.department) && c.email?.trim()) {
        lines.push({ text: c.email.trim(), size: FS_LABEL, color: GRAY })
      }
      return { x: MARGIN + j * w, w, lines }
    })
    drawBoxes(ctx, boxes)
  }
}

function drawLocationsAndSafety(ctx: Ctx): void {
  const { data } = ctx
  const left: BlockLine[] = []
  if (data.parkingBaseAddress?.trim()) {
    left.push(label('Unit base / crew parking'), { text: data.parkingBaseAddress.trim() })
  }
  if (data.locations.length > 0) {
    left.push(label('Shooting location(s)', GRAY, left.length ? 3 : 0))
    const seen = new Set<string>()
    let n = 0
    for (const l of data.locations) {
      const key = `${l.name}|${l.address ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      n += 1
      left.push({ text: `${n} | ${l.name}`, bold: true, gap: n > 1 ? 2 : 0 })
      if (l.address?.trim()) left.push({ text: l.address.trim() })
      if (l.what3words?.trim()) left.push({ text: `what3words: ${l.what3words}`, size: FS_SMALL, color: GRAY })
      if (l.notes?.trim()) left.push({ text: l.notes.trim(), size: FS_SMALL, color: GRAY })
    }
  }

  const right: BlockLine[] = []
  if (data.specialNotes?.trim()) {
    right.push(label('Safety', ALERT), { text: data.specialNotes.trim(), bold: true })
  }
  const emergency = (title: string, name: string | null, address: string | null, phone?: string | null) => {
    if (!name?.trim() && !address?.trim() && !phone?.trim()) return
    right.push(label(title, GRAY, right.length ? 3 : 0))
    if (name?.trim()) right.push({ text: name.trim(), bold: true })
    if (address?.trim()) right.push({ text: address.trim() })
    if (phone?.trim()) right.push({ text: `Tel ${phone.trim()}` })
  }
  emergency('Nearest A&E', data.hospitalName, data.hospitalAddress, data.hospitalPhone)
  emergency('Police / emergency', data.policeStationName, data.policeStationAddress, data.policeStationPhone)

  drawBoxes(ctx, twoBoxes(left, right, 0.55))
}

// ---------- Generic table (cast, catering, radio, transport) ----------
type TableCol = { label: string; w: number }

function drawTable(
  ctx: Ctx,
  title: string,
  cols: TableCol[],
  rows: string[][],
  fs: number = FS_CAST,
): void {
  if (rows.length === 0) return
  const ls = fs + 1.8
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const xs: number[] = []
  cols.reduce((x, c) => (xs.push(x), x + c.w), MARGIN)
  const headH = fs + 6

  const header = (): void => {
    fillRect(ctx, MARGIN, ctx.y - headH, tableW, headH, FILL_BAR)
    cols.forEach((c, i) => txt(ctx, c.label, xs[i]! + 2, ctx.y - headH + 3.5, fs - 0.5, { bold: true }))
    ctx.y -= headH
  }

  ensure(ctx, BAR_H + 2 + headH + ls + 6)
  sectionBar(ctx, title)
  header()
  for (const row of rows) {
    const cells = cols.map((c, i) => wrapLines(row[i] ?? '', c.w - 4, ctx.font, fs))
    const depth = Math.max(1, ...cells.map((c) => c.length))
    const rowH = 4 + depth * ls
    if (ctx.y - rowH < Y_MIN) {
      newPage(ctx)
      sectionBar(ctx, `${title} (cont'd)`)
      header()
    }
    cells.forEach((lines, i) => {
      lines.forEach((ln, j) => txt(ctx, ln, xs[i]! + 2, ctx.y - 1.5 - fs - j * ls, fs))
    })
    ctx.y -= rowH
    rule(ctx, ctx.y, MARGIN, MARGIN + tableW, RULE_LIGHT)
  }
  ctx.y -= SECTION_GAP
}

// ---------- Strip tables (main + advanced schedule) ----------
type StripCol = MainScheduleColDef | AdvancedScheduleColDef

const SPECIAL_TYPES: ReadonlySet<CallSheetStrip['strip_type']> = new Set([
  'CALL',
  'LUNCH',
  'WRAP',
  'NOTE',
  'MOVE',
])

// Special strips are added manually (call, lunch, wrap, move, note) and are not shooting rows.
const isSpecialStrip = (t: CallSheetStrip['strip_type']): boolean => SPECIAL_TYPES.has(t)

function specialScheduleSetLine(s: CallSheetStrip): string {
  const body =
    s.rowNotes?.trim() ||
    [s.title, s.description].filter((x): x is string => typeof x === 'string' && x.trim().length > 0).join(' - ')
  return body.trim() ? `${s.strip_type} - ${body.trim()}` : s.strip_type
}

function drawStripTable(
  ctx: Ctx,
  strips: CallSheetStrip[],
  cols: StripCol[],
  contHeading: () => void,
  fs: number = FS_SCHED,
): void {
  if (strips.length === 0) return
  const ls = fs + 1.8
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const xs: number[] = []
  cols.reduce((x, c) => (xs.push(x), x + c.w), MARGIN)
  const colIdx = (k: string): number => cols.findIndex((c) => c.key === k)
  const widthOf = (k: string): number => cols[colIdx(k)]?.w ?? 0
  const headH = fs + 6
  let itpMode = false

  const header = (): void => {
    fillRect(ctx, MARGIN, ctx.y - headH, tableW, headH, FILL_BAR)
    cols.forEach((c, i) => txt(ctx, c.label, xs[i]! + 2, ctx.y - headH + 3.5, fs - 0.5, { bold: true }))
    ctx.y -= headH
  }
  const itpBanner = (): void => {
    txt(ctx, 'IF TIME PERMITS', MARGIN + 2, ctx.y - 1.5 - fs, fs, { bold: true })
    ctx.y -= ls + 4
  }
  const pageBreak = (): void => {
    newPage(ctx)
    contHeading()
    header()
    if (itpMode) itpBanner()
  }
  const room = (h: number): void => {
    if (ctx.y - h < Y_MIN) pageBreak()
  }

  const drawRow = (s: CallSheetStrip): void => {
    const special = isSpecialStrip(s.strip_type)
    const cell: Record<string, string[]> = {}
    let synopsis: Array<{ text: string; bold: boolean; size: number }> = []

    if (special) {
      synopsis = wrapLines(specialScheduleSetLine(s), tableW - 4, ctx.bold, fs).map((text) => ({
        text,
        bold: true,
        size: fs,
      }))
    } else {
      const setW = widthOf('synopsis') - 4
      const sn = s.scene_number?.trim()
      const sh = s.shot_number?.trim()
      cell.scsh = [sn && sh ? `${sn} | ${sh}` : (sn ?? sh ?? '')]
      cell.loc = [s.locDitto ? DITTO_MARK : (s.locLabel ?? '')]
      cell.ep = [(s.episodeLabel ?? '').trim()]
      cell.dn = [formatScheduleDnColumn(s.int_ext, s.day_night)]
      cell.pgs = [s.page_eighths != null ? `${s.page_eighths}/8` : '']
      cell.time = [s.estTime?.trim() ?? '']
      cell.cast = wrapLines(s.castCompact ?? '', widthOf('cast') - 4, ctx.font, fs)
      cell.notes = wrapLines(s.rowNotes ?? '', widthOf('notes') - 4, ctx.font, fs)
      if (s.strip_type === 'SHOT' && s.shot_description?.trim()) {
        const sceneLine = s.scene_title?.trim() || s.scene_heading?.trim() || ''
        for (const text of wrapLines(sceneLine, setW, ctx.bold, fs)) synopsis.push({ text, bold: true, size: fs })
        for (const text of wrapLines(s.shot_description, setW, ctx.font, fs - 0.5)) {
          synopsis.push({ text, bold: false, size: fs - 0.5 })
        }
      } else {
        synopsis = wrapLines(formatCallSheetSynopsis(s), setW, ctx.bold, fs).map((text) => ({
          text,
          bold: true,
          size: fs,
        }))
      }
    }

    const depth = Math.max(1, synopsis.length, ...Object.values(cell).map((l) => l.length))
    const rowH = 4 + depth * ls
    room(rowH + 2)

    if (special) fillRect(ctx, MARGIN, ctx.y - rowH, tableW, rowH, FILL_SPECIAL)

    const base = ctx.y - 1.5 - fs
    if (special) {
      synopsis.forEach((l, i) => txt(ctx, l.text, MARGIN + 2, base - i * ls, l.size, { bold: l.bold }))
    } else {
      cols.forEach((c, ci) => {
        if (c.key === 'synopsis') {
          synopsis.forEach((l, i) => txt(ctx, l.text, xs[ci]! + 2, base - i * ls, l.size, { bold: l.bold }))
          return
        }
        ;(cell[c.key] ?? ['']).forEach((ln, i) => txt(ctx, ln, xs[ci]! + 2, base - i * ls, fs))
      })
    }
    ctx.y -= rowH
    rule(ctx, ctx.y, MARGIN, MARGIN + tableW, RULE_LIGHT)
  }

  // Never strand the header row at the foot of a page: it needs its first row beneath it.
  if (ctx.y - (headH + ls * 2 + 8) < Y_MIN) {
    newPage(ctx)
    contHeading()
  }
  header()
  const primary = strips.filter((s) => !s.ifTimePermits)
  const itp = strips.filter((s) => s.ifTimePermits)
  for (const s of primary) drawRow(s)
  if (itp.length > 0) {
    room(ls * 3 + 8)
    itpMode = true
    itpBanner()
    for (const s of itp) drawRow(s)
    itpMode = false
  }
}

function drawShootingSchedule(ctx: Ctx): void {
  const { data } = ctx
  if (data.schedule.length === 0) return
  const cols = buildMainScheduleColumns(
    {
      includeEpisodesInSchedule: data.includeEpisodesInSchedule,
      showTime: data.schedule.some((s) => !!s.estTime?.trim()),
    },
    contentW(),
  )
  ensure(ctx, BAR_H + 2 + 40)
  sectionBar(ctx, 'Shooting schedule')
  drawStripTable(ctx, data.schedule, cols, () => sectionBar(ctx, "Shooting schedule (cont'd)"))
  ctx.y -= SECTION_GAP
}

// ---------- Principal cast ----------
function principalCastRows(data: CallSheetData): CallSheetCastRow[] {
  if (data.castCalledRows?.length) return [...data.castCalledRows]
  return data.castCalled.map((name) => ({
    person_id: '',
    cast_number: null,
    name,
    phone: null,
    email: null,
    agent_name: null,
    agent_email: null,
    agent_phone: null,
    source: 'scene' as const,
  }))
}

function drawPrincipalCast(ctx: Ctx): void {
  const rows = principalCastRows(ctx.data)
  if (rows.length === 0) return
  const has = (f: (r: CallSheetCastRow) => string | null | undefined): boolean =>
    rows.some((r) => f(r)?.trim())

  type Def = { label: string; base: number; flex: boolean; cell: (r: CallSheetCastRow) => string }
  const defs: Def[] = [{ label: '#', base: 24, flex: false, cell: (r) => r.cast_number?.trim() ?? '' }]
  defs.push({ label: 'CAST', base: 100, flex: true, cell: (r) => (r.name ?? '').trim() })
  if (has((r) => r.character_name)) {
    defs.push({ label: 'CHARACTER', base: 90, flex: true, cell: (r) => r.character_name?.trim() ?? '' })
  }
  if (has((r) => r.pickup_time)) {
    defs.push({ label: 'PICK-UP', base: 40, flex: false, cell: (r) => r.pickup_time?.trim() ?? '' })
  }
  if (has((r) => r.makeup_time)) {
    defs.push({ label: 'H/MU', base: 40, flex: false, cell: (r) => r.makeup_time?.trim() ?? '' })
  }
  if (has((r) => r.wardrobe_time)) {
    defs.push({ label: 'WARD', base: 40, flex: false, cell: (r) => r.wardrobe_time?.trim() ?? '' })
  }
  if (has((r) => r.booking_schedule_line)) {
    defs.push({ label: 'SET CALL', base: 52, flex: false, cell: (r) => r.booking_schedule_line?.trim() ?? '' })
  }
  if (has((r) => r.phone)) {
    defs.push({ label: 'PHONE', base: 78, flex: true, cell: (r) => r.phone?.trim() ?? '' })
  }
  if (has((r) => r.booking_notes)) {
    defs.push({ label: 'NOTES', base: 100, flex: true, cell: (r) => r.booking_notes?.trim() ?? '' })
  }

  const fixedSum = defs.filter((d) => !d.flex).reduce((s, d) => s + d.base, 0)
  const flexSum = defs.filter((d) => d.flex).reduce((s, d) => s + d.base, 0)
  const scale = (contentW() - fixedSum) / flexSum
  const cols: TableCol[] = defs.map((d) => ({ label: d.label, w: d.flex ? d.base * scale : d.base }))

  drawTable(
    ctx,
    'Principal cast calls',
    cols,
    rows.map((r) => defs.map((d) => d.cell(r))),
  )
}

// ---------- Notes, background, special requirements ----------
function drawNotes(ctx: Ctx): void {
  const { data } = ctx
  const noteLines = (title: string, body: string | null): BlockLine[] =>
    body?.trim() ? [label(title), { text: body.trim() }] : []
  drawBoxes(ctx, twoBoxes(noteLines('Day notes', data.dayNotes), noteLines('Unit notes', data.unitNotes), 0.5))

  const reqs = (data.specialRequirements ?? []).filter((r) => r.text?.trim())
  const reqLines: BlockLine[] = reqs.length
    ? [
        label('Special requirements'),
        ...reqs.flatMap((r, i) => [
          { text: r.department, size: FS_SMALL, bold: true, gap: i ? 2 : 0 } as BlockLine,
          { text: r.text.trim() } as BlockLine,
        ]),
      ]
    : []
  drawBoxes(ctx, twoBoxes(noteLines('Background / SA', data.backgroundNotes ?? null), reqLines, 0.5))
  ctx.y -= SECTION_GAP
}

// ---------- Departments (two-column grid) ----------
/** Departments whose contacts / crew belong on Health, Safety & Stunts (not general departmental). */
function isHealthSafetyStuntsDepartment(dept: string): boolean {
  const d = dept.trim().toLowerCase()
  if (!d) return false
  return (
    /\bstunt/.test(d) ||
    /\bmedic|\bmedical|\bparamedic|\bambulance/.test(d) ||
    /\bsafety|\bh\s*&\s*s\b|\bhse\b/.test(d) ||
    /\bhealth\b/.test(d) ||
    /\bfire\b/.test(d) ||
    /\brisk\b/.test(d)
  )
}

type DepartmentBlock = {
  department: string
  keyContacts: CallSheetKeyContact[]
  crewGroup: CallSheetCrewGroup | null
}

function primaryContactDedupKey(c: CallSheetKeyContact): string {
  return `${c.department.trim().toLowerCase()}\0${(c.name ?? '').trim().toLowerCase()}\0${(c.phone ?? '').trim()}`
}

function buildDepartmentBlocks(data: CallSheetData, healthSafety: boolean): DepartmentBlock[] {
  const primaryKeys = new Set((data.primaryContactsTop ?? []).map(primaryContactDedupKey))
  const crewOrder = new Map<string, number>()
  ;(data.crewGroups ?? []).forEach((g, i) => crewOrder.set(g.department, i))
  const byDept = new Map<string, DepartmentBlock>()

  for (const g of data.crewGroups ?? []) {
    if (isHealthSafetyStuntsDepartment(g.department) !== healthSafety || g.rows.length === 0) continue
    byDept.set(g.department, { department: g.department, keyContacts: [], crewGroup: g })
  }
  for (const c of data.keyContacts) {
    if (isHealthSafetyStuntsDepartment(c.department) !== healthSafety) continue
    if (primaryKeys.has(primaryContactDedupKey(c))) continue
    const hasPayload = [c.name, c.phone, c.email, c.notes].some((v) => (v?.trim() ?? '') !== '')
    if (!hasPayload) continue
    let blk = byDept.get(c.department)
    if (!blk) {
      blk = { department: c.department, keyContacts: [], crewGroup: null }
      byDept.set(c.department, blk)
    }
    blk.keyContacts.push(c)
  }

  return Array.from(byDept.keys())
    .sort((a, b) => {
      const ia = crewOrder.get(a) ?? 999
      const ib = crewOrder.get(b) ?? 999
      return ia !== ib ? ia - ib : a.localeCompare(b)
    })
    .map((d) => byDept.get(d)!)
}

type DeptRow = { cells: string[][]; h: number; note: string[] }

const DEPT_BAR_H = 11
const DEPT_FS = 7.5

function measureDeptRows(ctx: Ctx, block: DepartmentBlock, w: number): DeptRow[] {
  const ls = DEPT_FS + 1.8
  const make = (texts: string[], widths: number[], note: string | null): DeptRow => {
    const cells = texts.map((t, i) => wrapLines(t, widths[i]! - 4, ctx.font, DEPT_FS))
    const noteLines = note ? wrapLines(note, w - 4, ctx.font, DEPT_FS - 0.5) : []
    const depth = Math.max(1, ...cells.map((c) => c.length))
    return { cells, note: noteLines, h: 3 + depth * ls + noteLines.length * (ls - 0.5) }
  }
  const crewW = [w * 0.38, w * 0.34, w * 0.28]
  const contactW = [w * 0.3, w * 0.42, w * 0.28]
  const rows: DeptRow[] = []
  for (const c of block.keyContacts) {
    rows.push(make([c.name?.trim() ?? '', c.email?.trim() ?? '', c.phone?.trim() ?? ''], contactW, c.notes?.trim() ?? null))
  }
  for (const r of (block.crewGroup?.rows ?? []) as CallSheetCrewRow[]) {
    const role = joinBar([r.role_name?.trim(), r.is_hod ? 'HOD' : null])
    rows.push(make([r.name ?? '', role, r.phone?.trim() ?? ''], crewW, null))
  }
  return rows
}

function drawDeptBar(ctx: Ctx, block: DepartmentBlock, x: number, top: number, w: number, contd: boolean): void {
  fillRect(ctx, x, top - DEPT_BAR_H, w, DEPT_BAR_H, FILL_BAR)
  txt(ctx, `${block.department.toUpperCase()}${contd ? " (CONT'D)" : ''}`, x + 3, top - DEPT_BAR_H + 3.5, FS_SMALL, {
    bold: true,
  })
  const call = ctx.data.crewCallTimes?.[block.department]?.trim()
  if (call) txtRight(ctx, `Call ${call}`, x + w - 3, top - DEPT_BAR_H + 3.5, FS_SMALL, { bold: true })
}

function drawDeptRow(ctx: Ctx, row: DeptRow, x: number, top: number, w: number, widths: number[]): void {
  const ls = DEPT_FS + 1.8
  let cx = x
  row.cells.forEach((lines, i) => {
    lines.forEach((ln, j) => {
      txt(ctx, ln, cx + 2, top - 1.5 - DEPT_FS - j * ls, DEPT_FS, { color: i === 1 ? GRAY : BLACK })
    })
    cx += widths[i]!
  })
  const depth = Math.max(1, ...row.cells.map((c) => c.length))
  row.note.forEach((ln, j) => {
    txt(ctx, ln, x + 2, top - 1.5 - DEPT_FS - (depth + j) * ls + 0.5, DEPT_FS - 0.5, { color: GRAY })
  })
  rule(ctx, top - row.h, x, x + w, RULE_LIGHT)
}

function drawDepartmentGrid(ctx: Ctx, title: string, blocks: DepartmentBlock[]): void {
  if (blocks.length === 0) return
  const gap = 10
  const colW = (contentW() - gap) / 2
  const xs = [MARGIN, MARGIN + colW + gap]
  const widthsFor = (block: DepartmentBlock, i: number): number[] =>
    i < block.keyContacts.length ? [colW * 0.3, colW * 0.42, colW * 0.28] : [colW * 0.38, colW * 0.34, colW * 0.28]
  const heightOf = (rows: DeptRow[]): number => DEPT_BAR_H + rows.reduce((s, r) => s + r.h, 0) + 4

  ensure(ctx, BAR_H + 2 + 50)
  sectionBar(ctx, title)
  let ys = [ctx.y, ctx.y]

  const resetPage = (): void => {
    newPage(ctx)
    sectionBar(ctx, `${title} (cont'd)`)
    ys = [ctx.y, ctx.y]
  }

  for (const block of blocks) {
    const rows = measureDeptRows(ctx, block, colW)
    const h = heightOf(rows)
    let col = ys[0]! >= ys[1]! ? 0 : 1
    if (ys[col]! - h < Y_MIN) col = 1 - col
    if (ys[col]! - h < Y_MIN) {
      resetPage()
      col = 0
    }

    if (ys[col]! - h < Y_MIN) {
      // Taller than a whole page: single column, row-level page breaks.
      let top = ys[0]!
      drawDeptBar(ctx, block, xs[0]!, top, colW, false)
      top -= DEPT_BAR_H
      rows.forEach((row, i) => {
        if (top - row.h < Y_MIN) {
          resetPage()
          top = ys[0]!
          drawDeptBar(ctx, block, xs[0]!, top, colW, true)
          top -= DEPT_BAR_H
        }
        drawDeptRow(ctx, row, xs[0]!, top, colW, widthsFor(block, i))
        top -= row.h
      })
      ys = [top - 4, top - 4]
      continue
    }

    let top = ys[col]!
    drawDeptBar(ctx, block, xs[col]!, top, colW, false)
    top -= DEPT_BAR_H
    rows.forEach((row, i) => {
      drawDeptRow(ctx, row, xs[col]!, top, colW, widthsFor(block, i))
      top -= row.h
    })
    ys[col] = top - 4
  }
  ctx.y = Math.min(ys[0]!, ys[1]!) - SECTION_GAP + 2
}

// ---------- Catering, radio, transport ----------
function drawCatering(ctx: Ctx): void {
  const headerMeal = /breakfast|lunch/
  const meals = ctx.data.mealTimes.filter(
    (m) => (m.name?.trim() ?? '') !== '' && (m.time?.trim() ?? '') !== '' && !headerMeal.test(m.name.trim().toLowerCase()),
  )
  // Breakfast and lunch already sit in the header strip; only list the other meals here.
  drawTable(
    ctx,
    'Catering / meals',
    [
      { label: 'MEAL', w: 200 },
      { label: 'TIME', w: 120 },
    ],
    meals.map((m) => [m.name.trim(), m.time.trim()]),
  )
}

function drawRadio(ctx: Ctx): void {
  const rows = (ctx.data.radioChannels ?? []).filter(
    (r) => (r.channel?.trim() ?? '') !== '' && (r.purpose?.trim() ?? '') !== '',
  )
  drawTable(
    ctx,
    'Radio channels',
    [
      { label: 'CHANNEL', w: 100 },
      { label: 'PURPOSE', w: contentW() - 100 },
    ],
    rows.map((r) => [r.channel.trim(), r.purpose.trim()]),
  )
}

function drawTransport(ctx: Ctx): void {
  const rows = ctx.data.transportRows ?? []
  const defs: Array<{ key: keyof CallSheetTransportRow; label: string; w: number }> = [
    { key: 'driver', label: 'DRIVER', w: 1 },
    { key: 'pickupTime', label: 'PICK-UP', w: 0.6 },
    { key: 'passenger', label: 'PASSENGER', w: 1.2 },
    { key: 'from', label: 'FROM', w: 1 },
    { key: 'to', label: 'TO', w: 1 },
    { key: 'arrival', label: 'ARRIVAL', w: 0.6 },
  ]
  const active = defs.filter((c) => rows.some((r) => (r[c.key] ?? '').toString().trim() !== ''))
  if (active.length === 0) return
  const unit = contentW() / active.reduce((s, c) => s + c.w, 0)
  drawTable(
    ctx,
    'Transport requirements',
    active.map((c) => ({ label: c.label, w: c.w * unit })),
    rows.map((r) => active.map((c) => (r[c.key] ?? '').toString().trim())),
  )
}

// ---------- Advanced schedule ----------
function drawAdvancedSchedule(ctx: Ctx): void {
  const { data } = ctx
  const days = data.advancedScheduleDays ?? []
  if (days.length === 0) return

  const dayHead = (day: CallSheetAdvancedDay, contd: boolean): void => {
    txt(
      ctx,
      `${joinBar([formatShootDate(day.shootDate), day.dayNumber != null ? `Day ${day.dayNumber}` : null, day.callTime?.trim() ? `Unit call ${day.callTime.trim()}` : null])}${contd ? " (cont'd)" : ''}`,
      MARGIN,
      ctx.y - FS_BODY,
      FS_BODY,
      { bold: true },
    )
    ctx.y -= FS_BODY + 4
    const meta = joinBar([
      day.parkingBaseAddress?.trim() ? `Base: ${day.parkingBaseAddress.trim()}` : null,
      day.locationSummary?.trim() ? `Locations: ${day.locationSummary.trim()}` : null,
    ])
    if (meta) {
      for (const ln of wrapLines(meta, contentW(), ctx.font, FS_SMALL)) {
        txt(ctx, ln, MARGIN, ctx.y - FS_SMALL, FS_SMALL, { color: GRAY })
        ctx.y -= FS_SMALL + 2
      }
    }
    ctx.y -= 3
  }

  ensure(ctx, BAR_H + 2 + 60)
  sectionBar(ctx, 'Advanced schedule')
  for (const day of days) {
    if (ctx.y - 90 < Y_MIN) {
      newPage(ctx)
      sectionBar(ctx, "Advanced schedule (cont'd)")
    }
    dayHead(day, false)
    const cols = buildAdvancedScheduleColumns(
      {
        includeEpisodesInSchedule: data.includeEpisodesInSchedule === true,
        hasCast: day.strips.some((s) => (s.castCompact?.trim() ?? '').length > 0),
      },
      contentW(),
    )
    drawStripTable(ctx, day.strips, cols, () => {
      sectionBar(ctx, "Advanced schedule (cont'd)")
      dayHead(day, true)
    })
    ctx.y -= SECTION_GAP
  }
}

// ---------- Entry point ----------
export async function generateCallSheetPdf(data: CallSheetData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await embedStandardFont(doc, StandardFonts.Helvetica)
  const bold = await embedStandardFont(doc, StandardFonts.HelveticaBold)

  // Everything below is synchronous until `doc.save()`, so the module-level paper size cannot
  // be changed by a concurrent generation part-way through drawing.
  setPaper(data.paperSize)
  const ctx: Ctx = {
    doc,
    font,
    bold,
    data,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
  }
  const issuedStamp = formatIssueStamp(data.issuedAt)

  drawTitleBlock(ctx, issuedStamp)
  drawHeaderStrip(ctx)
  drawKeyContacts(ctx)
  drawLocationsAndSafety(ctx)
  ctx.y -= SECTION_GAP

  drawShootingSchedule(ctx)
  drawPrincipalCast(ctx)
  drawNotes(ctx)

  drawDepartmentGrid(ctx, 'Departmental requirements', buildDepartmentBlocks(data, false))
  drawDepartmentGrid(ctx, 'Health, safety & stunts', buildDepartmentBlocks(data, true))
  drawCatering(ctx)
  drawRadio(ctx)
  drawTransport(ctx)
  drawAdvancedSchedule(ctx)

  applyFooters(ctx, issuedStamp)
  return doc.save()
}
