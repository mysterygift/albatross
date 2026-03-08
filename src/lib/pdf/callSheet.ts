/**
 * Call sheet PDF: Film / HETV-style layout.
 * Uses pdf-lib. Section order: header, key day summary, locations & safety,
 * schedule (table), cast calls (table), key crew (table), meals, notes, advance placeholder, footer.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { CallSheetCastRow } from '@/lib/call-sheets/castRequirements'
import type { CallSheetCrewGroup } from '@/lib/call-sheets/crewRequirements'

export interface CallSheetStrip {
  strip_type: 'SCENE' | 'MOVE' | 'CALL' | 'LUNCH' | 'WRAP' | 'NOTE'
  scene_number?: string | null
  scene_title?: string | null
  int_ext?: string | null
  day_night?: string | null
  page_eighths?: number | null
  shot_number?: string | null
  title?: string | null
  description?: string | null
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
  hospitalName: string | null
  hospitalAddress: string | null
  policeStationName: string | null
  policeStationAddress: string | null
  weatherSummary: string | null
  parkingBaseAddress: string | null
  mealTimes: Array<{ name: string; time: string }>
  specialNotes: string | null
  schedule: CallSheetStrip[]
  castCalled: string[]
  castCalledRows?: CallSheetCastRow[]
  /** Booked crew grouped by canonical crew department (C1), HOD first. */
  crewGroups: CallSheetCrewGroup[]
  locations: CallSheetLocation[]
}

// Typography and spacing
const MARGIN = 54
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const Y_MIN = MARGIN + 40
const LINE_BODY = 10
const LINE_SECTION = 12
const SEP_SECTION = 10
const FONT_MASTHEAD = 20
const FONT_PRODUCTION = 14
const FONT_SECTION = 11
const FONT_BODY = 9
const FONT_TABLE = 8
const FONT_FOOTER = 8
const ROW_HEIGHT = 10
const GRAY = rgb(0.45, 0.45, 0.45)

type Page = ReturnType<PDFDocument['getPages']>[0]

function drawRule(
  page: Page,
  y: number,
  xStart: number,
  xEnd: number,
  color: ReturnType<typeof rgb> = GRAY
): void {
  page.drawRectangle({
    x: xStart,
    y: y - 0.25,
    width: xEnd - xStart,
    height: 0.5,
    color,
  })
}

/**
 * Draw a table: header row (bold) + data rows, with horizontal rules. Updates y.
 */
function drawTable(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  y: { current: number },
  columns: { label: string; width: number }[],
  rows: string[][]
): void {
  const tableWidth = columns.reduce((s, c) => s + c.width, 0)
  const xStart = MARGIN
  drawRule(page, y.current, xStart, xStart + tableWidth)
  y.current -= ROW_HEIGHT
  let x = xStart
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!
    page.drawText(col.label.slice(0, 20), { x, y: y.current, size: FONT_TABLE, font: bold })
    x += col.width
  }
  y.current -= ROW_HEIGHT
  drawRule(page, y.current, xStart, xStart + tableWidth)
  y.current -= 2
  const maxChars = (w: number) => Math.max(4, Math.floor(w / 5.5))
  for (const row of rows) {
    if (y.current < Y_MIN) break
    x = xStart
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]!
      const cell = (row[i] ?? '').slice(0, maxChars(col.width))
      page.drawText(cell, { x, y: y.current, size: FONT_TABLE, font })
      x += col.width
    }
    y.current -= ROW_HEIGHT
  }
  y.current -= SEP_SECTION
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

function drawSection(
  page: Page,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  title: string,
  content: string[],
  y: { current: number }
): void {
  if (y.current < Y_MIN + LINE_SECTION * 2) return
  y.current -= LINE_SECTION
  page.drawText(title, { x: MARGIN, y: y.current, size: FONT_SECTION, font: bold })
  y.current -= LINE_BODY
  for (const line of content) {
    if (y.current < Y_MIN) break
    page.drawText(line.slice(0, 95), { x: MARGIN, y: y.current, size: FONT_BODY, font })
    y.current -= LINE_BODY
  }
  y.current -= SEP_SECTION
}

export async function generateCallSheetPdf(data: CallSheetData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const y = { current: PAGE_HEIGHT - MARGIN }

  // ---------- 1. Header / masthead ----------
  page.drawText('CALL SHEET', { x: MARGIN, y: y.current, size: FONT_MASTHEAD, font: bold })
  y.current -= LINE_SECTION + 4
  page.drawText(data.productionName, { x: MARGIN, y: y.current, size: FONT_PRODUCTION, font: bold })
  y.current -= LINE_SECTION
  const headerSub = `${data.shootDate}  •  ${data.unitName}${data.dayNumber != null ? `  •  Day ${data.dayNumber}` : ''}`
  page.drawText(headerSub.slice(0, 95), { x: MARGIN, y: y.current, size: FONT_BODY, font })
  y.current -= LINE_BODY
  if (data.callTime) {
    page.drawText(`Crew call: ${data.callTime}`, { x: MARGIN, y: y.current, size: FONT_BODY, font })
    y.current -= LINE_BODY
  }
  if (data.wrapTime) {
    page.drawText(`Wrap (est.): ${data.wrapTime}`, { x: MARGIN, y: y.current, size: FONT_BODY, font })
    y.current -= LINE_BODY
  }
  y.current -= SEP_SECTION

  // ---------- 2. Key day summary band ----------
  drawRule(page, y.current, MARGIN, PAGE_WIDTH - MARGIN)
  y.current -= LINE_BODY
  const summaryParts = [
    data.callTime ? `Call ${data.callTime}` : null,
    data.shootDate,
    data.unitName,
    data.weatherSummary ?? '—',
    data.hospitalName ? `Hospital: ${data.hospitalName}` : '—',
  ].filter(Boolean)
  page.drawText(summaryParts.join('  |  ').slice(0, 120), {
    x: MARGIN,
    y: y.current,
    size: FONT_TABLE,
    font,
  })
  y.current -= LINE_BODY + 4

  // ---------- 3. Locations & safety ----------
  const hasLocations =
    data.locations.length > 0 ||
    data.parkingBaseAddress ||
    data.hospitalName ||
    data.hospitalAddress ||
    data.policeStationName ||
    data.policeStationAddress
  if (hasLocations) {
    const locResult = addPageIfNeeded(doc, page, y, 15)
    page = locResult.page
    if (locResult.isNew) {
      page.drawText(`CALL SHEET – ${data.shootDate} (cont'd)`, {
        x: MARGIN,
        y: page.getSize().height - MARGIN,
        size: FONT_SECTION,
        font: bold,
        color: GRAY,
      })
      y.current -= LINE_BODY + SEP_SECTION
    }
    page.drawText('Locations & safety', { x: MARGIN, y: y.current, size: FONT_SECTION, font: bold })
    y.current -= LINE_BODY
    if (data.locations.length > 0) {
      page.drawText('Set', { x: MARGIN, y: y.current, size: FONT_TABLE, font: bold })
      y.current -= LINE_BODY - 2
      for (const l of data.locations) {
        if (y.current < Y_MIN) break
        page.drawText((l.address ? `${l.name} — ${l.address}` : l.name).slice(0, 95), {
          x: MARGIN + 8,
          y: y.current,
          size: FONT_TABLE,
          font,
        })
        y.current -= ROW_HEIGHT - 1
        if (l.what3words) {
          page.drawText(`what3words: ${l.what3words}`.slice(0, 60), {
            x: MARGIN + 8,
            y: y.current,
            size: FONT_TABLE,
            font,
            color: GRAY,
          })
          y.current -= ROW_HEIGHT - 1
        }
      }
      y.current -= 2
    }
    if (data.parkingBaseAddress) {
      page.drawText('Parking / base', { x: MARGIN, y: y.current, size: FONT_TABLE, font: bold })
      y.current -= LINE_BODY - 2
      page.drawText(data.parkingBaseAddress.slice(0, 95), {
        x: MARGIN + 8,
        y: y.current,
        size: FONT_TABLE,
        font,
      })
      y.current -= ROW_HEIGHT + 2
    }
    if (data.hospitalName || data.hospitalAddress) {
      page.drawText('Hospital', { x: MARGIN, y: y.current, size: FONT_TABLE, font: bold })
      y.current -= LINE_BODY - 2
      const hospitalLine = [data.hospitalName, data.hospitalAddress].filter(Boolean).join(' — ')
      page.drawText(hospitalLine.slice(0, 95), {
        x: MARGIN + 8,
        y: y.current,
        size: FONT_TABLE,
        font,
      })
      y.current -= ROW_HEIGHT + 2
    }
    if (data.policeStationName || data.policeStationAddress) {
      page.drawText('Police / emergency', { x: MARGIN, y: y.current, size: FONT_TABLE, font: bold })
      y.current -= LINE_BODY - 2
      const policeLine = [data.policeStationName, data.policeStationAddress].filter(Boolean).join(' — ')
      page.drawText(policeLine.slice(0, 95), {
        x: MARGIN + 8,
        y: y.current,
        size: FONT_TABLE,
        font,
      })
      y.current -= ROW_HEIGHT + 2
    }
    y.current -= SEP_SECTION
  }

  // ---------- 4. Today's scenes / schedule (table) ----------
  let tableResult = addPageIfNeeded(doc, page, y, 20)
  page = tableResult.page
  if (tableResult.isNew) {
    page.drawText(`CALL SHEET – ${data.shootDate} (cont'd)`, {
      x: MARGIN,
      y: page.getSize().height - MARGIN,
      size: FONT_SECTION,
      font: bold,
      color: GRAY,
    })
    y.current -= LINE_BODY + SEP_SECTION
  }
  page.drawText("Today's scenes", { x: MARGIN, y: y.current, size: FONT_SECTION, font: bold })
  y.current -= LINE_BODY + 2
  const scheduleCols = [
    { label: 'Scene', width: 70 },
    { label: 'Title / description', width: 220 },
    { label: 'I/E', width: 36 },
    { label: 'D/N', width: 36 },
    { label: 'Pgs', width: 40 },
  ]
  const scheduleRows: string[][] = data.schedule.map((s) => {
    if (s.strip_type === 'SCENE') {
      const sceneLabel = `Scene ${s.scene_number ?? '—'}${s.shot_number ? ` – ${s.shot_number}` : ''}`
      const title = (s.scene_title ?? s.title ?? s.description ?? '—').slice(0, 50)
      return [
        sceneLabel,
        title,
        s.int_ext ?? '—',
        s.day_night ?? '—',
        s.page_eighths != null ? `${s.page_eighths}/8` : '—',
      ]
    }
    const title = [s.strip_type, s.title, s.description].filter(Boolean).join(' — ').slice(0, 50)
    return [s.strip_type, title, '—', '—', '—']
  })
  if (scheduleRows.length) {
    drawTable(page, font, bold, y, scheduleCols, scheduleRows)
  }

  // ---------- 5. Cast calls (table) ----------
  tableResult = addPageIfNeeded(doc, page, y, 15)
  page = tableResult.page
  if (tableResult.isNew) {
    page.drawText(`CALL SHEET – ${data.shootDate} (cont'd)`, {
      x: MARGIN,
      y: page.getSize().height - MARGIN,
      size: FONT_SECTION,
      font: bold,
      color: GRAY,
    })
    y.current -= LINE_BODY + SEP_SECTION
  }
  page.drawText('Cast called', { x: MARGIN, y: y.current, size: FONT_SECTION, font: bold })
  y.current -= LINE_BODY + 2
  const castCols = [
    { label: '#', width: 28 },
    { label: 'Name', width: 120 },
    { label: 'Phone', width: 100 },
    { label: 'Agent / contact', width: 200 },
  ]
  let castRows: string[][]
  if (data.castCalledRows?.length) {
    castRows = data.castCalledRows.map((r) => [
      (r.cast_number ?? '—').slice(0, 8),
      r.name.slice(0, 30),
      (r.phone ?? '—').slice(0, 20),
      [r.agent_name, r.agent_phone].filter(Boolean).join('  ').slice(0, 35),
    ])
  } else {
    castRows = data.castCalled.map((name) => [name.slice(0, 30), '—', '—', '—'])
  }
  if (castRows.length) {
    drawTable(page, font, bold, y, castCols, castRows)
  }

  // ---------- 5b. Crew (booked crew by department, HOD first) ----------
  const crewGroups = data.crewGroups ?? []
  if (crewGroups.length > 0) {
    tableResult = addPageIfNeeded(doc, page, y, 8)
    page = tableResult.page
    if (tableResult.isNew) {
      page.drawText(`CALL SHEET – ${data.shootDate} (cont'd)`, {
        x: MARGIN,
        y: page.getSize().height - MARGIN,
        size: FONT_SECTION,
        font: bold,
        color: GRAY,
      })
      y.current -= LINE_BODY + SEP_SECTION
    }
    page.drawText('Crew', { x: MARGIN, y: y.current, size: FONT_SECTION, font: bold })
    y.current -= LINE_BODY + 2
    for (const group of crewGroups) {
      if (group.rows.length === 0) continue
      const needLines = 3 + group.rows.length * (ROW_HEIGHT / 10)
      tableResult = addPageIfNeeded(doc, page, y, Math.ceil(needLines))
      page = tableResult.page
      if (tableResult.isNew) {
        page.drawText(`CALL SHEET – ${data.shootDate} (cont'd)`, {
          x: MARGIN,
          y: page.getSize().height - MARGIN,
          size: FONT_SECTION,
          font: bold,
          color: GRAY,
        })
        y.current -= LINE_BODY + SEP_SECTION
      }
      page.drawText(group.department, {
        x: MARGIN,
        y: y.current,
        size: FONT_TABLE,
        font: bold,
      })
      y.current -= ROW_HEIGHT
      const crewCols = [
        { label: 'Name', width: 140 },
        { label: 'Role', width: 160 },
        { label: 'Phone', width: 120 },
      ]
      const crewRows: string[][] = group.rows.map((r) => [
        (r.name ?? '—').slice(0, 28),
        (r.role_name ?? '—').slice(0, 32),
        (r.phone ?? '—').slice(0, 22),
      ])
      drawTable(page, font, bold, y, crewCols, crewRows)
      y.current -= SEP_SECTION
    }
  }

  // ---------- 6. Key crew / contacts (table) ----------
  tableResult = addPageIfNeeded(doc, page, y, 12)
  page = tableResult.page
  if (tableResult.isNew) {
    page.drawText(`CALL SHEET – ${data.shootDate} (cont'd)`, {
      x: MARGIN,
      y: page.getSize().height - MARGIN,
      size: FONT_SECTION,
      font: bold,
      color: GRAY,
    })
    y.current -= LINE_BODY + SEP_SECTION
  }
  page.drawText('Key crew / contacts', { x: MARGIN, y: y.current, size: FONT_SECTION, font: bold })
  y.current -= LINE_BODY + 2
  const contactCols = [
    { label: 'Department', width: 100 },
    { label: 'Name', width: 110 },
    { label: 'Phone', width: 95 },
    { label: 'Email', width: 150 },
  ]
  const contactRows: string[][] = data.keyContacts.map((c) => [
    c.department.slice(0, 18),
    (c.name ?? '—').slice(0, 20),
    (c.phone ?? '—').slice(0, 18),
    (c.email ?? '—').slice(0, 28),
  ])
  if (contactRows.length) {
    drawTable(page, font, bold, y, contactCols, contactRows)
  }

  // ---------- 7. Meal times ----------
  if (data.mealTimes.length > 0) {
    const mealResult = addPageIfNeeded(doc, page, y, 8)
    page = mealResult.page
    if (mealResult.isNew) {
      page.drawText(`CALL SHEET – ${data.shootDate} (cont'd)`, {
        x: MARGIN,
        y: page.getSize().height - MARGIN,
        size: FONT_SECTION,
        font: bold,
        color: GRAY,
      })
      y.current -= LINE_BODY + SEP_SECTION
    }
    const mealLines = data.mealTimes.map((m) => `${m.name}: ${m.time}`)
    drawSection(page, font, bold, 'Meal times', mealLines, y)
  }

  // ---------- 8. Notes (consolidated) ----------
  const noteBlocks: string[] = []
  if (data.dayNotes) noteBlocks.push(`Day: ${data.dayNotes}`)
  if (data.unitNotes) noteBlocks.push(`Unit: ${data.unitNotes}`)
  if (data.specialNotes) noteBlocks.push(`Special: ${data.specialNotes}`)
  if (noteBlocks.length) {
    const notesResult = addPageIfNeeded(doc, page, y, 6)
    page = notesResult.page
    if (notesResult.isNew) {
      page.drawText(`CALL SHEET – ${data.shootDate} (cont'd)`, {
        x: MARGIN,
        y: page.getSize().height - MARGIN,
        size: FONT_SECTION,
        font: bold,
        color: GRAY,
      })
      y.current -= LINE_BODY + SEP_SECTION
    }
    drawSection(page, font, bold, 'Notes', noteBlocks, y)
  }

  // ---------- 9. Advance schedule placeholder ----------
  const advanceResult = addPageIfNeeded(doc, page, y, 4)
  page = advanceResult.page
  if (advanceResult.isNew) {
    page.drawText(`CALL SHEET – ${data.shootDate} (cont'd)`, {
      x: MARGIN,
      y: page.getSize().height - MARGIN,
      size: FONT_SECTION,
      font: bold,
      color: GRAY,
    })
    y.current -= LINE_BODY + SEP_SECTION
  }
  page.drawText('Advance schedule', { x: MARGIN, y: y.current, size: FONT_SECTION, font: bold })
  y.current -= LINE_BODY
  page.drawText('—', { x: MARGIN, y: y.current, size: FONT_BODY, font, color: GRAY })
  y.current -= SEP_SECTION

  // ---------- 10. Footer (on last page) ----------
  page.drawText(`Generated: ${new Date().toLocaleString()}`, {
    x: MARGIN,
    y: 36,
    size: FONT_FOOTER,
    font,
    color: GRAY,
  })

  return doc.save()
}
