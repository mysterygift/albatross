/**
 * Color configuration for the People Bookings calendar.
 *
 * Pills are colored so users can read cast/crew grouping at a glance:
 * - Crew are colored by department.
 * - Principal cast are colored individually (user-designated).
 * - All other cast (supporting / standing artists) share one color.
 *
 * The configuration is persisted per production in localStorage. All resolution
 * helpers are pure so they can be unit tested.
 */

import type { Person } from '@/lib/db/types'

export type BookingColorConfig = {
  /** Department name -> hex color. */
  departmentColors: Record<string, string>
  /** Person id -> hex color for principal cast. */
  principalCastColors: Record<string, string>
  /** Shared color for supporting cast / standing artists. */
  supportingCastColor: string
  /** Fallback color for crew with no department color. */
  crewFallbackColor: string
}

/** Distinct, readable palette (deliberately avoids clustering on purple/indigo). */
export const DEPARTMENT_PALETTE = [
  '#2563eb', // blue
  '#0d9488', // teal
  '#16a34a', // green
  '#ca8a04', // amber
  '#dc2626', // red
  '#db2777', // pink
  '#ea580c', // orange
  '#0891b2', // cyan
  '#65a30d', // lime
  '#e11d48', // rose
  '#0284c7', // sky
  '#9333ea', // purple (last resort)
]

export const PRINCIPAL_CAST_PALETTE = [
  '#7c3aed', // violet
  '#0ea5e9', // sky
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#14b8a6', // teal
  '#f97316', // orange
  '#22c55e', // green
]

export const DEFAULT_SUPPORTING_CAST_COLOR = '#64748b' // slate-500
export const DEFAULT_CREW_FALLBACK_COLOR = '#475569' // slate-600

const STORAGE_PREFIX = 'peopleBookingsColors'

/** Sorted, de-duplicated department names present on the given people. */
export function getDepartmentNames(people: Person[]): string[] {
  const set = new Set<string>()
  for (const p of people) {
    const dept = p.department?.trim()
    if (dept) set.add(dept)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** Builds a deterministic default configuration from the current people list. */
export function getDefaultColorConfig(people: Person[]): BookingColorConfig {
  const departmentColors: Record<string, string> = {}
  getDepartmentNames(people).forEach((dept, i) => {
    departmentColors[dept] = DEPARTMENT_PALETTE[i % DEPARTMENT_PALETTE.length]
  })
  return {
    departmentColors,
    principalCastColors: {},
    supportingCastColor: DEFAULT_SUPPORTING_CAST_COLOR,
    crewFallbackColor: DEFAULT_CREW_FALLBACK_COLOR,
  }
}

/**
 * Ensures every current department has a color (adding defaults for new ones)
 * and drops principal colors for people no longer present, while preserving all
 * existing user choices.
 */
export function mergeConfigWithDefaults(
  config: BookingColorConfig,
  people: Person[]
): BookingColorConfig {
  const departmentColors = { ...config.departmentColors }
  const departments = getDepartmentNames(people)
  const used = new Set(Object.values(departmentColors))
  for (const dept of departments) {
    if (departmentColors[dept]) continue
    const next =
      DEPARTMENT_PALETTE.find((c) => !used.has(c)) ??
      DEPARTMENT_PALETTE[Object.keys(departmentColors).length % DEPARTMENT_PALETTE.length]
    departmentColors[dept] = next
    used.add(next)
  }
  const validPersonIds = new Set(people.map((p) => p.id))
  const principalCastColors: Record<string, string> = {}
  for (const [id, color] of Object.entries(config.principalCastColors)) {
    if (validPersonIds.has(id)) principalCastColors[id] = color
  }
  return {
    departmentColors,
    principalCastColors,
    supportingCastColor: config.supportingCastColor || DEFAULT_SUPPORTING_CAST_COLOR,
    crewFallbackColor: config.crewFallbackColor || DEFAULT_CREW_FALLBACK_COLOR,
  }
}

/** Returns the next principal palette color not already assigned. */
export function nextPrincipalColor(config: BookingColorConfig): string {
  const used = new Set(Object.values(config.principalCastColors))
  return (
    PRINCIPAL_CAST_PALETTE.find((c) => !used.has(c)) ??
    PRINCIPAL_CAST_PALETTE[used.size % PRINCIPAL_CAST_PALETTE.length]
  )
}

/** Resolves the pill color for a person given the active configuration. */
export function resolvePersonColor(person: Person, config: BookingColorConfig): string {
  if (person.is_cast === 1) {
    return config.principalCastColors[person.id] ?? config.supportingCastColor
  }
  const dept = person.department?.trim()
  if (dept && config.departmentColors[dept]) return config.departmentColors[dept]
  return config.crewFallbackColor
}

/** Chooses black or white text for legibility against a hex background. */
export function getContrastText(hex: string): string {
  const c = hex.replace('#', '')
  const full =
    c.length === 3
      ? c.split('').map((ch) => ch + ch).join('')
      : c.padEnd(6, '0').slice(0, 6)
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const toLinear = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance > 0.5 ? '#0b0f19' : '#ffffff'
}

function storageKey(productionId: string): string {
  return `${STORAGE_PREFIX}:${productionId}`
}

/** Loads and normalizes the stored config for a production, falling back to defaults. */
export function loadColorConfig(productionId: string, people: Person[]): BookingColorConfig {
  try {
    const raw = localStorage.getItem(storageKey(productionId))
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BookingColorConfig>
      return mergeConfigWithDefaults(
        {
          departmentColors: parsed.departmentColors ?? {},
          principalCastColors: parsed.principalCastColors ?? {},
          supportingCastColor: parsed.supportingCastColor ?? DEFAULT_SUPPORTING_CAST_COLOR,
          crewFallbackColor: parsed.crewFallbackColor ?? DEFAULT_CREW_FALLBACK_COLOR,
        },
        people
      )
    }
  } catch {
    // Ignore storage/parse failures and fall back to defaults.
  }
  return getDefaultColorConfig(people)
}

/** Persists the config for a production. */
export function saveColorConfig(productionId: string, config: BookingColorConfig): void {
  try {
    localStorage.setItem(storageKey(productionId), JSON.stringify(config))
  } catch {
    // Ignore storage write failures.
  }
}
