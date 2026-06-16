import { describe, it, expect } from 'vitest'
import type { Location, Scene, Shot, StripboardStrip } from '@/lib/db/types'
import { getOrderedLocationStackForDayUnit } from './orderedLocationStack'

const baseStrip = (overrides: Partial<StripboardStrip>): StripboardStrip => ({
  id: 'strip-1',
  production_id: 'prod-1',
  shoot_day_id: 'day-1',
  shoot_day_unit_id: 'unit-1',
  strip_type: 'SHOT',
  scene_id: null,
  shot_id: null,
  title: null,
  description: null,
  estimated_minutes: null,
  sort_index: 0,
  color_tag: null,
  strip_status: 'SCHEDULED',
  origin_location_id: null,
  destination_location_id: null,
  created_at: 't',
  updated_at: 't',
  deleted_at: null,
  ...overrides,
})

const loc = (id: string, name: string): Location => ({
  id,
  production_id: 'prod-1',
  name,
  booked_status: 'unbooked',
  address: null,
  what3words: null,
  parking_info: null,
  availability_constraints: null,
  permit_fee: null,
  location_fee: null,
  notes: null,
  created_at: 't',
  updated_at: 't',
  deleted_at: null,
})

const scene = (id: string, locationId: string | null): Scene => ({
  id,
  production_id: 'prod-1',
  episode_id: null,
  scene_number: '1',
  title: null,
  heading: null,
  description: null,
  int_ext: null,
  day_night: null,
  page_eighths: null,
  duration_minutes: null,
  location_id: locationId,
  created_at: 't',
  updated_at: 't',
  deleted_at: null,
})

const shot = (id: string, sceneId: string): Shot => ({
  id,
  scene_id: sceneId,
  shot_number: '1',
  shot_description: null,
  subject: null,
  shot_size: null,
  support: null,
  lens: null,
  duration_seconds: null,
  estimated_shoot_minutes: null,
  camera_movement: null,
  notes: null,
  created_at: 't',
  updated_at: 't',
  deleted_at: null,
})

describe('getOrderedLocationStackForDayUnit', () => {
  const locations = [loc('loc-a', 'Studio A'), loc('loc-b', 'Location B'), loc('loc-c', 'Location C')]

  it('builds stack from SHOT strips via scene location (regression)', () => {
    const result = getOrderedLocationStackForDayUnit({
      strips: [
        baseStrip({ id: 's1', sort_index: 1000, strip_type: 'SHOT', shot_id: 'shot-1' }),
        baseStrip({ id: 's2', sort_index: 2000, strip_type: 'SHOT', shot_id: 'shot-2' }),
      ],
      scenes: [scene('scene-1', 'loc-a'), scene('scene-2', 'loc-b')],
      shots: [shot('shot-1', 'scene-1'), shot('shot-2', 'scene-2')],
      locations,
    })
    expect(result.orderedLocations.map((e) => e.locationId)).toEqual(['loc-a', 'loc-b'])
    expect(result.missingLocationSceneCount).toBe(0)
  })

  it('dedupes consecutive same scene locations', () => {
    const result = getOrderedLocationStackForDayUnit({
      strips: [
        baseStrip({ id: 's1', sort_index: 1000, strip_type: 'SHOT', shot_id: 'shot-1' }),
        baseStrip({ id: 's2', sort_index: 2000, strip_type: 'SHOT', shot_id: 'shot-2' }),
      ],
      scenes: [scene('scene-1', 'loc-a'), scene('scene-2', 'loc-a')],
      shots: [shot('shot-1', 'scene-1'), shot('shot-2', 'scene-2')],
      locations,
    })
    expect(result.orderedLocations.map((e) => e.locationId)).toEqual(['loc-a'])
  })

  it('inserts MOVE origin and destination between scenes', () => {
    const result = getOrderedLocationStackForDayUnit({
      strips: [
        baseStrip({ id: 's1', sort_index: 1000, strip_type: 'SHOT', shot_id: 'shot-1' }),
        baseStrip({
          id: 's2',
          sort_index: 2000,
          strip_type: 'MOVE',
          origin_location_id: 'loc-a',
          destination_location_id: 'loc-c',
        }),
        baseStrip({ id: 's3', sort_index: 3000, strip_type: 'SHOT', shot_id: 'shot-2' }),
      ],
      scenes: [scene('scene-1', 'loc-a'), scene('scene-2', 'loc-b')],
      shots: [shot('shot-1', 'scene-1'), shot('shot-2', 'scene-2')],
      locations,
    })
    expect(result.orderedLocations.map((e) => e.locationId)).toEqual(['loc-a', 'loc-c', 'loc-b'])
  })

  it('MOVE with only destination appends destination', () => {
    const result = getOrderedLocationStackForDayUnit({
      strips: [
        baseStrip({ id: 's1', sort_index: 1000, strip_type: 'SHOT', shot_id: 'shot-1' }),
        baseStrip({
          id: 's2',
          sort_index: 2000,
          strip_type: 'MOVE',
          destination_location_id: 'loc-c',
        }),
      ],
      scenes: [scene('scene-1', 'loc-a')],
      shots: [shot('shot-1', 'scene-1')],
      locations,
    })
    expect(result.orderedLocations.map((e) => e.locationId)).toEqual(['loc-a', 'loc-c'])
  })

  it('skips MOVE origin when it matches the last stack entry', () => {
    const result = getOrderedLocationStackForDayUnit({
      strips: [
        baseStrip({ id: 's1', sort_index: 1000, strip_type: 'SHOT', shot_id: 'shot-1' }),
        baseStrip({
          id: 's2',
          sort_index: 2000,
          strip_type: 'MOVE',
          origin_location_id: 'loc-a',
          destination_location_id: 'loc-b',
        }),
      ],
      scenes: [scene('scene-1', 'loc-a')],
      shots: [shot('shot-1', 'scene-1')],
      locations,
    })
    expect(result.orderedLocations.map((e) => e.locationId)).toEqual(['loc-a', 'loc-b'])
  })

  it('MOVE-only day produces stack when locations set', () => {
    const result = getOrderedLocationStackForDayUnit({
      strips: [
        baseStrip({
          id: 's1',
          sort_index: 1000,
          strip_type: 'MOVE',
          origin_location_id: 'loc-a',
          destination_location_id: 'loc-b',
        }),
      ],
      scenes: [],
      shots: [],
      locations,
    })
    expect(result.orderedLocations.map((e) => e.locationId)).toEqual(['loc-a', 'loc-b'])
    expect(result.missingLocationSceneCount).toBe(0)
  })
})
