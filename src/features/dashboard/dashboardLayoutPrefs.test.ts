// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIDDEN_CARDS_STORAGE_KEY, readHiddenCards, writeHiddenCards } from './dashboardLayoutPrefs'

function installStorage() {
  const map = new Map<string, string>()
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  return storage
}

beforeEach(() => {
  installStorage()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dashboardLayoutPrefs', () => {
  it('defaults to nothing hidden', () => {
    expect(readHiddenCards()).toEqual([])
  })

  it('round-trips hidden cards', () => {
    writeHiddenCards(['budgetHealth', 'riskWatch'])
    expect(readHiddenCards()).toEqual(['budgetHealth', 'riskWatch'])
  })

  it('clears storage when nothing is hidden', () => {
    writeHiddenCards(['floats'])
    writeHiddenCards([])
    expect(window.localStorage.getItem(HIDDEN_CARDS_STORAGE_KEY)).toBeNull()
  })

  it('falls back on corrupt JSON or wrong shapes', () => {
    window.localStorage.setItem(HIDDEN_CARDS_STORAGE_KEY, '{not json')
    expect(readHiddenCards()).toEqual([])
    window.localStorage.setItem(HIDDEN_CARDS_STORAGE_KEY, JSON.stringify({ hidden: 'x' }))
    expect(readHiddenCards()).toEqual([])
    window.localStorage.setItem(HIDDEN_CARDS_STORAGE_KEY, 'null')
    expect(readHiddenCards()).toEqual([])
  })

  it('drops unknown ids', () => {
    window.localStorage.setItem(HIDDEN_CARDS_STORAGE_KEY, JSON.stringify({ hidden: ['tasksDue', 'bogus', 3] }))
    expect(readHiddenCards()).toEqual(['tasksDue'])
  })

  it('does not throw when storage throws', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: blocked, setItem: blocked, removeItem: blocked },
      configurable: true,
    })
    expect(readHiddenCards()).toEqual([])
    expect(() => writeHiddenCards(['floats'])).not.toThrow()
  })
})
