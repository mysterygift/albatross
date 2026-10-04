import type { MovementOrderMovementLeg } from '@/lib/movement-orders/types'

/** Hand-entered values for one leg. Times are never computed from the crew call. */
export interface MovementOrderLegInput {
  departTime: string | null
  arriveTime: string | null
}

/**
 * Hand-entered movement order values for one shoot day + unit. Stored as JSON in
 * `shoot_day_units.movement_order_json`.
 */
export interface MovementOrderInputs {
  revisionLabel: string | null
  unitBaseTime: string | null
  /** Keyed by `getMovementLegKeys`. */
  legs: Record<string, MovementOrderLegInput>
}

export const EMPTY_MOVEMENT_ORDER_INPUTS: MovementOrderInputs = {
  revisionLabel: null,
  unitBaseTime: null,
  legs: {},
}

/** Normalise `H:MM`, `HH:MM`, `HHMM` or `HH.MM` to `HH:MM` (24h); anything else is null. */
export function normalizeMovementTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^\s*(\d{1,2})[:.]?(\d{2})\s*$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function parseMovementOrderInputs(raw: string | null | undefined): MovementOrderInputs {
  if (!raw?.trim()) return { ...EMPTY_MOVEMENT_ORDER_INPUTS, legs: {} }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const legs: Record<string, MovementOrderLegInput> = {}
    const rawLegs = parsed.legs
    if (rawLegs && typeof rawLegs === 'object') {
      for (const [key, value] of Object.entries(rawLegs as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue
        const entry = value as Record<string, unknown>
        const departTime = normalizeMovementTime(entry.departTime)
        const arriveTime = normalizeMovementTime(entry.arriveTime)
        if (departTime || arriveTime) legs[key] = { departTime, arriveTime }
      }
    }
    return {
      revisionLabel: cleanLabel(parsed.revisionLabel),
      unitBaseTime: normalizeMovementTime(parsed.unitBaseTime),
      legs,
    }
  } catch {
    return { ...EMPTY_MOVEMENT_ORDER_INPUTS, legs: {} }
  }
}

/** Returns null when nothing is entered, so an empty order clears the column. */
export function serializeMovementOrderInputs(inputs: MovementOrderInputs): string | null {
  const legs: Record<string, MovementOrderLegInput> = {}
  for (const [key, leg] of Object.entries(inputs.legs)) {
    const departTime = normalizeMovementTime(leg.departTime)
    const arriveTime = normalizeMovementTime(leg.arriveTime)
    if (departTime || arriveTime) legs[key] = { departTime, arriveTime }
  }
  const revisionLabel = cleanLabel(inputs.revisionLabel)
  const unitBaseTime = normalizeMovementTime(inputs.unitBaseTime)
  if (!revisionLabel && !unitBaseTime && Object.keys(legs).length === 0) return null
  return JSON.stringify({ revisionLabel, unitBaseTime, legs })
}

/**
 * One key per leg between consecutive locations. A repeated pair (A>B twice in a day) gets a
 * `#n` suffix so each occurrence keeps its own times.
 */
export function getMovementLegKeys(locations: Array<{ id: string }>): string[] {
  const seen = new Map<string, number>()
  const keys: string[] = []
  for (let i = 0; i < locations.length - 1; i += 1) {
    const base = `${locations[i]!.id}>${locations[i + 1]!.id}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    keys.push(count === 0 ? base : `${base}#${count}`)
  }
  return keys
}

export function applyMovementOrderLegInputs(
  legs: MovementOrderMovementLeg[],
  inputs: MovementOrderInputs
): MovementOrderMovementLeg[] {
  return legs.map((leg) => {
    const input = inputs.legs[leg.key]
    return {
      ...leg,
      departTime: input?.departTime ?? null,
      arriveTime: input?.arriveTime ?? null,
    }
  })
}

export function formatDriveDuration(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

export function formatDriveDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export interface MovementDrivingTotals {
  minutes: number | null
  meters: number | null
  /** True when some legs have no driving data, so the totals undercount. */
  incomplete: boolean
}

/** Sums the legs' driving data. Totals are null when no leg has any. */
export function summariseMovementDriving(legs: MovementOrderMovementLeg[]): MovementDrivingTotals {
  let minutes = 0
  let meters = 0
  let hasMinutes = false
  let hasMeters = false
  let incomplete = false
  for (const leg of legs) {
    if (leg.drivingTimeMinutes != null) {
      minutes += leg.drivingTimeMinutes
      hasMinutes = true
    } else {
      incomplete = true
    }
    if (leg.drivingDistanceMeters != null) {
      meters += leg.drivingDistanceMeters
      hasMeters = true
    }
  }
  return {
    minutes: hasMinutes ? minutes : null,
    meters: hasMeters ? meters : null,
    incomplete: incomplete && legs.length > 0,
  }
}
