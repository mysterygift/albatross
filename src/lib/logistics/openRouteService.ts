type LatLng = { lat: number; lng: number }
import { getSetting } from '@/lib/db/repositories/settings'

const OPENROUTESERVICE_API_KEY_SETTING = 'openrouteservice_api_key'

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
    const minutes = await invoke<number | null>('get_driving_travel_time_minutes', {
      startLat,
      startLng,
      endLat,
      endLng,
      orsApiKey: resolvedOrsApiKey,
    })
    return typeof minutes === 'number' && Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : null
  } catch {
    // Non-Tauri environment or backend failure: keep caller flow resilient.
    return null
  }
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

export type { LatLng }
