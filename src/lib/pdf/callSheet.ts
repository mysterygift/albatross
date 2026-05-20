/**
 * Call sheet PDF: Film / HETV-style layout.
 * Uses pdf-lib. Page 1 top: masthead, essential times + primary contacts, environment & safety,
 * base & locations; then schedule (table), principal cast; page 2+ operational support (departmental, H&S/stunts,
 * catering, optional radio/transport, advanced schedule (forward days), repeated headers/footers.
 *
 * Headers: page 1 uses the full masthead (production identity). Any continuation page uses the compact
 * running header (CALL SHEET (cont'd) + production + date + rule) — intentional; do not duplicate the masthead on page 1.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { CallSheetCastRow } from '@/lib/call-sheets/castRequirements'
import type { CallSheetCrewGroup, CallSheetCrewRow } from '@/lib/call-sheets/crewRequirements'
import { primaryContactShowsEmail } from '@/lib/call-sheets/primaryContacts'
import { formatCallSheetSynopsis, formatScheduleDnColumn } from '@/lib/call-sheets/scheduleStripRow'
import {
  buildMainScheduleColumns,
  buildAdvancedScheduleColumns,
  type MainScheduleColKey,
  type AdvancedScheduleColKey,
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
  /** Shot list description; shown under scene title in SHOT DESCRIPTION for SHOT rows. */
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

export interface CallSheetData {
  productionName: string
  shootDate: string
  unitName: string
  dayNumber: number | null
  callTime: string | null
  wrapTime: string | null
  dayNotes: string | null
  unitNotes: string | null
  keyContacts: CallSheetKeyContact[]
  /** AD / coordinator / office contacts for the top of page 1 only. */
  primaryContactsTop?: CallSheetKeyContact[]
  hospitalName: string | null
  hospitalAddress: string | null
  policeStationName: string | null
  policeStationAddress: string | null
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
  locations: CallSheetLocation[]
  /** When set and non-empty, drawn under Radio channels on the support page. */
  radioChannels?: CallSheetRadioChannel[]
  /** When set and non-empty, drawn as the transport table on the support page. */
  transportRows?: CallSheetTransportRow[]
  /** Upcoming shoot days (1–2) after `shootDate`, same unit when possible. */
  advancedScheduleDays?: CallSheetAdvancedDay[]
  /** From production; drives episodic masthead / schedule column behavior. */
  isEpisodicProduction?: boolean
  /** When true with episodic production, EP column is shown in schedule tables. */
  includeEpisodesInSchedule?: boolean
  /** Episodic only: shoot day bloc display name, or null to omit masthead line. */
  shootingBlocMastheadLabel?: string | null
}

// Typography and spacing
const MARGIN = 54
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
/** Space reserved above footer band (confidentiality + optional generated line). */
const FOOTER_RESERVE = 52
const Y_MIN = MARGIN + FOOTER_RESERVE
const LINE_BODY = 9
const LINE_SECTION = 11
const SEP_SECTION = 8
const FONT_MASTHEAD = 15
const FONT_PRODUCTION = 12
const FONT_SECTION = 10
const FONT_BODY = 8.5
const FONT_TABLE = 8
const ROW_HEIGHT = 10
const FONT_SCHED = 6
/** Shot description in SHOT DESCRIPTION column (scene title stays FONT_SCHED bold). */
const FONT_SCHED_SHOT_DESC = FONT_SCHED - 0.5
const SCHED_LINE_STEP = 7.5
const FONT_RUN_TITLE = 9
const FONT_RUN_SUB = 7.5
const FONT_CONF = 6.5
const SCHEDULE_SPECIAL_FILL = rgb(0.93, 0.93, 0.93)
/** ASCII ditto: Unicode U+3003 is not encodable in pdf-lib StandardFonts (WinAnsi). */
const DITTO_MARK = '"'
const GRAY = rgb(0.45, 0.45, 0.45)

/** Page 2+ support layer: slightly tighter than briefing blocks. */
const FONT_SUPPORT = 7.5
const FONT_SUPPORT_HEAD = 9
const ROW_SUPPORT = 8
const SUPPORT_SEP = 6

type Page = ReturnType<PDFDocument['getPages']>[0]

/** StandardFonts use WinAnsi; strip bidi/zero-width controls and unmapped code points. */
export function textForPdf(text: string): string {
  return text
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, '')
}

function drawPdfText(
  page: Page,
  text: string,
  options: Parameters<Page['drawText']>[1]
): void {
  page.drawText(textForPdf(text), options)
}

function drawRule(
  page: Page,
  y: number,
  xStart: number,
  xEnd: number,
  color: ReturnType<typeof rgb> = GRAY
): void {
  page.drawRectangle({ // Draws the actual line.
    x: xStart,
    y: y + 6, // originally 0.25, I've offset this to +4 to put it above each element in the row. Which means it no longer bisects any multi-line cells.
    width: xEnd - xStart,
    height: 0.5,
    color,
  })
}

/**
 * Ensure we have room for at least minLines; if not, add a new page and return { page, isNew }.
 */
function addPageIfNeeded(
  doc: PDFDocument,
  currentPage: Page,
  y: { current: number },
  minLines: number
): { page: Page; isNew: boolean } {
  const need = y.current - minLines * ROW_HEIGHT
  if (need >= Y_MIN) return { page: currentPage, isNew: false }
  const newPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  y.current = PAGE_HEIGHT - MARGIN
  return { page: newPage, isNew: true }
}

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

function formatShootDate(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isNaN(t)) {
    return new Date(t).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
  return iso
}

function drawTextRight(
  page: Page,
  text: string,
  y: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  xRight: number
): void {
  const safe = textForPdf(text)
  const w = font.widthOfTextAtSize(safe, size)
  drawPdfText(page, safe, { x: Math.max(MARGIN, xRight - w), y, size, font })
}

function wrapLines(
  text: string,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
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

function wrapLinesLimited(
  text: string,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
  maxLines: number
): string[] {
  const all = wrapLines(text.trim(), maxWidth, font, size)
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

type PdfFont = Awaited<ReturnType<PDFDocument['embedFont']>>

type ShotSynopsisLayout = { sceneLines: string[]; shotLines: string[] }

function layoutShotSynopsis(
  s: CallSheetStrip,
  maxWidth: number,
  font: PdfFont,
  bold: PdfFont,
  sceneSize: number,
  shotSize: number
): ShotSynopsisLayout {
  const sceneLine = (s.scene_title?.trim() || s.scene_heading?.trim() || '') || ''
  const shotLine = s.shot_description?.trim() || ''
  return {
    sceneLines: sceneLine ? wrapLines(sceneLine, maxWidth, bold, sceneSize) : [],
    shotLines: shotLine ? wrapLines(shotLine, maxWidth, font, shotSize) : [],
  }
}

function shotSynopsisLineCount(layout: ShotSynopsisLayout): number {
  const n = layout.sceneLines.length + layout.shotLines.length
  return n > 0 ? n : 1
}

// We consider a strip to be special if it is a call, lunch, wrap, note, or move – these are manually added to the schedule and are not part of the shooting schedule table.
function scheduleStripIsSpecial(stripType: CallSheetStrip['strip_type']): boolean {
  return stripType === 'CALL' || stripType === 'LUNCH' || stripType === 'WRAP' || stripType === 'NOTE' || stripType === 'MOVE'
}

function specialScheduleSetLine(s: CallSheetStrip): string {
  const tag = s.strip_type
  const body =
    s.rowNotes?.trim() ||
    [s.title, s.description].filter((x): x is string => typeof x === 'string' && x.trim().length > 0).join(' — ')
  return body.trim() ? `${tag} — ${body.trim()}` : tag
}

type ScheduleDrawRefs = {
  page: Page
  y: { current: number }
}

/**
 * Compact running header for every continuation page (and mid-document page breaks).
 * Page 1 opens with `drawMasthead` instead; pairing masthead + this on page 1 would be cluttered.
 */
function drawRunningHeader(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  data: CallSheetData,
  y: { current: number },
  continued: boolean
): void {
  const title = continued ? "CALL SHEET (cont'd)" : 'CALL SHEET'
  drawPdfText(page, title, { x: MARGIN, y: y.current, size: FONT_RUN_TITLE, font: bold })
  y.current -= 10
  drawPdfText(page, data.productionName.slice(0, 84), { x: MARGIN, y: y.current, size: FONT_RUN_SUB, font: bold })
  y.current -= 9
  drawPdfText(page, formatShootDate(data.shootDate), { x: MARGIN, y: y.current, size: FONT_RUN_SUB, font })
  y.current -= 10
  drawRule(page, y.current, MARGIN, PAGE_WIDTH - MARGIN)
  y.current -= 5
}

const CONFIDENTIAL_FOOTER_CORE =
  'CONFIDENTIAL – DO NOT SHARE.'

function drawConfidentialFooterOnPage(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  data: CallSheetData,
  includeGenerated: boolean
): void {
  const maxW = PAGE_WIDTH - 2 * MARGIN
  const prefix = data.productionName?.trim() ? `${data.productionName.trim()}. ` : ''
  const full = `${prefix}${CONFIDENTIAL_FOOTER_CORE}`
  const lines = wrapLines(full, maxW, font, FONT_CONF)
  let yLine = 22
  if (includeGenerated) {
    drawPdfText(page, `Generated: ${new Date().toLocaleString()}`.slice(0, 95), {
      x: MARGIN,
      y: yLine,
      size: 6.5,
      font,
      color: GRAY,
    })
    yLine += 8
  }
  for (const ln of lines) {
    drawPdfText(page, ln.slice(0, 120), {
      x: MARGIN,
      y: yLine,
      size: FONT_CONF,
      font,
      color: GRAY,
    })
    yLine += 7.5
  }
}

function applyFootersToAllPages(
  doc: PDFDocument,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  data: CallSheetData
): void {
  const pages = doc.getPages()
  const last = pages.length - 1
  for (let i = 0; i < pages.length; i++) {
    drawConfidentialFooterOnPage(pages[i]!, font, data, i === last)
  }
}
// This function draws the shooting schedule table and contains the logic for the shooting schedule table.
function drawShootingScheduleTable(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  const cols = buildMainScheduleColumns(data)
  const tableW = cols.reduce((s, c) => s + c.w, 0)
  const x0 = MARGIN
  const pad = 2

  const colIndex = (k: MainScheduleColKey): number => {
    const i = cols.findIndex((c) => c.key === k)
    if (i < 0) throw new Error(`Missing schedule column ${k}`)
    return i
  }

  const wFor = (k: MainScheduleColKey): number => cols[colIndex(k)]!.w

  const drawHeader = (): void => {
    const pg = refs.page
    drawRule(pg, refs.y.current, x0, x0 + tableW)
    refs.y.current -= ROW_HEIGHT
    let xh = x0
    for (const c of cols) {
      drawPdfText(pg, c.label, { x: xh + pad, y: refs.y.current, size: FONT_SCHED, font: bold })
      xh += c.w
    }
    refs.y.current -= ROW_HEIGHT
    drawRule(pg, refs.y.current, x0, x0 + tableW)
    refs.y.current -= 2
  }

  let itpMode = false

  const ensureSpace = (minH: number, repeatHeader: boolean): void => {
    if (refs.y.current - minH >= Y_MIN) return
    refs.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    refs.y.current = PAGE_HEIGHT - MARGIN
    drawRunningHeader(refs.page, font, bold, data, refs.y, true)
    drawPdfText(refs.page, 'SHOOTING SCHEDULE', {
      x: MARGIN,
      y: refs.y.current,
      size: FONT_SECTION + 0.5,
      font: bold,
    })
    refs.y.current -= LINE_BODY + 2
    if (repeatHeader) drawHeader()
    if (itpMode) {
      drawPdfText(refs.page, 'IF TIME PERMITS', {
        x: MARGIN,
        y: refs.y.current,
        size: FONT_TABLE,
        font: bold,
      })
      refs.y.current -= LINE_BODY + 2
    }
  }

  if (data.schedule.length === 0) return

  const primaryStrips = data.schedule.filter((s) => !s.ifTimePermits)
  const itpStrips = data.schedule.filter((s) => s.ifTimePermits)

  ensureSpace(52, false)
  drawPdfText(refs.page, 'SHOOTING SCHEDULE', {
    x: MARGIN,
    y: refs.y.current,
    size: FONT_SECTION + 0.5,
    font: bold,
  })
  refs.y.current -= LINE_BODY + 2
  drawRule(refs.page, refs.y.current, MARGIN, PAGE_WIDTH - MARGIN)
  refs.y.current -= 3
  drawHeader()

  const xStarts: number[] = [x0]
  for (let i = 1; i < cols.length; i++) {
    xStarts.push(xStarts[i - 1]! + cols[i - 1]!.w)
  }

  const drawColumnText = (
    colIndex: number,
    lines: string[],
    lineFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
    yTop: number
  ): void => {
    const x = xStarts[colIndex]! + pad
    let yy = yTop
    const toDraw = lines.length ? lines : ['']
    for (const line of toDraw) {
      drawPdfText(refs.page, line.slice(0, 100), {
        x,
        y: yy,
        size: FONT_SCHED,
        font: lineFont,
        color: rgb(0, 0, 0),
      })
      yy -= SCHED_LINE_STEP
    }
  }

  const drawScheduleRow = (s: CallSheetStrip): void => {
    const isSpecial = scheduleStripIsSpecial(s.strip_type)
    const setW = wFor('synopsis') - pad * 2
    const notesW = wFor('notes') - pad * 2
    const castW = wFor('cast') - pad * 2

    let loc = ''
    let ep = ''
    let ScSh = ''
    let setLines: string[]
    let dn = ''
    let pgs = ''
    let castStr = ''
    let notesLines: string[]

    if (isSpecial) {
      loc = ''
      ep = ''
      ScSh = ''
      setLines = wrapLinesLimited(specialScheduleSetLine(s), setW, font, FONT_SCHED, 2)
      dn = ''
      pgs = ''
      castStr = ''
      notesLines = ['']
    } else {
      loc = s.locDitto ? DITTO_MARK : (s.locLabel ?? '')
      ep = (s.episodeLabel ?? '').trim()
      const sn = s.scene_number?.trim()
      const sh = s.shot_number?.trim()
      if (sn && sh) ScSh = `${sn} · ${sh}`
      else ScSh = sn ?? sh ?? ''
      setLines = wrapLinesLimited(formatCallSheetSynopsis(s), setW, font, FONT_SCHED, 2)
      dn = formatScheduleDnColumn(s.int_ext, s.day_night)
      pgs = s.page_eighths != null ? `${s.page_eighths}/8` : ''
      castStr = s.castCompact ?? ''
      const noteSrc = s.rowNotes?.trim() ?? ''
      notesLines = noteSrc ? wrapLinesLimited(noteSrc, notesW, font, FONT_SCHED, 2) : ['']
    }

    const shotSynopsisStyled =
      !isSpecial && s.strip_type === 'SHOT' && !!s.shot_description?.trim()
    const shotSynopsis = shotSynopsisStyled
      ? layoutShotSynopsis(s, setW, font, bold, FONT_SCHED, FONT_SCHED_SHOT_DESC)
      : null
    const synopsisLineCount = shotSynopsis
      ? shotSynopsisLineCount(shotSynopsis)
      : setLines.length

    const nLines = Math.max(synopsisLineCount, notesLines.length, 1)
    const rowH = 2 + nLines * SCHED_LINE_STEP

    ensureSpace(rowH + 6, true)

    if (isSpecial) {
      refs.page.drawRectangle({
        x: x0,
        y: refs.y.current - rowH + 7, // to account for the extra space added to the row height.
        width: tableW,
        height: rowH,
        color: SCHEDULE_SPECIAL_FILL,
      })
    }

    const yTop = refs.y.current
    const setFont = bold

    for (const c of cols) {
      const ci = colIndex(c.key)
      switch (c.key) {
        case 'loc':
          drawColumnText(ci, [loc], font, yTop)
          break
        case 'ep':
          drawColumnText(ci, [ep], font, yTop)
          break
        case 'scsh':
          drawColumnText(ci, [ScSh], font, yTop)
          break
        case 'synopsis': {
          if (shotSynopsis) {
            const x = xStarts[ci]! + pad
            let yy = yTop
            for (const line of shotSynopsis.sceneLines) {
              drawPdfText(refs.page, line.slice(0, 100), {
                x,
                y: yy,
                size: FONT_SCHED,
                font: bold,
                color: rgb(0, 0, 0),
              })
              yy -= SCHED_LINE_STEP
            }
            for (const line of shotSynopsis.shotLines) {
              drawPdfText(refs.page, line.slice(0, 100), {
                x,
                y: yy,
                size: FONT_SCHED_SHOT_DESC,
                font,
                color: rgb(0, 0, 0),
              })
              yy -= SCHED_LINE_STEP
            }
          } else {
            drawColumnText(ci, setLines, setFont, yTop)
          }
          break
        }
        case 'dn':
          drawColumnText(ci, [dn], font, yTop)
          break
        case 'pgs':
          drawColumnText(ci, [pgs], font, yTop)
          break
        case 'cast': {
          const castLines = wrapLinesLimited(castStr, castW, font, FONT_SCHED, nLines)
          drawColumnText(ci, castLines, font, yTop)
          break
        }
        case 'notes':
          drawColumnText(ci, notesLines, font, yTop)
          break
      }
    }

    refs.y.current -= rowH
    drawRule(refs.page, refs.y.current, x0, x0 + tableW, rgb(0.78, 0.78, 0.78))
    refs.y.current -= 2
  }

  itpMode = false
  for (const s of primaryStrips) {
    drawScheduleRow(s)
  }

  if (itpStrips.length > 0) {
    ensureSpace(LINE_BODY + SCHED_LINE_STEP * 2 + 14, true)
    drawPdfText(refs.page, 'IF TIME PERMITS', {
      x: MARGIN,
      y: refs.y.current,
      size: FONT_TABLE,
      font: bold,
    })
    refs.y.current -= LINE_BODY + 2
    itpMode = true
    for (const s of itpStrips) {
      drawScheduleRow(s)
    }
    itpMode = false
  }

  refs.y.current -= SEP_SECTION
}

const FONT_CAST = 7.5
const CAST_ROW_H = 9

type PrincipalCastCol = { key: string; label: string; width: number; center?: boolean }

function buildPrincipalCastColumns(rows: CallSheetCastRow[]): PrincipalCastCol[] {
  const hasChar = rows.some((r) => r.character_name?.trim())
  const hasReport = rows.some((r) => r.booking_schedule_line?.trim())
  const hasPhone = rows.some((r) => r.phone?.trim())
  const hasNotes = rows.some((r) => r.booking_notes?.trim())
  const hasAgent = rows.some((r) => r.agent_name?.trim() || r.agent_phone?.trim())

  const cols: PrincipalCastCol[] = [
    { key: 'id', label: 'ID', width: 28 },
    { key: 'cast', label: 'CAST', width: 108 },
  ]
  if (hasChar) cols.push({ key: 'char', label: 'CHARACTER', width: 102 })
  if (hasReport) cols.push({ key: 'onset', label: 'ON SET', width: 52, center: true })
  if (hasPhone) cols.push({ key: 'phone', label: 'PHONE', width: 76 })
  if (hasNotes) cols.push({ key: 'notes', label: 'NOTES', width: 86 })
  if (hasAgent) cols.push({ key: 'agent', label: 'AGENT', width: 52 })

  const target = PAGE_WIDTH - 2 * MARGIN
  const sum = cols.reduce((s, c) => s + c.width, 0)
  if (sum < target) {
    const castCol = cols.find((c) => c.key === 'cast')
    if (castCol) castCol.width += target - sum
  } else if (sum > target) {
    let over = sum - target
    const castCol = cols.find((c) => c.key === 'cast')
    const notesCol = cols.find((c) => c.key === 'notes')
    if (castCol && over > 0) {
      const take = Math.min(over, Math.max(0, castCol.width - 72))
      castCol.width -= take
      over -= take
    }
    if (notesCol && over > 0) {
      const take = Math.min(over, Math.max(0, notesCol.width - 56))
      notesCol.width -= take
      over -= take
    }
    if (castCol && over > 0) castCol.width = Math.max(64, castCol.width - over)
  }
  return cols
}

function principalCastCell(r: CallSheetCastRow, key: string): string {
  switch (key) {
    case 'id':
      return r.cast_number?.trim() ?? ''
    case 'cast':
      return (r.name ?? '').trim()
    case 'char':
      return r.character_name?.trim() ?? ''
    case 'onset':
      return r.booking_schedule_line?.trim() ?? ''
    case 'phone':
      return r.phone?.trim() ?? ''
    case 'notes':
      return r.booking_notes?.trim() ?? ''
    case 'agent':
      return [r.agent_name, r.agent_phone].filter(Boolean).join(' ').trim()
    default:
      return ''
  }
}

function drawPrincipalCastCallsGrid(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  let rows: CallSheetCastRow[] = data.castCalledRows?.length ? [...data.castCalledRows] : []
  if (rows.length === 0 && data.castCalled.length > 0) {
    rows = data.castCalled.map((name) => ({
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
  if (rows.length === 0) return

  const cols = buildPrincipalCastColumns(rows)
  const tableW = cols.reduce((s, c) => s + c.width, 0)
  const x0 = MARGIN
  const pad = 2

  const xStarts: number[] = [x0]
  for (let i = 1; i < cols.length; i++) {
    xStarts.push(xStarts[i - 1]! + cols[i - 1]!.width)
  }

  const drawCastHeaderRow = (): void => {
    drawRule(refs.page, refs.y.current, x0, x0 + tableW)
    refs.y.current -= CAST_ROW_H
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i]!
      const x = xStarts[i]! + pad
      drawPdfText(refs.page, c.label, { x, y: refs.y.current, size: FONT_CAST, font: bold })
    }
    refs.y.current -= CAST_ROW_H
    drawRule(refs.page, refs.y.current, x0, x0 + tableW)
    refs.y.current -= 3
  }

  const continuePrincipalCastOnNewPage = (): void => {
    refs.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    refs.y.current = PAGE_HEIGHT - MARGIN
    drawRunningHeader(refs.page, font, bold, data, refs.y, true)
    drawPdfText(refs.page, 'PRINCIPAL CAST CALLS', {
      x: MARGIN,
      y: refs.y.current,
      size: FONT_SECTION + 0.5,
      font: bold,
    })
    refs.y.current -= LINE_BODY + 2
    drawRule(refs.page, refs.y.current, MARGIN, MARGIN + tableW)
    refs.y.current -= 4
    drawCastHeaderRow()
  }

  refs.y.current -= 6
  drawPdfText(refs.page, 'PRINCIPAL CAST CALLS', {
    x: MARGIN,
    y: refs.y.current,
    size: FONT_SECTION + 0.5,
    font: bold,
  })
  refs.y.current -= LINE_BODY + 2
  drawRule(refs.page, refs.y.current, MARGIN, MARGIN + tableW)
  refs.y.current -= 4
  drawCastHeaderRow()

  const lineStep = CAST_ROW_H - 1 // Spacing for the cast calls grid.

  for (const r of rows) {
    const cellLines: string[][] = cols.map((c) => {
      const raw = principalCastCell(r, c.key)
      const maxW = c.width - pad * 2
      const maxLn = c.key === 'notes' ? 2 : 1
      return wrapLinesLimited(raw, maxW, font, FONT_CAST, maxLn)
    })
    const depth = Math.max(1, ...cellLines.map((ln) => ln.length))
    const rowH = 2 + depth * lineStep

    if (refs.y.current - rowH - 8 < Y_MIN) {
      continuePrincipalCastOnNewPage()
    }

    const yRow0 = refs.y.current
    for (let lineIdx = 0; lineIdx < depth; lineIdx++) {
      const yy = yRow0 - lineIdx * lineStep
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i]!
        const text = (cellLines[i]![lineIdx] ?? '').slice(0, 100)
        if (!text && lineIdx > 0) continue
        if (c.center && lineIdx === 0 && text) {
          const tw = font.widthOfTextAtSize(text, FONT_CAST)
          const cx = xStarts[i]! + (c.width - tw) / 2
          drawPdfText(refs.page, text, {
            x: Math.max(xStarts[i]! + pad, cx),
            y: yy,
            size: FONT_CAST,
            font,
          })
        } else if (!c.center) {
          drawPdfText(refs.page, text, {
            x: xStarts[i]! + pad,
            y: yy,
            size: FONT_CAST,
            font,
          })
        }
      }
    }
// This draws the horizontal rule below the cast calls grid.
    refs.y.current = yRow0 - rowH
    drawRule(refs.page, refs.y.current, x0, x0 + tableW, rgb(0.82, 0.82, 0.82))
    refs.y.current -= 2
  }

  refs.y.current -= SEP_SECTION
}

function mealTimeByPattern(
  meals: Array<{ name: string; time: string }>,
  re: RegExp
): string | null {
  const m = meals.find((x) => re.test(x.name.trim().toLowerCase()))
  return m?.time?.trim() ? m.time : null
}

function drawSectionHeading(
  page: Page,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  title: string,
  y: { current: number }
): void {
  drawPdfText(page, title.toUpperCase(), { x: MARGIN, y: y.current, size: FONT_SECTION, font: bold })
  y.current -= LINE_BODY + 1
  drawRule(page, y.current, MARGIN, PAGE_WIDTH - MARGIN)
  y.current -= LINE_BODY + 2
}

function drawParagraphLines(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  text: string,
  y: { current: number },
  maxWidth: number,
  size: number = FONT_BODY,
  color: ReturnType<typeof rgb> = rgb(0, 0, 0)
): void {
  const lines = wrapLines(text, maxWidth, font, size)
  for (const ln of lines) {
    if (y.current < Y_MIN) return
    drawPdfText(page, ln.slice(0, 120), { x: MARGIN, y: y.current, size, font, color })
    y.current -= LINE_BODY
  }
}

function drawMasthead(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  data: CallSheetData,
  y: { current: number }
): void {
  const contentW = PAGE_WIDTH - 2 * MARGIN
  const dateStr = formatShootDate(data.shootDate)
  drawPdfText(page, 'CALL SHEET', { x: MARGIN, y: y.current, size: FONT_MASTHEAD, font: bold })
  drawTextRight(page, dateStr, y.current, FONT_BODY, bold, PAGE_WIDTH - MARGIN)
  y.current -= LINE_SECTION + 2

  const prodLines = wrapLines(data.productionName, contentW, bold, FONT_PRODUCTION)
  for (const ln of prodLines) {
    drawPdfText(page, ln, { x: MARGIN, y: y.current, size: FONT_PRODUCTION, font: bold })
    y.current -= LINE_SECTION
  }

  const idParts: string[] = []
  if (data.dayNumber != null) idParts.push(`Day ${data.dayNumber}`)
  idParts.push(`Unit: ${data.unitName}`)
  drawPdfText(page, idParts.join('  ·  ').slice(0, 95), { x: MARGIN, y: y.current, size: FONT_BODY, font })
  y.current -= LINE_BODY
  const bloc = data.shootingBlocMastheadLabel?.trim()
  if (bloc) {
    drawPdfText(page, `Shooting bloc: ${bloc}`.slice(0, 95), { x: MARGIN, y: y.current, size: FONT_BODY, font })
    y.current -= LINE_BODY
  }
  /** Unit call / wrap live under Essential times (structured); avoid repeating them here. */
  y.current -= 4
}

function drawLabelValueColumn(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  pairs: Array<{ label: string; value: string | null }>,
  x: number,
  yStart: number,
  labelColW: number
): number {
  let y = yStart
  for (const { label, value } of pairs) {
    if (value == null || value === '') continue
    drawPdfText(page, label, { x, y, size: FONT_TABLE, font: bold })
    drawPdfText(page, value.slice(0, 42), { x: x + labelColW, y, size: FONT_TABLE, font })
    y -= ROW_HEIGHT
  }
  return y
}

function drawPrimaryContactsColumn(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  contacts: CallSheetKeyContact[],
  x: number,
  yStart: number
): number {
  let y = yStart
  drawPdfText(page, 'Primary contacts', { x, y, size: FONT_TABLE, font: bold })
  y -= ROW_HEIGHT + 1
  for (const c of contacts) {
    if (y < Y_MIN) break
    drawPdfText(page, c.department.slice(0, 22), { x, y, size: FONT_TABLE, font: bold })
    y -= ROW_HEIGHT - 1
    const namePhone = `${c.name ?? '—'} · ${c.phone ?? '—'}`
    drawPdfText(page, namePhone.slice(0, 38), { x, y, size: FONT_TABLE, font })
    y -= ROW_HEIGHT - 1
    if (primaryContactShowsEmail(c.department) && c.email?.trim()) {
      drawPdfText(page, c.email.slice(0, 38), { x, y, size: 7.5, font, color: GRAY })
      y -= ROW_HEIGHT - 1
    }
    y -= 1
  }
  return y
}

function drawEssentialTimesAndPrimaryContacts(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  data: CallSheetData,
  y: { current: number }
): void {
  drawSectionHeading(page, bold, 'Essential times & primary contacts', y)
  const splitX = MARGIN + 268
  const leftLabelW = 72
  const pairs: Array<{ label: string; value: string | null }> = [
    { label: 'Date', value: formatShootDate(data.shootDate) },
    { label: 'Unit call', value: data.callTime },
    { label: 'Wrap (est.)', value: data.wrapTime },
    { label: 'Breakfast', value: mealTimeByPattern(data.mealTimes, /breakfast/) },
    { label: 'Lunch', value: mealTimeByPattern(data.mealTimes, /lunch/) },
  ].filter((p) => p.value != null && p.value !== '')

  const yAfterLeft = drawLabelValueColumn(page, font, bold, pairs, MARGIN, y.current, leftLabelW)
  const rightContacts = data.primaryContactsTop ?? []
  const yAfterRight =
    rightContacts.length > 0
      ? drawPrimaryContactsColumn(page, font, bold, rightContacts, splitX, y.current)
      : y.current

  y.current = Math.min(yAfterLeft, yAfterRight) - SEP_SECTION
}

function hasEnvironmentContent(data: CallSheetData): boolean {
  const w = data.weatherStored ?? null
  return !!(
    data.weatherSummary?.trim() ||
    data.weatherManual?.trim() ||
    data.weatherSunrise?.trim() ||
    data.weatherSunset?.trim() ||
    (w && (w.summary || w.high || w.low || w.wind || w.sunrise || w.sunset || w.tide)) ||
    data.dayNotes?.trim() ||
    data.unitNotes?.trim() ||
    data.specialNotes?.trim() ||
    data.hospitalName ||
    data.hospitalAddress ||
    data.policeStationName ||
    data.policeStationAddress
  )
}

function drawEnvironmentAndSafety(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  data: CallSheetData,
  y: { current: number }
): void {
  if (!hasEnvironmentContent(data)) return
  drawSectionHeading(page, bold, 'Environment & safety', y)

  const w = data.weatherStored ?? null
  const wx: Array<{ label: string; value: string }> = []
  if (data.weatherSummary?.trim()) wx.push({ label: 'Forecast', value: data.weatherSummary.trim() })
  const storedSummary = w?.summary?.trim()
  if (storedSummary && (!data.weatherSummary?.trim() || storedSummary !== data.weatherSummary.trim())) {
    wx.push({ label: 'Conditions', value: storedSummary })
  }
  const hi = w?.high?.trim()
  const lo = w?.low?.trim()
  if (hi || lo) wx.push({ label: 'Temp', value: [hi ? `High ${hi}` : '', lo ? `Low ${lo}` : ''].filter(Boolean).join(' · ') })
  if (w?.wind?.trim()) wx.push({ label: 'Wind', value: w.wind.trim() })
  const sunriseDisplay = (data.weatherSunrise?.trim() || w?.sunrise?.trim() || '').trim()
  const sunsetDisplay = (data.weatherSunset?.trim() || w?.sunset?.trim() || '').trim()
  if (sunriseDisplay) wx.push({ label: 'Sunrise', value: sunriseDisplay })
  if (sunsetDisplay) wx.push({ label: 'Sunset', value: sunsetDisplay })
  if (w?.tide?.trim()) wx.push({ label: 'Tide', value: w.tide.trim() })

  if (wx.length) {
    const y0 = drawLabelValueColumn(page, font, bold, wx, MARGIN, y.current, 52)
    y.current = y0 - 2
  }

  if (data.weatherManual?.trim()) {
    drawPdfText(page, 'Weather (manual)', { x: MARGIN, y: y.current, size: FONT_TABLE, font: bold })
    y.current -= LINE_BODY
    drawParagraphLines(page, font, data.weatherManual.trim(), y, PAGE_WIDTH - 2 * MARGIN, FONT_TABLE)
    y.current -= 2
  }

  const noteBlocks: Array<{ title: string; body: string }> = []
  if (data.dayNotes?.trim()) noteBlocks.push({ title: 'Day notes', body: data.dayNotes.trim() })
  if (data.unitNotes?.trim()) noteBlocks.push({ title: 'Unit notes', body: data.unitNotes.trim() })
  if (data.specialNotes?.trim()) noteBlocks.push({ title: 'Safety / special', body: data.specialNotes.trim() })

  for (const nb of noteBlocks) {
    if (y.current < Y_MIN) return
    drawPdfText(page, nb.title, { x: MARGIN, y: y.current, size: FONT_TABLE, font: bold })
    y.current -= LINE_BODY
    drawParagraphLines(page, font, nb.body, y, PAGE_WIDTH - 2 * MARGIN, FONT_TABLE)
    y.current -= 2
  }

  if (data.hospitalName || data.hospitalAddress) {
    if (y.current < Y_MIN) return
    drawPdfText(page, 'Hospital', { x: MARGIN, y: y.current, size: FONT_TABLE, font: bold })
    y.current -= LINE_BODY
    const hospitalLine = [data.hospitalName, data.hospitalAddress].filter(Boolean).join(' — ')
    drawParagraphLines(page, font, hospitalLine, y, PAGE_WIDTH - 2 * MARGIN, FONT_TABLE)
    y.current -= 2
  }
  if (data.policeStationName || data.policeStationAddress) {
    if (y.current < Y_MIN) return
    drawPdfText(page, 'Police / emergency', { x: MARGIN, y: y.current, size: FONT_TABLE, font: bold })
    y.current -= LINE_BODY
    const policeLine = [data.policeStationName, data.policeStationAddress].filter(Boolean).join(' — ')
    drawParagraphLines(page, font, policeLine, y, PAGE_WIDTH - 2 * MARGIN, FONT_TABLE)
    y.current -= 2
  }
  y.current -= SEP_SECTION - 2
}

function hasBaseAndLocationsContent(data: CallSheetData): boolean {
  return !!(data.parkingBaseAddress?.trim() || data.locations.length > 0)
}

function drawBaseAndLocations(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  data: CallSheetData,
  y: { current: number }
): void {
  if (!hasBaseAndLocationsContent(data)) return
  drawSectionHeading(page, bold, 'Base & locations', y)

  if (data.parkingBaseAddress?.trim()) {
    drawPdfText(page, 'Unit base / crew parking', { x: MARGIN, y: y.current, size: FONT_TABLE, font: bold })
    y.current -= LINE_BODY
    drawParagraphLines(page, font, data.parkingBaseAddress.trim(), y, PAGE_WIDTH - 2 * MARGIN, FONT_TABLE)
    y.current -= 2
  }

  if (data.locations.length > 0) {
    drawPdfText(page, 'Shooting location(s)', { x: MARGIN, y: y.current, size: FONT_TABLE, font: bold })
    y.current -= LINE_BODY
    const seen = new Set<string>()
    for (const l of data.locations) {
      if (y.current < Y_MIN) break
      const key = `${l.name}|${l.address ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      const head = l.address?.trim() ? `${l.name} — ${l.address}` : l.name
      drawParagraphLines(page, font, head, y, PAGE_WIDTH - 2 * MARGIN - 8, FONT_TABLE)
      if (l.what3words?.trim()) {
        drawPdfText(page, `what3words: ${l.what3words}`.slice(0, 70), {
          x: MARGIN + 6,
          y: y.current,
          size: FONT_TABLE,
          font,
          color: GRAY,
        })
        y.current -= ROW_HEIGHT - 1
      }
      if (l.notes?.trim()) {
        drawParagraphLines(page, font, l.notes.trim(), y, PAGE_WIDTH - 2 * MARGIN - 8, FONT_TABLE - 0.5, GRAY)
      }
      y.current -= 1
    }
  }
  y.current -= SEP_SECTION
}

function primaryContactDedupKey(c: CallSheetKeyContact): string {
  return `${c.department.trim().toLowerCase()}\0${(c.name ?? '').trim().toLowerCase()}\0${(c.phone ?? '').trim()}`
}

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

type DepartmentalBlock = {
  department: string
  keyContacts: CallSheetKeyContact[]
  crewGroup: CallSheetCrewGroup | null
}

function buildGeneralDepartmentalBlocks(data: CallSheetData): DepartmentalBlock[] {
  const primaryKeys = new Set((data.primaryContactsTop ?? []).map(primaryContactDedupKey))
  const crewOrder = new Map<string, number>()
  ;(data.crewGroups ?? []).forEach((g, i) => crewOrder.set(g.department, i))

  const byDept = new Map<string, DepartmentalBlock>()

  for (const g of data.crewGroups ?? []) {
    if (isHealthSafetyStuntsDepartment(g.department)) continue
    if (g.rows.length === 0) continue
    byDept.set(g.department, { department: g.department, keyContacts: [], crewGroup: g })
  }

  for (const c of data.keyContacts) {
    if (isHealthSafetyStuntsDepartment(c.department)) continue
    if (primaryKeys.has(primaryContactDedupKey(c))) continue
    const hasPayload =
      (c.name?.trim() ?? '') !== '' ||
      (c.phone?.trim() ?? '') !== '' ||
      (c.email?.trim() ?? '') !== '' ||
      (c.notes?.trim() ?? '') !== ''
    if (!hasPayload) continue
    let blk = byDept.get(c.department)
    if (!blk) {
      blk = { department: c.department, keyContacts: [], crewGroup: null }
      byDept.set(c.department, blk)
    }
    blk.keyContacts.push(c)
  }

  const depts = Array.from(byDept.keys())
  depts.sort((a, b) => {
    const ia = crewOrder.has(a) ? crewOrder.get(a)! : 999
    const ib = crewOrder.has(b) ? crewOrder.get(b)! : 999
    if (ia !== ib) return ia - ib
    return a.localeCompare(b)
  })

  return depts.map((d) => byDept.get(d)!)
}

type HealthSafetyBlock = {
  department: string
  keyContacts: CallSheetKeyContact[]
  crewGroup: CallSheetCrewGroup | null
}

function buildHealthSafetyBlocks(data: CallSheetData): HealthSafetyBlock[] {
  const primaryKeys = new Set((data.primaryContactsTop ?? []).map(primaryContactDedupKey))
  const crewOrder = new Map<string, number>()
  ;(data.crewGroups ?? []).forEach((g, i) => crewOrder.set(g.department, i))

  const byDept = new Map<string, HealthSafetyBlock>()

  for (const g of data.crewGroups ?? []) {
    if (!isHealthSafetyStuntsDepartment(g.department)) continue
    if (g.rows.length === 0) continue
    byDept.set(g.department, { department: g.department, keyContacts: [], crewGroup: g })
  }

  for (const c of data.keyContacts) {
    if (!isHealthSafetyStuntsDepartment(c.department)) continue
    if (primaryKeys.has(primaryContactDedupKey(c))) continue
    const hasPayload =
      (c.name?.trim() ?? '') !== '' ||
      (c.phone?.trim() ?? '') !== '' ||
      (c.notes?.trim() ?? '') !== ''
    if (!hasPayload) continue
    let blk = byDept.get(c.department)
    if (!blk) {
      blk = { department: c.department, keyContacts: [], crewGroup: null }
      byDept.set(c.department, blk)
    }
    blk.keyContacts.push(c)
  }

  const depts = Array.from(byDept.keys())
  depts.sort((a, b) => {
    const ia = crewOrder.has(a) ? crewOrder.get(a)! : 999
    const ib = crewOrder.has(b) ? crewOrder.get(b)! : 999
    if (ia !== ib) return ia - ib
    return a.localeCompare(b)
  })

  return depts.map((d) => byDept.get(d)!)
}

function hasOperationalSupportLayer(data: CallSheetData): boolean {
  if (buildGeneralDepartmentalBlocks(data).length > 0) return true
  if (buildHealthSafetyBlocks(data).length > 0) return true
  if (data.mealTimes.length > 0) return true
  if ((data.radioChannels?.length ?? 0) > 0) return true
  if ((data.transportRows?.length ?? 0) > 0) return true
  return false
}

function estimateDepartmentalBlockLines(block: DepartmentalBlock): number {
  let n = 2
  for (const c of block.keyContacts) {
    n += 1
    if (c.notes?.trim()) n += 2
  }
  if (block.crewGroup && block.crewGroup.rows.length > 0) n += 2 + block.crewGroup.rows.length
  return n
}

function drawSupportContinuationHeader(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  data: CallSheetData,
  y: { current: number }
): void {
  drawRunningHeader(page, font, bold, data, y, true)
  drawPdfText(page, 'Operational support', {
    x: MARGIN,
    y: y.current,
    size: FONT_SUPPORT,
    font,
    color: GRAY,
  })
  y.current -= LINE_BODY + SUPPORT_SEP - 2
}

function drawSupportMajorHeading(
  page: Page,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  titleUpper: string,
  continued: boolean,
  y: { current: number }
): void {
  const label = continued ? `${titleUpper} (cont'd)` : titleUpper
  drawPdfText(page, label, { x: MARGIN, y: y.current, size: FONT_SUPPORT_HEAD, font: bold })
  y.current -= ROW_SUPPORT
  drawRule(page, y.current, MARGIN, PAGE_WIDTH - MARGIN)
  y.current -= ROW_SUPPORT
}

/** Start a new page mid–operational-support block; redraw running header + caller’s subsection banner. */
function breakSupportSubsectionPage(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  redrawSubsectionContinued: () => void
): void {
  refs.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  refs.y.current = PAGE_HEIGHT - MARGIN
  drawSupportContinuationHeader(refs.page, font, bold, data, refs.y)
  redrawSubsectionContinued()
}

function drawCompactCrewTableHeader(
  page: Page,
  _font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  y: { current: number },
  hasPhone: boolean,
  nameW: number,
  roleW: number,
  _phoneW: number,
  tableW: number,
  x0: number
): void {
  drawRule(page, y.current, x0, x0 + tableW)
  y.current -= ROW_SUPPORT
  drawPdfText(page, 'Name', { x: x0 + 2, y: y.current, size: FONT_SUPPORT, font: bold })
  drawPdfText(page, 'Role', { x: x0 + nameW + 2, y: y.current, size: FONT_SUPPORT, font: bold })
  if (hasPhone) {
    drawPdfText(page, 'Phone', { x: x0 + nameW + roleW + 2, y: y.current, size: FONT_SUPPORT, font: bold })
  }
  y.current -= ROW_SUPPORT
  drawRule(page, y.current, x0, x0 + tableW)
  y.current -= 2
}

function drawCompactCrewRows(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  rows: CallSheetCrewRow[],
  redrawSubsectionContinued: () => void
): void {
  if (rows.length === 0) return
  const hasPhone = rows.some((r) => (r.phone?.trim() ?? '') !== '')
  const nameW = hasPhone ? 132 : 168
  const roleW = hasPhone ? 148 : 200
  const phoneW = hasPhone ? 98 : 0
  const tableW = nameW + roleW + phoneW
  const x0 = MARGIN
  drawCompactCrewTableHeader(refs.page, font, bold, refs.y, hasPhone, nameW, roleW, phoneW, tableW, x0)
  const maxName = Math.max(6, Math.floor(nameW / 4.2))
  const maxRole = Math.max(6, Math.floor(roleW / 4.2))
  const maxPh = Math.max(4, Math.floor(phoneW / 4.2))
  for (const r of rows) {
    if (refs.y.current - ROW_SUPPORT < Y_MIN) {
      breakSupportSubsectionPage(doc, refs, data, font, bold, () => {
        redrawSubsectionContinued()
        drawCompactCrewTableHeader(
          refs.page,
          font,
          bold,
          refs.y,
          hasPhone,
          nameW,
          roleW,
          phoneW,
          tableW,
          x0
        )
      })
    }
    const roleCell = [r.role_name?.trim() ?? '', r.is_hod ? 'HOD' : ''].filter(Boolean).join(' · ')
    drawPdfText(refs.page, (r.name ?? '').slice(0, maxName), {
      x: x0 + 2,
      y: refs.y.current,
      size: FONT_SUPPORT,
      font,
    })
    drawPdfText(refs.page, roleCell.slice(0, maxRole), {
      x: x0 + nameW + 2,
      y: refs.y.current,
      size: FONT_SUPPORT,
      font,
    })
    if (hasPhone) {
      drawPdfText(refs.page, (r.phone?.trim() ?? '').slice(0, maxPh), {
        x: x0 + nameW + roleW + 2,
        y: refs.y.current,
        size: FONT_SUPPORT,
        font,
      })
    }
    refs.y.current -= ROW_SUPPORT
  }
  drawRule(refs.page, refs.y.current, x0, x0 + tableW, rgb(0.82, 0.82, 0.82))
  refs.y.current -= SUPPORT_SEP
}

function drawKeyContactLines(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  contacts: CallSheetKeyContact[],
  indent: number,
  redrawSubsectionContinued: () => void
): void {
  const xBase = MARGIN + indent
  const maxW = PAGE_WIDTH - MARGIN - xBase
  for (const c of contacts) {
    const parts: string[] = []
    if (c.name?.trim()) parts.push(c.name.trim())
    if (c.phone?.trim()) parts.push(c.phone.trim())
    const head = parts.join(' · ')
    if (head) {
      if (refs.y.current - ROW_SUPPORT < Y_MIN) {
        breakSupportSubsectionPage(doc, refs, data, font, bold, redrawSubsectionContinued)
      }
      drawPdfText(refs.page, head.slice(0, 72), { x: xBase, y: refs.y.current, size: FONT_SUPPORT, font: bold })
      refs.y.current -= ROW_SUPPORT
    }
    if (c.email?.trim()) {
      if (refs.y.current - ROW_SUPPORT < Y_MIN) {
        breakSupportSubsectionPage(doc, refs, data, font, bold, redrawSubsectionContinued)
      }
      drawPdfText(refs.page, c.email.trim().slice(0, 72), {
        x: xBase,
        y: refs.y.current,
        size: FONT_SUPPORT - 0.5,
        font,
        color: GRAY,
      })
      refs.y.current -= ROW_SUPPORT - 1
    }
    if (c.notes?.trim()) {
      const lines = wrapLines(c.notes.trim(), maxW, font, FONT_SUPPORT - 0.5)
      for (const ln of lines) {
        if (refs.y.current - ROW_SUPPORT < Y_MIN) {
          breakSupportSubsectionPage(doc, refs, data, font, bold, redrawSubsectionContinued)
        }
        drawPdfText(refs.page, ln.slice(0, 100), {
          x: xBase,
          y: refs.y.current,
          size: FONT_SUPPORT - 0.5,
          font,
          color: GRAY,
        })
        refs.y.current -= ROW_SUPPORT - 1
      }
    }
    refs.y.current -= 1
  }
}

function drawDepartmentalRequirementsSection(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  const blocks = buildGeneralDepartmentalBlocks(data)
  if (blocks.length === 0) return

  let sectionHeadingDrawn = false
  for (const block of blocks) {
    const needLines = estimateDepartmentalBlockLines(block) + 2
    const pr = addPageIfNeeded(doc, refs.page, refs.y, needLines)
    refs.page = pr.page
    if (pr.isNew) {
      drawSupportContinuationHeader(refs.page, font, bold, data, refs.y)
    }
    if (!sectionHeadingDrawn || pr.isNew) {
      const contd = sectionHeadingDrawn && pr.isNew
      drawSupportMajorHeading(refs.page, bold, 'DEPARTMENTAL REQUIREMENTS', contd, refs.y)
      sectionHeadingDrawn = true
    }

    drawPdfText(refs.page, block.department.toUpperCase(), {
      x: MARGIN,
      y: refs.y.current,
      size: FONT_SUPPORT,
      font: bold,
    })
    refs.y.current -= ROW_SUPPORT
    drawRule(refs.page, refs.y.current, MARGIN + 4, PAGE_WIDTH - MARGIN, rgb(0.78, 0.78, 0.78))
    refs.y.current -= 3

    const redrawSubsectionContinued = () => {
      drawSupportMajorHeading(refs.page, bold, 'DEPARTMENTAL REQUIREMENTS', true, refs.y)
      drawPdfText(refs.page, block.department.toUpperCase(), {
        x: MARGIN,
        y: refs.y.current,
        size: FONT_SUPPORT,
        font: bold,
      })
      refs.y.current -= ROW_SUPPORT
      drawRule(refs.page, refs.y.current, MARGIN + 4, PAGE_WIDTH - MARGIN, rgb(0.78, 0.78, 0.78))
      refs.y.current -= 3
    }

    if (block.keyContacts.length > 0) {
      drawKeyContactLines(doc, refs, data, font, bold, block.keyContacts, 4, redrawSubsectionContinued)
    }
    if (block.crewGroup && block.crewGroup.rows.length > 0) {
      drawCompactCrewRows(doc, refs, data, font, bold, block.crewGroup.rows, redrawSubsectionContinued)
    }
    refs.y.current -= 2
  }
  refs.y.current -= SUPPORT_SEP
}

function drawHealthSafetyStuntsSection(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  const blocks = buildHealthSafetyBlocks(data)
  if (blocks.length === 0) return

  let sectionHeadingDrawn = false
  for (const block of blocks) {
    const needLines = estimateDepartmentalBlockLines({
      department: block.department,
      keyContacts: block.keyContacts,
      crewGroup: block.crewGroup,
    })
    const pr = addPageIfNeeded(doc, refs.page, refs.y, needLines + 2)
    refs.page = pr.page
    if (pr.isNew) {
      drawSupportContinuationHeader(refs.page, font, bold, data, refs.y)
    }
    if (!sectionHeadingDrawn || pr.isNew) {
      const contd = sectionHeadingDrawn && pr.isNew
      drawSupportMajorHeading(refs.page, bold, 'HEALTH, SAFETY & STUNTS', contd, refs.y)
      sectionHeadingDrawn = true
    }

    drawPdfText(refs.page, block.department.toUpperCase(), {
      x: MARGIN,
      y: refs.y.current,
      size: FONT_SUPPORT,
      font: bold,
    })
    refs.y.current -= ROW_SUPPORT
    drawRule(refs.page, refs.y.current, MARGIN + 4, PAGE_WIDTH - MARGIN, rgb(0.78, 0.78, 0.78))
    refs.y.current -= 3

    const redrawSubsectionContinued = () => {
      drawSupportMajorHeading(refs.page, bold, 'HEALTH, SAFETY & STUNTS', true, refs.y)
      drawPdfText(refs.page, block.department.toUpperCase(), {
        x: MARGIN,
        y: refs.y.current,
        size: FONT_SUPPORT,
        font: bold,
      })
      refs.y.current -= ROW_SUPPORT
      drawRule(refs.page, refs.y.current, MARGIN + 4, PAGE_WIDTH - MARGIN, rgb(0.78, 0.78, 0.78))
      refs.y.current -= 3
    }

    if (block.keyContacts.length > 0) {
      drawKeyContactLines(doc, refs, data, font, bold, block.keyContacts, 4, redrawSubsectionContinued)
    }
    if (block.crewGroup && block.crewGroup.rows.length > 0) {
      drawCompactCrewRows(doc, refs, data, font, bold, block.crewGroup.rows, redrawSubsectionContinued)
    }
    refs.y.current -= 2
  }
  refs.y.current -= SUPPORT_SEP
}

function drawCateringMealsSection(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  const meals = data.mealTimes.filter((m) => (m.name?.trim() ?? '') !== '' && (m.time?.trim() ?? '') !== '')
  if (meals.length === 0) return

  let pr = addPageIfNeeded(doc, refs.page, refs.y, 6 + meals.length * 2)
  refs.page = pr.page
  if (pr.isNew) {
    drawSupportContinuationHeader(refs.page, font, bold, data, refs.y)
  }
  drawSupportMajorHeading(refs.page, bold, 'CATERING / MEALS', false, refs.y)

  const mealW = 200
  const timeW = 120
  const tw = mealW + timeW
  const x0 = MARGIN
  drawRule(refs.page, refs.y.current, x0, x0 + tw)
  refs.y.current -= ROW_SUPPORT
  drawPdfText(refs.page, 'Meal', { x: x0 + 2, y: refs.y.current, size: FONT_SUPPORT, font: bold })
  drawPdfText(refs.page, 'Time', { x: x0 + mealW + 2, y: refs.y.current, size: FONT_SUPPORT, font: bold })
  refs.y.current -= ROW_SUPPORT
  drawRule(refs.page, refs.y.current, x0, x0 + tw)
  refs.y.current -= 2
  for (const m of meals) {
    if (refs.y.current < Y_MIN) {
      pr = addPageIfNeeded(doc, refs.page, refs.y, 4 + meals.length)
      refs.page = pr.page
      if (pr.isNew) {
        drawSupportContinuationHeader(refs.page, font, bold, data, refs.y)
        drawSupportMajorHeading(refs.page, bold, 'CATERING / MEALS', true, refs.y)
        drawRule(refs.page, refs.y.current, x0, x0 + tw)
        refs.y.current -= ROW_SUPPORT
        drawPdfText(refs.page, 'Meal', { x: x0 + 2, y: refs.y.current, size: FONT_SUPPORT, font: bold })
        drawPdfText(refs.page, 'Time', { x: x0 + mealW + 2, y: refs.y.current, size: FONT_SUPPORT, font: bold })
        refs.y.current -= ROW_SUPPORT
        drawRule(refs.page, refs.y.current, x0, x0 + tw)
        refs.y.current -= 2
      }
    }
    drawPdfText(refs.page, m.name.trim().slice(0, 36), {
      x: x0 + 2,
      y: refs.y.current,
      size: FONT_SUPPORT,
      font,
    })
    drawPdfText(refs.page, m.time.trim().slice(0, 16), {
      x: x0 + mealW + 2,
      y: refs.y.current,
      size: FONT_SUPPORT,
      font,
    })
    refs.y.current -= ROW_SUPPORT
  }
  drawRule(refs.page, refs.y.current, x0, x0 + tw, rgb(0.82, 0.82, 0.82))
  refs.y.current -= SUPPORT_SEP + 2
}

function drawRadioChannelsSection(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  const rows = (data.radioChannels ?? []).filter(
    (r) => (r.channel?.trim() ?? '') !== '' && (r.purpose?.trim() ?? '') !== ''
  )
  if (rows.length === 0) return

  let pr = addPageIfNeeded(doc, refs.page, refs.y, 6 + rows.length * 2)
  refs.page = pr.page
  if (pr.isNew) {
    drawSupportContinuationHeader(refs.page, font, bold, data, refs.y)
  }
  let sectionHeadingDrawn = false
  for (const r of rows) {
    pr = addPageIfNeeded(doc, refs.page, refs.y, 3)
    refs.page = pr.page
    if (pr.isNew) {
      drawSupportContinuationHeader(refs.page, font, bold, data, refs.y)
    }
    if (!sectionHeadingDrawn || pr.isNew) {
      const contd = sectionHeadingDrawn && pr.isNew
      drawSupportMajorHeading(refs.page, bold, 'RADIO CHANNELS', contd, refs.y)
      sectionHeadingDrawn = true
    }
    const line = `${r.channel.trim()} — ${r.purpose.trim()}`
    drawPdfText(refs.page, line.slice(0, 88), {
      x: MARGIN + 2,
      y: refs.y.current,
      size: FONT_SUPPORT,
      font,
    })
    refs.y.current -= ROW_SUPPORT
  }
  refs.y.current -= SUPPORT_SEP
}

function drawTransportRequirementsSection(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  const rows = data.transportRows ?? []
  if (rows.length === 0) return

  const colDefs: { key: keyof CallSheetTransportRow; label: string; width: number }[] = [
    { key: 'driver', label: 'Driver', width: 72 },
    { key: 'pickupTime', label: 'Pickup', width: 52 },
    { key: 'passenger', label: 'Passenger', width: 86 },
    { key: 'from', label: 'From', width: 68 },
    { key: 'to', label: 'To', width: 68 },
    { key: 'arrival', label: 'Arrival', width: 52 },
  ]
  const activeCols = colDefs.filter((c) =>
    rows.some((r) => {
      const v = r[c.key]
      return v != null && String(v).trim() !== ''
    })
  )
  if (activeCols.length === 0) return

  const tableW = activeCols.reduce((s, c) => s + c.width, 0)
  const x0 = MARGIN

  const drawTransportTableHeader = (): void => {
    drawRule(refs.page, refs.y.current, x0, x0 + tableW)
    refs.y.current -= ROW_SUPPORT
    let x = x0 + 2
    for (const c of activeCols) {
      drawPdfText(refs.page, c.label, { x, y: refs.y.current, size: FONT_SUPPORT, font: bold })
      x += c.width
    }
    refs.y.current -= ROW_SUPPORT
    drawRule(refs.page, refs.y.current, x0, x0 + tableW)
    refs.y.current -= 2
  }

  let pr = addPageIfNeeded(doc, refs.page, refs.y, 8 + rows.length * 2)
  refs.page = pr.page
  if (pr.isNew) {
    drawSupportContinuationHeader(refs.page, font, bold, data, refs.y)
  }

  let sectionHeadingDrawn = false
  for (const row of rows) {
    pr = addPageIfNeeded(doc, refs.page, refs.y, 4)
    refs.page = pr.page
    if (pr.isNew) {
      drawSupportContinuationHeader(refs.page, font, bold, data, refs.y)
    }
    if (!sectionHeadingDrawn || pr.isNew) {
      const contd = sectionHeadingDrawn && pr.isNew
      drawSupportMajorHeading(refs.page, bold, 'TRANSPORT REQUIREMENTS', contd, refs.y)
      drawTransportTableHeader()
      sectionHeadingDrawn = true
    }

    let x = x0 + 2
    for (const c of activeCols) {
      const cell = String(row[c.key] ?? '').trim()
      const mw = Math.max(4, Math.floor(c.width / 4.2))
      drawPdfText(refs.page, cell.slice(0, mw), { x, y: refs.y.current, size: FONT_SUPPORT, font })
      x += c.width
    }
    refs.y.current -= ROW_SUPPORT
  }
  drawRule(refs.page, refs.y.current, x0, x0 + tableW, rgb(0.82, 0.82, 0.82))
  refs.y.current -= SUPPORT_SEP + 2
}

const FONT_ADV = 6.75
const FONT_ADV_SHOT_DESC = FONT_ADV - 0.5
const ADV_LINE_STEP = 7

// Advanced Schedule Logic & layout
function drawAdvancedScheduleSection(
  doc: PDFDocument,
  refs: ScheduleDrawRefs,
  data: CallSheetData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  const days = data.advancedScheduleDays ?? []
  if (days.length === 0) return

  const drawDayMeta = (day: CallSheetAdvancedDay, contd: boolean): void => {
    const head = `${formatShootDate(day.shootDate)}${contd ? " (cont'd)" : ''}`
    drawPdfText(refs.page, head, { x: MARGIN, y: refs.y.current, size: FONT_SUPPORT, font: bold })
    refs.y.current -= ROW_SUPPORT
    const idParts: string[] = []
    if (day.dayNumber != null) idParts.push(`Day ${day.dayNumber}`)
    if (day.callTime?.trim()) idParts.push(`Unit call ${day.callTime.trim()}`)
    if (idParts.length) {
      drawPdfText(refs.page, idParts.join('  ·  ').slice(0, 92), {
        x: MARGIN,
        y: refs.y.current,
        size: FONT_SUPPORT - 0.5,
        font,
      })
      refs.y.current -= ROW_SUPPORT - 1
    }
    if (day.parkingBaseAddress?.trim()) {
      drawPdfText(refs.page, `Base: ${day.parkingBaseAddress.trim()}`.slice(0, 92), {
        x: MARGIN,
        y: refs.y.current,
        size: FONT_SUPPORT - 0.5,
        font,
      })
      refs.y.current -= ROW_SUPPORT - 1
    }
    if (day.locationSummary?.trim()) {
      drawPdfText(refs.page, `Locations: ${day.locationSummary.trim()}`.slice(0, 92), {
        x: MARGIN,
        y: refs.y.current,
        size: FONT_SUPPORT - 0.5,
        font,
        color: GRAY,
      })
      refs.y.current -= ROW_SUPPORT
    }
    refs.y.current -= 2
  }

  let sectionHeadingDrawn = false

  for (const day of days) {
    const est = 32 + Math.max(day.strips.length, 1) * 10
    let pr = addPageIfNeeded(doc, refs.page, refs.y, est)
    refs.page = pr.page
    if (pr.isNew) {
      refs.y.current = PAGE_HEIGHT - MARGIN
      drawRunningHeader(refs.page, font, bold, data, refs.y, true)
    }
    if (!sectionHeadingDrawn || pr.isNew) {
      const contd = sectionHeadingDrawn && pr.isNew
      drawSupportMajorHeading(refs.page, bold, 'ADVANCED SCHEDULE', contd, refs.y)
      sectionHeadingDrawn = true
    }

    drawDayMeta(day, false)

    const primaryStrips = day.strips.filter((s) => !s.ifTimePermits)
    const itpStrips = day.strips.filter((s) => s.ifTimePermits)

    const drawLightBlock = (list: CallSheetStrip[], showItpBanner: boolean): void => {
      if (list.length === 0) return
      const hasCast = list.some((s) => (s.castCompact?.trim() ?? '').length > 0)
      const cols = buildAdvancedScheduleColumns({
        includeEpisodesInSchedule: data.includeEpisodesInSchedule === true,
        hasCast,
      })
      const tableW = cols.reduce((s, c) => s + c.w, 0)
      const x0 = MARGIN
      const pad = 2
      const xStarts: number[] = [x0]
      for (let i = 1; i < cols.length; i++) {
        xStarts.push(xStarts[i - 1]! + cols[i - 1]!.w)
      }

      const advColIdx = (k: AdvancedScheduleColKey): number => {
        const i = cols.findIndex((c) => c.key === k)
        if (i < 0) throw new Error(`Missing advanced schedule column ${k}`)
        return i
      }

      const drawTableHead = (): void => {
        drawRule(refs.page, refs.y.current, x0, x0 + tableW)
        refs.y.current -= ROW_SUPPORT
        let xh = x0
        for (const c of cols) {
          drawPdfText(refs.page, c.label, { x: xh + pad, y: refs.y.current, size: FONT_ADV, font: bold })
          xh += c.w
        }
        refs.y.current -= ROW_SUPPORT
        drawRule(refs.page, refs.y.current, x0, x0 + tableW)
        refs.y.current -= 2
      }

      const ensure = (minH: number, repeatHead: boolean): void => {
        if (refs.y.current - minH >= Y_MIN) return
        refs.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        refs.y.current = PAGE_HEIGHT - MARGIN
        drawRunningHeader(refs.page, font, bold, data, refs.y, true)
        drawSupportMajorHeading(refs.page, bold, 'ADVANCED SCHEDULE', true, refs.y)
        drawDayMeta(day, true)
        if (showItpBanner) {
          drawPdfText(refs.page, 'IF TIME PERMITS', {
            x: MARGIN,
            y: refs.y.current,
            size: FONT_TABLE,
            font: bold,
          })
          refs.y.current -= LINE_BODY + 2
        }
        if (repeatHead) drawTableHead()
      }

      ensure(36, false)
      drawTableHead()

      const synopsisW = cols[advColIdx('synopsis')].w - pad * 2
      const castEntry = cols.find((c) => c.key === 'cast')
      const castW = castEntry ? castEntry.w - pad * 2 : 0

      for (const s of list) {
        const isSpecial = scheduleStripIsSpecial(s.strip_type)

        let loc = ''
        let ep = ''
        let ScSh = ''
        let setLines: string[]
        let dn = ''
        let pgs = ''
        let castStr = ''

        if (isSpecial) {
          loc = ''
          ep = ''
          ScSh = ''
          setLines = wrapLinesLimited(specialScheduleSetLine(s), synopsisW, font, FONT_ADV, 1)
          dn = ''
          pgs = ''
          castStr = ''
        } else {
          loc = s.locDitto ? DITTO_MARK : (s.locLabel ?? '')
          ep = (s.episodeLabel ?? '').trim()
          const sn = s.scene_number?.trim()
          const sh = s.shot_number?.trim()
          if (sn && sh) ScSh = `${sn} · ${sh}`
          else ScSh = sn ?? sh ?? ''
          setLines = wrapLinesLimited(formatCallSheetSynopsis(s), synopsisW, font, FONT_ADV, 1)
          dn = formatScheduleDnColumn(s.int_ext, s.day_night)
          pgs = s.page_eighths != null ? `${s.page_eighths}/8` : ''
          castStr = s.castCompact ?? ''
        }

        const shotSynopsisStyled =
          !isSpecial && s.strip_type === 'SHOT' && !!s.shot_description?.trim()
        const shotSynopsis = shotSynopsisStyled
          ? layoutShotSynopsis(s, synopsisW, font, bold, FONT_ADV, FONT_ADV_SHOT_DESC)
          : null
        const synopsisLineCount = shotSynopsis ? shotSynopsisLineCount(shotSynopsis) : setLines.length
        const nAdvLines = Math.max(synopsisLineCount, 1)
        const rowH = 2 + nAdvLines * ADV_LINE_STEP

        ensure(rowH + 6, true)

        if (isSpecial) {
          refs.page.drawRectangle({
            x: x0,
            y: refs.y.current - rowH + 7,
            width: tableW,
            height: rowH,
            color: SCHEDULE_SPECIAL_FILL,
          })
        }

        const yTop = refs.y.current
        const drawCell = (ci: number, text: string, useBold: boolean): void => {
          drawPdfText(refs.page, text.slice(0, 48), {
            x: xStarts[ci]! + pad,
            y: yTop,
            size: FONT_ADV,
            font: useBold ? bold : font,
          })
        }

        for (const c of cols) {
          const ci = advColIdx(c.key)
          switch (c.key) {
            case 'loc':
              drawCell(ci, loc, false)
              break
            case 'ep':
              drawCell(ci, ep, false)
              break
            case 'scsh':
              drawCell(ci, ScSh, false)
              break
            case 'synopsis':
              if (shotSynopsis) {
                const x = xStarts[ci]! + pad
                let yy = yTop
                for (const line of shotSynopsis.sceneLines) {
                  drawPdfText(refs.page, line.slice(0, 100), {
                    x,
                    y: yy,
                    size: FONT_ADV,
                    font: bold,
                  })
                  yy -= ADV_LINE_STEP
                }
                for (const line of shotSynopsis.shotLines) {
                  drawPdfText(refs.page, line.slice(0, 100), {
                    x,
                    y: yy,
                    size: FONT_ADV_SHOT_DESC,
                    font,
                  })
                  yy -= ADV_LINE_STEP
                }
              } else {
                drawCell(ci, setLines[0] ?? '', true)
              }
              break
            case 'dn':
              drawCell(ci, dn, false)
              break
            case 'pgs':
              drawCell(ci, pgs, false)
              break
            case 'cast': {
              const castLines = wrapLinesLimited(castStr, castW, font, FONT_ADV, nAdvLines)
              const x = xStarts[ci]! + pad
              let yy = yTop
              for (const line of castLines.length ? castLines : ['']) {
                drawPdfText(refs.page, line.slice(0, 48), { x, y: yy, size: FONT_ADV, font })
                yy -= ADV_LINE_STEP
              }
              break
            }
          }
        }

        refs.y.current -= rowH
        drawRule(refs.page, refs.y.current, x0, x0 + tableW, rgb(0.78, 0.78, 0.78))
        refs.y.current -= 2
      }
      refs.y.current -= 3
    }

    drawLightBlock(primaryStrips, false)
    if (itpStrips.length > 0) {
      pr = addPageIfNeeded(doc, refs.page, refs.y, LINE_BODY + ADV_LINE_STEP * 2 + 20)
      refs.page = pr.page
      if (pr.isNew) {
        refs.y.current = PAGE_HEIGHT - MARGIN
        drawRunningHeader(refs.page, font, bold, data, refs.y, true)
        drawSupportMajorHeading(refs.page, bold, 'ADVANCED SCHEDULE', true, refs.y)
        drawDayMeta(day, true)
      }
      drawPdfText(refs.page, 'IF TIME PERMITS', {
        x: MARGIN,
        y: refs.y.current,
        size: FONT_TABLE,
        font: bold,
      })
      refs.y.current -= LINE_BODY + 2
      drawLightBlock(itpStrips, true)
    }

    refs.y.current -= SUPPORT_SEP - 2
  }
}

// Main function to generate the call sheet PDF.
export async function generateCallSheetPdf(data: CallSheetData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const y = { current: PAGE_HEIGHT - MARGIN }

  // ---------- Page 1 top: masthead → times/contacts → environment → base ----------
  drawMasthead(page, font, bold, data, y)
  drawEssentialTimesAndPrimaryContacts(page, font, bold, data, y)

  let topResult = addPageIfNeeded(doc, page, y, 28)
  page = topResult.page
  if (topResult.isNew) {
    y.current = page.getSize().height - MARGIN
    drawRunningHeader(page, font, bold, data, y, true)
  }
  if (hasEnvironmentContent(data)) {
    drawEnvironmentAndSafety(page, font, bold, data, y)
  }

  topResult = addPageIfNeeded(doc, page, y, 20)
  page = topResult.page
  if (topResult.isNew) {
    y.current = page.getSize().height - MARGIN
    drawRunningHeader(page, font, bold, data, y, true)
  }
  if (hasBaseAndLocationsContent(data)) {
    drawBaseAndLocations(page, font, bold, data, y)
  }

  y.current -= 3

  // ---------- Shooting schedule (stripboard-driven) ----------
  const schedRefs: ScheduleDrawRefs = { page, y }
  drawShootingScheduleTable(doc, schedRefs, data, font, bold)
  page = schedRefs.page

  // ---------- Principal cast calls (matrix) ----------
  const hasPrincipalCast =
    (data.castCalledRows != null && data.castCalledRows.length > 0) || data.castCalled.length > 0
  if (hasPrincipalCast) {
    const tableResult = addPageIfNeeded(doc, page, y, 28)
    page = tableResult.page
    if (tableResult.isNew) {
      y.current = page.getSize().height - MARGIN
      drawRunningHeader(page, font, bold, data, y, true)
    }
    const castRefs: ScheduleDrawRefs = { page, y }
    drawPrincipalCastCallsGrid(doc, castRefs, data, font, bold)
    page = castRefs.page
  }

  // ---------- Page 2+ operational support (after principal cast / schedule) ----------
  if (hasOperationalSupportLayer(data)) {
    const supportPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    page = supportPage
    y.current = PAGE_HEIGHT - MARGIN
    drawSupportContinuationHeader(page, font, bold, data, y)

    const supportRefs: ScheduleDrawRefs = { page, y }
    drawDepartmentalRequirementsSection(doc, supportRefs, data, font, bold)
    page = supportRefs.page
    drawHealthSafetyStuntsSection(doc, supportRefs, data, font, bold)
    page = supportRefs.page
    drawCateringMealsSection(doc, supportRefs, data, font, bold)
    page = supportRefs.page
    drawRadioChannelsSection(doc, supportRefs, data, font, bold)
    page = supportRefs.page
    drawTransportRequirementsSection(doc, supportRefs, data, font, bold)
    page = supportRefs.page
  }

  // ---------- Advanced schedule (forward days) ----------
  if ((data.advancedScheduleDays?.length ?? 0) > 0) {
    const pr = addPageIfNeeded(doc, page, y, 44)
    page = pr.page
    if (pr.isNew) {
      y.current = PAGE_HEIGHT - MARGIN
      drawRunningHeader(page, font, bold, data, y, true)
    }
    const advRefs: ScheduleDrawRefs = { page, y }
    drawAdvancedScheduleSection(doc, advRefs, data, font, bold)
    page = advRefs.page
    y.current = advRefs.y.current
  }

  applyFootersToAllPages(doc, font, data)

  return doc.save()
}
