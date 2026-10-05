import { describe, expect, it } from 'vitest'

import type { ShootDay, Slate, Take } from '@/lib/db/types'
import {
  carryOverFields,
  formatDuration,
  latestSlate,
  pickDefaultShootDay,
  printedTakeNumbers,
  sceneTimeLabel,
  slateSetupSummary,
  takeToMark,
} from './slatePanel'

const soft = { created_at: 't', updated_at: 't', deleted_at: null }

function slate(over: Partial<Slate>): Slate {
  return {
    id: 's', production_id: 'p', slating_system: 'uk', shoot_day_id: 'd', unit_id: null, scene_id: null, shot_id: null,
    slate_prefix: '', slate_number: 1, shot_type: null, shot_code: null, description: null, camera: null, lens: null,
    stop: null, filter: null, sound_mode: 'sync', int_ext: null, day_night: null, camera_roll: null, sound_roll: null,
    notes: null, ...soft, ...over,
  }
}

function take(over: Partial<Take>): Take {
  return { id: 't', slate_id: 's', take_number: 1, status: 'pending', ng_reason: null, duration_ms: null, end_board: 0, remarks: null, ...soft, ...over }
}

function day(id: string, shoot_date: string): ShootDay {
  return { id, shoot_date } as ShootDay
}

describe('slate panel helpers', () => {
  it('carries camera setup and rolls over, but not what the shot is', () => {
    const prev = slate({ camera: 'A', lens: '50mm', stop: 'T2.8', sound_mode: 'mute', camera_roll: 'A014', shot_code: 'MS', description: 'Elena', shot_type: 'single', filter: '' })
    expect(carryOverFields(prev)).toEqual({ camera: 'A', lens: '50mm', stop: 'T2.8', sound_mode: 'mute', camera_roll: 'A014' })
    expect(carryOverFields(null)).toEqual({})
  })

  it('opens today, else the latest past day, else the first day', () => {
    const days = [day('b', '2026-10-08'), day('a', '2026-10-06')]
    expect(pickDefaultShootDay(days, '2026-10-08')?.id).toBe('b')
    expect(pickDefaultShootDay(days, '2026-10-07')?.id).toBe('a')
    expect(pickDefaultShootDay(days, '2026-10-01')?.id).toBe('a')
    expect(pickDefaultShootDay([], '2026-10-01')).toBeNull()
  })

  it('marks the selected take, else the latest', () => {
    const takes = [take({ id: 't1', take_number: 1 }), take({ id: 't3', take_number: 3 }), take({ id: 't2', take_number: 2 })]
    expect(takeToMark(takes, null)?.id).toBe('t3')
    expect(takeToMark(takes, 't1')?.id).toBe('t1')
    expect(takeToMark(takes, 'gone')?.id).toBe('t3')
    expect(takeToMark([], null)).toBeNull()
  })

  it('formats durations, picks the latest slate and lists prints', () => {
    expect(formatDuration(47_900)).toBe('0:47')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
    expect(formatDuration(null)).toBe('—')
    expect(latestSlate([slate({ id: 'x', created_at: '2026-10-07T10:00' }), slate({ id: 'y', created_at: '2026-10-07T11:00' })])?.id).toBe('y')
    expect(printedTakeNumbers([take({ take_number: 4, status: 'print' }), take({ take_number: 2, status: 'print' }), take({ take_number: 3, status: 'ng' })])).toEqual([2, 4])
  })

  it('summarises the camera setup on one line for the tablet header', () => {
    expect(
      slateSetupSummary(slate({ camera: 'A', lens: '50mm', stop: 'T2.8', filter: 'ND.6', camera_roll: 'A012', sound_roll: 'S004' }))
    ).toBe('A · 50mm · T2.8 · ND.6 · A012 / S004 · Sync')
    expect(slateSetupSummary(slate({ lens: '35mm', sound_roll: 'S002', sound_mode: 'wild_track' }))).toBe('35mm · S002 · Wild track')
    expect(slateSetupSummary(slate({ sound_mode: 'mute' }))).toBe('Mute')
  })

  it('labels a scene by interior/exterior and time of day', () => {
    expect(sceneTimeLabel('INT', 'NIGHT')).toBe('Int · Night')
    expect(sceneTimeLabel('INT/EXT', null)).toBe('Int/ext')
    expect(sceneTimeLabel(null, null)).toBe('')
  })
})
