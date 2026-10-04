import type { LatLngLike } from '@/lib/maps/polyline'

export type Bounds = { south: number; west: number; north: number; east: number }

export function boundsOf(points: LatLngLike[]): Bounds | null {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (valid.length === 0) return null
  return {
    south: Math.min(...valid.map((p) => p.lat)),
    north: Math.max(...valid.map((p) => p.lat)),
    west: Math.min(...valid.map((p) => p.lng)),
    east: Math.max(...valid.map((p) => p.lng)),
  }
}

export function centerOf(bounds: Bounds): LatLngLike {
  return { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 }
}

/** Approximate ground distance in metres (haversine). */
export function distanceMeters(a: LatLngLike, b: LatLngLike): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** `{ type: 'FeatureCollection' }` of one LineString per route, for a MapLibre GeoJSON source. */
export function routesToGeoJson(routes: LatLngLike[][]): {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: Record<string, never>
    geometry: { type: 'LineString'; coordinates: Array<[number, number]> }
  }>
} {
  return {
    type: 'FeatureCollection',
    features: routes.map((line) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: line.map((p) => [p.lng, p.lat] as [number, number]) },
    })),
  }
}
