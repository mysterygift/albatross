import type { LatLng } from '@/lib/logistics/openRouteService'

export const MOVEMENT_PIN_KINDS = ['unit_base', 'parking', 'other'] as const
export type MovementPinKind = (typeof MOVEMENT_PIN_KINDS)[number]

export const MOVEMENT_PIN_KIND_LABELS: Record<MovementPinKind, string> = {
  unit_base: 'Unit base',
  parking: 'Parking',
  other: 'Other',
}

/** A marker the production places on the movement order maps. Belongs to a shoot day. */
export interface MovementPin {
  id: string
  kind: MovementPinKind
  label: string
  notes: string | null
  lat: number
  lng: number
}

function isKind(value: unknown): value is MovementPinKind {
  return typeof value === 'string' && (MOVEMENT_PIN_KINDS as readonly string[]).includes(value)
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** Reads `shoot_days.movement_pins_json`; ignores malformed entries rather than failing. */
export function parseMovementPins(raw: string | null | undefined): MovementPin[] {
  if (!raw?.trim()) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const pins: MovementPin[] = []
    const seen = new Set<string>()
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const o = entry as Record<string, unknown>
      const lat = Number(o.lat)
      const lng = Number(o.lng)
      const id = cleanText(o.id)
      if (!id || seen.has(id) || !isKind(o.kind)) continue
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
      seen.add(id)
      pins.push({ id, kind: o.kind, label: cleanText(o.label) ?? '', notes: cleanText(o.notes), lat, lng })
    }
    return pins
  } catch {
    return []
  }
}

/** Null when there are no pins, so an empty list clears the column. */
export function serializeMovementPins(pins: MovementPin[]): string | null {
  if (pins.length === 0) return null
  return JSON.stringify(
    pins.map((pin) => ({
      id: pin.id,
      kind: pin.kind,
      label: pin.label.trim(),
      notes: pin.notes?.trim() || null,
      lat: pin.lat,
      lng: pin.lng,
    }))
  )
}

/**
 * Short code printed on the map marker and in the pin legend: `B` for the unit base (`B1`, `B2`
 * if several), `P1`, `P2`... for parking, `X1`... for other pins.
 */
export function getMovementPinCodes(pins: MovementPin[]): string[] {
  const counts: Record<MovementPinKind, number> = { unit_base: 0, parking: 0, other: 0 }
  const totals: Record<MovementPinKind, number> = { unit_base: 0, parking: 0, other: 0 }
  for (const pin of pins) totals[pin.kind] += 1
  const prefix: Record<MovementPinKind, string> = { unit_base: 'B', parking: 'P', other: 'X' }
  return pins.map((pin) => {
    counts[pin.kind] += 1
    if (pin.kind === 'unit_base' && totals.unit_base === 1) return 'B'
    return `${prefix[pin.kind]}${counts[pin.kind]}`
  })
}

export function pinPosition(pin: MovementPin): LatLng {
  return { lat: pin.lat, lng: pin.lng }
}

export function newMovementPinId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `pin-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}
