import { recordApiCall } from '@/lib/dev/apiCallTracker'
import { buildApiCacheKey } from '@/lib/api/cacheKey'
import { isCacheExpired } from '@/lib/api/cacheTTL'
import {
  getApiCacheByKey,
  upsertApiCache,
  type ApiCacheEntry,
  type ApiCacheUpsert,
} from '@/lib/db/repositories/apiCache'
import {
  normalizeOrsDirectionsKeyParts,
  normalizeOrsGeocodeKeyParts,
} from '@/lib/logistics/normalizeOpenRouteServiceParams'
import { getSetting } from '@/lib/db/repositories/settings'

type LatLng = { lat: number; lng: number }
const OPENROUTESERVICE_API_KEY_SETTING = 'openrouteservice_api_key'
const PROFILE_DRIVING = 'driving-car'
const PROFILE_WALKING = 'foot-walking'

export type OrsCacheOptions = { forceRefresh?: boolean }

export async function getOpenRouteServiceApiKey(): Promise<string> {
  return (await getSetting(OPENROUTESERVICE_API_KEY_SETTING))?.trim() ?? ''
}

async function resolveOrsApiKey(orsApiKey?: string | null): Promise<string> {
  if (typeof orsApiKey === 'string') return orsApiKey.trim()
  return getOpenRouteServiceApiKey()
}

async function readApiCache(key: string): Promise<ApiCacheEntry | null> {
  try {
    return await getApiCacheByKey(key)
  } catch {
    return null
  }
}

async function writeApiCache(entry: ApiCacheUpsert): Promise<void> {
  try {
    await upsertApiCache(entry)
  } catch {
    // Cache must not break ORS usage if the DB write fails.
  }
}

function parseCachedLatLng(raw: unknown): LatLng | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const lat = Number(o.lat)
  const lng = Number(o.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

export async function getDrivingTravelTimeMinutes(
  start: LatLng,
  end: LatLng,
  orsApiKey?: string | null,
  cacheOpts?: OrsCacheOptions
): Promise<number | null> {
  const summary = await getDrivingRouteSummary(start, end, orsApiKey, cacheOpts)
  return summary?.durationMinutes ?? null
}

export async function geocodeLocationWithOpenRouteService(
  query: string,
  orsApiKey?: string | null,
  cacheOpts?: OrsCacheOptions
): Promise<LatLng | null> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return null

  const resolvedOrsApiKey = await resolveOrsApiKey(orsApiKey)
  const normalized = normalizeOrsGeocodeKeyParts(trimmedQuery, resolvedOrsApiKey)
  const key = buildApiCacheKey({
    provider: 'openrouteservice',
    endpoint: 'geocode',
    ...normalized,
  })
  const forceRefresh = cacheOpts?.forceRefresh === true

  let cachedRow: ApiCacheEntry | null = null
  if (!forceRefresh) {
    cachedRow = await readApiCache(key)
    if (
      cachedRow &&
      !isCacheExpired({ endpoint: 'geocode', updatedAt: cachedRow.updatedAt })
    ) {
      const parsed = parseCachedLatLng(cachedRow.data)
      if (parsed) return parsed
    }
  }

  let fresh: LatLng | null = null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    recordApiCall('openrouteservice')
    const coordinates = await invoke<LatLng | null>('geocode_location_to_lat_lng', {
      query: trimmedQuery,
      orsApiKey: resolvedOrsApiKey,
    })
    fresh =
      coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lng)
        ? coordinates
        : null
  } catch {
    fresh = null
  }

  if (fresh !== null) {
    const now = Date.now()
    await writeApiCache({
      key,
      provider: 'openrouteservice',
      endpoint: 'geocode',
      requestHash: key,
      responseJson: JSON.stringify(fresh),
      createdAt: now,
      updatedAt: now,
    })
    return fresh
  }

  if (forceRefresh && !cachedRow) {
    cachedRow = await readApiCache(key)
  }
  if (cachedRow) {
    const parsed = parseCachedLatLng(cachedRow.data)
    if (parsed) return parsed
  }
  return null
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

function routeSummaryFromOut(summary: RouteSummaryOut): RouteSummary {
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
}

function parseCachedRouteSummaryOut(raw: unknown): RouteSummaryOut | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!('duration_minutes' in o || 'distance_meters' in o || 'instructions' in o)) return null
  const duration_minutes =
    typeof o.duration_minutes === 'number' && Number.isFinite(o.duration_minutes)
      ? o.duration_minutes
      : null
  const distance_meters =
    typeof o.distance_meters === 'number' && Number.isFinite(o.distance_meters)
      ? o.distance_meters
      : null
  const instructions = Array.isArray(o.instructions)
    ? o.instructions.filter((entry): entry is string => typeof entry === 'string')
    : []
  return { duration_minutes, distance_meters, instructions }
}

async function invokeRouteSummary(
  start: LatLng,
  end: LatLng,
  profile: typeof PROFILE_DRIVING | typeof PROFILE_WALKING,
  orsApiKey: string
): Promise<RouteSummaryOut | null> {
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
    recordApiCall('openrouteservice')
    return await invoke<RouteSummaryOut | null>('get_route_summary', {
      startLat,
      startLng,
      endLat,
      endLng,
      profile,
      orsApiKey,
    })
  } catch {
    return null
  }
}

async function getRouteSummaryCached(
  start: LatLng,
  end: LatLng,
  profile: typeof PROFILE_DRIVING | typeof PROFILE_WALKING,
  orsApiKey?: string | null,
  cacheOpts?: OrsCacheOptions
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

  const resolvedOrsApiKey = await resolveOrsApiKey(orsApiKey)
  const normalized = normalizeOrsDirectionsKeyParts(
    { lat: startLat, lng: startLng },
    { lat: endLat, lng: endLng },
    profile,
    resolvedOrsApiKey
  )
  const key = buildApiCacheKey({
    provider: 'openrouteservice',
    endpoint: 'directions',
    ...normalized,
  })
  const forceRefresh = cacheOpts?.forceRefresh === true

  let cachedRow: ApiCacheEntry | null = null
  if (!forceRefresh) {
    cachedRow = await readApiCache(key)
    if (
      cachedRow &&
      !isCacheExpired({ endpoint: 'directions', updatedAt: cachedRow.updatedAt })
    ) {
      const out = parseCachedRouteSummaryOut(cachedRow.data)
      if (out) return routeSummaryFromOut(out)
    }
  }

  const fresh = await invokeRouteSummary(
    { lat: startLat, lng: startLng },
    { lat: endLat, lng: endLng },
    profile,
    resolvedOrsApiKey
  )

  if (fresh) {
    const now = Date.now()
    await writeApiCache({
      key,
      provider: 'openrouteservice',
      endpoint: 'directions',
      requestHash: key,
      responseJson: JSON.stringify(fresh),
      createdAt: now,
      updatedAt: now,
    })
    return routeSummaryFromOut(fresh)
  }

  if (forceRefresh && !cachedRow) {
    cachedRow = await readApiCache(key)
  }
  if (cachedRow) {
    const out = parseCachedRouteSummaryOut(cachedRow.data)
    if (out) return routeSummaryFromOut(out)
  }
  return null
}

export async function getDrivingRouteSummary(
  start: LatLng,
  end: LatLng,
  orsApiKey?: string | null,
  cacheOpts?: OrsCacheOptions
): Promise<RouteSummary | null> {
  return getRouteSummaryCached(start, end, PROFILE_DRIVING, orsApiKey, cacheOpts)
}

export async function getWalkingRouteSummary(
  start: LatLng,
  end: LatLng,
  orsApiKey?: string | null,
  cacheOpts?: OrsCacheOptions
): Promise<RouteSummary | null> {
  return getRouteSummaryCached(start, end, PROFILE_WALKING, orsApiKey, cacheOpts)
}

export type { LatLng }
