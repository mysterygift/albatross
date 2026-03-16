import { PDFDocument, rgb } from 'pdf-lib'

type InputPDFBytes = Uint8Array | ArrayBuffer

export interface RecipientNameWatermarkOptions {
  recipientFullName: string
}

/**
 * Apply a per-page recipient name watermark to an existing PDF.
 *
 * - Does not alter original generation logic; operates purely as a post‑processor.
 * - Draws the recipient's full name once per page, diagonally, grey at ~20% opacity.
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

  for (const page of pages) {
    const { width, height } = page.getSize()

    // Diagonal from bottom‑left towards top‑right; center roughly across the page.
    const angle = Math.atan2(height, width) // radians

    // Font size relative to page; tuned for typical A4/Letter production docs.
    const baseFontSize = Math.min(width, height) * 0.06

    const textWidth = font.widthOfTextAtSize(name, baseFontSize)
    const textHeight = font.heightAtSize(baseFontSize)

    // Position near the geometric center.
    const centerX = width / 2
    const centerY = height / 2

    // Adjust so rotation happens around text center.
    const x = centerX - textWidth / 2
    const y = centerY - textHeight / 2

    page.drawText(name, {
      x,
      y,
      size: baseFontSize,
      font,
      color: rgb(0.5, 0.5, 0.5), // medium grey
      rotate: { type: 'degrees', angle: (angle * 180) / Math.PI },
      opacity: 0.2,
    })
  }

  return doc.save()
}

