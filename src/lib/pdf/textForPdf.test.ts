import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { textForPdf } from '@/lib/pdf/callSheet'
import { applyRecipientNameWatermarkToPDF } from '@/lib/pdf/applyRecipientNameWatermarkToPDF'
import { generateCueSheet } from '@/lib/pdf'
import { generateDoodPdf } from '@/lib/pdf/dood'

describe('textForPdf', () => {
  it('removes left-to-right override (U+202D) from crew names', () => {
    expect(textForPdf('‭Alex Producer')).toBe('Alex Producer')
  })

  // Œ and œ are in WinAnsi (0x8C, 0x9C), so Helvetica draws them as they are.
  it('maps letters WinAnsi lacks to their base letter and keeps the ones it has', () => {
    expect(textForPdf('Kovač Dvořák Łódź Ştefan Ğül Œuvre İbrahim')).toBe('Kovac Dvorák Lódz Stefan Gül Œuvre Ibrahim')
    expect(textForPdf('José Müller Ørsted Straße')).toBe('José Müller Ørsted Straße')
  })

  it('turns Unicode spaces into plain spaces and drops what has no Latin form', () => {
    expect(textForPdf('10:30 PM')).toBe('10:30 PM')
    expect(textForPdf('Ana 李 🎬')).toBe('Ana  ')
  })

  it('always returns text Helvetica can encode', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
    const sample = 'Kovač ŁŻŚĆ ąęńő ŠšŽž ğış ț ș ř ů ě ď ť ň ľ ĺ ŕ ā ē ī ō ū 李 🎬   '
    expect(() => font.encodeText(textForPdf(sample))).not.toThrow()
  })
})

describe('PDFs with names WinAnsi cannot encode', () => {
  it('watermarks a recipient whose name has a č', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const out = await applyRecipientNameWatermarkToPDF(await doc.save(), { recipientFullName: 'Ana Kovač' })
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
  })

  it('leaves the PDF unwatermarked when nothing in the name is printable', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const out = await applyRecipientNameWatermarkToPDF(await doc.save(), { recipientFullName: '李小龙' })
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
  })

  it('renders a cue sheet and a day out of days with such names', async () => {
    await expect(
      generateCueSheet('Prodŭkcija', [{ title: 'Slavonic Dance', artist: 'Antonín Dvořák', publisher: 'Supraphon' }])
    ).resolves.toBeInstanceOf(Uint8Array)
    await expect(
      generateDoodPdf({
        productionName: 'Prodŭkcija',
        dates: ['2026-10-14'],
        rows: [{ personName: 'Ana Kovač', cells: ['WORK'], start: '2026-10-14', finish: '2026-10-14', workDays: 1, holdDays: 0, clashCount: 0 }],
      } as unknown as Parameters<typeof generateDoodPdf>[0])
    ).resolves.toBeInstanceOf(Uint8Array)
  })
})

describe('toWinAnsi / textForPdf: letters the standard fonts cannot encode', () => {
  it('keeps WinAnsi letters, including those outside Latin-1', async () => {
    const { toWinAnsi } = await import('@/lib/pdf/layoutKit')
    expect(toWinAnsi('Lucía Fernández, Šárka Žáková, Œuvre €5')).toBe('Lucía Fernández, Šárka Žáková, Œuvre €5')
  })

  it('falls back to the base letter for other accented letters', () => {
    expect(textForPdf('Jiří Čech')).toBe('Jirí Cech')
    expect(textForPdf('Łukasz Wałęsa')).toBe('Lukasz Walesa')
    expect(textForPdf('Erdős Ödön')).toBe('Erdos Ödön')
  })

  it('drops characters with no Latin equivalent instead of throwing', () => {
    expect(textForPdf('Ivan Иванов')).toBe('Ivan ')
  })
})

describe('embedStandardFont', () => {
  it('draws and measures text WinAnsi cannot encode', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const { embedStandardFont } = await import('@/lib/pdf/layoutKit')
    const doc = await PDFDocument.create()
    const font = await embedStandardFont(doc, StandardFonts.Helvetica)
    const page = doc.addPage()
    expect(() => page.drawText('Tomáš Čech', { x: 10, y: 10, size: 12, font })).not.toThrow()
    expect(font.widthOfTextAtSize('Čech', 12)).toBe(font.widthOfTextAtSize('Cech', 12))
  })
})
