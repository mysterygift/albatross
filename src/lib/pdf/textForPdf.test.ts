import { describe, expect, it } from 'vitest'
import { textForPdf } from '@/lib/pdf/callSheet'

describe('textForPdf', () => {
  it('removes left-to-right override (U+202D) from crew names', () => {
    expect(textForPdf('\u202dAlex Producer')).toBe('Alex Producer')
  })
})
