import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Film, Truck, Megaphone, Utensils, Moon, StickyNote } from 'lucide-react'
import type { Episode, Location, Scene, Shot, StripboardStrip, StripType } from '@/lib/db/types'
import type { UpdateStripData } from '@/lib/db/repositories/stripboard-strips'
import { episodeLabelForSceneRow } from '@/lib/schedule/episodicScheduleDisplay'
import { sceneScheduleLabel } from '@/lib/schedule/sceneDisplay'
import { formatMoveStripRouteLabel } from './strip-item'
import { StripActions } from './strip-actions'

const STRIP_ICONS: Record<StripType, typeof Film> = {
  SHOT: Film,
  SCENE: Film,
  MOVE: Truck,
  CALL: Megaphone,
  LUNCH: Utensils,
  WRAP: Moon,
  NOTE: StickyNote,
}

export type StripTableRowProps = {
  strip: StripboardStrip
  scene: Scene | null
  shot: Shot | null
  locations: Location[]
  /** SHOT strips: shot estimate used when the strip has no override. */
  estimatedMinutesDefault?: number
  /** SHOT strips: number of cast members assigned to the shot. */
  castCount?: number
  isEpisodic?: boolean
  episodeById?: Map<string, Episode>
  disabled?: boolean
  /** Total table columns, used to span non-shot strips across the middle cells. */
  columnCount: number
  scheduledCallCountOnDay?: number
  scheduledWrapCountOnDay?: number
  onUpdateEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  onUpdateCallWrapTime?: (stripId: string, time: string) => void
  onUpdateMoveStrip?: (stripId: string, data: UpdateStripData) => void
  onSendToBoneyard?: (strip: StripboardStrip) => void
  onDeleteStrip?: (strip: StripboardStrip) => void
}

const cellBase = 'px-2 py-2 align-middle'

/**
 * One stripboard row in the day table. Drag data matches StripItem (`type: 'strip'`),
 * so the page's drag handler reorders or moves it exactly like a card. Only the grip
 * cell starts a drag, so the cells stay clickable and selectable.
 */
export function StripTableRow({
  strip,
  scene,
  shot,
  locations,
  estimatedMinutesDefault,
  castCount,
  isEpisodic,
  episodeById,
  disabled,
  columnCount,
  scheduledCallCountOnDay,
  scheduledWrapCountOnDay,
  onUpdateEstimatedMinutes,
  onUpdateCallWrapTime,
  onUpdateMoveStrip,
  onSendToBoneyard,
  onDeleteStrip,
}: StripTableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: strip.id,
    data: { type: 'strip' as const, strip },
    disabled,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const Icon = STRIP_ICONS[strip.strip_type]
  const locationName = scene?.location_id
    ? locations.find((l) => l.id === scene.location_id)?.name ?? null
    : null
  const episodeLabel =
    isEpisodic && episodeById && scene && (strip.strip_type === 'SHOT' || strip.strip_type === 'SCENE')
      ? episodeLabelForSceneRow({ scene, episodeById })
      : null
  const estMinutes = strip.estimated_minutes ?? estimatedMinutesDefault

  const actionsCell = (
    <td className={`${cellBase} w-px whitespace-nowrap text-right`}>
      <div className="inline-flex items-center justify-end gap-0.5">
        <StripActions
          strip={strip}
          estimatedMinutesDefault={estimatedMinutesDefault}
          onUpdateEstimatedMinutes={onUpdateEstimatedMinutes}
          onUpdateCallWrapTime={onUpdateCallWrapTime}
          onUpdateMoveStrip={onUpdateMoveStrip}
          locations={locations}
          disabled={disabled}
          onSendToBoneyard={onSendToBoneyard}
          onDeleteStrip={onDeleteStrip}
          scheduledCallCountOnDay={scheduledCallCountOnDay}
          scheduledWrapCountOnDay={scheduledWrapCountOnDay}
        />
      </div>
    </td>
  )

  const gripCell = (
    <td className={`${cellBase} w-8`}>
      <button
        type="button"
        aria-label={disabled ? 'Locked' : 'Drag to reorder'}
        disabled={disabled}
        className={`text-muted-foreground ${disabled ? 'opacity-40' : 'cursor-grab active:cursor-grabbing hover:text-foreground'}`}
        {...(disabled ? {} : { ...attributes, ...listeners })}
      >
        <GripVertical className="size-4" />
      </button>
    </td>
  )

  if (strip.strip_type !== 'SHOT') {
    const content =
      strip.strip_type === 'MOVE'
        ? formatMoveStripRouteLabel(strip, new Map(locations.map((l) => [l.id, l.name])))
        : strip.strip_type === 'SCENE' && scene
          ? `Scene ${scene.scene_number} · ${scene.title ?? sceneScheduleLabel(scene, locationName)}`
          : strip.title
    return (
      <tr
        ref={setNodeRef}
        style={style}
        className={`border-t border-border bg-card ${isDragging ? 'opacity-50' : ''}`}
      >
        {gripCell}
        <td colSpan={columnCount - 2} className={`${cellBase} text-sm`}>
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-primary" />
            <span className="shrink-0 font-medium">{strip.strip_type === 'MOVE' ? 'MOVE' : strip.strip_type}</span>
            {content && <span className="min-w-0 truncate text-muted-foreground">{content}</span>}
            {episodeLabel && <span className="shrink-0 text-xs text-muted-foreground">{episodeLabel}</span>}
          </div>
        </td>
        {actionsCell}
      </tr>
    )
  }

  const description = shot?.shot_description ?? shot?.subject ?? '(No shot description)'
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-t border-border bg-card text-sm hover:bg-muted/30 ${isDragging ? 'opacity-50' : ''}`}
    >
      {gripCell}
      <td className={`${cellBase} font-medium tabular-nums`}>{scene?.scene_number ?? '—'}</td>
      <td className={`${cellBase} tabular-nums`}>{shot?.shot_number ?? '—'}</td>
      <td className={`${cellBase} max-w-[280px]`}>
        <span className="block truncate text-muted-foreground" title={description}>
          {description}
        </span>
      </td>
      <td className={cellBase}>{scene?.int_ext ?? '—'}</td>
      <td className={cellBase}>{scene?.day_night ?? '—'}</td>
      <td className={`${cellBase} max-w-[180px]`}>
        <span className="block truncate" title={locationName ?? undefined}>
          {locationName ?? <span className="text-destructive">No location</span>}
        </span>
      </td>
      <td className={`${cellBase} tabular-nums`}>{scene?.page_eighths != null ? `${scene.page_eighths}/8` : '—'}</td>
      <td className={`${cellBase} tabular-nums`}>{castCount != null && castCount > 0 ? castCount : '—'}</td>
      <td className={`${cellBase} tabular-nums`}>{estMinutes != null ? `${estMinutes}` : '—'}</td>
      {isEpisodic && (
        <td className={`${cellBase} max-w-[140px]`}>
          <span className="block truncate" title={episodeLabel ?? undefined}>
            {episodeLabel ?? ''}
          </span>
        </td>
      )}
      {actionsCell}
    </tr>
  )
}
