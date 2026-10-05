import { describe, expect, it } from 'vitest'
import { textForPdf } from '@/lib/pdf/callSheet'

describe('textForPdf', () => {
  it('removes left-to-right override (U+202D) from crew names', () => {
    expect(textForPdf('\u202dAlex Producer')).toBe('Alex Producer')
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
