import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { MovementOrderData } from '@/lib/movement-orders/types'

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 54
const Y_MIN = 64
const LINE = 12
const FONT_BODY = 9
const FONT_SECTION = 11
const FONT_TITLE = 18

type Page = ReturnType<PDFDocument['getPages']>[0]

function wrapText(
  text: string,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next
      continue
    }
    if (line) {
      lines.push(line)
      line = word
      continue
    }
    // Single overlong token fallback: hard-wrap by character width.
    let chunk = ''
    for (const char of word) {
      const nextChunk = `${chunk}${char}`
      if (font.widthOfTextAtSize(nextChunk, size) <= maxWidth) {
        chunk = nextChunk
      } else {
        if (chunk) lines.push(chunk)
        chunk = char
      }
    }
    line = chunk
  }
  if (line) lines.push(line)
  return lines
}

function sectionHeading(
  page: Page,
  y: { current: number },
  title: string,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  page.drawText(title.toUpperCase(), {
    x: MARGIN,
    y: y.current,
    size: FONT_SECTION,
    font: bold,
  })
  y.current -= LINE
  page.drawRectangle({
    x: MARGIN,
    y: y.current + 5,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 0.6,
    color: rgb(0.65, 0.65, 0.65),
  })
  y.current -= 8
}

function ensurePage(
  doc: PDFDocument,
  pageRef: { page: Page },
  y: { current: number },
  minHeight: number,
  data: MovementOrderData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  if (y.current - minHeight >= Y_MIN) return
  pageRef.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  y.current = PAGE_HEIGHT - MARGIN
  drawRunningHeader(pageRef.page, y, data, font, bold)
}

function drawRunningHeader(
  page: Page,
  y: { current: number },
  data: MovementOrderData,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>
): void {
  page.drawText('MOVEMENT ORDER', { x: MARGIN, y: y.current, size: 10, font: bold })
  page.drawText(data.productionName.slice(0, 80), { x: MARGIN + 130, y: y.current, size: 8.5, font })
  y.current -= 12
  page.drawRectangle({
    x: MARGIN,
    y: y.current + 5,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  })
  y.current -= 8
}

export async function generateMovementOrderPDF(
  data: MovementOrderData
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const pageRef = { page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]) }
  const y = { current: PAGE_HEIGHT - MARGIN }

  pageRef.page.drawText('MOVEMENT ORDER', {
    x: MARGIN,
    y: y.current,
    size: FONT_TITLE,
    font: bold,
  })
  y.current -= 22
  pageRef.page.drawText(data.productionName.slice(0, 96), {
    x: MARGIN,
    y: y.current,
    size: 12,
    font: bold,
  })
  y.current -= 14
  const dateLine = `Shoot date: ${data.shootDate}${
    data.dayNumber != null ? `  ·  Day ${data.dayNumber}` : ''
  }  ·  Unit: ${data.unitName}`
  pageRef.page.drawText(dateLine.slice(0, 110), {
    x: MARGIN,
    y: y.current,
    size: FONT_BODY,
    font,
  })
  y.current -= 18

  sectionHeading(pageRef.page, y, 'Locations', bold)
  if (data.locations.length === 0) {
    pageRef.page.drawText('No locations available.', { x: MARGIN, y: y.current, size: FONT_BODY, font })
    y.current -= LINE
  } else {
    for (const location of data.locations) {
      ensurePage(doc, pageRef, y, 72, data, font, bold)
      pageRef.page.drawText(location.name.slice(0, 90), { x: MARGIN, y: y.current, size: FONT_BODY, font: bold })
      y.current -= LINE

      const address = location.address?.trim() || 'Address not available'
      for (const line of wrapText(address, PAGE_WIDTH - MARGIN * 2, font, FONT_BODY)) {
        pageRef.page.drawText(line, { x: MARGIN, y: y.current, size: FONT_BODY, font })
        y.current -= LINE
      }
      if (location.what3words?.trim()) {
        pageRef.page.drawText(`what3words: ${location.what3words.trim()}`.slice(0, 96), {
          x: MARGIN,
          y: y.current,
          size: FONT_BODY,
          font,
          color: rgb(0.3, 0.3, 0.3),
        })
        y.current -= LINE
      }
      if (location.parkingInfo?.trim()) {
        for (const line of wrapText(
          `Parking: ${location.parkingInfo.trim()}`,
          PAGE_WIDTH - MARGIN * 2,
          font,
          FONT_BODY
        )) {
          pageRef.page.drawText(line, { x: MARGIN, y: y.current, size: FONT_BODY, font })
          y.current -= LINE
        }
      } else {
        pageRef.page.drawText('Parking: Parking info unavailable.', {
          x: MARGIN,
          y: y.current,
          size: FONT_BODY,
          font,
          color: rgb(0.35, 0.35, 0.35),
        })
        y.current -= LINE
      }
      y.current -= 6
    }
  }

  ensurePage(doc, pageRef, y, 72, data, font, bold)
  sectionHeading(pageRef.page, y, 'Movement / Directions', bold)
  if (data.movementLegs.length === 0) {
    pageRef.page.drawText('No movement legs available.', { x: MARGIN, y: y.current, size: FONT_BODY, font })
    y.current -= LINE
  } else {
    for (const leg of data.movementLegs) {
      ensurePage(doc, pageRef, y, 84, data, font, bold)
      pageRef.page.drawText(`${leg.fromLocationName} -> ${leg.toLocationName}`.slice(0, 100), {
        x: MARGIN,
        y: y.current,
        size: FONT_BODY,
        font: bold,
      })
      y.current -= LINE

      const drivingTime = leg.drivingTimeMinutes != null ? `${leg.drivingTimeMinutes} min` : 'Unavailable'
      const drivingDistance = leg.drivingDistanceText ?? 'Unavailable'
      pageRef.page.drawText(`Driving: ${drivingTime} (${drivingDistance})`.slice(0, 100), {
        x: MARGIN,
        y: y.current,
        size: FONT_BODY,
        font,
      })
      y.current -= LINE

      if (leg.walkingTimeMinutes != null || leg.walkingDistanceText) {
        const walkingTime = leg.walkingTimeMinutes != null ? `${leg.walkingTimeMinutes} min` : 'Unavailable'
        const walkingDistance = leg.walkingDistanceText ?? 'Unavailable'
        pageRef.page.drawText(`Walking: ${walkingTime} (${walkingDistance})`.slice(0, 100), {
          x: MARGIN,
          y: y.current,
          size: FONT_BODY,
          font,
        })
        y.current -= LINE
      } else {
        pageRef.page.drawText('Walking: Walking route unavailable.', {
          x: MARGIN,
          y: y.current,
          size: FONT_BODY,
          font,
          color: rgb(0.35, 0.35, 0.35),
        })
        y.current -= LINE
      }

      if (leg.writtenDirections?.trim()) {
        for (const line of wrapText(
          `Directions: ${leg.writtenDirections.trim()}`,
          PAGE_WIDTH - MARGIN * 2,
          font,
          FONT_BODY
        )) {
          ensurePage(doc, pageRef, y, LINE + 6, data, font, bold)
          pageRef.page.drawText(line, { x: MARGIN, y: y.current, size: FONT_BODY, font })
          y.current -= LINE
        }
      } else {
        pageRef.page.drawText('Directions: No directions available.', {
          x: MARGIN,
          y: y.current,
          size: FONT_BODY,
          font,
        })
        y.current -= LINE
      }
      y.current -= 4
    }
  }

  ensurePage(doc, pageRef, y, 72, data, font, bold)
  sectionHeading(pageRef.page, y, 'Locations Team Contacts', bold)
  if (data.locationContacts.length === 0) {
    pageRef.page.drawText('No Locations department contacts available.', {
      x: MARGIN,
      y: y.current,
      size: FONT_BODY,
      font,
    })
  } else {
    for (const contact of data.locationContacts) {
      ensurePage(doc, pageRef, y, 52, data, font, bold)
      pageRef.page.drawText(contact.name.slice(0, 90), { x: MARGIN, y: y.current, size: FONT_BODY, font: bold })
      y.current -= LINE
      const role = contact.role?.trim() ? contact.role.trim() : 'Role unavailable'
      pageRef.page.drawText(`Role: ${role}`.slice(0, 100), { x: MARGIN, y: y.current, size: FONT_BODY, font })
      y.current -= LINE
      if (contact.phone?.trim()) {
        pageRef.page.drawText(`Phone: ${contact.phone.trim()}`.slice(0, 100), {
          x: MARGIN,
          y: y.current,
          size: FONT_BODY,
          font,
        })
        y.current -= LINE
      }
      if (contact.email?.trim()) {
        pageRef.page.drawText(`Email: ${contact.email.trim()}`.slice(0, 100), {
          x: MARGIN,
          y: y.current,
          size: FONT_BODY,
          font,
        })
        y.current -= LINE
      }
      y.current -= 4
    }
  }

  return doc.save()
}
