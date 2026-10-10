/**
 * Two-finger gestures on a touch screen: how far the fingers have spread (scale), twisted (turn)
 * and moved (the point between them), and where that carries a point on the plan, as if the plan
 * under the fingers were stuck to them.
 */
import { normalizeAngle, type Point } from '@/lib/floor-plans/model'

export type TwoFingerTransform = {
  /** Distance between the fingers now over at the start. */
  scale: number
  /** Degrees clockwise the line between the fingers has turned. */
  turn: number
  /** The point between the fingers at the start, and now. */
  from: Point
  to: Point
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** The transform between the fingers at `a0`/`b0` and now at `a`/`b` (plan units). */
export function twoFingerTransform(a0: Point, b0: Point, a: Point, b: Point): TwoFingerTransform {
  const d0 = Math.max(1, Math.hypot(b0.x - a0.x, b0.y - a0.y))
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  const angle0 = Math.atan2(b0.y - a0.y, b0.x - a0.x)
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  // Shortest way round, so a twist past ±180° does not flip.
  const turn = normalizeAngle(((angle - angle0) * 180) / Math.PI + 180) - 180
  return { scale: d / d0, turn, from: mid(a0, b0), to: mid(a, b) }
}

/** Where `p` goes: scaled and turned about the start point between the fingers, then moved with them. */
export function applyTwoFinger(t: Pick<TwoFingerTransform, 'scale' | 'from' | 'to'>, turn: number, p: Point): Point {
  const r = (turn * Math.PI) / 180
  const dx = (p.x - t.from.x) * t.scale
  const dy = (p.y - t.from.y) * t.scale
  return { x: t.to.x + dx * Math.cos(r) - dy * Math.sin(r), y: t.to.y + dx * Math.sin(r) + dy * Math.cos(r) }
}
