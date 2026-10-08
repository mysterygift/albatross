/**
 * Pure logic behind `SignaturePad`: strokes are stored with coordinates normalised to 0–1 of the
 * pad, so a signature survives resizing (e.g. rotating an iPad) and can be re-rendered at any
 * resolution for export.
 */

export type PadPointerType = 'mouse' | 'pen' | 'touch'

export type StrokePoint = {
  /** 0–1 across the pad. */
  x: number
  /** 0–1 down the pad. */
  y: number
  /** 0–1; only meaningful for pen input. */
  pressure: number
}

export type Stroke = {
  pointerType: PadPointerType
  points: StrokePoint[]
}

/** Stroke width in CSS pixels at a pad width of 500px; scaled with the pad so ink keeps its weight. */
export const BASE_STROKE_WIDTH = 2.6
const REFERENCE_PAD_WIDTH = 500

export function toPadPointerType(pointerType: string): PadPointerType {
  if (pointerType === 'pen' || pointerType === 'touch') return pointerType
  return 'mouse'
}

export function normalisePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  pressure: number
): StrokePoint {
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return {
    x: rect.width > 0 ? clamp((clientX - rect.left) / rect.width) : 0,
    y: rect.height > 0 ? clamp((clientY - rect.top) / rect.height) : 0,
    pressure: clamp(pressure),
  }
}

/**
 * Line width for a segment, in pixels of a pad `padWidth` wide. Apple Pencil (pen) pressure
 * varies the width between roughly half and one and a half times the base; mouse and finger
 * report no useful pressure, so they draw at the base width.
 */
export function strokeWidth(pointerType: PadPointerType, pressure: number, padWidth: number): number {
  const base = BASE_STROKE_WIDTH * Math.max(0.6, padWidth / REFERENCE_PAD_WIDTH)
  if (pointerType !== 'pen' || pressure <= 0) return base
  return base * (0.45 + Math.min(1, pressure) * 1.1)
}

/**
 * Palm rejection: once an Apple Pencil has touched the pad, finger touches are ignored so a hand
 * resting on the screen does not draw. Only one pointer draws at a time.
 */
export function shouldAcceptPointer(args: {
  pointerType: PadPointerType
  penSeen: boolean
  activePointerId: number | null
  pointerId: number
}): boolean {
  if (args.activePointerId !== null && args.activePointerId !== args.pointerId) return false
  if (args.pointerType === 'touch' && args.penSeen) return false
  return true
}

/** Bounding box of all ink in pad pixels, padded by `margin`; null when there is no ink. */
export function inkBounds(
  strokes: Stroke[],
  width: number,
  height: number,
  margin: number
): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x * width)
      minY = Math.min(minY, p.y * height)
      maxX = Math.max(maxX, p.x * width)
      maxY = Math.max(maxY, p.y * height)
    }
  }
  if (!Number.isFinite(minX)) return null
  const x = Math.max(0, Math.floor(minX - margin))
  const y = Math.max(0, Math.floor(minY - margin))
  return {
    x,
    y,
    width: Math.min(width, Math.ceil(maxX + margin)) - x,
    height: Math.min(height, Math.ceil(maxY + margin)) - y,
  }
}

type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'quadraticCurveTo'
  | 'stroke'
  | 'arc'
  | 'fill'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'strokeStyle'
  | 'fillStyle'
>

/**
 * Draws strokes onto a context `width` x `height` pixels, offset by (`dx`, `dy`). Segments are
 * smoothed with quadratic curves through the midpoints between samples; each segment takes the
 * width of its pressure so Pencil strokes taper naturally.
 */
export function drawStrokes(
  ctx: Ctx,
  strokes: Stroke[],
  width: number,
  height: number,
  color: string,
  dx = 0,
  dy = 0
): void {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of strokes) {
    const pts = stroke.points.map((p) => ({ x: p.x * width - dx, y: p.y * height - dy, pressure: p.pressure }))
    if (pts.length === 0) continue
    if (pts.length === 1) {
      const p = pts[0]!
      ctx.beginPath()
      ctx.arc(p.x, p.y, strokeWidth(stroke.pointerType, p.pressure, width) / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    let prevMid = pts[0]!
    for (let i = 1; i < pts.length; i += 1) {
      const prev = pts[i - 1]!
      const curr = pts[i]!
      const mid = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 }
      ctx.beginPath()
      ctx.lineWidth = strokeWidth(stroke.pointerType, (prev.pressure + curr.pressure) / 2, width)
      ctx.moveTo(prevMid.x, prevMid.y)
      ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y)
      ctx.stroke()
      prevMid = { ...mid, pressure: curr.pressure }
    }
    const last = pts[pts.length - 1]!
    ctx.beginPath()
    ctx.moveTo(prevMid.x, prevMid.y)
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
  }
}
