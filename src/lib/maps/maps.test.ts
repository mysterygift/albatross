import { describe, expect, it } from 'vitest'
import { boundsOf, centerOf, distanceMeters, routesToGeoJson } from './mapMath'
import { DEFAULT_MAP_STYLE_URL, MAP_ATTRIBUTION } from './mapStyle'
import { decodePolyline } from './polyline'

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
  it('bounds, centres and measures points', () => {
    const bounds = boundsOf([
      { lat: 51.5, lng: -0.12 },
      { lat: 51.51, lng: -0.1 },
    ])!
    expect(bounds).toEqual({ south: 51.5, north: 51.51, west: -0.12, east: -0.1 })
    expect(centerOf({ south: 0, north: 2, west: 10, east: 14 })).toEqual({ lat: 1, lng: 12 })
    expect(boundsOf([])).toBeNull()
    expect(distanceMeters({ lat: 51.5, lng: 0 }, { lat: 51.5, lng: 0 })).toBe(0)
    expect(distanceMeters({ lat: 51.5, lng: 0 }, { lat: 51.51, lng: 0 })).toBeCloseTo(1112, -1)
  })

  it('turns routes into GeoJSON with [lng, lat] order', () => {
    const geo = routesToGeoJson([[{ lat: 51.5, lng: -0.12 }, { lat: 51.51, lng: -0.11 }]])
    expect(geo.features).toHaveLength(1)
    expect(geo.features[0]!.geometry.coordinates).toEqual([
      [-0.12, 51.5],
      [-0.11, 51.51],
    ])
    expect(routesToGeoJson([]).features).toEqual([])
  })
})

describe('map style', () => {
  it('defaults to a keyless OpenFreeMap style with attribution', () => {
    expect(DEFAULT_MAP_STYLE_URL).toBe('https://tiles.openfreemap.org/styles/liberty')
    expect(DEFAULT_MAP_STYLE_URL).not.toContain('key')
    expect(MAP_ATTRIBUTION).toContain('OpenFreeMap')
    expect(MAP_ATTRIBUTION).toContain('OpenStreetMap')
  })
})
