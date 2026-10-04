import { useDraggable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { pillColorStyle } from './bookingViewShared'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type SpanDragKind = 'move' | 'resize-left' | 'resize-right'

/**
 * A single contiguous booking pill, used by both the Calendar View and the Timeline View. The
 * body is draggable to move the whole span; the left/right edges are draggable to resize.
 * Corners are squared off where the span continues into an adjacent week or month.
 *
 * The fill is always the booking's colour code. Shape, border, shadow and type come from the
 * active theme through `data-slot="booking-pill"`; Albatross Mint uses the classes below.
 */
export function BookingSpanPill({
  spanKey,
  weekIndex,
  label,
  color,
  textColor,
  continuesLeft,
  continuesRight,
  tooltip,
  onOpen,
  disabled,
}: {
  spanKey: string
  weekIndex: number
  label: string
  color: string
  textColor: string
  continuesLeft: boolean
  continuesRight: boolean
  tooltip: ReactNode
  onOpen: () => void
  disabled?: boolean
}) {
  const {
    setNodeRef: moveRef,
    listeners: moveListeners,
    attributes: moveAttributes,
    isDragging,
  } = useDraggable({
    id: `move:${spanKey}:w${weekIndex}`,
    data: { kind: 'move' satisfies SpanDragKind, spanKey },
    disabled,
  })
  const {
    setNodeRef: leftRef,
    listeners: leftListeners,
    attributes: leftAttributes,
  } = useDraggable({
    id: `resize-left:${spanKey}:w${weekIndex}`,
    data: { kind: 'resize-left' satisfies SpanDragKind, spanKey },
    disabled,
  })
  const {
    setNodeRef: rightRef,
    listeners: rightListeners,
    attributes: rightAttributes,
  } = useDraggable({
    id: `resize-right:${spanKey}:w${weekIndex}`,
    data: { kind: 'resize-right' satisfies SpanDragKind, spanKey },
    disabled,
  })

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-slot="booking-pill"
          data-continues-left={continuesLeft}
          data-continues-right={continuesRight}
          className={cn(
            'relative h-full min-w-0 select-none overflow-hidden rounded-md bg-(--pill-color) text-(--pill-text) ring-1 ring-inset ring-black/10',
            continuesLeft && 'rounded-l-none',
            continuesRight && 'rounded-r-none',
            isDragging && 'opacity-40'
          )}
          style={pillColorStyle(color, textColor)}
        >
          <button
            type="button"
            ref={moveRef}
            {...moveListeners}
            {...moveAttributes}
            onClick={onOpen}
            className={cn(
              'flex h-full w-full items-center overflow-hidden px-2 text-left text-xs font-medium leading-none',
              'cursor-grab touch-none active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
            )}
          >
            <span className="truncate">{label}</span>
          </button>

          {!continuesLeft && (
            <div
              ref={leftRef}
              {...leftListeners}
              {...leftAttributes}
              aria-label="Resize booking start"
              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize touch-none hover:bg-black/15 dark:hover:bg-white/20"
            />
          )}
          {!continuesRight && (
            <div
              ref={rightRef}
              {...rightListeners}
              {...rightAttributes}
              aria-label="Resize booking end"
              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize touch-none hover:bg-black/15 dark:hover:bg-white/20"
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[240px] bg-popover text-popover-foreground border border-border shadow-md"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

/** The floating copy shown under the cursor while a pill is being moved. */
export function BookingPillDragPreview({ label, color, textColor }: { label: string; color: string; textColor: string }) {
  return (
    <div
      data-slot="booking-pill"
      className="flex h-6 items-center overflow-hidden rounded-md bg-(--pill-color) px-2 text-xs font-medium text-(--pill-text) shadow-lg ring-1 ring-border"
      style={pillColorStyle(color, textColor)}
    >
      <span className="truncate">{label}</span>
    </div>
  )
}
