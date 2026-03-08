/**
 * Call sheet PDF: A4 portrait, required sections.
 * Uses pdf-lib.
 * Cast section: when castCalledRows is provided, renders cast number, name, primary phone,
 * and agent name/phone as secondary; otherwise falls back to castCalled (names only).
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { CallSheetCastRow } from '@/lib/call-sheets/castRequirements'

export interface CallSheetStrip {
  strip_type: 'SCENE' | 'MOVE' | 'CALL' | 'LUNCH' | 'WRAP' | 'NOTE'
  scene_number?: string | null
  scene_title?: string | null
  int_ext?: string | null
  day_night?: string | null
  page_eighths?: number | null
  title?: string | null
  description?: string | null
}

export interface CallSheetKeyContact {
  department: string
  name: string | null
  phone: string | null
  email: string | null
}

export interface CallSheetLocation {
  name: string
  address: string | null
}

export interface CallSheetData {
  productionName: string
  shootDate: string
  unitName: string
  callTime: string | null
  wrapTime: string | null
  keyContacts: CallSheetKeyContact[]
  hospitalName: string | null
  hospitalAddress: string | null
  policeStationName: string | null
  policeStationAddress: string | null
  weatherSummary: string | null
  parkingBaseAddress: string | null
  mealTimes: Array<{ name: string; time: string }>
  specialNotes: string | null
  schedule: CallSheetStrip[]
  /** Names only; kept for backward compatibility. */
  castCalled: string[]
  /** Richer cast rows from the call-sheet cast requirements service (booked-and-required only). When present, the PDF cast section uses these for number, name, phone, agent. */
  castCalledRows?: CallSheetCastRow[]
  locations: CallSheetLocation[]
}

const MARGIN = 54
const LINE = 14
const SEP = 8
const CAST_LINE_MAX = 95

/**
 * Build cast section lines for the PDF. Priority: cast number, name, person phone; agent name/phone as secondary.
 * When castCalledRows is provided, uses two-line rows where the second line is agent contact when present.
 */
function buildCastSectionLines(
  castCalledRows: CallSheetCastRow[] | null,
  fallbackNames: string[]
): string[] {
  if (castCalledRows?.length) {
    const lines: string[] = []
    for (const row of castCalledRows) {
      const numPart = row.cast_number?.trim() ? `${row.cast_number}  ` : ''
      const line1 = `${numPart}${row.name}${row.phone ? `  ${row.phone}` : ''}`.trim()
      lines.push(line1.slice(0, CAST_LINE_MAX))
      if (row.agent_name || row.agent_phone) {
        const agentParts = ['Agent:'].concat(
          row.agent_name ? [row.agent_name] : [],
          row.agent_phone ? [row.agent_phone] : []
        )
        lines.push(`   ${agentParts.join('  ')}`.slice(0, CAST_LINE_MAX))
      }
    }
    return lines
  }
  return fallbackNames
}

function drawSection(
  page: ReturnType<PDFDocument['getPages']>[0],
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  title: string,
  content: string[],
  y: { current: number }
): void {
  if (y.current < MARGIN + LINE * 3) return
  y.current -= LINE
  page.drawText(title, { x: MARGIN, y: y.current, size: 11, font: bold })
  y.current -= LINE
  for (const line of content) {
    if (y.current < MARGIN + LINE) break
    page.drawText(line.slice(0, 95), { x: MARGIN, y: y.current, size: 9, font })
    y.current -= LINE
  }
  y.current -= SEP
}

export async function generateCallSheetPdf(data: CallSheetData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([612, 792])
  const { height } = page.getSize()
  const y = { current: height - MARGIN }

  // Header
  page.drawText('CALL SHEET', { x: MARGIN, y: y.current, size: 20, font: bold })
  y.current -= LINE + 4
  page.drawText(data.productionName, { x: MARGIN, y: y.current, size: 14, font })
  y.current -= LINE
  page.drawText(`${data.shootDate}  •  ${data.unitName}`, { x: MARGIN, y: y.current, size: 11, font })
  y.current -= LINE
  if (data.callTime) {
    page.drawText(`Call: ${data.callTime}`, { x: MARGIN, y: y.current, size: 10, font })
    y.current -= LINE
  }
  if (data.wrapTime) {
    page.drawText(`Wrap (est.): ${data.wrapTime}`, { x: MARGIN, y: y.current, size: 10, font })
    y.current -= LINE
  }
  y.current -= SEP

  // Key contacts
  const contactLines: string[] = []
  for (const c of data.keyContacts) {
    const parts = [c.department]
    if (c.name) parts.push(c.name)
    if (c.phone) parts.push(c.phone)
    if (c.email) parts.push(c.email)
    contactLines.push(parts.join('  •  '))
  }
  if (contactLines.length) drawSection(page, font, bold, 'Key contacts', contactLines, y)

  // Hospital
  if (data.hospitalName || data.hospitalAddress) {
    const lines = [data.hospitalName ?? '', data.hospitalAddress ?? ''].filter(Boolean)
    drawSection(page, font, bold, 'Hospital', lines, y)
  }

  // Police
  if (data.policeStationName || data.policeStationAddress) {
    const lines = [data.policeStationName ?? '', data.policeStationAddress ?? ''].filter(Boolean)
    drawSection(page, font, bold, 'Police station', lines, y)
  }

  // Weather
  if (data.weatherSummary) {
    drawSection(page, font, bold, 'Weather', [data.weatherSummary], y)
  }

  // Parking / Unit base
  if (data.parkingBaseAddress) {
    drawSection(page, font, bold, 'Parking / unit base', [data.parkingBaseAddress], y)
  }

  // Meal times
  if (data.mealTimes.length) {
    const lines = data.mealTimes.map((m) => `${m.name}: ${m.time}`)
    drawSection(page, font, bold, 'Meal times', lines, y)
  }

  // Special notes
  if (data.specialNotes) {
    drawSection(page, font, bold, 'Special notes', [data.specialNotes], y)
  }

  // Schedule
  const scheduleLines: string[] = []
  for (const s of data.schedule) {
    if (s.strip_type === 'SCENE') {
      const parts = [`Scene ${s.scene_number ?? '—'}`]
      if (s.scene_title) parts.push(s.scene_title)
      if (s.int_ext) parts.push(s.int_ext)
      if (s.day_night) parts.push(s.day_night)
      if (s.page_eighths != null) parts.push(`${s.page_eighths}/8 pgs`)
      scheduleLines.push(parts.join('  •  '))
    } else {
      scheduleLines.push(`${s.strip_type}${s.title ? ` — ${s.title}` : ''}${s.description ? ` (${s.description})` : ''}`)
    }
  }
  if (scheduleLines.length) drawSection(page, font, bold, 'Schedule', scheduleLines, y)

  // Cast called: richer rows when available (cast number, name, phone; agent as secondary)
  const castSectionLines = buildCastSectionLines(data.castCalledRows ?? null, data.castCalled)
  if (castSectionLines.length) {
    drawSection(page, font, bold, 'Cast called', castSectionLines, y)
  }

  // Locations
  if (data.locations.length) {
    const lines = data.locations.map((l) => (l.address ? `${l.name} — ${l.address}` : l.name))
    drawSection(page, font, bold, 'Locations', lines, y)
  }

  // Footer
  page.drawText(
    `Generated: ${new Date().toLocaleString()}`,
    { x: MARGIN, y: 36, size: 8, font, color: rgb(0.45, 0.45, 0.45) }
  )

  return doc.save()
}
