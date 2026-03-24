import { fingerprintApiKeyMaterial } from '@/lib/api/cacheKey'

type LatLngInput = { lat: number; lng: number }

export function roundCoord(value: number, decimals = 5): number {
  const f = Number(value)
  if (!Number.isFinite(f)) return f
  const p = 10 ** decimals
  return Math.round(f * p) / p
}

export function normalizeOrsGeocodeKeyParts(query: string, resolvedApiKey: string) {
  return {
    query: query.trim().toLowerCase(),
    apiKeyFingerprint: fingerprintApiKeyMaterial(resolvedApiKey),
  }
}

export function normalizeOrsDirectionsKeyParts(
  start: LatLngInput,
  end: LatLngInput,
  profile: 'driving-car' | 'foot-walking',
  resolvedApiKey: string
) {
  return {
    startLat: roundCoord(Number(start.lat)),
    startLng: roundCoord(Number(start.lng)),
    endLat: roundCoord(Number(end.lat)),
    endLng: roundCoord(Number(end.lng)),
    profile,
    apiKeyFingerprint: fingerprintApiKeyMaterial(resolvedApiKey),
  }
}
