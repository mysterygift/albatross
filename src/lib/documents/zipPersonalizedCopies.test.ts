import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'

import { zipPersonalizedCopies } from '@/lib/documents/persistPersonalizedDocuments'

describe('zipPersonalizedCopies', () => {
  it('bundles every copy, giving names that sanitise alike their own entry', () => {
    const pdf = (n: number) => new Uint8Array([0x25, 0x50, 0x44, 0x46, n])
    const zip = zipPersonalizedCopies([
      { fileName: 'call-sheet-2026-11-02-main-unit-alex-doe.pdf', bytes: pdf(1) },
      { fileName: 'call-sheet-2026-11-02-main-unit-alex-doe.pdf', bytes: pdf(2) },
      { fileName: 'call-sheet-2026-11-02-main-unit-sam-roe.pdf', bytes: pdf(3) },
    ])
    const files = unzipSync(zip)
    expect(Object.keys(files).sort()).toEqual([
      'call-sheet-2026-11-02-main-unit-alex-doe-1.pdf',
      'call-sheet-2026-11-02-main-unit-alex-doe.pdf',
      'call-sheet-2026-11-02-main-unit-sam-roe.pdf',
    ])
    expect(Array.from(files['call-sheet-2026-11-02-main-unit-alex-doe-1.pdf']!)).toEqual([0x25, 0x50, 0x44, 0x46, 2])
  })
})
