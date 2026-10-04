import { describe, expect, it } from 'vitest'
import {
  TILE_SIZE,
  boundsOf,
  centerOf,
  distanceMeters,
  fitZoom,
  planTiles,
  projectToWorldPixels,
} from './mapMath'
import { decodePolyline } from './polyline'
import {
  DEFAULT_MAP_TILE_URL_TEMPLATE,
  isMapTileConfigIncomplete,
  leafletTileUrl,
  tileUrl,
} from './tileConfig'

describe('decodePolyline', () => {
  it('decodes the reference example', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(points).toHaveLength(3)
    expect(points[0]).toEqual({ lat: 38.5, lng: -120.2 })
    expect(points[1]!.lat).toBeCloseTo(40.7, 5)
    expect(points[1]!.lng).toBeCloseTo(-120.95, 5)
    expect(points[2]!.lat).toBeCloseTo(43.252, 5)
    expect(points[2]!.lng).toBeCloseTo(-126.453, 5)
  })

  it('returns nothing for empty or truncated input', () => {
    expect(decodePolyline(null)).toEqual([])
    expect(decodePolyline('')).toEqual([])
    expect(decodePolyline('_p~iF')).toEqual([])
  })
})

describe('map maths', () => {
  it('puts the world centre at the middle of the world at zoom 0', () => {
    const p = projectToWorldPixels({ lat: 0, lng: 0 }, 0)
    expect(p.x).toBeCloseTo(TILE_SIZE / 2, 5)
    expect(p.y).toBeCloseTo(TILE_SIZE / 2, 5)
  })

  it('fits a tight pair of points at a high zoom and a wide pair at a low one', () => {
    const tight = boundsOf([
      { lat: 51.5, lng: -0.12 },
      { lat: 51.5005, lng: -0.1195 },
    ])!
    const wide = boundsOf([
      { lat: 51.5, lng: -0.12 },
      { lat: 53.5, lng: -2.2 },
    ])!
    const zTight = fitZoom({ bounds: tight, width: 800, height: 600, maxZoom: 17 })
    const zWide = fitZoom({ bounds: wide, width: 800, height: 600, maxZoom: 17 })
    expect(zTight).toBe(17)
    expect(zWide).toBeLessThan(10)
    expect(zWide).toBeGreaterThanOrEqual(2)
  })

  it('keeps the bounds inside the viewport at the chosen zoom', () => {
    const bounds = boundsOf([
      { lat: 51.49, lng: -0.15 },
      { lat: 51.53, lng: -0.08 },
    ])!
    const zoom = fitZoom({ bounds, width: 1600, height: 800, padding: 56 })
    const nw = projectToWorldPixels({ lat: bounds.north, lng: bounds.west }, zoom)
    const se = projectToWorldPixels({ lat: bounds.south, lng: bounds.east }, zoom)
    expect(se.x - nw.x).toBeLessThanOrEqual(1600 - 112)
    expect(se.y - nw.y).toBeLessThanOrEqual(800 - 112)
  })

  it('plans the tiles that cover the viewport, with pixel offsets', () => {
    const { tiles } = planTiles({ center: { lat: 51.5, lng: -0.12 }, zoom: 15, width: 800, height: 600 })
    expect(tiles.length).toBeGreaterThanOrEqual(12)
    for (const tile of tiles) {
      expect(tile.px).toBeGreaterThan(-TILE_SIZE)
      expect(tile.px).toBeLessThan(800)
      expect(tile.py).toBeGreaterThan(-TILE_SIZE)
      expect(tile.py).toBeLessThan(600)
    }
  })

  it('wraps tile x across the antimeridian and skips tiles beyond the poles', () => {
    const { tiles } = planTiles({ center: { lat: 0, lng: 179.9 }, zoom: 3, width: 800, height: 400 })
    expect(tiles.every((t) => t.x >= 0 && t.x < 8)).toBe(true)
    const polar = planTiles({ center: { lat: 85, lng: 0 }, zoom: 3, width: 800, height: 800 })
    expect(polar.tiles.every((t) => t.y >= 0)).toBe(true)
  })

  it('measures distance and centres bounds', () => {
    expect(distanceMeters({ lat: 51.5, lng: -0.12 }, { lat: 51.5, lng: -0.12 })).toBe(0)
    expect(distanceMeters({ lat: 51.5, lng: 0 }, { lat: 51.51, lng: 0 })).toBeCloseTo(1112, -1)
    expect(centerOf({ south: 0, north: 2, west: 10, east: 14 })).toEqual({ lat: 1, lng: 12 })
    expect(boundsOf([])).toBeNull()
  })
})

describe('tile config', () => {
  const config = { urlTemplate: DEFAULT_MAP_TILE_URL_TEMPLATE, apiKey: 'a b' }

  it('fills the key and tile coordinates', () => {
    expect(leafletTileUrl(config)).toBe(
      'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=a%20b'
    )
    expect(tileUrl(config, 15, 16370, 10895)).toBe(
      'https://api.maptiler.com/maps/streets-v2/15/16370/10895.png?key=a%20b'
    )
  })

  it('reports a missing key only when the template needs one', () => {
    expect(isMapTileConfigIncomplete({ urlTemplate: DEFAULT_MAP_TILE_URL_TEMPLATE, apiKey: '' })).toBe(true)
    expect(isMapTileConfigIncomplete(config)).toBe(false)
    expect(isMapTileConfigIncomplete({ urlTemplate: 'http://tiles.local/{z}/{x}/{y}.png', apiKey: '' })).toBe(false)
  })
})
