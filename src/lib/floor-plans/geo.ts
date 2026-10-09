/**
 * Finding where a floor plan is: coordinates for a location's address, and its time zone.
 *
 * Coordinates come from OpenRouteService when a key is set (Settings → Integrations), otherwise
 * from OpenStreetMap's free Nominatim service, or from coordinates typed by hand. The time zone
 * comes from Open-Meteo (free, no key). Both are asked once; the plan keeps the answer.
 */
import { recordApiCall } from '@/lib/dev/apiCallTracker'
import { geocodeLocationWithOpenRouteService, getOpenRouteServiceApiKey } from '@/lib/logistics/openRouteService'
import type { FloorPlanGeo } from './model'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

/** `51.5072, -0.1276` (or with a space instead of the comma) → coordinates. */
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text)
  if (!match) return null
  const lat = Number(match[1])
  const lon = Number(match[2])
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

async function geocodeWithNominatim(query: string, fetchImpl: typeof fetch): Promise<{ lat: number; lon: number } | null> {
  recordApiCall('nominatim_geocode')
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' })
  const res = await fetchImpl(`${NOMINATIM_URL}?${params}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>
  const lat = Number(rows[0]?.lat)
  const lon = Number(rows[0]?.lon)
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

/** Coordinates for an address: OpenRouteService with a key, else Nominatim. Null when not found. */
export async function geocodeAddress(
  query: string,
  deps: { fetchImpl?: typeof fetch; orsKey?: () => Promise<string> } = {}
): Promise<{ lat: number; lon: number } | null> {
  const q = query.trim()
  if (!q) return null
  const typed = parseCoordinates(q)
  if (typed) return typed
  const key = await (deps.orsKey ?? getOpenRouteServiceApiKey)().catch(() => '')
  if (key) {
    const hit = await geocodeLocationWithOpenRouteService(q, key).catch(() => null)
    if (hit) return { lat: hit.lat, lon: hit.lng }
  }
  try {
    return await geocodeWithNominatim(q, deps.fetchImpl ?? fetch)
  } catch {
    return null
  }
}

/** The IANA time zone at a place (e.g. `Europe/London`), from Open-Meteo; null when offline. */
export async function fetchTimeZone(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    recordApiCall('open_meteo_forecast')
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      timezone: 'auto',
      daily: 'sunrise',
      forecast_days: '1',
    })
    const res = await fetchImpl(`${OPEN_METEO_URL}?${params}`)
    if (!res.ok) return null
    const data = (await res.json()) as { timezone?: string }
    return typeof data.timezone === 'string' && data.timezone ? data.timezone : null
  } catch {
    return null
  }
}

/** Coordinates and time zone for an address or typed coordinates; null when it cannot be found. */
export async function resolvePlanGeo(
  query: string,
  deps: { fetchImpl?: typeof fetch; orsKey?: () => Promise<string> } = {}
): Promise<FloorPlanGeo | null> {
  const point = await geocodeAddress(query, deps)
  if (!point) return null
  return { ...point, timezone: await fetchTimeZone(point.lat, point.lon, deps.fetchImpl ?? fetch) }
}
