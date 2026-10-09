import { describe, expect, it } from 'vitest'
import type { Person, Scene, ShootDay, Shot, StripboardStrip } from '@/lib/db/types'
import { castOptionsFor, defaultSunDate, formatItemSize, shotCameraDetails } from './floorPlanDisplay'

describe('floor plan display helpers', () => {
  it('formats camera details and sizes with pipes', () => {
    expect(shotCameraDetails({ shot_size: 'WS', lens: '24mm', support: 'Dolly', camera_movement: 'Track' } as unknown as Shot)).toBe(
      'WS | 24mm | Dolly | Track'
    )
    expect(formatItemSize(0.47, 0.54)).toBe('0.47 x 0.54 m')
    expect(formatItemSize(3, 6)).toBe('3 x 6 m')
  })

  it('offers the scene cast first, by character name, in booking colours', () => {
    const cast = [
      { id: 'a', name: 'Ana Actor', role_name: 'Marta' },
      { id: 'b', name: 'Bo Actor', role_name: null },
      { id: 'c', name: 'Cy Actor', role_name: 'Joe' },
    ] as unknown as Person[]
    const options = castOptionsFor(
      { cast, castBySceneId: new Map([['sc', ['c']]]), castByShotId: new Map([['sh', ['a']]]) },
      'sc',
      'sh',
      (id) => (id === 'a' ? '#8b5cf6' : '#64748b')
    )
    expect(options.map((o) => [o.name, o.inScene, o.color])).toEqual([
      ['Marta', true, '#8b5cf6'],
      ['Bo Actor', false, '#64748b'],
      ['Joe', false, '#64748b'],
    ])
  })

  it('opens the sun on the next shoot day at the location, else the next shoot day', () => {
    const shootDays = [
      { id: 'd1', shoot_date: '2026-10-01', deleted_at: null },
      { id: 'd2', shoot_date: '2026-10-12', deleted_at: null },
      { id: 'd3', shoot_date: '2026-10-20', deleted_at: null },
    ] as unknown as ShootDay[]
    const scenes = [{ id: 'sc', location_id: 'diner' }] as unknown as Scene[]
    const shots = [{ id: 'sh', scene_id: 'sc' }] as unknown as Shot[]
    const strips = [{ shot_id: 'sh', shoot_day_id: 'd3', strip_status: 'SCHEDULED', deleted_at: null }] as unknown as StripboardStrip[]
    expect(defaultSunDate({ shootDays, scenes, shots, strips }, 'diner', '2026-10-09')).toBe('2026-10-20')
    expect(defaultSunDate({ shootDays, scenes, shots, strips }, 'garage', '2026-10-09')).toBe('2026-10-12')
    expect(defaultSunDate({ shootDays: [], scenes, shots, strips: [] }, 'garage', '2026-10-09')).toBe('2026-10-09')
  })
})
