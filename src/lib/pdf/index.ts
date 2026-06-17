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

  page.drawText('LOCATION RELEASE - COVER SHEET', {
    x: 72,
    y,
    size: 18,
    font: bold,
    color: rgb(0, 0, 0),
  })
  y -= 36

  page.drawText('Production:', { x: 72, y, size: 12, font: bold })
  page.drawText(data.productionName, { x: 160, y, size: 12, font })
  y -= 24

  page.drawText('Location:', { x: 72, y, size: 12, font: bold })
  page.drawText(data.locationName, { x: 160, y, size: 12, font })
  y -= 24

  page.drawText('Address:', { x: 72, y, size: 12, font: bold })
  page.drawText(data.address || '—', { x: 160, y, size: 12, font })
  y -= 24

  if (data.notes) {
    page.drawText('Notes:', { x: 72, y, size: 12, font: bold })
    page.drawText(data.notes, { x: 160, y, size: 12, font })
    y -= 24
  }

  page.drawText(
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
  page.drawText('CONTRIBUTOR AGREEMENT', { x: 72, y, size: 18, font: bold })
  y -= 36
  page.drawText('Production:', { x: 72, y, size: 12, font: bold })
  page.drawText(data.productionName, { x: 160, y, size: 12, font })
  y -= 24
  page.drawText('Contributor:', { x: 72, y, size: 12, font: bold })
  page.drawText(data.contributorName, { x: 160, y, size: 12, font })
  y -= 24
  if (data.role) {
    page.drawText('Role:', { x: 72, y, size: 12, font: bold })
    page.drawText(data.role, { x: 160, y, size: 12, font })
    y -= 24
  }
  page.drawText(`Generated: ${new Date().toLocaleString()}`, {
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

  page.drawText('CALL SHEET', {
    x: margin,
    y,
    size: 22,
    font: bold,
    color: rgb(0, 0, 0),
  })
  y -= 12

  page.drawText(data.productionName, {
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
  page.drawText(`Shoot Date: ${shootDate}`, { x: margin, y, size: 12, font: bold })
  y -= 20

  if (data.shootDay.call_time) {
    page.drawText(`Call Time: ${data.shootDay.call_time}`, { x: margin, y, size: 11, font })
    y -= 18
  }
  if (data.weather) {
    page.drawText(`Weather: ${data.weather}`, { x: margin, y, size: 11, font })
    y -= 18
  }
  y -= 12

  page.drawText('SCHEDULE', { x: margin, y, size: 12, font: bold })
  y -= 18

  for (const scene of data.scenes) {
    const locName = scene.location_id
      ? data.locations.find((l) => l.id === scene.location_id)?.name ?? null
      : null
    const slug = sceneSlugline(scene, locName)
    page.drawText(
      `Scene ${scene.scene_number}${slug ? ` — ${slug}` : ''}`,
      { x: margin, y, size: 10, font }
    )
    y -= 14
  }
  y -= 12

  page.drawText('LOCATIONS', { x: margin, y, size: 12, font: bold })
  y -= 18
  for (const loc of data.locations) {
    page.drawText(`${loc.name}${loc.address ? ` — ${loc.address}` : ''}`, {
      x: margin,
      y,
      size: 10,
      font,
    })
    y -= 14
  }
  y -= 12

  page.drawText('CAST & CREW', { x: margin, y, size: 12, font: bold })
  y -= 18
  for (const b of data.bookings) {
    const person = data.people.find((p) => p.id === b.person_id)
    const name = person?.name ?? '—'
    const dept = person?.department ?? b.role ?? ''
    page.drawText(`${name}${dept ? ` (${dept})` : ''}`, { x: margin, y, size: 10, font })
    y -= 14
  }

  page.drawText(
    `Generated: ${new Date().toLocaleString()}`,
    { x: margin, y: 48, size: 9, font, color: rgb(0.4, 0.4, 0.4) }
  )

  return doc.save()
}

export interface CueSheetRow {
  title: string
  artist: string | null
  publisher: string | null
  use?: string
}

/** Generate a simple music cue sheet PDF (no timecodes). */
export async function generateCueSheet(
  productionName: string,
  rows: CueSheetRow[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([612, 792])
  const { height } = page.getSize()
  const margin = 72
  let y = height - margin

  page.drawText('MUSIC CUE SHEET', { x: margin, y, size: 18, font: bold })
  y -= 12
  page.drawText(productionName, { x: margin, y, size: 12, font })
  y -= 24

  page.drawText('Title', { x: margin, y, size: 10, font: bold })
  page.drawText('Artist', { x: 220, y, size: 10, font: bold })
  page.drawText('Publisher/Label', { x: 350, y, size: 10, font: bold })
  page.drawText('Use', { x: 480, y, size: 10, font: bold })
  y -= 16

  for (const row of rows) {
    if (y < 100) break
    page.drawText(row.title.slice(0, 30), { x: margin, y, size: 9, font })
    page.drawText((row.artist ?? '—').slice(0, 25), { x: 220, y, size: 9, font })
    page.drawText((row.publisher ?? '—').slice(0, 25), { x: 350, y, size: 9, font })
    page.drawText((row.use ?? '—').slice(0, 20), { x: 480, y, size: 9, font })
    y -= 14
  }

  page.drawText(
    `Generated: ${new Date().toLocaleString()}`,
    { x: margin, y: 48, size: 9, font, color: rgb(0.4, 0.4, 0.4) }
  )

  return doc.save()
}
