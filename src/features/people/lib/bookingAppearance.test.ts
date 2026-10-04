import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LANES_PER_WEEK,
  MAX_LANES_PER_WEEK,
  MIN_LANES_PER_WEEK,
  clampLanesPerWeek,
  loadAppearanceConfig,
  normalizeAppearanceConfig,
  saveAppearanceConfig,
} from './bookingAppearance'

describe('clampLanesPerWeek', () => {
  it('keeps values inside the supported range', () => {
    expect(clampLanesPerWeek(1)).toBe(MIN_LANES_PER_WEEK)
    expect(clampLanesPerWeek(99)).toBe(MAX_LANES_PER_WEEK)
    expect(clampLanesPerWeek(5)).toBe(5)
  })

  it('rounds and falls back to the default for junk', () => {
    expect(clampLanesPerWeek(4.6)).toBe(5)
    expect(clampLanesPerWeek('abc')).toBe(DEFAULT_LANES_PER_WEEK)
    expect(clampLanesPerWeek(undefined)).toBe(DEFAULT_LANES_PER_WEEK)
  })
})

describe('normalizeAppearanceConfig', () => {
  it('fills defaults for missing fields', () => {
    expect(normalizeAppearanceConfig({})).toEqual({
      view: 'calendar',
      lanesPerWeek: DEFAULT_LANES_PER_WEEK,
      hideUnbookedPeople: false,
    })
  })

  it('rejects unknown views', () => {
    expect(normalizeAppearanceConfig({ view: 'list' as never }).view).toBe('calendar')
    expect(normalizeAppearanceConfig({ view: 'timeline' }).view).toBe('timeline')
  })
})

describe('load/save appearance config', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
  })

  it('round-trips per production', () => {
    saveAppearanceConfig('p1', { view: 'timeline', lanesPerWeek: 6, hideUnbookedPeople: true })
    expect(loadAppearanceConfig('p1')).toEqual({ view: 'timeline', lanesPerWeek: 6, hideUnbookedPeople: true })
    expect(loadAppearanceConfig('p2').lanesPerWeek).toBe(DEFAULT_LANES_PER_WEEK)
  })

  it('recovers from corrupt storage', () => {
    localStorage.setItem('peopleBookingsAppearance:p1', '{nope')
    expect(loadAppearanceConfig('p1').view).toBe('calendar')
  })
})
