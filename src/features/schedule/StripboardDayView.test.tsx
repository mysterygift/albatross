// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import { StripboardDayView, type StripboardDayViewProps } from './stripboard-day-view'
import type { Scene, Shot, ShootDay, ShootDayUnit, StripboardStrip, Unit } from '@/lib/db/types'

const soft = { created_at: 't', updated_at: 't', deleted_at: null }

const days = [
  { id: 'd1', production_id: 'p', shoot_date: '2026-10-05', day_number: 1, shooting_bloc_id: null, ...soft },
  { id: 'd2', production_id: 'p', shoot_date: '2026-10-06', day_number: 2, shooting_bloc_id: null, ...soft },
] as unknown as ShootDay[]

const units = [
  { id: 'u-main', production_id: 'p', name: 'Main Unit', ...soft },
  { id: 'u-second', production_id: 'p', name: 'Second Unit', ...soft },
] as unknown as Unit[]

const dayUnits = [
  { id: 'du-main', shoot_day_id: 'd1', unit_id: 'u-main', is_locked: 0, ...soft },
  { id: 'du-second', shoot_day_id: 'd1', unit_id: 'u-second', is_locked: 1, ...soft },
] as unknown as ShootDayUnit[]

const scenes = [
  { id: 's1', production_id: 'p', scene_number: '12', int_ext: 'INT', day_night: 'DAY', page_eighths: 4, location_id: 'loc', duration_minutes: null, episode_id: null, title: null, description: null, ...soft },
  { id: 's2', production_id: 'p', scene_number: '14', int_ext: 'EXT', day_night: 'NIGHT', page_eighths: 2, location_id: null, duration_minutes: null, episode_id: null, title: null, description: null, ...soft },
] as unknown as Scene[]

const shots = [
  { id: 'sh1', scene_id: 's1', shot_number: '1A', shot_description: 'Wide on the kitchen', subject: null, estimated_shoot_minutes: 30, ...soft },
  { id: 'sh2', scene_id: 's2', shot_number: '2', shot_description: null, subject: 'Close on the door', estimated_shoot_minutes: 20, ...soft },
] as unknown as Shot[]

const strip = (over: Partial<StripboardStrip> & { id: string }): StripboardStrip =>
  ({
    production_id: 'p',
    shoot_day_id: 'd1',
    shoot_day_unit_id: 'du-main',
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
    ...soft,
    ...over,
  }) as StripboardStrip

function makeProps(overrides: Partial<StripboardDayViewProps> = {}): StripboardDayViewProps {
  const stripsByDayUnit = new Map<string, StripboardStrip[]>([
    ['d1:du-main', [
      strip({ id: 'a', shot_id: 'sh1', sort_index: 1000 }),
      strip({ id: 'call', strip_type: 'CALL', title: '07:00', sort_index: 500 }),
    ]],
    ['d1:du-second', [strip({ id: 'b', shoot_day_unit_id: 'du-second', shot_id: 'sh2' })]],
  ])
  return {
    days,
    day: days[0],
    onSelectDay: vi.fn(),
    dayUnitsByDayId: new Map([['d1', dayUnits]]),
    units,
    stripsByDayUnit,
    columnId: (d, u) => `col:${d}:${u}`,
    scenes,
    shots,
    locations: [{ id: 'loc', name: 'Kitchen' } as never],
    estimatedShootMinutesByShotId: new Map([['sh1', 30], ['sh2', 20]]),
    castPersonIdsByShotId: new Map([['sh1', ['p1', 'p2']]]),
    isEpisodic: false,
    pageEighthsTarget: 48,
    columnFilters: {},
    onColumnFilterChange: vi.fn(),
    onToggleLock: vi.fn(),
    onUpdateStripEstimatedMinutes: vi.fn(),
    onUpdateCallWrapTime: vi.fn(),
    onUpdateMoveStrip: vi.fn(),
    onSendToBoneyard: vi.fn(),
    onDeleteStrip: vi.fn(),
    ...overrides,
  }
}

function renderView(props: StripboardDayViewProps) {
  return render(
    <TooltipProvider>
      <DndContext>
        <StripboardDayView {...props} />
      </DndContext>
    </TooltipProvider>
  )
}

describe('StripboardDayView', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows one table per unit, with shot rows and non-shot rows', () => {
    renderView(makeProps())
    const mainHeading = screen.getByRole('heading', { name: 'Main Unit' })
    const mainTable = mainHeading.closest('section')!.querySelector('table')!
    const mainRows = within(mainTable).getAllByRole('row').slice(1) // skip header
    expect(mainRows).toHaveLength(2)
    // Rows follow sort_index: the CALL (500) sits above the shot (1000).
    expect(within(mainRows[0]!).getByText('CALL'))
    expect(within(mainRows[1]!).getByText('12'))
    expect(within(mainRows[1]!).getByText('1A'))
    expect(within(mainRows[1]!).getByText('Wide on the kitchen'))
    expect(within(mainRows[1]!).getByText('4/8'))
    expect(within(mainRows[1]!).getByText('2')) // cast count

    const secondTable = screen.getByRole('heading', { name: /Second Unit/ }).closest('section')!.querySelector('table')!
    expect(within(secondTable).getByText('Close on the door'))
  })

  it('marks the locked unit and offers an unlock control', () => {
    renderView(makeProps())
    expect(screen.getByRole('button', { name: 'Unlock Second Unit' }))
    expect(screen.getByRole('button', { name: 'Lock Main Unit' }))
  })

  it('navigates days with the arrows and the day chips', () => {
    const onSelectDay = vi.fn()
    renderView(makeProps({ onSelectDay, day: days[0] }))
    expect((screen.getByRole('button', { name: 'Previous shoot day' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next shoot day' }))
    expect(onSelectDay).toHaveBeenCalledWith('d2')
    fireEvent.click(screen.getByRole('button', { name: /2026-10-06/ }))
    expect(onSelectDay).toHaveBeenLastCalledWith('d2')
  })

  it('shows the empty state when there is no day to show', () => {
    renderView(makeProps({ day: null, days: [] }))
    expect(screen.getByText(/No shoot days to show/))
  })

  it('adds an Episode column for episodic productions', () => {
    renderView(makeProps({ isEpisodic: true, episodeById: new Map() }))
    expect(screen.getAllByRole('columnheader', { name: 'Episode' }).length).toBeGreaterThan(0)
  })
})
