import { render } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import { StripboardDayView, type StripboardDayViewProps } from '@/features/schedule/stripboard-day-view'
import type {
  Episode,
  Scene,
  ShootDay,
  ShootDayUnit,
  ShootingBloc,
  Shot,
  StripboardStrip,
  Unit,
} from '@/lib/db/types'

/**
 * Renders the Day view for one day, one unit, with the given strips. Callbacks are no-ops.
 * Tests that only care about header labels or row content use this instead of repeating props.
 */
export function renderStripboardDayView({
  day,
  unit,
  shootDayUnit,
  strips = [],
  scenes = [],
  shots = [],
  isEpisodic = false,
  blocById,
  episodeById,
}: {
  day: ShootDay
  unit: Unit
  shootDayUnit: ShootDayUnit
  strips?: StripboardStrip[]
  scenes?: Scene[]
  shots?: Shot[]
  isEpisodic?: boolean
  blocById?: Map<string, ShootingBloc>
  episodeById?: Map<string, Episode>
}) {
  const props: StripboardDayViewProps = {
    days: [day],
    day,
    onSelectDay: () => {},
    dayUnitsByDayId: new Map([[day.id, [shootDayUnit]]]),
    units: [unit],
    stripsByDayUnit: new Map([[`${day.id}:${shootDayUnit.id}`, strips]]),
    columnId: (dayId, unitId) => `col:${dayId}:${unitId}`,
    scenes,
    shots,
    locations: [],
    estimatedShootMinutesByShotId: new Map(),
    castPersonIdsByShotId: new Map(),
    isEpisodic,
    blocById,
    episodeById,
    pageEighthsTarget: 48,
    columnFilters: {},
    onColumnFilterChange: () => {},
    onToggleLock: () => {},
    onUpdateStripEstimatedMinutes: () => {},
    onUpdateCallWrapTime: () => {},
    onUpdateMoveStrip: () => {},
    onSendToBoneyard: () => {},
    onDeleteStrip: () => {},
  }
  return render(
    <TooltipProvider>
      <DndContext onDragEnd={() => {}}>
        <StripboardDayView {...props} />
      </DndContext>
    </TooltipProvider>
  )
}
