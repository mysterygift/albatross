/**
 * Appearance settings for the People Bookings page (Calendar View and Timeline View).
 *
 * Persisted per production in localStorage, alongside the pill color configuration.
 */

export type BookingView = 'calendar' | 'timeline'

export type BookingAppearanceConfig = {
  /** Which view the Bookings page shows. */
  view: BookingView
  /**
   * Lane slots every week row reserves in the Calendar View. When a week needs more, the
   * last slot becomes a "+n more" button, so every week stays the same height.
   */
  lanesPerWeek: number
  /** Timeline View: hide people with no bookings in the visible month. */
  hideUnbookedPeople: boolean
}

export const MIN_LANES_PER_WEEK = 3
export const MAX_LANES_PER_WEEK = 8
export const DEFAULT_LANES_PER_WEEK = 4

export const DEFAULT_APPEARANCE_CONFIG: BookingAppearanceConfig = {
  view: 'calendar',
  lanesPerWeek: DEFAULT_LANES_PER_WEEK,
  hideUnbookedPeople: false,
}

const STORAGE_PREFIX = 'peopleBookingsAppearance'

export function clampLanesPerWeek(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_LANES_PER_WEEK
  return Math.min(MAX_LANES_PER_WEEK, Math.max(MIN_LANES_PER_WEEK, Math.round(n)))
}

/** Normalizes untrusted stored data into a valid config. */
export function normalizeAppearanceConfig(raw: Partial<BookingAppearanceConfig> | null | undefined): BookingAppearanceConfig {
  return {
    view: raw?.view === 'timeline' ? 'timeline' : 'calendar',
    lanesPerWeek: clampLanesPerWeek(raw?.lanesPerWeek ?? DEFAULT_LANES_PER_WEEK),
    hideUnbookedPeople: raw?.hideUnbookedPeople === true,
  }
}

function storageKey(productionId: string): string {
  return `${STORAGE_PREFIX}:${productionId}`
}

export function loadAppearanceConfig(productionId: string): BookingAppearanceConfig {
  try {
    const raw = localStorage.getItem(storageKey(productionId))
    if (raw) return normalizeAppearanceConfig(JSON.parse(raw) as Partial<BookingAppearanceConfig>)
  } catch {
    // Ignore storage/parse failures and fall back to defaults.
  }
  return DEFAULT_APPEARANCE_CONFIG
}

export function saveAppearanceConfig(productionId: string, config: BookingAppearanceConfig): void {
  try {
    localStorage.setItem(storageKey(productionId), JSON.stringify(config))
  } catch {
    // Ignore storage write failures.
  }
}
