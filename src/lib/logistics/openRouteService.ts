type LatLng = { lat: number; lng: number }
import { getSetting } from '@/lib/db/repositories/settings'

const OPENROUTESERVICE_API_KEY_SETTING = 'openrouteservice_api_key'
const PROFILE_DRIVING = 'driving-car'
const PROFILE_WALKING = 'foot-walking'

export async function getOpenRouteServiceApiKey(): Promise<string> {
  return (await getSetting(OPENROUTESERVICE_API_KEY_SETTING))?.trim() ?? ''
}

async function resolveOrsApiKey(orsApiKey?: string | null): Promise<string> {
  if (typeof orsApiKey === 'string') return orsApiKey.trim()
  return getOpenRouteServiceApiKey()
}

/**
 * Local ORS integration entrypoint. Never calls ORS directly from browser code.
 * Returns rounded driving minutes or null on any failure/unavailable route.
 */
export async function getDrivingTravelTimeMinutes(
  start: LatLng,
  end: LatLng,
  orsApiKey?: string | null
): Promise<number | null> {
  const summary = await getDrivingRouteSummary(start, end, orsApiKey)
  return summary?.durationMinutes ?? null
}

export async function geocodeLocationWithOpenRouteService(
  query: string,
  orsApiKey?: string | null
): Promise<LatLng | null> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const resolvedOrsApiKey = await resolveOrsApiKey(orsApiKey)
    const coordinates = await invoke<LatLng | null>('geocode_location_to_lat_lng', {
      query: trimmedQuery,
      orsApiKey: resolvedOrsApiKey,
    })
    return coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng)
      ? coordinates
      : null
  } catch {
    return null
  }
}

export type RouteSummary = {
  durationMinutes: number | null
  distanceMeters: number | null
  distanceText: string | null
  writtenDirections: string | null
}

type RouteSummaryOut = {
  duration_minutes: number | null
  distance_meters: number | null
  instructions: string[]
}

function toDistanceText(distanceMeters: number | null): string | null {
  if (distanceMeters == null || !Number.isFinite(distanceMeters) || distanceMeters < 0) return null
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`
  return `${(distanceMeters / 1000).toFixed(1)} km`
}

function toWrittenDirections(instructions: string[]): string | null {
  const cleaned = instructions
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  if (cleaned.length === 0) return null
  return cleaned.join(' -> ')
}

async function getRouteSummary(
  start: LatLng,
  end: LatLng,
  profile: typeof PROFILE_DRIVING | typeof PROFILE_WALKING,
  orsApiKey?: string | null
): Promise<RouteSummary | null> {
  const startLat = Number(start?.lat)
  const startLng = Number(start?.lng)
  const endLat = Number(end?.lat)
  const endLng = Number(end?.lng)

  if (
    !Number.isFinite(startLat) ||
    !Number.isFinite(startLng) ||
    !Number.isFinite(endLat) ||
    !Number.isFinite(endLng)
  ) {
    return null
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const resolvedOrsApiKey = await resolveOrsApiKey(orsApiKey)
    const summary = await invoke<RouteSummaryOut | null>('get_route_summary', {
      startLat,
      startLng,
      endLat,
      endLng,
      profile,
      orsApiKey: resolvedOrsApiKey,
    })
    if (!summary) return null
    const durationMinutes =
      typeof summary.duration_minutes === 'number' && Number.isFinite(summary.duration_minutes)
        ? Math.max(0, Math.round(summary.duration_minutes))
        : null
    const distanceMeters =
      typeof summary.distance_meters === 'number' && Number.isFinite(summary.distance_meters)
        ? Math.max(0, Math.round(summary.distance_meters))
        : null
    const instructions = Array.isArray(summary.instructions)
      ? summary.instructions.filter((entry): entry is string => typeof entry === 'string')
      : []
    return {
      durationMinutes,
      distanceMeters,
      distanceText: toDistanceText(distanceMeters),
      writtenDirections: toWrittenDirections(instructions),
    }
  } catch {
    return null
  }
}

export async function getDrivingRouteSummary(
  start: LatLng,
  end: LatLng,
  orsApiKey?: string | null
): Promise<RouteSummary | null> {
  return getRouteSummary(start, end, PROFILE_DRIVING, orsApiKey)
}

export async function getWalkingRouteSummary(
  start: LatLng,
  end: LatLng,
  orsApiKey?: string | null
): Promise<RouteSummary | null> {
  return getRouteSummary(start, end, PROFILE_WALKING, orsApiKey)
}

export type { LatLng }
