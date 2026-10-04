// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(() => cleanup())
import { StripItem } from '@/features/schedule/strip-item'
import { renderStripboardDayView } from '@/test/stripboardDayViewHarness'
import { CalendarEventCardBody } from '@/features/schedule/calendar-page'
import { OUTSIDE_BLOCS_LABEL } from '@/lib/schedule/episodicScheduleDisplay'
import type {
  CalendarShootDayEvent,
  Episode,
  Scene,
  ShootDay,
  ShootDayUnit,
  ShootingBloc,
  Shot,
  StripboardStrip,
  Unit,
} from '@/lib/db/types'

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

function blocsById(entries: [string, string][]) {
  return new Map(
    entries.map(([id, name]) => [id, { id, production_id: 'p-1', name, ...soft } as ShootingBloc])
  )
}

function shootDay(over: Partial<ShootDay> = {}): ShootDay {
  return {
    id: 'day-1',
    production_id: 'p-1',
    shooting_bloc_id: 'bloc-1',
    shoot_date: '2025-06-01',
    day_number: 1,
    call_time: null,
    wrap_time: null,
    notes: null,
    weather_manual: null,
    meal_times_json: null,
    weather_json: null,
    parking_base_address: null,
    special_notes: null,
    hospital_name: null,
    hospital_address: null,
    police_station_name: null,
    police_station_address: null,
    ...soft,
    ...over,
  }
}

describe('episodic schedule UI', () => {
  it('day view header shows the shooting bloc label when episodic', () => {
    const unit: Unit = { id: 'u-1', production_id: 'p-1', name: 'Main Unit', ...soft }
    const sdu: ShootDayUnit = {
      id: 'sdu-1',
      shoot_day_id: 'day-1',
      unit_id: 'u-1',
      notes: null,
      is_locked: 0,
      movement_order_json: null,
      ...soft,
    }
    renderStripboardDayView({
      day: shootDay(),
      unit,
      shootDayUnit: sdu,
      isEpisodic: true,
      blocById: blocsById([['bloc-1', 'Production Block A']]),
    })
    expect(screen.getByText('Production Block A')).toBeTruthy()
  })

  it('day view has no bloc selector (bloc is not editable from the day)', () => {
    const unit: Unit = { id: 'u-1', production_id: 'p-1', name: 'Main Unit', ...soft }
    const sdu: ShootDayUnit = {
      id: 'sdu-1',
      shoot_day_id: 'day-1',
      unit_id: 'u-1',
      notes: null,
      is_locked: 0,
      movement_order_json: null,
      ...soft,
    }
    renderStripboardDayView({
      day: shootDay(),
      unit,
      shootDayUnit: sdu,
      isEpisodic: true,
      blocById: blocsById([['bloc-1', 'B']]),
    })
    expect(screen.queryByRole('combobox', { name: /bloc/i })).toBeNull()
  })

  it('day view omits the bloc label when not episodic', () => {
    const uniqueBloc = 'Only If Episodic Would Show'
    const unit: Unit = { id: 'u-1', production_id: 'p-1', name: 'Main Unit', ...soft }
    const sdu: ShootDayUnit = {
      id: 'sdu-1',
      shoot_day_id: 'day-1',
      unit_id: 'u-1',
      notes: null,
      is_locked: 0,
      movement_order_json: null,
      ...soft,
    }
    renderStripboardDayView({
      day: shootDay(),
      unit,
      shootDayUnit: sdu,
      isEpisodic: false,
      blocById: blocsById([['bloc-1', uniqueBloc]]),
    })
    expect(screen.queryByText(uniqueBloc)).toBeNull()
  })

  it('StripItem shows episode name from scene in episodic mode', () => {
    const scene: Scene = {
      id: 'sc-1',
      production_id: 'p-1',
      episode_id: 'ep-1',
      scene_number: '12',
      title: null,
      description: null,
      int_ext: null,
      day_night: null,
      page_eighths: null,
      location_id: null,
      duration_minutes: null,
      ...soft,
    }
    const shot: Shot = {
      id: 'sh-1',
      scene_id: 'sc-1',
      shot_number: '3',
      shot_description: 'Test',
      subject: null,
      shot_size: null,
      support: null,
      lens: null,
      duration_seconds: null,
      estimated_shoot_minutes: null,
      camera_movement: null,
      notes: null,
      ...soft,
    }
    const ep: Episode = {
      id: 'ep-1',
      production_id: 'p-1',
      name: 'Episode Forty-Two',
      sort_order: 0,
      ...soft,
    }
    const strip: StripboardStrip = {
      id: 'st-1',
      production_id: 'p-1',
      shoot_day_id: 'day-1',
      shoot_day_unit_id: 'sdu-1',
      strip_type: 'SHOT',
      scene_id: null,
      shot_id: 'sh-1',
      title: null,
      description: null,
      estimated_minutes: null,
      sort_index: 0,
      color_tag: null,
      strip_status: 'SCHEDULED',
      origin_location_id: null,
      destination_location_id: null,
      ...soft,
    }
    const episodeById = new Map<string, Episode>([[ep.id, ep]])
    render(
      <StripItem
        strip={strip}
        scenes={[scene]}
        shots={[shot]}
        isEpisodic
        episodeById={episodeById}
      />
    )
    expect(screen.getByText('Episode Forty-Two')).toBeTruthy()
  })

  it('calendar event card shows bloc when episodic', () => {
    const event: CalendarShootDayEvent = {
      shootDayId: 'd',
      shootDayUnitId: 'du',
      date: '2025-06-01',
      shootingBlocId: 'bloc-x',
      shootingBlocName: 'Principal Photography',
      unitId: 'u',
      unitName: 'Main Unit',
      unitKey: 'main',
      callTime: '09:00',
      lunchTime: null,
      wrapTime: '18:00',
      notes: null,
      primaryLocationName: 'Stage',
      primaryLocationId: 'l',
      shotCount: 2,
      estMinutes: 90,
    }
    render(<CalendarEventCardBody event={event} onClick={() => {}} isEpisodic />)
    expect(screen.getByText('Principal Photography')).toBeTruthy()
  })

  it('calendar event card omits bloc line when not episodic', () => {
    const blocName = 'Non Episodic Should Hide This Bloc Name'
    const event: CalendarShootDayEvent = {
      shootDayId: 'd',
      shootDayUnitId: 'du',
      date: '2025-06-01',
      shootingBlocId: 'bloc-x',
      shootingBlocName: blocName,
      unitId: 'u',
      unitName: 'Main Unit',
      unitKey: 'main',
      callTime: null,
      lunchTime: null,
      wrapTime: null,
      notes: null,
      primaryLocationName: null,
      primaryLocationId: null,
      shotCount: 0,
      estMinutes: 0,
    }
    render(<CalendarEventCardBody event={event} onClick={() => {}} isEpisodic={false} />)
    expect(screen.queryByText(blocName)).toBeNull()
  })

  it('day view shows one bloc label and distinct episode labels on strips (mixed episodes)', () => {
    const unit: Unit = { id: 'u-1', production_id: 'p-1', name: 'Main Unit', ...soft }
    const sdu: ShootDayUnit = {
      id: 'sdu-1',
      shoot_day_id: 'day-1',
      unit_id: 'u-1',
      notes: null,
      is_locked: 0,
      movement_order_json: null,
      ...soft,
    }
    const scenes: Scene[] = [
      {
        id: 'sc-a',
        production_id: 'p-1',
        episode_id: 'ep-a',
        scene_number: '1',
        title: null,
        description: null,
        int_ext: 'INT',
        day_night: 'DAY',
        page_eighths: null,
        location_id: null,
        duration_minutes: null,
        ...soft,
      },
      {
        id: 'sc-b',
        production_id: 'p-1',
        episode_id: 'ep-b',
        scene_number: '2',
        title: null,
        description: null,
        int_ext: 'EXT',
        day_night: 'DAY',
        page_eighths: null,
        location_id: null,
        duration_minutes: null,
        ...soft,
      },
    ]
    const strips: StripboardStrip[] = [
      {
        id: 'st-a',
        production_id: 'p-1',
        shoot_day_id: 'day-1',
        shoot_day_unit_id: 'sdu-1',
        strip_type: 'SCENE',
        scene_id: 'sc-a',
        shot_id: null,
        title: null,
        description: null,
        estimated_minutes: null,
        sort_index: 0,
        color_tag: null,
        strip_status: 'SCHEDULED',
        origin_location_id: null,
        destination_location_id: null,
        ...soft,
      },
      {
        id: 'st-b',
        production_id: 'p-1',
        shoot_day_id: 'day-1',
        shoot_day_unit_id: 'sdu-1',
        strip_type: 'SCENE',
        scene_id: 'sc-b',
        shot_id: null,
        title: null,
        description: null,
        estimated_minutes: null,
        sort_index: 1,
        color_tag: null,
        strip_status: 'SCHEDULED',
        origin_location_id: null,
        destination_location_id: null,
        ...soft,
      },
    ]
    const episodeById = new Map<string, Episode>([
      ['ep-a', { id: 'ep-a', production_id: 'p-1', name: 'Ep A', sort_order: 0, ...soft }],
      ['ep-b', { id: 'ep-b', production_id: 'p-1', name: 'Ep B', sort_order: 1, ...soft }],
    ])
    const bloc = 'Unified Bloc For Day'
    renderStripboardDayView({
      day: shootDay(),
      unit,
      shootDayUnit: sdu,
      strips,
      scenes,
      isEpisodic: true,
      blocById: blocsById([['bloc-1', bloc]]),
      episodeById,
    })
    expect(screen.getAllByText(bloc).length).toBe(1)
    expect(screen.getByText('Ep A')).toBeTruthy()
    expect(screen.getByText('Ep B')).toBeTruthy()
  })

  it('calendar event card shows outside blocs when day has no bloc', () => {
    const event: CalendarShootDayEvent = {
      shootDayId: 'd',
      shootDayUnitId: 'du',
      date: '2025-07-01',
      shootingBlocId: null,
      shootingBlocName: null,
      unitId: 'u',
      unitName: 'Main Unit',
      unitKey: 'main',
      callTime: null,
      lunchTime: null,
      wrapTime: null,
      notes: null,
      primaryLocationName: null,
      primaryLocationId: null,
      shotCount: 0,
      estMinutes: 0,
    }
    render(<CalendarEventCardBody event={event} onClick={() => {}} isEpisodic />)
    expect(screen.getByText(OUTSIDE_BLOCS_LABEL)).toBeTruthy()
  })
})
