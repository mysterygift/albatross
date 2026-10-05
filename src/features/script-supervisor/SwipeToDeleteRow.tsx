import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Width of the revealed Delete action. */
const ACTION_WIDTH_PX = 96;
/** Movement before a press is classified as a horizontal swipe (or left alone as a tap / scroll). */
const LOCK_DISTANCE_PX = 8;
/** Swiping this far (or flicking at FLICK_VELOCITY) opens the action on release. */
const OPEN_DISTANCE_PX = ACTION_WIDTH_PX / 3;
const FLICK_VELOCITY = 0.4
/** A flick must still travel this far, so a twitch does not count. */
const MIN_FLICK_DISTANCE_PX = 24;

type Drag = {
  x0: number;
  y0: number;
  t0: number;
  base: number;
  locked: boolean;
};

/**
 * A list row that slides left to reveal a Delete action (touch, pen or mouse drag). The parent owns
 * `open` so only one row is revealed at a time. While a row is open, tapping it closes it instead of
 * running its own click handler.
 */
export function SwipeToDeleteRow({
  open,
  onOpenChange,
  onDelete,
  disabled = false,
  deleteLabel,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  disabled?: boolean;
  deleteLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  // Live offset (px, 0..ACTION_WIDTH_PX) while a finger is down; null when settled.
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const offset = dragOffset ?? (open ? ACTION_WIDTH_PX : 0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = {
      x0: e.clientX,
      y0: e.clientY,
      t0: e.timeStamp,
      base: open ? ACTION_WIDTH_PX : 0,
      locked: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.locked) {
      if (Math.abs(dx) < LOCK_DISTANCE_PX && Math.abs(dy) < LOCK_DISTANCE_PX)
        return;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // vertical: let the list scroll
        return;
      }
      d.locked = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setDragOffset(Math.min(ACTION_WIDTH_PX, Math.max(0, d.base - dx)));
  };

  const finish = (
    e: React.PointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.locked) return;
    suppressClick.current = true;
    const dx = e.clientX - d.x0;
    const velocity = Math.abs(dx) / Math.max(1, e.timeStamp - d.t0);
    const finalOffset = Math.min(ACTION_WIDTH_PX, Math.max(0, d.base - dx));
    setDragOffset(null);
    if (cancelled) return;
    const flick = velocity > FLICK_VELOCITY && Math.abs(dx) > MIN_FLICK_DISTANCE_PX
    const flickOpen = flick && dx < 0;
    const flickClosed = flick && dx > 0;
    const next = flickOpen
      ? true
      : flickClosed
        ? false
        : d.base === 0
          ? finalOffset > OPEN_DISTANCE_PX
          : finalOffset > ACTION_WIDTH_PX - OPEN_DISTANCE_PX;
    if (next !== open) onOpenChange(next);
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    } else if (open) {
      e.stopPropagation();
      e.preventDefault();
      onOpenChange(false);
    }
  };

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: ACTION_WIDTH_PX }}
        aria-hidden={!open}
        inert={!open}
      >
        <button
          type="button"
          onClick={onDelete}
          aria-label={deleteLabel}
          className="flex w-full items-center justify-center gap-1.5 bg-destructive text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Trash2 className="size-4" aria-hidden />
          Delete
        </button>
      </div>
      <div
        data-slot="swipe-row"
        className={cn(
          "relative touch-pan-y bg-background",
          dragOffset === null && "transition-transform duration-200",
        )}
        style={{ transform: `translateX(${-offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
