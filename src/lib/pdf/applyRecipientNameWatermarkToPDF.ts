import { PDFDocument, degrees, rgb } from 'pdf-lib'

type InputPDFBytes = Uint8Array | ArrayBuffer

export interface RecipientNameWatermarkOptions {
  recipientFullName: string
}

/**
 * Apply a per-page recipient name watermark to an existing PDF.
 *
 * - Does not alter original generation logic; operates purely as a post‑processor.
 * - Draws the recipient's full name once per page, centred, rotated 45°, grey at ~20% opacity.
 *
 * Usage (example):
 *   const base = await generateCallSheetPdf(data)
 *   const watermarked = await applyRecipientNameWatermarkToPDF(base, { recipientFullName: 'Alex Doe' })
 */
export async function applyRecipientNameWatermarkToPDF(
  PDFBytes: InputPDFBytes,
  options: RecipientNameWatermarkOptions,
): Promise<Uint8Array> {
  const name = options.recipientFullName?.trim()
  if (!name) {
    throw new Error('applyRecipientNameWatermarkToPDF: recipientFullName is required and cannot be empty.')
  }

  let baseBytes: Uint8Array
  if (PDFBytes instanceof Uint8Array) {
    baseBytes = PDFBytes
  } else if (PDFBytes instanceof ArrayBuffer) {
    baseBytes = new Uint8Array(PDFBytes)
  } else {
    throw new Error('applyRecipientNameWatermarkToPDF: PDFBytes must be a Uint8Array or ArrayBuffer.')
  }

  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(baseBytes, { ignoreEncryption: false })
  } catch (err) {
    throw new Error('applyRecipientNameWatermarkToPDF: Failed to read input PDF bytes.')
  }

  const pages = doc.getPages()
  if (!pages.length) {
    // Treat empty PDFs as invalid for watermarking.
    throw new Error('applyRecipientNameWatermarkToPDF: PDF has no pages to watermark.')
  }

  // Use a built‑in font so the utility has no external font dependencies.
  const font = await doc.embedFont('Helvetica')

  /** pdf-lib rotates text about the baseline origin; offset so the label sits centred on the page. */
  const rotationDeg = 45
  const rad = (rotationDeg * Math.PI) / 180
  const cosR = Math.cos(rad)
  const sinR = Math.sin(rad)

  for (const page of pages) {
    const { width, height } = page.getSize()

    // Font size relative to page; tuned for typical A4/Letter production docs (doubled vs original 0.06).
    const baseFontSize = Math.min(width, height) * 0.12

    const textWidth = font.widthOfTextAtSize(name, baseFontSize)
    const textHeight = font.heightAtSize(baseFontSize)

    const cx = width / 2
    const cy = height / 2

    // Baseline runs along unit vector u; text "up" is v. Place origin so bbox centre ≈ (cx, cy).
    const k = textHeight * 0.38
    const x = cx - (textWidth / 2) * cosR + k * sinR
    const y = cy - (textWidth / 2) * sinR - k * cosR

    page.drawText(name, {
      x,
      y,
      size: baseFontSize,
      font,
      color: rgb(0.5, 0.5, 0.5), // medium grey
      rotate: degrees(rotationDeg),
      opacity: 0.2,
    })
  }

  return doc.save()
}

