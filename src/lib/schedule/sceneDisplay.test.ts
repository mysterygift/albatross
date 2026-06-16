import { describe, expect, it } from 'vitest'
import { sceneDisplayLabel, sceneScheduleLabel, sceneSlugline } from './sceneDisplay'
import type { Scene } from '@/lib/db/types'

const baseScene: Pick<Scene, 'int_ext' | 'day_night' | 'title' | 'description'> = {
  int_ext: 'INT',
  day_night: 'DAY',
  title: 'KITCHEN - DAY',
  description: null,
}

describe('sceneScheduleLabel', () => {
  it('formats INT/EXT, location, and day/night', () => {
    expect(sceneScheduleLabel(baseScene, 'Kitchen')).toBe('INT – Kitchen – DAY')
  })

  it('uses em dashes for missing values', () => {
    expect(sceneScheduleLabel({ int_ext: null, day_night: null, title: null }, null)).toBe(
      '— – — – —'
    )
  })

  it('treats UNK as missing', () => {
    expect(
      sceneScheduleLabel({ int_ext: 'INT', day_night: 'UNK', title: null }, null)
    ).toBe('INT – — – —')
  })
})

describe('sceneDisplayLabel', () => {
  it('falls back to title when only int_ext is set and day/night is UNK', () => {
    expect(
      sceneDisplayLabel(
        {
          int_ext: 'INT',
          day_night: 'UNK',
          title: 'INT. KITCHEN - DAY',
          description: null,
        },
        null
      )
    ).toBe('INT. KITCHEN - DAY')
  })

  it('uses schedule label when location and day/night are meaningful', () => {
    expect(sceneDisplayLabel(baseScene, 'Kitchen')).toBe('INT – Kitchen – DAY')
  })

  it('uses schedule label when int_ext and day/night are both set', () => {
    expect(sceneDisplayLabel({ ...baseScene, title: null }, null)).toBe('INT – — – DAY')
  })
})

describe('sceneSlugline', () => {
  it('builds screenplay slug from structured fields', () => {
    expect(sceneSlugline(baseScene, 'Kitchen')).toBe('INT. Kitchen - DAY')
  })

  it('falls back to title when location and day/night are absent', () => {
    expect(sceneSlugline({ int_ext: null, day_night: null, title: 'Legacy slug' }, null)).toBe(
      'Legacy slug'
    )
  })

  it('ignores UNK day/night when building slug parts', () => {
    expect(sceneSlugline({ int_ext: 'INT', day_night: 'UNK', title: 'INT. KITCHEN' }, null)).toBe(
      'INT. KITCHEN'
    )
  })
})
