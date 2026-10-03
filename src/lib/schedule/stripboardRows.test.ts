import { describe, expect, it } from 'vitest'
import type { Scene, Shot, StripboardStrip } from '@/lib/db/types'
import {
  DEFAULT_COLUMN_FILTER,
  filterStripsByColumnFilter,
  isColumnFilterActive,
  resolveStripShotAndScene,
  sortStripsBySortIndex,
} from './stripboardRows'

const scenes = [
  { id: 's-int-day', int_ext: 'INT', day_night: 'DAY' },
  { id: 's-ext-night', int_ext: 'EXT', day_night: 'NIGHT' },
] as Scene[]
const shots = [
  { id: 'sh1', scene_id: 's-int-day' },
  { id: 'sh2', scene_id: 's-ext-night' },
] as Shot[]
const strip = (id: string, over: Partial<StripboardStrip> = {}) =>
  ({ id, strip_type: 'SHOT', shot_id: null, scene_id: null, sort_index: 0, ...over }) as StripboardStrip

describe('resolveStripShotAndScene', () => {
  it('resolves a SHOT strip through its shot', () => {
    const { shot, scene } = resolveStripShotAndScene(strip('a', { shot_id: 'sh2' }), shots, scenes)
    expect(shot?.id).toBe('sh2')
    expect(scene?.id).toBe('s-ext-night')
  })

  it('falls back to scene_id when there is no shot', () => {
    const { shot, scene } = resolveStripShotAndScene(strip('a', { scene_id: 's-int-day' }), shots, scenes)
    expect(shot).toBeNull()
    expect(scene?.id).toBe('s-int-day')
  })
})

describe('filterStripsByColumnFilter', () => {
  const all = [
    strip('int-day', { shot_id: 'sh1' }),
    strip('ext-night', { shot_id: 'sh2' }),
    strip('no-scene', { shot_id: 'missing' }),
    strip('call', { strip_type: 'CALL' }),
  ]

  it('returns everything when no toggle is active', () => {
    expect(isColumnFilterActive(DEFAULT_COLUMN_FILTER)).toBe(false)
    expect(filterStripsByColumnFilter(all, shots, scenes, DEFAULT_COLUMN_FILTER)).toHaveLength(4)
  })

  it('keeps matching shots, plus non-shot and unresolvable strips', () => {
    const ids = filterStripsByColumnFilter(all, shots, scenes, { ...DEFAULT_COLUMN_FILTER, int: true, day: true })
      .map((s) => s.id)
    expect(ids).toEqual(['int-day', 'no-scene', 'call'])
  })

  it('ORs within INT/EXT and within DAY/NIGHT, and ANDs across the two groups', () => {
    const ext = filterStripsByColumnFilter(all, shots, scenes, { ...DEFAULT_COLUMN_FILTER, ext: true })
      .map((s) => s.id)
    expect(ext).toEqual(['ext-night', 'no-scene', 'call'])
    const extDay = filterStripsByColumnFilter(all, shots, scenes, { ...DEFAULT_COLUMN_FILTER, ext: true, day: true })
      .map((s) => s.id)
    expect(extDay).toEqual(['no-scene', 'call'])
  })
})

describe('sortStripsBySortIndex', () => {
  it('sorts by sort_index without mutating the input', () => {
    const input = [strip('b', { sort_index: 2000 }), strip('a', { sort_index: 1000 })]
    expect(sortStripsBySortIndex(input).map((s) => s.id)).toEqual(['a', 'b'])
    expect(input.map((s) => s.id)).toEqual(['b', 'a'])
  })
})
