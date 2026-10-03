// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SmartSchedulingInsightsPanel } from './smart-scheduling-insights-panel'

const KEY = 'test.insightsOpen'

/** jsdom in this setup has no usable localStorage, so install an in-memory stand-in. */
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

const emptyProps = {
  strips: [],
  shots: [],
  scenes: [],
  shootDays: [],
  locations: [],
  castPersonIdsByShotId: new Map<string, string[]>(),
}

describe('SmartSchedulingInsightsPanel disclosure', () => {
  beforeEach(() => {
    installStorage()
  })

  afterEach(() => {
    cleanup()
  })

  it('starts collapsed, with the body hidden from interaction', () => {
    render(<SmartSchedulingInsightsPanel {...emptyProps} storageKey={KEY} />)
    const toggle = screen.getByRole('button', { name: /Smart Scheduling Insights/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const region = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(region.hasAttribute('inert')).toBe(true)
  })

  it('reveals the body on click and persists the choice', () => {
    render(<SmartSchedulingInsightsPanel {...emptyProps} storageKey={KEY} />)
    const toggle = screen.getByRole('button', { name: /Smart Scheduling Insights/ })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const region = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(region.hasAttribute('inert')).toBe(false)
    expect(window.localStorage.getItem(KEY)).toBe('true')
  })

  it('restores the remembered open state on mount', () => {
    window.localStorage.setItem(KEY, 'true')
    render(<SmartSchedulingInsightsPanel {...emptyProps} storageKey={KEY} />)
    expect(screen.getByRole('button', { name: /Smart Scheduling Insights/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('shows the state summary in the header while collapsed', () => {
    render(<SmartSchedulingInsightsPanel {...emptyProps} storageKey={KEY} />)
    expect(screen.getByText('Not enough scheduled shot data yet')).toBeTruthy()
  })
})
