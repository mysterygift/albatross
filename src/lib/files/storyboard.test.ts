import { describe, expect, it } from 'vitest'

import {
  assertAthenaPdfFilename,
  buildStoryboardImageStorageKey,
  buildStoryboardImportCandidateStorageKey,
} from '@/lib/files/storyboard'

describe('storyboard file storage helpers', () => {
  it('builds production-scoped deterministic path segments', () => {
    const key = buildStoryboardImageStorageKey({
      productionId: 'prod-123',
      shotId: 'shot-456',
      sourceType: 'manual',
      originalFilename: 'My Board Image.JPG',
    })

    expect(key.startsWith('storyboards/prod-123/shots/shot-456/manual/')).toBe(true)
    expect(key.endsWith('.jpg')).toBe(true)
    expect(key.includes('My-Board-Image')).toBe(true)
  })

  it('uses source-type specific folder for imports', () => {
    const key = buildStoryboardImageStorageKey({
      productionId: 'prod-123',
      shotId: 'shot-999',
      sourceType: 'athena_pdf_import',
      originalFilename: 'panel-01.png',
    })
    expect(key.includes('/athena_pdf_import/')).toBe(true)
  })

  it('validates Athena import file extension', () => {
    expect(() => assertAthenaPdfFilename('gallery.pdf')).not.toThrow()
    expect(() => assertAthenaPdfFilename('gallery.PDF')).not.toThrow()
    expect(() => assertAthenaPdfFilename('gallery.png')).toThrow(/PDF/i)
  })

  it('builds candidate storage keys under import scope', () => {
    const key = buildStoryboardImportCandidateStorageKey({
      productionId: 'prod-1',
      sourceImportId: 'import-1',
      pageNumber: 2,
      panelIndex: 5,
    })
    expect(key.startsWith('storyboards/prod-1/imports/import-1/candidates/page-002-panel-0005-')).toBe(true)
    expect(key.endsWith('.png')).toBe(true)
  })
})
