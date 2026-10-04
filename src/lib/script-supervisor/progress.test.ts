import { describe, expect, it } from 'vitest'

import {
  buildSceneProgressRows,
  deriveSceneStatus,
  deriveShotEighths,
  formatPageEighths,
  summariseProgress,
  type SceneForProgress,
  type SceneProgressMark,
  type SceneSlateAggregate,
} from './progress'

const scene = (id: string, page_eighths: number | null): SceneForProgress => ({
  id, scene_number: id, title: null, page_eighths, episode_id: null, duration_minutes: null,
})
const agg = (slates: number): SceneSlateAggregate => ({ slates, takes: slates * 2, prints: slates, lastShootDate: '2026-10-07', lastDayNumber: 14 })
const mark = (over: Partial<SceneProgressMark>): SceneProgressMark => ({
  marked_status: null, completed_shoot_day_id: null, credited_eighths: null, timed_seconds: null, notes: null, ...over,
})

describe('scene progress derivation (SS4)', () => {
  it('derives status from slates and the script supervisor mark', () => {
    expect(deriveSceneStatus(0, null)).toBe('not_shot')
    expect(deriveSceneStatus(2, null)).toBe('part_shot')
    expect(deriveSceneStatus(2, mark({ marked_status: 'complete' }))).toBe('complete')
    expect(deriveSceneStatus(0, mark({ marked_status: 'omitted' }))).toBe('omitted')
  })

  it('credits complete scenes in full and part-shot scenes up to their length', () => {
    expect(deriveShotEighths('complete', 11, null)).toBe(11)
    expect(deriveShotEighths('part_shot', 11, 4)).toBe(4)
    expect(deriveShotEighths('part_shot', 11, 20)).toBe(11)
    expect(deriveShotEighths('part_shot', null, 3)).toBe(3)
    expect(deriveShotEighths('not_shot', 11, 4)).toBe(0)
    expect(deriveShotEighths('omitted', 11, 4)).toBe(0)
  })

  it('totals pages and scenes, leaving omitted scenes out', () => {
    const rows = buildSceneProgressRows(
      [scene('10', 6), scene('23', 11), scene('24', 4), scene('32', 5)],
      new Map([['10', agg(1)], ['23', agg(2)]]),
      new Map([
        ['10', mark({ marked_status: 'complete', completed_shoot_day_id: 'd1' })],
        ['23', mark({ credited_eighths: 4 })],
        ['32', mark({ marked_status: 'omitted' })],
      ])
    )
    expect(rows.map((r) => r.status)).toEqual(['complete', 'part_shot', 'not_shot', 'omitted'])
    expect(summariseProgress(rows)).toEqual({
      scenes: 3, complete: 1, partShot: 1, notShot: 1, omitted: 1, totalEighths: 21, shotEighths: 10, slates: 3, takes: 6,
    })
  })

  it('writes page counts the breakdown way', () => {
    expect([0, 3, 8, 11, 16, null].map(formatPageEighths)).toEqual(['0', '3/8', '1', '1 3/8', '2', '0'])
  })
})
