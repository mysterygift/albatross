/**
 * The part of the plan the canvas shows: zoomed in by `scale`, with `x`/`y` the plan point at the
 * top-left corner. Ctrl/⌘ + scroll changes it and dragging empty floor pans it; it is not saved.
 */
import { createContext } from 'react'
import { PLAN_HEIGHT, PLAN_WIDTH, type Point } from '@/lib/floor-plans/model'

export type PlanView = { x: number; y: number; scale: number }

export const FULL_VIEW: PlanView = { x: 0, y: 0, scale: 1 }
export const MAX_VIEW_SCALE = 4

/** The canvas's view, for overlays positioned over it (the selection panel). */
export const PlanViewContext = createContext<PlanView>(FULL_VIEW)

/** Keeps the scale between 1 and `MAX_VIEW_SCALE` and the view inside the plan. */
export function clampView(view: PlanView): PlanView {
  const scale = Math.min(MAX_VIEW_SCALE, Math.max(1, view.scale))
  const x = Math.min(PLAN_WIDTH - PLAN_WIDTH / scale, Math.max(0, view.x))
  const y = Math.min(PLAN_HEIGHT - PLAN_HEIGHT / scale, Math.max(0, view.y))
  return { x, y, scale }
}

/** Plan point at a position in the view, given as fractions (0 to 1) of its width and height. */
export function viewFractionToPlan(view: PlanView, at: Point): Point {
  return { x: view.x + (at.x * PLAN_WIDTH) / view.scale, y: view.y + (at.y * PLAN_HEIGHT) / view.scale }
}

/** Where a plan point is in the view, as fractions of its width and height (0 to 1 when visible). */
export function planToViewFraction(view: PlanView, p: Point): Point {
  return { x: ((p.x - view.x) * view.scale) / PLAN_WIDTH, y: ((p.y - view.y) * view.scale) / PLAN_HEIGHT }
}

/**
 * Zoom to `scale`, keeping the plan point that was under `from` (view fractions, in `view`) under
 * `to`: a pinch both zooms and pans. Zooming round a fixed point passes the same point twice.
 */
export function zoomView(view: PlanView, scale: number, from: Point, to: Point = from): PlanView {
  const anchor = viewFractionToPlan(view, from)
  const next = Math.min(MAX_VIEW_SCALE, Math.max(1, scale))
  return clampView({ x: anchor.x - (to.x * PLAN_WIDTH) / next, y: anchor.y - (to.y * PLAN_HEIGHT) / next, scale: next })
}
