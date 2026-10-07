import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { generateCueSheet, type CueSheetRow } from '@/lib/pdf'

function rows(n: number): CueSheetRow[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `Track ${i + 1}`,
    artist: 'Artist',
    publisher: 'Label',
  }))
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}

describe('generateCueSheet', () => {
  it('fits a short list on one page', async () => {
    expect(await pageCount(await generateCueSheet('Prod', rows(10)))).toBe(1)
  })

  it('produces a single page for an empty list', async () => {
    expect(await pageCount(await generateCueSheet('Prod', []))).toBe(1)
  })

  it('paginates long track lists instead of truncating', async () => {
    // First page holds ~43 rows, later pages ~45.
    expect(await pageCount(await generateCueSheet('Prod', rows(40)))).toBe(1)
    expect(await pageCount(await generateCueSheet('Prod', rows(60)))).toBe(2)
    expect(await pageCount(await generateCueSheet('Prod', rows(100)))).toBe(3)
    expect(await pageCount(await generateCueSheet('Prod', rows(200)))).toBe(5)
  })

  it('handles very long titles without throwing', async () => {
    const long = [{ title: 'W'.repeat(300), artist: 'A'.repeat(200), publisher: null }]
    expect(await pageCount(await generateCueSheet('Prod', long))).toBe(1)
  })
})
