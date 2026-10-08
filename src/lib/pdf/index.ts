/**
 * PDF generation: location release cover sheet, call sheet.
 * Uses pdf-lib (works in Tauri without Node).
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { ShootDay } from '@/lib/db/types'
import type { Scene } from '@/lib/db/types'
import type { Location } from '@/lib/db/types'
import type { Person } from '@/lib/db/types'
import type { Booking } from '@/lib/db/types'
import { sceneSlugline } from '@/lib/schedule/sceneDisplay'
import { drawPdfText, textForPdf } from '@/lib/pdf/layoutKit'
export interface LocationReleaseCoverData {
  productionName: string
  locationName: string
  address: string
  notes?: string
}

/** Generate a simple Location Release cover sheet PDF. */
export async function generateLocationReleaseCover(
  data: LocationReleaseCoverData
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([612, 792])
  const { height } = page.getSize()
  let y = height - 72

  drawPdfText(page, 'LOCATION RELEASE - COVER SHEET', {
    x: 72,
    y,
    size: 18,
    font: bold,
    color: rgb(0, 0, 0),
  })
  y -= 36

  drawPdfText(page, 'Production:', { x: 72, y, size: 12, font: bold })
  drawPdfText(page, data.productionName, { x: 160, y, size: 12, font })
  y -= 24

  drawPdfText(page, 'Location:', { x: 72, y, size: 12, font: bold })
  drawPdfText(page, data.locationName, { x: 160, y, size: 12, font })
  y -= 24

  drawPdfText(page, 'Address:', { x: 72, y, size: 12, font: bold })
  drawPdfText(page, data.address || '—', { x: 160, y, size: 12, font })
  y -= 24

  if (data.notes) {
    drawPdfText(page, 'Notes:', { x: 72, y, size: 12, font: bold })
    drawPdfText(page, data.notes, { x: 160, y, size: 12, font })
    y -= 24
  }

  drawPdfText(page, 
    `Generated: ${new Date().toLocaleString()}`,
    { x: 72, y: 72, size: 9, font, color: rgb(0.4, 0.4, 0.4) }
  )

  return doc.save()
}

export interface ContributorFormCoverData {
  productionName: string
  contributorName: string
  role?: string
}

/** Generate a minimal contributor form cover PDF (for demo/seed). */
export async function generateContributorFormCover(
  data: ContributorFormCoverData
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([612, 792])
  const { height } = page.getSize()
  let y = height - 72
  drawPdfText(page, 'CONTRIBUTOR AGREEMENT', { x: 72, y, size: 18, font: bold })
  y -= 36
  drawPdfText(page, 'Production:', { x: 72, y, size: 12, font: bold })
  drawPdfText(page, data.productionName, { x: 160, y, size: 12, font })
  y -= 24
  drawPdfText(page, 'Contributor:', { x: 72, y, size: 12, font: bold })
  drawPdfText(page, data.contributorName, { x: 160, y, size: 12, font })
  y -= 24
  if (data.role) {
    drawPdfText(page, 'Role:', { x: 72, y, size: 12, font: bold })
    drawPdfText(page, data.role, { x: 160, y, size: 12, font })
    y -= 24
  }
  drawPdfText(page, `Generated: ${new Date().toLocaleString()}`, {
    x: 72,
    y: 72,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  })
  return doc.save()
}

export interface CallSheetData {
  productionName: string
  shootDay: ShootDay
  scenes: Array<Scene & { sortOrder: number }>
  locations: Location[]
  people: Person[]
  bookings: Booking[]
  weather?: string
}

/** Generate a call sheet PDF for a shoot day. */
export async function generateCallSheet(data: CallSheetData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([612, 792])
  const { height } = page.getSize()
  const margin = 72
  let y = height - margin

  drawPdfText(page, 'CALL SHEET', {
    x: margin,
    y,
    size: 22,
    font: bold,
    color: rgb(0, 0, 0),
  })
  y -= 12

  drawPdfText(page, data.productionName, {
    x: margin,
    y,
    size: 14,
    font,
    color: rgb(0.2, 0.2, 0.2),
  })
  y -= 24

  const shootDate = new Date(data.shootDay.shoot_date).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  drawPdfText(page, `Shoot Date: ${shootDate}`, { x: margin, y, size: 12, font: bold })
  y -= 20

  if (data.shootDay.call_time) {
    drawPdfText(page, `Call Time: ${data.shootDay.call_time}`, { x: margin, y, size: 11, font })
    y -= 18
  }
  if (data.weather) {
    drawPdfText(page, `Weather: ${data.weather}`, { x: margin, y, size: 11, font })
    y -= 18
  }
  y -= 12

  drawPdfText(page, 'SCHEDULE', { x: margin, y, size: 12, font: bold })
  y -= 18

  for (const scene of data.scenes) {
    const locName = scene.location_id
      ? data.locations.find((l) => l.id === scene.location_id)?.name ?? null
      : null
    const slug = sceneSlugline(scene, locName)
    drawPdfText(page, 
      `Scene ${scene.scene_number}${slug ? ` — ${slug}` : ''}`,
      { x: margin, y, size: 10, font }
    )
    y -= 14
  }
  y -= 12

  drawPdfText(page, 'LOCATIONS', { x: margin, y, size: 12, font: bold })
  y -= 18
  for (const loc of data.locations) {
    drawPdfText(page, `${loc.name}${loc.address ? ` — ${loc.address}` : ''}`, {
      x: margin,
      y,
      size: 10,
      font,
    })
    y -= 14
  }
  y -= 12

  drawPdfText(page, 'CAST & CREW', { x: margin, y, size: 12, font: bold })
  y -= 18
  for (const b of data.bookings) {
    const person = data.people.find((p) => p.id === b.person_id)
    const name = person?.name ?? '—'
    const dept = person?.department ?? b.role ?? ''
    drawPdfText(page, `${name}${dept ? ` (${dept})` : ''}`, { x: margin, y, size: 10, font })
    y -= 14
  }

  drawPdfText(page, 
    `Generated: ${new Date().toLocaleString()}`,
    { x: margin, y: 48, size: 9, font, color: rgb(0.4, 0.4, 0.4) }
  )

  return doc.save()
}

export interface CueSheetRow {
  title: string
  artist: string | null
  publisher: string | null
}

/** Shorten text with an ellipsis so it fits within maxWidth points. */
function fitText(
  text: string,
  font: { widthOfTextAtSize: (t: string, size: number) => number },
  size: number,
  maxWidth: number
): string {
  // Measure the WinAnsi-safe text: widthOfTextAtSize throws on characters Helvetica cannot encode.
  text = textForPdf(text)
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let end = text.length
  while (end > 0 && font.widthOfTextAtSize(`${text.slice(0, end).trimEnd()}...`, size) > maxWidth) {
    end -= 1
  }
  return end > 0 ? `${text.slice(0, end).trimEnd()}...` : ''
}

/**
 * Generate a simple music cue sheet PDF (no timecodes).
 * Long track lists continue onto further pages, each repeating the column header.
 */
export async function generateCueSheet(
  productionName: string,
  rows: CueSheetRow[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const pageWidth = 612
  const pageHeight = 792
  const margin = 72
  const bottomLimit = 72
  const rowHeight = 14
  const cols = {
    title: { x: margin, width: 170 },
    artist: { x: 252, width: 150 },
    publisher: { x: 412, width: 128 },
  }
  const generated = textForPdf(`Generated: ${new Date().toLocaleString()}`)

  let page = doc.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  const drawColumnHeader = () => {
    drawPdfText(page, 'Title', { x: cols.title.x, y, size: 10, font: bold })
    drawPdfText(page, 'Artist', { x: cols.artist.x, y, size: 10, font: bold })
    drawPdfText(page, 'Publisher/Label', { x: cols.publisher.x, y, size: 10, font: bold })
    y -= 16
  }

  drawPdfText(page, 'MUSIC CUE SHEET', { x: margin, y, size: 18, font: bold })
  y -= 12
  drawPdfText(page, productionName, { x: margin, y, size: 12, font })
  y -= 24
  drawColumnHeader()

  for (const row of rows) {
    if (y < bottomLimit) {
      page = doc.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
      drawColumnHeader()
    }
    drawPdfText(page, fitText(row.title, font, 9, cols.title.width), { x: cols.title.x, y, size: 9, font })
    drawPdfText(page, fitText(row.artist ?? '—', font, 9, cols.artist.width), {
      x: cols.artist.x,
      y,
      size: 9,
      font,
    })
    drawPdfText(page, fitText(row.publisher ?? '—', font, 9, cols.publisher.width), {
      x: cols.publisher.x,
      y,
      size: 9,
      font,
    })
    y -= rowHeight
  }

  const pages = doc.getPages()
  pages.forEach((p, i) => {
    p.drawText(generated, { x: margin, y: 48, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
    if (pages.length > 1) {
      const label = `Page ${i + 1} of ${pages.length}`
      p.drawText(label, {
        x: pageWidth - margin - font.widthOfTextAtSize(label, 9),
        y: 48,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      })
    }
  })

  return doc.save()
}
