import { describe, expect, it } from 'vitest'
import { buildMovementOrderLegSkeleton, buildMovementOrderWaypoints } from './movementLegs'
import {
  applyMovementOrderLegInputs,
  getMovementLegKeys,
  normalizeMovementTime,
  parseMovementOrderInputs,
  serializeMovementOrderInputs,
  summariseMovementDriving,
} from './movementOrderInputs'
import type { MovementOrderLocation, MovementOrderMovementLeg } from './types'

const location = (id: string): MovementOrderLocation => ({
  id,
  name: id.toUpperCase(),
  address: null,
  what3words: null,
  parkingInfo: null,
  lat: null,
  lng: null,
  scenes: [],
})

describe('normalizeMovementTime', () => {
  it('accepts common 24h forms and pads to HH:MM', () => {
    expect(normalizeMovementTime('7:05')).toBe('07:05')
    expect(normalizeMovementTime('0705')).toBe('07:05')
    expect(normalizeMovementTime('07.05')).toBe('07:05')
    expect(normalizeMovementTime(' 17:30 ')).toBe('17:30')
  })

  it('rejects out-of-range and non-time values', () => {
    expect(normalizeMovementTime('24:00')).toBeNull()
    expect(normalizeMovementTime('12:60')).toBeNull()
    expect(normalizeMovementTime('noon')).toBeNull()
    expect(normalizeMovementTime('')).toBeNull()
    expect(normalizeMovementTime(null)).toBeNull()
  })
})

describe('movement order inputs JSON', () => {
  it('round-trips revision label, base time and per-leg times', () => {
    const json = serializeMovementOrderInputs({
      revisionLabel: ' Draft 2 ',
      unitBaseTime: '6:30',
      legs: { 'a>b': { departTime: '07:00', arriveTime: '07:14' } },
    })
    expect(parseMovementOrderInputs(json)).toEqual({
      revisionLabel: 'Draft 2',
      unitBaseTime: '06:30',
      legs: { 'a>b': { departTime: '07:00', arriveTime: '07:14' } },
    })
  })

  it('serialises to null when nothing is entered, so the column is cleared', () => {
    expect(
      serializeMovementOrderInputs({
        revisionLabel: '  ',
        unitBaseTime: null,
        legs: { 'a>b': { departTime: null, arriveTime: 'bad' } },
      })
    ).toBeNull()
  })

  it('tolerates empty, malformed and partly invalid stored JSON', () => {
    expect(parseMovementOrderInputs(null).legs).toEqual({})
    expect(parseMovementOrderInputs('{not json').legs).toEqual({})
    const parsed = parseMovementOrderInputs(
      JSON.stringify({ unitBaseTime: '99:99', legs: { x: { departTime: '08:00' }, y: 5 } })
    )
    expect(parsed.unitBaseTime).toBeNull()
    expect(parsed.legs).toEqual({ x: { departTime: '08:00', arriveTime: null } })
  })
})

describe('getMovementLegKeys', () => {
  it('gives a repeated pair its own key so each occurrence keeps its own times', () => {
    expect(getMovementLegKeys([{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'b' }])).toEqual([
      'a>b',
      'b>a',
      'a>b#1',
    ])
  })

  it('returns no keys for fewer than two locations', () => {
    expect(getMovementLegKeys([{ id: 'a' }])).toEqual([])
  })
})

describe('journey waypoints', () => {
  it('starts and ends at the unit base when it has an address', () => {
    const waypoints = buildMovementOrderWaypoints([location('a'), location('b')], 'Mill Lane')
    expect(waypoints.map((w) => w.id)).toEqual(['unit-base', 'a', 'b', 'unit-base'])
    const legs = buildMovementOrderLegSkeleton(waypoints)
    expect(legs.map((l) => `${l.fromLocationName}>${l.toLocationName}`)).toEqual([
      'Unit base>A',
      'A>B',
      'B>Unit base',
    ])
  })

  it('gives a single location a leg out and back', () => {
    const legs = buildMovementOrderLegSkeleton(buildMovementOrderWaypoints([location('a')], 'Mill Lane'))
    expect(legs).toHaveLength(2)
  })

  it('leaves the locations alone without a base address', () => {
    const locations = [location('a'), location('b')]
    expect(buildMovementOrderWaypoints(locations, '  ')).toBe(locations)
    expect(buildMovementOrderWaypoints([], 'Mill Lane')).toEqual([])
  })
})

describe('applyMovementOrderLegInputs', () => {
  it('attaches hand-entered times by leg key and leaves other legs blank', () => {
    const legs = buildMovementOrderLegSkeleton([location('a'), location('b'), location('c')])
    const withTimes = applyMovementOrderLegInputs(legs, {
      revisionLabel: null,
      unitBaseTime: null,
      legs: { 'b>c': { departTime: '12:30', arriveTime: null } },
    })
    expect(withTimes.map((l) => [l.departTime, l.arriveTime])).toEqual([
      [null, null],
      ['12:30', null],
    ])
  })
})

describe('summariseMovementDriving', () => {
  const leg = (minutes: number | null, meters: number | null): MovementOrderMovementLeg => ({
    ...buildMovementOrderLegSkeleton([location('a'), location('b')])[0]!,
    drivingTimeMinutes: minutes,
    drivingDistanceMeters: meters,
  })

  it('sums the legs and flags totals that undercount', () => {
    expect(summariseMovementDriving([leg(14, 5200), leg(11, 4100)])).toEqual({
      minutes: 25,
      meters: 9300,
      incomplete: false,
    })
    expect(summariseMovementDriving([leg(14, 5200), leg(null, null)]).incomplete).toBe(true)
  })

  it('has no totals when no leg has driving data', () => {
    expect(summariseMovementDriving([leg(null, null)])).toEqual({
      minutes: null,
      meters: null,
      incomplete: true,
    })
    expect(summariseMovementDriving([])).toEqual({ minutes: null, meters: null, incomplete: false })
  })
})
