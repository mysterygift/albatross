import { describe, expect, it, vi } from 'vitest'
import { formatClock, solarPosition, sunDay, zonedTime } from '@/lib/floor-plans/sun'
import { fetchTimeZone, geocodeAddress, parseCoordinates } from '@/lib/floor-plans/geo'

vi.mock('@/lib/logistics/openRouteService', () => ({
  geocodeLocationWithOpenRouteService: vi.fn(async () => ({ lat: 1, lng: 2 })),
  getOpenRouteServiceApiKey: vi.fn(async () => ''),
}))

const near = (value: number | null, expected: number, tolerance: number) => {
  expect(value).not.toBeNull()
  expect(Math.abs(value! - expected)).toBeLessThanOrEqual(tolerance)
}

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h! * 60 + m!
}

describe('sun', () => {
  it('converts wall-clock time in a zone, across daylight saving', () => {
    expect(zonedTime('2026-06-21', clock('12:00'), 'Europe/London').toISOString()).toBe('2026-06-21T11:00:00.000Z')
    expect(zonedTime('2026-12-21', clock('12:00'), 'Europe/London').toISOString()).toBe('2026-12-21T12:00:00.000Z')
    expect(zonedTime('2026-07-04', clock('09:30'), 'America/New_York').toISOString()).toBe('2026-07-04T13:30:00.000Z')
  })

  it('places the sun due south at solar noon in London in June, high in the sky', () => {
    const noon = solarPosition(new Date('2026-06-21T12:02:00Z'), 51.5072, -0.1276)
    near(noon.azimuth, 180, 2)
    near(noon.elevation, 62, 1)
  })

  it('finds sunrise and sunset (London midsummer, New York midwinter)', () => {
    const london = sunDay('2026-06-21', 51.5072, -0.1276, 'Europe/London')
    near(london.sunrise, clock('04:43'), 3)
    near(london.sunset, clock('21:21'), 3)
    const ny = sunDay('2026-12-21', 40.7128, -74.006, 'America/New_York')
    near(ny.sunrise, clock('07:17'), 3)
    near(ny.sunset, clock('16:32'), 3)
    // Mid-afternoon in New York in winter: the sun is in the south-west.
    const afternoon = ny.at(clock('15:00'))
    expect(afternoon.azimuth).toBeGreaterThan(200)
    expect(afternoon.azimuth).toBeLessThan(240)
  })

  it('reports no sunrise or sunset in a polar summer', () => {
    const tromso = sunDay('2026-06-21', 69.65, 18.96, 'Europe/Oslo')
    expect(tromso.sunrise).toBeNull()
    expect(tromso.sunset).toBeNull()
  })

  it('formats clock times', () => {
    expect(formatClock(clock('07:05'))).toBe('07:05')
    expect(formatClock(1440 + 30)).toBe('00:30')
  })
})

describe('geo', () => {
  it('reads typed coordinates', () => {
    expect(parseCoordinates('51.5072, -0.1276')).toEqual({ lat: 51.5072, lon: -0.1276 })
    expect(parseCoordinates('51.5 -0.12')).toEqual({ lat: 51.5, lon: -0.12 })
    expect(parseCoordinates('12 High Street')).toBeNull()
    expect(parseCoordinates('95, 10')).toBeNull()
  })

  it('looks an address up with Nominatim when there is no OpenRouteService key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ lat: '51.5', lon: '-0.12' }]), { status: 200 }))
    expect(await geocodeAddress('12 High Street, London', { fetchImpl, orsKey: async () => '' })).toEqual({ lat: 51.5, lon: -0.12 })
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain('nominatim.openstreetmap.org')
  })

  it('uses OpenRouteService when a key is set', async () => {
    const fetchImpl = vi.fn()
    expect(await geocodeAddress('somewhere', { fetchImpl, orsKey: async () => 'key' })).toEqual({ lat: 1, lon: 2 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('gets the time zone from Open-Meteo, and copes with being offline', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ timezone: 'Europe/London' }), { status: 200 }))
    expect(await fetchTimeZone(51.5, -0.12, ok)).toBe('Europe/London')
    const offline = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await fetchTimeZone(51.5, -0.12, offline)).toBeNull()
  })
})
