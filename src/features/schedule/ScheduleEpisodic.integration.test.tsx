// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(() => cleanup())
import { DndContext } from '@dnd-kit/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import { StripboardDayColumn } from '@/features/schedule/stripboard-day-column'
import { StripItem } from '@/features/schedule/strip-item'
import { CalendarEventCardBody } from '@/features/schedule/calendar-page'
import { OUTSIDE_BLOCS_LABEL } from '@/lib/schedule/episodicScheduleDisplay'
import type {
  CalendarShootDayEvent,
  Episode,
  Scene,
  ShootDay,
  ShootDayUnit,
  Shot,
  StripboardStrip,
  Unit,
} from '@/lib/db/types'

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

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
  it('stripboard day column shows shooting bloc label when episodic', () => {
    const unit: Unit = { id: 'u-1', production_id: 'p-1', name: 'Main Unit', ...soft }
    const sdu: ShootDayUnit = {
      id: 'sdu-1',
      shoot_day_id: 'day-1',
      unit_id: 'u-1',
      notes: null,
      is_locked: 0,
      ...soft,
    }
    render(
      <DndContext onDragEnd={() => {}}>
        <StripboardDayColumn
          day={shootDay()}
          units={[unit]}
          dayUnits={[sdu]}
          stripsByUnit={[{ shootDayUnit: sdu, strips: [] }]}
          scenes={[]}
          shots={[]}
          estimatedShootMinutesByShotId={new Map()}
          columnId={(dayId, uid) => `col:${dayId}:${uid}`}
          isLocked={false}
          pageEighthsTarget={48}
          onSendToBoneyard={() => {}}
          isEpisodic
          shootingBlocLabel="Production Block A"
        />
      </DndContext>
    )
    expect(screen.getByText('Production Block A')).toBeTruthy()
  })

  it('stripboard day column has no bloc selector (non-editable bloc)', () => {
    const unit: Unit = { id: 'u-1', production_id: 'p-1', name: 'Main Unit', ...soft }
    const sdu: ShootDayUnit = {
      id: 'sdu-1',
      shoot_day_id: 'day-1',
      unit_id: 'u-1',
      notes: null,
      is_locked: 0,
      ...soft,
    }
    render(
      <DndContext onDragEnd={() => {}}>
        <StripboardDayColumn
          day={shootDay()}
          units={[unit]}
          dayUnits={[sdu]}
          stripsByUnit={[{ shootDayUnit: sdu, strips: [] }]}
          scenes={[]}
          shots={[]}
          estimatedShootMinutesByShotId={new Map()}
          columnId={(dayId, uid) => `col:${dayId}:${uid}`}
          isLocked={false}
          pageEighthsTarget={48}
          onSendToBoneyard={() => {}}
          isEpisodic
          shootingBlocLabel="B"
        />
      </DndContext>
    )
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('stripboard day column omits bloc label when not episodic', () => {
    const uniqueBloc = 'Only If Episodic Would Show'
    const unit: Unit = { id: 'u-1', production_id: 'p-1', name: 'Main Unit', ...soft }
    const sdu: ShootDayUnit = {
      id: 'sdu-1',
      shoot_day_id: 'day-1',
      unit_id: 'u-1',
      notes: null,
      is_locked: 0,
      ...soft,
    }
    render(
      <DndContext onDragEnd={() => {}}>
        <StripboardDayColumn
          day={shootDay()}
          units={[unit]}
          dayUnits={[sdu]}
          stripsByUnit={[{ shootDayUnit: sdu, strips: [] }]}
          scenes={[]}
          shots={[]}
          estimatedShootMinutesByShotId={new Map()}
          columnId={(dayId, uid) => `col:${dayId}:${uid}`}
          isLocked={false}
          pageEighthsTarget={48}
          onSendToBoneyard={() => {}}
          isEpisodic={false}
          shootingBlocLabel={uniqueBloc}
        />
      </DndContext>
    )
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

  it('same day column shows one bloc label and distinct episode labels on strips (mixed episodes)', () => {
    const unit: Unit = { id: 'u-1', production_id: 'p-1', name: 'Main Unit', ...soft }
    const sdu: ShootDayUnit = {
      id: 'sdu-1',
      shoot_day_id: 'day-1',
      unit_id: 'u-1',
      notes: null,
      is_locked: 0,
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
    render(
      <TooltipProvider>
        <DndContext onDragEnd={() => {}}>
          <StripboardDayColumn
            day={shootDay()}
            units={[unit]}
            dayUnits={[sdu]}
            stripsByUnit={[{ shootDayUnit: sdu, strips }]}
            scenes={scenes}
            shots={[]}
            estimatedShootMinutesByShotId={new Map()}
            columnId={(dayId, uid) => `col:${dayId}:${uid}`}
            isLocked={false}
            pageEighthsTarget={48}
            onSendToBoneyard={() => {}}
            isEpisodic
            shootingBlocLabel={bloc}
            episodeById={episodeById}
          />
        </DndContext>
      </TooltipProvider>
    )
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
