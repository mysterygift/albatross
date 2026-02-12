/**
 * Day Out of Days PDF export (A4, landscape if many columns).
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export type DoodCellStatus = 'WORK' | 'HOLD' | 'OFF' | 'CLASH'

export interface DoodExportData {
  productionName: string
  dates: string[]
  rows: Array<{
    personName: string
    start: string
    finish: string
    workDays: number
    holdDays: number
    clashCount: number
    cells: DoodCellStatus[]
  }>
}

export async function generateDoodPdf(data: DoodExportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const numCols = data.dates.length + 6 // dates + Start, Finish, Work, Hold, Clash
  const useLandscape = numCols > 10
  const pageSize: [number, number] = useLandscape ? [792, 612] : [612, 792]
  const page = doc.addPage(pageSize)
  const { width, height } = page.getSize()
  const margin = 36
  const rowH = 14
  const cellW = Math.min(48, (width - margin * 2 - 120) / Math.max(numCols, 1))
  const nameW = 100

  let y = height - margin

  page.drawText('DAY OUT OF DAYS', {
    x: margin,
    y,
    size: 16,
    font: bold,
    color: rgb(0.2, 0.2, 0.2),
  })
  y -= 8
  page.drawText(data.productionName, {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  })
  y -= rowH + 8

  let x = margin
  page.drawText('Cast', { x, y, size: 9, font: bold })
  x += nameW
  for (const d of data.dates) {
    page.drawText(d.slice(0, 10), { x, y, size: 7, font })
    x += cellW
  }
  page.drawText('Start', { x, y, size: 7, font: bold })
  x += cellW
  page.drawText('Finish', { x, y, size: 7, font: bold })
  x += cellW
  page.drawText('Work', { x, y, size: 7, font: bold })
  x += cellW
  page.drawText('Hold', { x, y, size: 7, font: bold })
  page.drawText('Clash', { x: x + cellW, y, size: 7, font: bold })
  y -= rowH

  const red = rgb(0.85, 0.2, 0.2)
  let currentPage = page
  for (const row of data.rows) {
    if (y < margin + rowH) {
      currentPage = doc.addPage(pageSize as [number, number])
      const newHeight = currentPage.getSize().height
      y = newHeight - margin
      let hx = margin
      currentPage.drawText('Cast', { x: hx, y, size: 9, font: bold })
      hx += nameW
      for (const d of data.dates) {
        currentPage.drawText(d.slice(0, 10), { x: hx, y, size: 7, font })
        hx += cellW
      }
      currentPage.drawText('Start', { x: hx, y, size: 7, font: bold })
      hx += cellW
      currentPage.drawText('Finish', { x: hx, y, size: 7, font: bold })
      hx += cellW
      currentPage.drawText('Work', { x: hx, y, size: 7, font: bold })
      hx += cellW
      currentPage.drawText('Hold', { x: hx, y, size: 7, font: bold })
      currentPage.drawText('Clash', { x: hx + cellW, y, size: 7, font: bold })
      y -= rowH
    }
    x = margin
    currentPage.drawText(row.personName.slice(0, 18), { x, y, size: 8, font })
    x += nameW
    for (let i = 0; i < row.cells.length; i++) {
      const status = row.cells[i]!
      const label = status === 'WORK' ? 'W' : status === 'HOLD' ? 'H' : status === 'CLASH' ? '!' : '—'
      if (status === 'CLASH') {
        currentPage.drawRectangle({
          x: x - 2,
          y: y - 2,
          width: cellW + 4,
          height: rowH + 4,
          color: rgb(0.95, 0.85, 0.85),
          borderColor: red,
          borderWidth: 1,
        })
        currentPage.drawText(label, { x: x + 4, y, size: 8, font: bold, color: red })
      } else {
        currentPage.drawText(label, { x: x + 4, y, size: 8, font })
      }
      x += cellW
    }
    currentPage.drawText(row.start, { x, y, size: 7, font })
    x += cellW
    currentPage.drawText(row.finish, { x, y, size: 7, font })
    x += cellW
    currentPage.drawText(String(row.workDays), { x, y, size: 7, font })
    x += cellW
    currentPage.drawText(String(row.holdDays), { x, y, size: 7, font })
    x += cellW
    currentPage.drawText(String(row.clashCount), { x, y, size: 7, font: row.clashCount > 0 ? bold : font, color: row.clashCount > 0 ? red : rgb(0.2, 0.2, 0.2) })
    y -= rowH
  }

  page.drawText(
    `Generated: ${new Date().toLocaleString()}`,
    { x: margin, y: 24, size: 8, font, color: rgb(0.5, 0.5, 0.5) }
  )

  return doc.save()
}
