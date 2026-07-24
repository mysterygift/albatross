import { useDraggable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type SpanDragKind = 'move' | 'resize-left' | 'resize-right'

/**
 * A single contiguous booking pill on the calendar. The body is draggable to
 * move the whole span; the left/right edges are draggable to resize. Corners are
 * squared off where the span continues into an adjacent week or month.
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
          className={cn(
            'relative h-full min-w-0 select-none',
            continuesLeft ? 'rounded-l-none' : 'rounded-l-md',
            continuesRight ? 'rounded-r-none' : 'rounded-r-md',
            isDragging && 'opacity-40'
          )}
          style={{
            backgroundColor: color,
            color: textColor,
            backgroundImage:
              'linear-gradient(to bottom, rgba(0,0,0,0) 45%, rgba(0,0,0,0.28) 100%)',
          }}
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
              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize touch-none rounded-l-md hover:bg-black/15 dark:hover:bg-white/20"
            />
          )}
          {!continuesRight && (
            <div
              ref={rightRef}
              {...rightListeners}
              {...rightAttributes}
              aria-label="Resize booking end"
              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize touch-none rounded-r-md hover:bg-black/15 dark:hover:bg-white/20"
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
