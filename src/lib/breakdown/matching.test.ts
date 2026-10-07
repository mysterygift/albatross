import { describe, expect, it } from 'vitest'

import type { BreakdownElement, Clearance, Equipment, Location, MusicTrack, Person } from '@/lib/db/types'
import { matchBreakdownElement, type BreakdownMatchData } from './matching'

const base = { created_at: 't', updated_at: 't', deleted_at: null }
const location = (id: string, name: string, booked_status: Location['booked_status']) =>
  ({ ...base, id, name, booked_status, production_id: 'p' }) as Location
const person = (id: string, name: string, role_name: string | null) => ({ ...base, id, name, role_name, is_cast: 1 }) as Person

function data(over: Partial<BreakdownMatchData> = {}): BreakdownMatchData {
  return {
    locations: [location('l1', 'Beach', 'booked'), location('l2', 'Old Mill', 'hold')],
    cast: [person('c1', 'Ada Lovelace', 'MARY')],
    equipment: [{ ...base, id: 'e1', name: 'ARRI SkyPanel S60', category: 'lighting' } as Equipment],
    musicTracks: [{ ...base, id: 'm1', title: 'Moonlight Sonata', artist: 'Beethoven' } as MusicTrack],
    clearances: [],
    castIdsBySceneId: new Map([['s1', ['c1']]]),
    ...over,
  }
}

function el(category: BreakdownElement['category'], name: string, over: Partial<BreakdownElement> = {}) {
  return { category, name, manual_status: 'needed' as const, linked_entity_type: null, linked_entity_id: null, ...over }
}

describe('matchBreakdownElement', () => {
  it('finds a booked location by name', () => {
    const m = matchBreakdownElement(el('locations', 'BEACH'), ['s1'], data())
    expect(m).toMatchObject({ status: 'sourced', source: 'auto', entity: { id: 'l1', type: 'location' } })
  })

  it('treats a location on hold as in progress, unless marked sourced by hand', () => {
    expect(matchBreakdownElement(el('locations', 'OLD MILL'), [], data()).status).toBe('partial')
    expect(matchBreakdownElement(el('locations', 'OLD MILL', { manual_status: 'sourced' }), [], data()).status).toBe('sourced')
  })

  it('only suggests loose matches', () => {
    const m = matchBreakdownElement(el('locations', 'BEACH CAR PARK'), [], data())
    expect(m).toMatchObject({ status: 'needed', source: 'manual', entity: null, detail: 'Not found on Locations' })
    expect(m.suggestions.map((s) => s.id)).toEqual(['l1'])
  })

  it('matches cast by character name and flags scenes they are not cast in', () => {
    expect(matchBreakdownElement(el('cast', 'MARY'), ['s1'], data())).toMatchObject({ status: 'sourced', entity: { id: 'c1' } })
    const m = matchBreakdownElement(el('cast', 'MARY'), ['s1', 's2'], data())
    expect(m).toMatchObject({ status: 'partial', missingFromSceneIds: ['s2'] })
  })

  it('uses an explicit link over name matching', () => {
    const m = matchBreakdownElement(
      el('locations', 'THE SHORE', { linked_entity_type: 'location', linked_entity_id: 'l1' }),
      [],
      data()
    )
    expect(m).toMatchObject({ status: 'sourced', source: 'linked', entity: { id: 'l1' } })
    const lost = matchBreakdownElement(
      el('locations', 'THE SHORE', { linked_entity_type: 'location', linked_entity_id: 'gone' }),
      [],
      data()
    )
    expect(lost).toMatchObject({ status: 'needed', detail: 'The linked row was removed' })
  })

  it('matches lighting equipment and music tracks, with pending clearance as in progress', () => {
    expect(matchBreakdownElement(el('lighting', 'arri skypanel s60'), [], data()).status).toBe('sourced')
    const pending = data({ clearances: [{ ...base, id: 'k', production_id: 'p', type: 'music', item_id: 'm1', status: 'requested', requested_at: null, granted_at: null, expiry: null } as Clearance] })
    expect(matchBreakdownElement(el('foley_music', 'Moonlight Sonata'), [], pending)).toMatchObject({ status: 'partial' })
  })

  it('uses the manual status for categories with no database', () => {
    expect(matchBreakdownElement(el('props', 'Umbrella'), [], data())).toMatchObject({ status: 'needed', source: 'manual', detail: 'Not sourced yet' })
    expect(matchBreakdownElement(el('props', 'Umbrella', { manual_status: 'sourced' }), [], data()).status).toBe('sourced')
  })
})
