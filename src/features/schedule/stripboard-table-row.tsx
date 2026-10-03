import type { ReactNode } from 'react'
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

const cellBase = 'px-2 py-2 align-middle'

/** Size of a day-table row at drag start, so its drag preview can match the table exactly. */
export type DayTablePreviewSize = { width: number; columnWidths: number[] }

/**
 * Measures the day-table row for a strip, plus its table's column widths. Returns null
 * for strips that aren't rendered as table rows (board cards, boneyard), which keep the card preview.
 */
export function measureStripTableRow(stripId: string): DayTablePreviewSize | null {
  const row = document.querySelector<HTMLTableRowElement>(`tr[data-strip-row="${stripId}"]`)
  const table = row?.closest('table')
  if (!row || !table) return null
  return {
    width: row.getBoundingClientRect().width,
    columnWidths: Array.from(table.querySelectorAll('thead th'), (th) => th.getBoundingClientRect().width),
  }
}

type StripTableRowDisplayProps = {
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
  /** Total table columns, used to span non-shot strips across the middle cells. */
  columnCount: number
}

/**
 * The cells of one stripboard row, without the `<tr>` or drag hook. Shared by the live
 * row and the drag preview, so the two can't drift apart.
 */
function StripTableRowCells({
  strip,
  scene,
  shot,
  locations,
  estimatedMinutesDefault,
  castCount,
  isEpisodic,
  episodeById,
  columnCount,
  grip,
  actions,
}: StripTableRowDisplayProps & { grip: ReactNode; actions: ReactNode }) {
  const Icon = STRIP_ICONS[strip.strip_type]
  const locationName = scene?.location_id
    ? locations.find((l) => l.id === scene.location_id)?.name ?? null
    : null
  const episodeLabel =
    isEpisodic && episodeById && scene && (strip.strip_type === 'SHOT' || strip.strip_type === 'SCENE')
      ? episodeLabelForSceneRow({ scene, episodeById })
      : null
  const estMinutes = strip.estimated_minutes ?? estimatedMinutesDefault

  const gripCell = <td className={`${cellBase} w-8`}>{grip}</td>
  const actionsCell = (
    <td className={`${cellBase} w-px whitespace-nowrap text-right`}>{actions}</td>
  )

  if (strip.strip_type !== 'SHOT') {
    const content =
      strip.strip_type === 'MOVE'
        ? formatMoveStripRouteLabel(strip, new Map(locations.map((l) => [l.id, l.name])))
        : strip.strip_type === 'SCENE' && scene
          ? `Scene ${scene.scene_number} · ${scene.title ?? sceneScheduleLabel(scene, locationName)}`
          : strip.title
    return (
      <>
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
      </>
    )
  }

  const description = shot?.shot_description ?? shot?.subject ?? '(No shot description)'
  return (
    <>
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
    </>
  )
}

export type StripTableRowProps = StripTableRowDisplayProps & {
  /** Locked units: rows can't be dragged or edited. */
  disabled?: boolean
  scheduledCallCountOnDay?: number
  scheduledWrapCountOnDay?: number
  onUpdateEstimatedMinutes?: (stripId: string, minutes: number | null) => void
  onUpdateCallWrapTime?: (stripId: string, time: string) => void
  onUpdateMoveStrip?: (stripId: string, data: UpdateStripData) => void
  onSendToBoneyard?: (strip: StripboardStrip) => void
  onDeleteStrip?: (strip: StripboardStrip) => void
}

/**
 * One stripboard row in the day table. Drag data matches StripItem (`type: 'strip'`),
 * so the page's drag handler reorders or moves it exactly like a card. Only the grip
 * cell starts a drag, so the cells stay clickable and selectable.
 */
export function StripTableRow({
  disabled,
  scheduledCallCountOnDay,
  scheduledWrapCountOnDay,
  onUpdateEstimatedMinutes,
  onUpdateCallWrapTime,
  onUpdateMoveStrip,
  onSendToBoneyard,
  onDeleteStrip,
  ...display
}: StripTableRowProps) {
  const { strip, estimatedMinutesDefault } = display
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: strip.id,
    data: { type: 'strip' as const, strip },
    disabled,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  const grip = (
    <button
      type="button"
      aria-label={disabled ? 'Locked' : 'Drag to reorder'}
      disabled={disabled}
      className={`text-muted-foreground ${disabled ? 'opacity-40' : 'cursor-grab active:cursor-grabbing hover:text-foreground'}`}
      {...(disabled ? {} : { ...attributes, ...listeners })}
    >
      <GripVertical className="size-4" />
    </button>
  )

  const actions = (
    <div className="inline-flex items-center justify-end gap-0.5">
      <StripActions
        strip={strip}
        estimatedMinutesDefault={estimatedMinutesDefault}
        onUpdateEstimatedMinutes={onUpdateEstimatedMinutes}
        onUpdateCallWrapTime={onUpdateCallWrapTime}
        onUpdateMoveStrip={onUpdateMoveStrip}
        locations={display.locations}
        disabled={disabled}
        onSendToBoneyard={onSendToBoneyard}
        onDeleteStrip={onDeleteStrip}
        scheduledCallCountOnDay={scheduledCallCountOnDay}
        scheduledWrapCountOnDay={scheduledWrapCountOnDay}
      />
    </div>
  )

  return (
    <tr
      ref={setNodeRef}
      style={style}
      data-strip-row={strip.id}
      className={`border-t border-border bg-card text-sm ${strip.strip_type === 'SHOT' ? 'hover:bg-muted/30' : ''} ${isDragging ? 'opacity-50' : ''}`}
    >
      <StripTableRowCells {...display} grip={grip} actions={actions} />
    </tr>
  )
}

/**
 * Drag preview for a day-table row. Renders the same cells in a table laid out with the
 * source row's measured width and column widths, so the preview is the same size as the row.
 * Actions are left out, and the preview doesn't register as a sortable.
 */
export function StripTableDragPreview({
  preview,
  ...display
}: StripTableRowDisplayProps & { preview: DayTablePreviewSize }) {
  return (
    <table
      className="border-collapse rounded-md bg-card text-left shadow-lg ring-2 ring-primary"
      style={{ width: preview.width, tableLayout: 'fixed' }}
    >
      <colgroup>
        {preview.columnWidths.map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <tbody>
        <tr className="bg-card text-sm">
          <StripTableRowCells
            {...display}
            grip={<GripVertical className="size-4 text-primary" />}
            actions={null}
          />
        </tr>
      </tbody>
    </table>
  )
}
