import { describe, expect, it } from 'vitest'
import { projectScene } from '@/lib/maps/staticMapRenderer'
import { buildLocationScene, buildOverviewScene, viewForScene } from './movementMaps'
import { applyResolvedLocationCoordinates, buildMovementOrderLegSkeleton } from './movementLegs'
import type { MovementPin } from './pins'
import type { MovementOrderLocation } from './types'

// Any valid encoded polyline with two or more points.
const LINE = '_ibpIfdU_ibEiaE'

const location = (id: string, lat: number | null, lng: number | null): MovementOrderLocation => ({
  id,
  name: id,
  address: null,
  what3words: null,
  parkingInfo: null,
  lat,
  lng,
  scenes: [],
})

const pins: MovementPin[] = [
  { id: 'b', kind: 'unit_base', label: 'Base', notes: null, lat: 51.5002, lng: -0.1198 },
  { id: 'p', kind: 'parking', label: 'Bays', notes: null, lat: 51.505, lng: -0.115 },
]

function data(over = {}) {
  const locations = [location('a', 51.5, -0.12), location('b', 51.51, -0.11)]
  const legs = buildMovementOrderLegSkeleton(locations).map((leg) => ({
    ...leg,
    routeGeometry: LINE,
    fromCoords: { lat: 51.5, lng: -0.12 },
    toCoords: { lat: 51.51, lng: -0.11 },
  }))
  return { locations, movementLegs: legs, pins, unitBaseAddress: null as string | null, ...over }
}

describe('buildOverviewScene', () => {
  it('draws the routes, numbered stops and coded pins, and fits them all', () => {
    const scene = buildOverviewScene(data())!
    expect(scene.routes).toHaveLength(1)
    expect(scene.markers.map((m) => [m.label, m.style])).toEqual([
      ['1', 'location'],
      ['2', 'location'],
      ['B', 'unit_base'],
      ['P1', 'parking'],
    ])
    expect(scene.fitPoints.length).toBeGreaterThanOrEqual(scene.markers.length)
  })

  it('adds a base marker only when the journey starts at a base with no unit base pin', () => {
    const withBase = buildOverviewScene(data({ unitBaseAddress: 'Mill Lane', pins: [] }))!
    expect(withBase.markers.some((m) => m.style === 'base')).toBe(true)
    const withPin = buildOverviewScene(data({ unitBaseAddress: 'Mill Lane' }))!
    expect(withPin.markers.some((m) => m.style === 'base')).toBe(false)
  })

  it('is null with nothing to draw', () => {
    expect(buildOverviewScene({ locations: [], movementLegs: [], pins: [], unitBaseAddress: null })).toBeNull()
  })
})

describe('buildLocationScene', () => {
  it('centres a close-up on the location and zooms in', () => {
    const scene = buildLocationScene(data(), 0)!
    const view = viewForScene(scene, 800, 600)!
    expect(view.zoom).toBeGreaterThanOrEqual(14)
    expect(view.zoom).toBeLessThanOrEqual(17)
    expect(view.center.lat).toBeCloseTo(51.5, 2)
  })

  it('has no close-up for a location without coordinates', () => {
    const d = data({ locations: [location('a', null, null)] })
    expect(buildLocationScene(d, 0)).toBeNull()
    expect(buildLocationScene(d, 5)).toBeNull()
  })
})

describe('projectScene', () => {
  it('puts the view centre in the middle of the canvas', () => {
    const scene = buildLocationScene(data(), 0)!
    const view = { center: { lat: 51.5, lng: -0.12 }, zoom: 16 }
    const projected = projectScene(scene, view, 800, 600)
    const first = projected.markers.find((m) => m.label === '1')!
    expect(first.at.x).toBeCloseTo(400, 3)
    expect(first.at.y).toBeCloseTo(300, 3)
    // North is up, east is right.
    const second = projected.markers.find((m) => m.label === '2')!
    expect(second.at.y).toBeLessThan(300)
    expect(second.at.x).toBeGreaterThan(400)
  })
})

describe('applyResolvedLocationCoordinates', () => {
  it('fills locations from the legs, allowing for the base waypoint', () => {
    const locations = [location('a', null, null), location('b', null, null)]
    const base = location('unit-base', null, null)
    const legs = buildMovementOrderLegSkeleton([base, ...locations, base]).map((leg, i) => ({
      ...leg,
      fromCoords: { lat: 50 + i, lng: 0 },
      toCoords: { lat: 51 + i, lng: 0 },
    }))
    const out = applyResolvedLocationCoordinates(locations, legs, true)
    expect(out.map((l) => l.lat)).toEqual([51, 52])
  })

  it('keeps coordinates a location already has and tolerates missing legs', () => {
    const out = applyResolvedLocationCoordinates([location('a', 1, 2), location('b', null, null)], [], false)
    expect(out[0]).toMatchObject({ lat: 1, lng: 2 })
    expect(out[1]).toMatchObject({ lat: null, lng: null })
  })
})
