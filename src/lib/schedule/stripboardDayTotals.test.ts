import { describe, expect, it } from 'vitest'
import type { Scene, Shot, StripboardStrip } from '@/lib/db/types'
import {
  computeStripboardTotals,
  formatRuntime,
  runtimeWarningLevel,
} from './stripboardDayTotals'

const scene = (over: Partial<Scene> & { id: string }): Scene =>
  ({
    production_id: 'p',
    episode_id: null,
    scene_number: '1',
    title: null,
    description: null,
    int_ext: 'INT',
    day_night: 'DAY',
    page_eighths: 4,
    location_id: 'loc',
    duration_minutes: null,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
    ...over,
  }) as Scene

const shot = (id: string, sceneId: string): Shot =>
  ({
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
  }) as Shot

const strip = (over: Partial<StripboardStrip> & { id: string }): StripboardStrip =>
  ({
    production_id: 'p',
    shoot_day_id: 'd',
    shoot_day_unit_id: 'u',
    strip_type: 'SHOT',
    scene_id: null,
    shot_id: null,
    title: null,
    description: null,
    estimated_minutes: null,
    sort_index: 1000,
    color_tag: null,
    strip_status: 'SCHEDULED',
    origin_location_id: null,
    destination_location_id: null,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
    ...over,
  }) as StripboardStrip

describe('computeStripboardTotals', () => {
  it('counts only SHOT strips and sums pages, runtime and INT/EXT/DAY/NIGHT', () => {
    const scenes = [
      scene({ id: 's1', int_ext: 'INT', day_night: 'DAY', page_eighths: 4 }),
      scene({ id: 's2', int_ext: 'EXT', day_night: 'NIGHT', page_eighths: 2, location_id: null }),
    ]
    const shots = [shot('sh1', 's1'), shot('sh2', 's2')]
    const strips = [
      strip({ id: 'a', shot_id: 'sh1' }),
      strip({ id: 'b', shot_id: 'sh2' }),
      strip({ id: 'call', strip_type: 'CALL', title: '07:00' }),
    ]
    const totals = computeStripboardTotals(strips, shots, scenes, new Map([['sh1', 30], ['sh2', 45]]))
    expect(totals).toEqual({
      shotCount: 2,
      totalEighths: 6,
      runtimeMinutes: 75,
      intCount: 1,
      extCount: 1,
      dayCount: 1,
      nightCount: 1,
      noLocation: true,
    })
  })

  it('prefers the strip estimate override over the shot estimate', () => {
    const scenes = [scene({ id: 's1' })]
    const shots = [shot('sh1', 's1')]
    const totals = computeStripboardTotals(
      [strip({ id: 'a', shot_id: 'sh1', estimated_minutes: 90 })],
      shots,
      scenes,
      new Map([['sh1', 30]])
    )
    expect(totals.runtimeMinutes).toBe(90)
  })

  it('treats unknown shots and scenes as zero', () => {
    const totals = computeStripboardTotals([strip({ id: 'a', shot_id: 'missing' })], [], [], new Map())
    expect(totals.shotCount).toBe(1)
    expect(totals.runtimeMinutes).toBe(0)
    expect(totals.totalEighths).toBe(0)
    expect(totals.noLocation).toBe(false)
  })
})

describe('runtimeWarningLevel', () => {
  it('flags above 10h and above 10.5h, not at the boundaries', () => {
    expect(runtimeWarningLevel(600)).toBe('none')
    expect(runtimeWarningLevel(601)).toBe('over10')
    expect(runtimeWarningLevel(630)).toBe('over10')
    expect(runtimeWarningLevel(631)).toBe('over10_5')
  })
})

describe('formatRuntime', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatRuntime(0)).toBe('0h 0m')
    expect(formatRuntime(615)).toBe('10h 15m')
  })
})
