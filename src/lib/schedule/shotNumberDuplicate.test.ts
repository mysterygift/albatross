import { describe, expect, it } from 'vitest'
import { nextShotNumberForDuplicate } from './shotNumberDuplicate'

describe('nextShotNumberForDuplicate', () => {
  it('appends A when source has no letter suffix', () => {
    expect(nextShotNumberForDuplicate('9', [])).toBe('9A')
    expect(nextShotNumberForDuplicate('10', new Set())).toBe('10A')
  })

  it('increments letter suffix for industry numbers', () => {
    expect(nextShotNumberForDuplicate('3A', [])).toBe('3B')
    expect(nextShotNumberForDuplicate('3a', [])).toBe('3b')
  })

  it('skips collisions in the scene', () => {
    expect(nextShotNumberForDuplicate('3A', ['3A', '3B'])).toBe('3C')
    expect(nextShotNumberForDuplicate('9', ['9', '9A'])).toBe('9B')
  })

  it('rolls Z to AA', () => {
    expect(nextShotNumberForDuplicate('9Z', [])).toBe('9AA')
  })

  it('uses fallback for non-industry numbers', () => {
    expect(nextShotNumberForDuplicate('Pickup', [])).toBe('PickupA')
    expect(nextShotNumberForDuplicate('Pickup', ['Pickup', 'PickupA'])).toBe('PickupB')
  })

  it('throws for empty source', () => {
    expect(() => nextShotNumberForDuplicate('', [])).toThrow(/empty/)
  })
})
