import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { generateReleaseFormPdf, type ReleaseFormPdfInput } from '@/lib/pdf/releaseForm'

/** 1x1 transparent PNG. */
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0)
)

function input(over: Partial<ReleaseFormPdfInput> = {}): ReleaseFormPdfInput {
  const signedAt = new Date('2026-10-08T13:32:00Z')
  return {
    title: 'Contributor Release Form',
    companyName: 'Maverick Live',
    productionName: 'Wild Rivers',
    termsParagraphs: ['First paragraph of terms.', 'Second paragraph of terms.'],
    details: [
      { label: 'Address', value: '1 High Street' },
      { label: 'Email', value: '' },
    ],
    signer: { name: 'Jane Smith', signaturePng: PNG },
    signedAt,
    signedAtLabel: '8 October 2026, 14:32 BST',
    ...over,
  }
}

async function load(bytes: Uint8Array) {
  return PDFDocument.load(bytes, { updateMetadata: false })
}

/** Counts image XObjects in the saved file (a transparent PNG adds its soft mask too). */
function imageCount(bytes: Uint8Array): number {
  return (new TextDecoder('latin1').decode(bytes).match(/\/Subtype \/Image/g) ?? []).length
}

describe('generateReleaseFormPdf', () => {
  it('produces a one-page release with the signature embedded and metadata set', async () => {
    const bytes = await generateReleaseFormPdf(input())
    const pdf = await load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getTitle()).toBe('Contributor Release Form - Jane Smith')
    expect(pdf.getAuthor()).toBe('Maverick Live')
    expect(pdf.getSubject()).toBe('Wild Rivers')
    expect(imageCount(bytes)).toBeGreaterThan(0)
  })

  it('adds guardian and producer signatures only when given', async () => {
    const single = imageCount(await generateReleaseFormPdf(input()))
    const bytes = await generateReleaseFormPdf(
      input({
        guardian: { name: 'John Smith', signaturePng: PNG, termsParagraphs: ['Consent.'] },
        producer: { name: 'Pat Producer', signaturePng: PNG },
      })
    )
    expect(imageCount(bytes)).toBe(single * 3)
  })

  it('flows long terms onto further pages instead of truncating', async () => {
    const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}. ${'Lorem ipsum dolor sit amet. '.repeat(12)}`)
    const pdf = await load(await generateReleaseFormPdf(input({ termsParagraphs: long })))
    expect(pdf.getPageCount()).toBeGreaterThan(2)
  })

  it('still renders when the signature image cannot be read', async () => {
    const pdf = await load(await generateReleaseFormPdf(input({ signer: { name: 'X', signaturePng: new Uint8Array([1, 2]) } })))
    expect(pdf.getPageCount()).toBe(1)
  })
})
