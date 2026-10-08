import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Eraser, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  drawStrokes,
  inkBounds,
  normalisePoint,
  shouldAcceptPointer,
  toPadPointerType,
  type Stroke,
} from '@/components/signaturePadModel'

/** Signatures are always dark ink on a white pad, like paper, in both themes. */
const INK = '#111827'

export type SignaturePadHandle = {
  isEmpty: () => boolean
  clear: () => void
  /** Transparent PNG of the ink, trimmed to its bounds and rendered at `scale`x; null when empty. */
  toPng: (scale?: number) => Promise<Uint8Array | null>
}

export type SignaturePadProps = {
  ref?: Ref<SignaturePadHandle>
  /** Accessible name, e.g. "Contributor signature". */
  label: string
  onChange?: (isEmpty: boolean) => void
  disabled?: boolean
  className?: string
}

/**
 * Freehand signature pad for mouse, finger and Apple Pencil, built on Pointer Events:
 * - Pencil pressure varies the line width, and coalesced events keep fast strokes smooth.
 * - Once a Pencil touches the pad, finger touches are ignored (palm rejection).
 * - `touch-action: none` stops the page scrolling or zooming while signing.
 */
export function SignaturePad({ ref, label, onChange, disabled, className }: SignaturePadProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const activeRef = useRef<{ pointerId: number; stroke: Stroke } | null>(null)
  const penSeenRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const width = canvas.width / dpr
    const height = canvas.height / dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    drawStrokes(ctx, strokesRef.current, width, height, INK)
  }, [])

  const scheduleRedraw = useCallback(() => {
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      redraw()
    })
  }, [redraw])

  const publishEmpty = useCallback(() => {
    const empty = strokesRef.current.length === 0
    setIsEmpty(empty)
    onChange?.(empty)
  }, [onChange])

  // Match the canvas backing store to its displayed size; strokes are normalised, so they redraw
  // in place after a resize or rotation.
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      redraw()
    }
    resize()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [redraw])

  // Older iOS WebKit can still start a scroll from a touch before pointer events take over.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prevent = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault()
    }
    canvas.addEventListener('touchstart', prevent, { passive: false })
    canvas.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      canvas.removeEventListener('touchstart', prevent)
      canvas.removeEventListener('touchmove', prevent)
    }
  }, [])

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    },
    []
  )

  const clear = useCallback(() => {
    strokesRef.current = []
    activeRef.current = null
    redraw()
    publishEmpty()
  }, [publishEmpty, redraw])

  const undo = useCallback(() => {
    strokesRef.current = strokesRef.current.slice(0, -1)
    activeRef.current = null
    redraw()
    publishEmpty()
  }, [publishEmpty, redraw])

  useImperativeHandle(
    ref,
    () => ({
      isEmpty: () => strokesRef.current.length === 0,
      clear,
      toPng: async (scale = 3) => {
        const container = containerRef.current
        if (!container) return null
        const { width, height } = container.getBoundingClientRect()
        const bounds = inkBounds(strokesRef.current, width, height, 6)
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
        const out = document.createElement('canvas')
        out.width = Math.ceil(bounds.width * scale)
        out.height = Math.ceil(bounds.height * scale)
        const ctx = out.getContext('2d')
        if (!ctx) return null
        ctx.scale(scale, scale)
        drawStrokes(ctx, strokesRef.current, width, height, INK, bounds.x, bounds.y)
        const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
        return blob ? new Uint8Array(await blob.arrayBuffer()) : null
      },
    }),
    [clear]
  )

  const pointFrom = (e: { clientX: number; clientY: number; pressure: number }, pointerType: string) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    // Mouse and finger report a fixed 0.5 (or 0); only the Pencil's pressure is real.
    return normalisePoint(e.clientX, e.clientY, rect, pointerType === 'pen' ? e.pressure : 0.5)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const pointerType = toPadPointerType(e.pointerType)
    const active = activeRef.current
    // A palm that landed before the Pencil: drop its stroke and let the Pencil take over.
    if (pointerType === 'pen' && active && active.stroke.pointerType === 'touch') {
      strokesRef.current = strokesRef.current.filter((s) => s !== active.stroke)
      activeRef.current = null
    }
    if (
      !shouldAcceptPointer({
        pointerType,
        penSeen: penSeenRef.current,
        activePointerId: activeRef.current?.pointerId ?? null,
        pointerId: e.pointerId,
      })
    ) {
      return
    }
    e.preventDefault()
    if (pointerType === 'pen') penSeenRef.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // The pointer already ended (or is synthetic); drawing still works without capture.
    }
    const stroke: Stroke = { pointerType, points: [pointFrom(e, e.pointerType)] }
    strokesRef.current = [...strokesRef.current, stroke]
    activeRef.current = { pointerId: e.pointerId, stroke }
    scheduleRedraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current
    if (!active || active.pointerId !== e.pointerId) return
    e.preventDefault()
    // Apple Pencil reports up to 240 samples a second; coalesced events keep them all.
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? []
    const events = samples.length > 0 ? samples : [e.nativeEvent]
    for (const sample of events) active.stroke.points.push(pointFrom(sample, e.pointerType))
    scheduleRedraw()
  }

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeRef.current
    if (!active || active.pointerId !== e.pointerId) return
    activeRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    redraw()
    publishEmpty()
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div
        ref={containerRef}
        className={cn(
          'relative h-44 w-full overflow-hidden rounded-md border bg-white shadow-xs sm:h-48',
          disabled && 'opacity-60'
        )}
      >
        {isEmpty && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-6 bottom-10 flex items-end gap-2 border-b border-dashed border-neutral-400 pb-1 text-sm text-neutral-400"
          >
            <span className="text-lg leading-none">✕</span>
            <span>Sign here</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          data-testid="signature-pad-canvas"
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none select-none [-webkit-touch-callout:none] [-webkit-user-select:none]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="h-10" onClick={undo} disabled={disabled || isEmpty}>
          <Undo2 />
          Undo
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={clear} disabled={disabled || isEmpty}>
          <Eraser />
          Clear
        </Button>
      </div>
    </div>
  )
}
