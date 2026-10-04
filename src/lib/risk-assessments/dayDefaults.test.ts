import { describe, expect, it } from 'vitest'
import { firstLocationForStrips } from '@/lib/risk-assessments/dayDefaults'

const locations = [
  { id: 'l1', name: 'Warehouse' },
  { id: 'l2', name: 'Beach' },
]
const scenes = [
  { id: 's1', location_id: null },
  { id: 's2', location_id: 'l2' },
  { id: 's3', location_id: 'l1' },
]
const shots = [{ id: 'sh1', scene_id: 's3' }]

describe('firstLocationForStrips', () => {
  it('returns the first strip with a known location (scene or via shot)', () => {
    expect(
      firstLocationForStrips(
        [
          { scene_id: 's1', shot_id: null },
          { scene_id: null, shot_id: 'sh1' },
          { scene_id: 's2', shot_id: null },
        ],
        scenes,
        shots,
        locations
      )
    ).toEqual({ id: 'l1', name: 'Warehouse' })
  })

  it('returns null when nothing resolves', () => {
    expect(firstLocationForStrips([], scenes, shots, locations)).toBeNull()
    expect(firstLocationForStrips([{ scene_id: 's1', shot_id: null }], scenes, shots, locations)).toBeNull()
  })
})
