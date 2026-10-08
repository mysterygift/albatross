import type { PDFImage } from 'pdf-lib'
import { COLOR_MUTED, PdfLayout, drawHorizontalRule, type TextBlock } from '@/lib/pdf/layoutKit'

export type ReleaseSignature = {
  /** Full printed name of the person signing. */
  name: string
  /** Transparent PNG of the drawn signature. */
  signaturePng: Uint8Array
}

export type ReleaseFormPdfInput = {
  title: string
  companyName: string
  productionName: string
  /** Terms as signed (tokens already filled in), one entry per paragraph. */
  termsParagraphs: string[]
  /** Optional details the signer filled in; empty values are left out. */
  details: Array<{ label: string; value: string }>
  signer: ReleaseSignature
  /** Parent or guardian consent, for signers under 18. */
  guardian?: (ReleaseSignature & { termsParagraphs: string[] }) | null
  /** Producer countersignature (location releases). */
  producer?: ReleaseSignature | null
  signedAt: Date
  /** Human-readable signing time, e.g. "8 October 2026, 14:32 BST". */
  signedAtLabel: string
}

const TERMS_SIZE = 9.5
const SIGNATURE_BOX_W = 230
const SIGNATURE_BOX_H = 60

function drawParagraphs(layout: PdfLayout, paragraphs: string[]): void {
  const lineH = layout.lineHeight(TERMS_SIZE)
  for (const paragraph of paragraphs) {
    for (const line of layout.wrap(paragraph, layout.contentWidth, TERMS_SIZE)) {
      layout.ensureSpace(lineH)
      layout.text(line, layout.xLeft, layout.y - TERMS_SIZE, { size: TERMS_SIZE })
      layout.y -= lineH
    }
    layout.gap(TERMS_SIZE * 0.7)
  }
}

/** Signature image sitting on a rule, with the printed name and signing time underneath. */
function drawSignatureBlock(
  layout: PdfLayout,
  label: string,
  image: PDFImage | null,
  lines: Array<{ label: string; value: string }>
): void {
  const lineH = layout.lineHeight(TERMS_SIZE)
  layout.ensureSpace(10 + SIGNATURE_BOX_H + 6 + lines.length * lineH + 8)
  layout.text(label.toUpperCase(), layout.xLeft, layout.y - 7, { size: 7, color: COLOR_MUTED })
  const ruleY = layout.y - 10 - SIGNATURE_BOX_H
  if (image) {
    const scale = Math.min(SIGNATURE_BOX_W / image.width, SIGNATURE_BOX_H / image.height)
    const width = image.width * scale
    const height = image.height * scale
    layout.page.drawImage(image, { x: layout.xLeft + 4, y: ruleY + 2, width, height })
  }
  drawHorizontalRule(layout.page, ruleY, layout.xLeft, layout.xLeft + SIGNATURE_BOX_W, undefined, 0.8)
  layout.y = ruleY - 4
  for (const line of lines) {
    const labelText = `${line.label}: `
    const baseline = layout.y - TERMS_SIZE
    layout.text(labelText, layout.xLeft, baseline, { size: TERMS_SIZE, color: COLOR_MUTED })
    layout.text(line.value, layout.xLeft + layout.textWidth(labelText, TERMS_SIZE), baseline, {
      size: TERMS_SIZE,
      bold: true,
    })
    layout.y -= lineH
  }
  layout.gap(8)
}

/** A signed release: details, the terms as signed, and the signature blocks, stamped with the signing time. */
export async function generateReleaseFormPdf(input: ReleaseFormPdfInput): Promise<Uint8Array> {
  const layout = await PdfLayout.create({ margin: 40, footerReserve: 26 })
  const { doc } = layout
  doc.setTitle(`${input.title} - ${input.signer.name}`)
  doc.setSubject(input.productionName)
  if (input.companyName) doc.setAuthor(input.companyName)
  doc.setCreator('Albatross')
  doc.setProducer('Albatross')
  doc.setCreationDate(input.signedAt)
  doc.setModificationDate(input.signedAt)

  layout.masthead({
    title: input.title,
    right: input.companyName,
    subLeft: input.productionName ? `Production: ${input.productionName}` : null,
    subRight: `Signed ${input.signedAtLabel}`,
  })

  const details = input.details.filter((d) => d.value.trim())
  if (details.length > 0) {
    const cells: TextBlock[][] = details.map((d) => [{ label: d.label, text: d.value.trim() }])
    layout.blockGrid(cells, 2)
    layout.gap(6)
  }

  drawParagraphs(layout, input.termsParagraphs)
  layout.gap(4)

  const [signerImage, guardianImage, producerImage] = await Promise.all([
    layout.embedPng(input.signer.signaturePng),
    input.guardian ? layout.embedPng(input.guardian.signaturePng) : Promise.resolve(null),
    input.producer ? layout.embedPng(input.producer.signaturePng) : Promise.resolve(null),
  ])

  layout.sectionBar('Accepted and agreed', 10 + SIGNATURE_BOX_H + 40)
  layout.gap(8)
  drawSignatureBlock(layout, 'Signature', signerImage, [
    { label: 'Name', value: input.signer.name },
    { label: 'Date and time', value: input.signedAtLabel },
  ])

  if (input.producer) {
    drawSignatureBlock(layout, 'Producer signature', producerImage, [
      { label: 'Name', value: input.producer.name },
      { label: 'Date and time', value: input.signedAtLabel },
    ])
  }

  if (input.guardian) {
    layout.sectionBar('Consent of parent or guardian', 60)
    layout.gap(8)
    drawParagraphs(layout, input.guardian.termsParagraphs)
    drawSignatureBlock(layout, 'Parent or guardian signature', guardianImage, [
      { label: 'Name', value: input.guardian.name },
      { label: 'Date and time', value: input.signedAtLabel },
    ])
  }

  layout.applyFooters({
    left: `${input.title} signed electronically in Albatross on ${input.signedAt.toISOString()}.`,
  })
  return doc.save()
}
