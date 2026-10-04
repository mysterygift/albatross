import type { LatLngLike } from '@/lib/maps/polyline'

/** Slippy-map (Web Mercator) maths for 256px tiles, shared by the static map renderer. */
export const TILE_SIZE = 256
export const MAX_ZOOM = 19

export type Bounds = { south: number; west: number; north: number; east: number }
export type PixelPoint = { x: number; y: number }

const MAX_LAT = 85.0511287798

function clampLat(lat: number): number {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
}

/** World pixel position of a coordinate at `zoom` (origin top-left of the world). */
export function projectToWorldPixels(point: LatLngLike, zoom: number): PixelPoint {
  const scale = TILE_SIZE * 2 ** zoom
  const lat = (clampLat(point.lat) * Math.PI) / 180
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * scale,
  }
}

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

/**
 * Highest zoom at which `bounds` (plus `padding` px each side) fits in a `width` x `height`
 * viewport, clamped to [minZoom, maxZoom].
 */
export function fitZoom(args: {
  bounds: Bounds
  width: number
  height: number
  padding?: number
  minZoom?: number
  maxZoom?: number
}): number {
  const { bounds, width, height } = args
  const padding = args.padding ?? 24
  const minZoom = args.minZoom ?? 2
  const maxZoom = args.maxZoom ?? MAX_ZOOM
  const availW = Math.max(1, width - padding * 2)
  const availH = Math.max(1, height - padding * 2)
  for (let zoom = maxZoom; zoom > minZoom; zoom -= 1) {
    const nw = projectToWorldPixels({ lat: bounds.north, lng: bounds.west }, zoom)
    const se = projectToWorldPixels({ lat: bounds.south, lng: bounds.east }, zoom)
    if (Math.abs(se.x - nw.x) <= availW && Math.abs(se.y - nw.y) <= availH) return zoom
  }
  return minZoom
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

export type TileRef = { z: number; x: number; y: number; px: number; py: number }

/**
 * Tiles covering a `width` x `height` viewport centred on `center` at `zoom`, with the pixel
 * position at which each tile should be drawn. Tile x wraps around the antimeridian; tiles
 * outside the world's vertical extent are skipped.
 */
export function planTiles(args: {
  center: LatLngLike
  zoom: number
  width: number
  height: number
}): { tiles: TileRef[]; origin: PixelPoint } {
  const { center, zoom, width, height } = args
  const c = projectToWorldPixels(center, zoom)
  const origin = { x: c.x - width / 2, y: c.y - height / 2 }
  const count = 2 ** zoom
  const x0 = Math.floor(origin.x / TILE_SIZE)
  const x1 = Math.floor((origin.x + width) / TILE_SIZE)
  const y0 = Math.floor(origin.y / TILE_SIZE)
  const y1 = Math.floor((origin.y + height) / TILE_SIZE)
  const tiles: TileRef[] = []
  for (let ty = y0; ty <= y1; ty += 1) {
    if (ty < 0 || ty >= count) continue
    for (let tx = x0; tx <= x1; tx += 1) {
      tiles.push({
        z: zoom,
        x: ((tx % count) + count) % count,
        y: ty,
        px: tx * TILE_SIZE - origin.x,
        py: ty * TILE_SIZE - origin.y,
      })
    }
  }
  return { tiles, origin }
}
