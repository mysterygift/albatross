import { describe, expect, it } from 'vitest'
import { normalizeSceneDayNight, normalizeSceneIntExt } from './sceneFields'

describe('normalizeSceneIntExt', () => {
  it('maps UNK and empty to null', () => {
    expect(normalizeSceneIntExt('UNK')).toBeNull()
    expect(normalizeSceneIntExt('')).toBeNull()
    expect(normalizeSceneIntExt(null)).toBeNull()
  })

  it('accepts INT, EXT, and MIXED', () => {
    expect(normalizeSceneIntExt('INT')).toBe('INT')
    expect(normalizeSceneIntExt('EXT')).toBe('EXT')
    expect(normalizeSceneIntExt('MIXED')).toBe('MIXED')
  })

  it('rejects unknown strings', () => {
    expect(normalizeSceneIntExt('EST')).toBeNull()
  })
})

describe('normalizeSceneDayNight', () => {
  it('maps UNK and empty to null', () => {
    expect(normalizeSceneDayNight('UNK')).toBeNull()
    expect(normalizeSceneDayNight('')).toBeNull()
    expect(normalizeSceneDayNight(null)).toBeNull()
  })

  it('accepts expanded time-of-day values', () => {
    expect(normalizeSceneDayNight('DAWN')).toBe('DAWN')
    expect(normalizeSceneDayNight('DUSK')).toBe('DUSK')
    expect(normalizeSceneDayNight('TIMELESS')).toBe('TIMELESS')
    expect(normalizeSceneDayNight('DAY')).toBe('DAY')
  })

  it('rejects unknown strings', () => {
    expect(normalizeSceneDayNight('SUNRISE')).toBeNull()
  })
})
