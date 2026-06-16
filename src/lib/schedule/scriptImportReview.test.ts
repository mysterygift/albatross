import { describe, expect, it } from 'vitest'
import type { ParsedScene } from '@/lib/script-parser'
import {
  analyzeImportLocations,
  applyLocationMergeToDrafts,
  draftToParsedScene,
  effectiveParsedLocation,
  hasLocationSpellingVariants,
  syncSceneSlugFields,
  toImportSceneDrafts,
} from './scriptImportReview'
import type { Location } from '@/lib/db/types'

function parsed(over: Partial<ParsedScene> = {}): ParsedScene {
  return {
    scene_number: '1',
    title: 'KITCHEN - DAY',
    location: 'KITCHEN',
    int_ext: 'INT',
    day_night: 'DAY',
    ...over,
  }
}

describe('effectiveParsedLocation', () => {
  it('prefers explicit location field', () => {
    expect(effectiveParsedLocation(parsed({ location: 'WAREHOUSE', title: 'KITCHEN - DAY' }))).toBe(
      'WAREHOUSE'
    )
  })

  it('falls back to slug extraction when location is empty', () => {
    expect(effectiveParsedLocation(parsed({ location: null, title: 'ALLEY - NIGHT' }))).toBe('ALLEY')
  })
})

describe('syncSceneSlugFields', () => {
  it('rebuilds title from location and day_night', () => {
    const draft = toImportSceneDrafts([parsed()])[0]!
    const updated = syncSceneSlugFields(draft, {
      location: 'WAREHOUSE',
      day_night: 'NIGHT',
    })
    expect(updated.location).toBe('WAREHOUSE')
    expect(updated.day_night).toBe('NIGHT')
    expect(updated.title).toBe('WAREHOUSE - NIGHT')
  })

  it('uses location alone when day_night is cleared', () => {
    const draft = toImportSceneDrafts([parsed()])[0]!
    const updated = syncSceneSlugFields(draft, { location: 'ROOF', day_night: null })
    expect(updated.title).toBe('ROOF')
  })
})

describe('analyzeImportLocations', () => {
  it('groups scenes by normalized location key', () => {
    const drafts = toImportSceneDrafts([
      parsed({ scene_number: '1', location: 'Kitchen' }),
      parsed({ scene_number: '2', location: 'KITCHEN' }),
      parsed({ scene_number: '3', location: 'ALLEY' }),
    ])
    const groups = analyzeImportLocations(drafts)
    expect(groups).toHaveLength(2)
    const kitchen = groups.find((g) => g.canonicalKey === 'KITCHEN')
    expect(kitchen?.sceneIds).toHaveLength(2)
    expect(kitchen?.rawVariants.sort()).toEqual(['KITCHEN', 'Kitchen'])
  })

  it('matches existing production locations', () => {
    const drafts = toImportSceneDrafts([parsed({ location: 'kitchen' })])
    const existing: Location[] = [
      {
        id: 'loc-1',
        production_id: 'prod-1',
        name: 'Kitchen',
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
      },
    ]
    const groups = analyzeImportLocations(drafts, existing)
    expect(groups[0]?.matchesExistingLocation?.id).toBe('loc-1')
  })
})

describe('hasLocationSpellingVariants', () => {
  it('is true when a group has multiple raw variants', () => {
    const groups = analyzeImportLocations(
      toImportSceneDrafts([
        parsed({ location: 'Kitchen' }),
        parsed({ scene_number: '2', location: 'KITCHEN' }),
      ])
    )
    expect(hasLocationSpellingVariants(groups)).toBe(true)
  })
})

describe('applyLocationMergeToDrafts', () => {
  it('sets canonical location on all scenes in the group', () => {
    const drafts = toImportSceneDrafts([
      parsed({ scene_number: '1', location: 'Kitchen', day_night: 'DAY' }),
      parsed({ scene_number: '2', location: 'KITCHEN', day_night: 'NIGHT' }),
    ])
    const merged = applyLocationMergeToDrafts(
      drafts,
      drafts.map((d) => d.id),
      'Main Kitchen'
    )
    expect(merged.every((d) => d.location === 'Main Kitchen')).toBe(true)
    expect(merged[0]?.title).toBe('Main Kitchen - DAY')
    expect(merged[1]?.title).toBe('Main Kitchen - NIGHT')
  })
})

describe('draftToParsedScene', () => {
  it('strips review id', () => {
    const draft = toImportSceneDrafts([parsed()])[0]!
    const parsedScene = draftToParsedScene(draft)
    expect(parsedScene).not.toHaveProperty('id')
    expect(parsedScene.scene_number).toBe('1')
  })
})
