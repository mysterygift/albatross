/**
 * Minimal text PDFs (pdf-lib, standard Helvetica) for the demo's documents: invoices, purchase
 * orders, receipts, placeholder permits and the demo guide. Standard fonts only cover WinAnsi,
 * so text is folded to that set first.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'

const WIN_ANSI_EXTRAS = new Set(['–', '—', '‘', '’', '“', '”', '…', '•', '€', '£', '×'])

export function winAnsi(text: string): string {
  let out = ''
  for (const ch of text.replace(/→/g, '->').replace(/≈/g, '~').replace(/≤/g, '<=').replace(/≥/g, '>=')) {
    const cp = ch.codePointAt(0)!
    if (cp < 256 || WIN_ANSI_EXTRAS.has(ch)) {
      out += ch
      continue
    }
    const folded = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    out += folded.codePointAt(0)! < 256 ? folded : '?'
  }
  return out
}

export type PdfBlock =
  | { kind: 'h1' | 'h2' | 'p' | 'li' | 'mono'; text: string }
  | { kind: 'gap' }
  | { kind: 'row'; cols: string[]; widths: number[]; bold?: boolean }

type Doc = { title: string; banner?: string; blocks: PdfBlock[] }

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = winAnsi(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next
    } else {
      if (line) lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

export async function renderPdf(doc: Doc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(winAnsi(doc.title))
  pdf.setCreator('Albatross demo generator')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const mono = await pdf.embedFont(StandardFonts.Courier)
  const W = 595.28
  const H = 841.89
  const M = 54
  const maxW = W - 2 * M
  let page = pdf.addPage([W, H])
  let y = H - M

  const newPage = () => {
    page = pdf.addPage([W, H])
    y = H - M
  }
  const need = (h: number) => {
    if (y - h < M) newPage()
  }

  if (doc.banner) {
    page.drawRectangle({ x: M, y: y - 22, width: maxW, height: 22, color: rgb(0.96, 0.9, 0.7) })
    page.drawText(winAnsi(doc.banner), { x: M + 8, y: y - 15, size: 8.5, font: bold, color: rgb(0.35, 0.25, 0) })
    y -= 36
  }
  page.drawText(winAnsi(doc.title), { x: M, y: y - 18, size: 20, font: bold })
  y -= 38

  for (const b of doc.blocks) {
    if (b.kind === 'gap') {
      y -= 8
      continue
    }
    if (b.kind === 'row') {
      need(16)
      let x = M
      b.cols.forEach((c, i) => {
        const w = b.widths[i] ?? 100
        const f = b.bold ? bold : font
        const t = wrap(c, f, 9, w - 6)[0] ?? ''
        page.drawText(t, { x, y: y - 10, size: 9, font: f })
        x += w
      })
      y -= 14
      continue
    }
    const style = {
      h1: { f: bold, s: 14, lh: 19, indent: 0, before: 8 },
      h2: { f: bold, s: 11.5, lh: 16, indent: 0, before: 6 },
      p: { f: font, s: 10, lh: 14, indent: 0, before: 0 },
      li: { f: font, s: 10, lh: 14, indent: 14, before: 0 },
      mono: { f: mono, s: 8.5, lh: 12, indent: 0, before: 0 },
    }[b.kind]
    y -= style.before
    const lines = wrap(b.text, style.f, style.s, maxW - style.indent)
    for (let i = 0; i < lines.length; i++) {
      need(style.lh)
      if (b.kind === 'li' && i === 0) page.drawText('•', { x: M + 3, y: y - style.s, size: style.s, font })
      page.drawText(lines[i]!, { x: M + style.indent, y: y - style.s, size: style.s, font: style.f })
      y -= style.lh
    }
  }
  return pdf.save()
}

export const DEMO_BANNER = 'DEMO PLACEHOLDER — fictional document for the Toothpick demo. Not a real invoice, permit or contract.'
