import { describe, expect, it } from 'vitest'

import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'

describe('sanitizeForFilename', () => {
  it('slugs names, keeping the base letter of accented ones', () => {
    expect(sanitizeForFilename('Mirela Kovač')).toBe('mirela-kovac')
    expect(sanitizeForFilename('Łukasz Wałęsa')).toBe('lukasz-walesa')
    expect(sanitizeForFilename('  Ciarán  Doyle ')).toBe('ciaran-doyle')
  })

  it('falls back when nothing usable is left', () => {
    expect(sanitizeForFilename('Иван')).toBe('recipient')
  })
})
