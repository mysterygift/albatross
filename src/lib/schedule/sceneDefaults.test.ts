import { describe, expect, it } from 'vitest'
import { findDefaultSceneLocationId, DEFAULT_NEW_SCENE_LOCATION_NAME } from './sceneDefaults'
import type { Location } from '@/lib/db/types'

function loc(id: string, name: string): Location {
  return {
    id,
    production_id: 'p1',
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
  }
}

describe('findDefaultSceneLocationId', () => {
  it('matches default city case-insensitively', () => {
    expect(
      findDefaultSceneLocationId([loc('loc-1', 'default city'), loc('loc-2', 'Kitchen')])
    ).toBe('loc-1')
  })

  it('returns null when default city is absent', () => {
    expect(findDefaultSceneLocationId([loc('loc-2', 'Kitchen')])).toBeNull()
  })

  it('exports the expected default location label', () => {
    expect(DEFAULT_NEW_SCENE_LOCATION_NAME).toBe('Default City')
  })
})
