import { describe, it, expect } from 'vitest'
import type { Episode, Scene, Shot, ShootingBloc, StripboardStrip } from '@/lib/db/types'
import {
  OUTSIDE_BLOCS_LABEL,
  calendarShootingBlocDisplay,
  episodeLabelForSceneRow,
  orderedDistinctEpisodeNames,
  resolveSceneIdForStrip,
  shootDayMatchesBlocFilter,
  shootingBlocLabelFromAssociation,
} from './episodicScheduleDisplay'

describe('episodicScheduleDisplay', () => {
  it('shootingBlocLabelFromAssociation returns Outside blocs when id null', () => {
    expect(shootingBlocLabelFromAssociation(null, new Map())).toBe(OUTSIDE_BLOCS_LABEL)
  })

  it('shootingBlocLabelFromAssociation uses bloc name when present', () => {
    const b: ShootingBloc = {
      id: 'b1',
      production_id: 'p',
      name: 'Block A',
      start_date: '2025-01-01',
      end_date: '2025-01-10',
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    }
    const m = new Map([[b.id, b]])
    expect(shootingBlocLabelFromAssociation('b1', m)).toBe('Block A')
  })

  it('calendarShootingBlocDisplay prefers joined name', () => {
    expect(calendarShootingBlocDisplay('x', 'Joined')).toBe('Joined')
    expect(calendarShootingBlocDisplay(null, 'ignored')).toBe(OUTSIDE_BLOCS_LABEL)
  })

  it('shootDayMatchesBlocFilter', () => {
    expect(shootDayMatchesBlocFilter('a', 'all')).toBe(true)
    expect(shootDayMatchesBlocFilter(null, 'unassigned')).toBe(true)
    expect(shootDayMatchesBlocFilter('a', 'unassigned')).toBe(false)
    expect(shootDayMatchesBlocFilter('a', 'a')).toBe(true)
    expect(shootDayMatchesBlocFilter('b', 'a')).toBe(false)
  })

  it('orderedDistinctEpisodeNames sorts and dedupes', () => {
    const strips: StripboardStrip[] = [
      {
        id: 's1',
        production_id: 'p',
        shoot_day_id: 'd',
        shoot_day_unit_id: 'u',
        strip_type: 'SHOT',
        scene_id: null,
        shot_id: 'sh1',
        title: null,
        description: null,
        estimated_minutes: null,
        sort_index: 0,
        color_tag: null,
        strip_status: 'SCHEDULED',
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
      {
        id: 's2',
        production_id: 'p',
        shoot_day_id: 'd',
        shoot_day_unit_id: 'u',
        strip_type: 'SHOT',
        scene_id: null,
        shot_id: 'sh2',
        title: null,
        description: null,
        estimated_minutes: null,
        sort_index: 1,
        color_tag: null,
        strip_status: 'SCHEDULED',
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
    ]
    const shotById = new Map<string, Shot>([
      ['sh1', { id: 'sh1', scene_id: 'c1', shot_number: '1', description: null, shot_description: null, subject: null, action_description: null, shot_size: null, support: null, lens: null, duration_seconds: null, estimated_shoot_minutes: null, camera_movement: null, notes: null, created_at: 't', updated_at: 't', deleted_at: null }],
      ['sh2', { id: 'sh2', scene_id: 'c2', shot_number: '2', description: null, shot_description: null, subject: null, action_description: null, shot_size: null, support: null, lens: null, duration_seconds: null, estimated_shoot_minutes: null, camera_movement: null, notes: null, created_at: 't', updated_at: 't', deleted_at: null }],
    ])
    const sceneById = new Map<string, Scene>([
      ['c1', { id: 'c1', production_id: 'p', episode_id: 'e2', scene_number: '1', heading: null, title: null, description: null, int_ext: null, day_night: null, page_eighths: null, location_id: null, duration_minutes: null, created_at: 't', updated_at: 't', deleted_at: null }],
      ['c2', { id: 'c2', production_id: 'p', episode_id: 'e1', scene_number: '2', heading: null, title: null, description: null, int_ext: null, day_night: null, page_eighths: null, location_id: null, duration_minutes: null, created_at: 't', updated_at: 't', deleted_at: null }],
    ])
    const episodeById = new Map<string, Episode>([
      ['e1', { id: 'e1', production_id: 'p', name: 'Alpha', sort_order: 0, created_at: 't', updated_at: 't', deleted_at: null }],
      ['e2', { id: 'e2', production_id: 'p', name: 'Beta', sort_order: 1, created_at: 't', updated_at: 't', deleted_at: null }],
    ])
    expect(
      orderedDistinctEpisodeNames({ strips, shotById, sceneById, episodeById })
    ).toEqual(['Alpha', 'Beta'])
  })

  it('resolveSceneIdForStrip matches strip-item precedence', () => {
    const shotById = new Map([['sh1', { scene_id: 'sc-from-shot' }]])
    const strip: Pick<StripboardStrip, 'scene_id' | 'shot_id' | 'strip_type'> = {
      strip_type: 'SHOT',
      shot_id: 'sh1',
      scene_id: 'legacy',
    }
    expect(resolveSceneIdForStrip(strip, shotById)).toBe('sc-from-shot')
  })

  it('episodeLabelForSceneRow degrades without assignment', () => {
    const episodeById = new Map<string, Episode>()
    expect(
      episodeLabelForSceneRow({
        scene: { episode_id: null } as Scene,
        episodeById,
      })
    ).toBe('No episode')
  })
})
