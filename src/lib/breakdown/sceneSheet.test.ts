import { describe, expect, it } from 'vitest'

import { buildSceneSheet } from './sceneSheet'

describe('buildSceneSheet', () => {
  it('fills the header from the scene, its pages and the production', () => {
    const sheet = buildSceneSheet({
      production: { name: 'Whiteridge', production_code: 'WR-01/A' },
      scene: { id: 's1', scene_number: '12A', title: 'EXT. BEACH - DAY', description: 'Mary loses her umbrella', int_ext: 'EXT', day_night: 'DAY', page_eighths: null, location_id: 'l1' },
      sceneOrdinal: 3,
      sceneCount: 40,
      pages: [
        { page_number: '12', page_index: 0, eighths: 5 },
        { page_number: '13', page_index: 1, eighths: 4 },
      ],
      locations: [{ id: 'l1', name: 'Beach' }],
      tags: [
        { element_id: 'e1', updated_at: '2026-10-01T10:00:00Z' },
        { element_id: 'e1', updated_at: '2026-10-03T10:00:00Z' },
        { element_id: 'e2', updated_at: '2026-10-02T10:00:00Z' },
      ],
      elementsById: new Map([
        ['e1', { id: 'e1', category: 'props' as const, name: 'Umbrella' }],
        ['e2', { id: 'e2', category: 'locations' as const, name: 'BEACH' }],
      ]),
      matchesByElementId: new Map([['e2', { status: 'sourced' as const, detail: 'On Locations · booked' }]]),
    })
    expect(sheet.header).toEqual({
      sceneOrdinal: 3,
      sceneCount: 40,
      breakdownDate: '2026-10-03T10:00:00Z',
      intExt: 'EXT',
      dayNight: 'DAY',
      productionCode: 'WR-01/A',
      productionTitle: 'Whiteridge',
      breakdownPageNo: 3,
      sceneNumber: '12A',
      sceneName: 'EXT. Beach - DAY',
      scriptPages: '12–13',
      description: 'Mary loses her umbrella',
      pageCount: '1 1/8 pg',
      locationName: 'Beach',
    })
    expect(sheet.categories).toHaveLength(11)
    expect(sheet.categories.find((c) => c.category === 'props')!.items).toEqual([
      { elementId: 'e1', name: 'Umbrella', status: 'needed', detail: '', occurrences: 2 },
    ])
    expect(sheet.categories.find((c) => c.category === 'locations')!.items[0]).toMatchObject({ status: 'sourced' })
  })
})
