import { describe, expect, it } from 'vitest'

import {
  extractLocationFromSlug,
  formatSceneHeading,
  inferDayNight,
} from './common'

describe('extractLocationFromSlug', () => {
  it('extracts location before a time-of-day segment', () => {
    expect(extractLocationFromSlug('KITCHEN - DAY')).toBe('KITCHEN')
    expect(extractLocationFromSlug('STREET - NIGHT')).toBe('STREET')
  })

  it('keeps sub-locations before time-of-day', () => {
    expect(extractLocationFromSlug("JOHN'S APARTMENT - LIVING ROOM - DAY")).toBe(
      "JOHN'S APARTMENT - LIVING ROOM"
    )
  })

  it('treats a slug with no dash as the full location', () => {
    expect(extractLocationFromSlug('WAREHOUSE')).toBe('WAREHOUSE')
  })

  it('peels DAWN and other non-day/night time tokens', () => {
    expect(extractLocationFromSlug('CITY SKYLINE - DAWN')).toBe('CITY SKYLINE')
    expect(extractLocationFromSlug('OFFICE - MORNING')).toBe('OFFICE')
    expect(extractLocationFromSlug('ROAD - CONTINUOUS')).toBe('ROAD')
  })

  it('returns null when only a time token remains', () => {
    expect(extractLocationFromSlug('DAY')).toBeNull()
    expect(extractLocationFromSlug('NIGHT')).toBeNull()
  })

  it('strips continuation markers before parsing', () => {
    expect(extractLocationFromSlug('OFFICE - DAY (CONTINUED)')).toBe('OFFICE')
  })

  it('does not affect inferDayNight on the full slug', () => {
    const slug = 'KITCHEN - DAY'
    expect(extractLocationFromSlug(slug)).toBe('KITCHEN')
    expect(inferDayNight(slug)).toBe('DAY')
  })

  it('infers DAWN, DUSK, and TIMELESS', () => {
    expect(inferDayNight('CITY SKYLINE - DAWN')).toBe('DAWN')
    expect(inferDayNight('HILLTOP - DUSK')).toBe('DUSK')
    expect(inferDayNight('VOID - TIMELESS')).toBe('TIMELESS')
    expect(inferDayNight('BEACH - SUNRISE')).toBe('DAWN')
    expect(inferDayNight('PIER - SUNSET')).toBe('DUSK')
  })
})

describe('formatSceneHeading', () => {
  it('reconstructs full sluglines from INT/EXT and slug title', () => {
    expect(formatSceneHeading('INT', 'KITCHEN - DAY')).toBe('INT. KITCHEN - DAY')
    expect(formatSceneHeading('EXT', 'STREET - NIGHT')).toBe('EXT. STREET - NIGHT')
    expect(formatSceneHeading('MIXED', 'CAR - DAY')).toBe('INT/EXT CAR - DAY')
  })

  it('defaults to INT when int_ext is unknown', () => {
    expect(formatSceneHeading(null, 'ROOM - DAY')).toBe('INT. ROOM - DAY')
  })
})
