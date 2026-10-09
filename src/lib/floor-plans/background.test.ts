import { describe, expect, it } from 'vitest'
import { fitBackground, groundResolution, mapBackground, mapZoomFor } from '@/lib/floor-plans/background'

describe('floor plan backgrounds', () => {
  it('fits a picture whole and centred, or fills the plan with it', () => {
    // A square picture on the 1200 x 800 plan.
    expect(fitBackground(1000, 1000, 'fit')).toEqual({ x: 200, y: 0, width: 800, height: 800 })
    expect(fitBackground(1000, 1000, 'fill')).toEqual({ x: 0, y: -200, width: 1200, height: 1200 })
  })

  it('picks the tile zoom with enough detail and how far to stretch it', () => {
    // 200 m across 2400 px at London's latitude.
    const { zoom, stretch } = mapZoomFor(51.5, 200, 2400)
    expect(zoom).toBe(19)
    expect(groundResolution(51.5, zoom) / stretch).toBeCloseTo(200 / 2400, 6)
    // A wide area needs less detail.
    expect(mapZoomFor(51.5, 5000, 2400).zoom).toBeLessThan(19)
  })

  it('places a map over the whole plan and sets the scale from it', () => {
    const { background, unitsPerMetre } = mapBackground(51.5, -0.12, 200)
    expect(background).toMatchObject({ source: 'map', x: 0, y: 0, width: 1200, height: 800, map: { lat: 51.5, lon: -0.12, metresAcross: 200 } })
    expect(unitsPerMetre).toBe(6)
  })
})
