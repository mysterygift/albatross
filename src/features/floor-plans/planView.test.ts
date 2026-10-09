import { describe, expect, it } from 'vitest'
import { FULL_VIEW, MAX_VIEW_SCALE, clampView, planToViewFraction, viewFractionToPlan, zoomView } from './planView'

describe('plan view', () => {
  it('maps between view fractions and plan points', () => {
    const view = { x: 300, y: 200, scale: 2 }
    expect(viewFractionToPlan(view, { x: 0.5, y: 0.5 })).toEqual({ x: 600, y: 400 })
    expect(planToViewFraction(view, { x: 600, y: 400 })).toEqual({ x: 0.5, y: 0.5 })
    expect(viewFractionToPlan(FULL_VIEW, { x: 1, y: 1 })).toEqual({ x: 1200, y: 800 })
  })

  it('zooms round a point, keeping it in place', () => {
    const view = zoomView(FULL_VIEW, 2, { x: 0.25, y: 0.25 })
    expect(view).toEqual({ x: 150, y: 100, scale: 2 })
    expect(planToViewFraction(view, { x: 300, y: 200 })).toEqual({ x: 0.25, y: 0.25 })
  })

  it('pans while pinching: the plan point under the fingers follows them', () => {
    const start = { x: 300, y: 200, scale: 2 }
    const view = zoomView(start, 2, { x: 0.5, y: 0.5 }, { x: 0.25, y: 0.5 })
    expect(view).toEqual({ x: 450, y: 200, scale: 2 })
  })

  it('stays inside the plan and between 1x and the maximum zoom', () => {
    expect(clampView({ x: -50, y: 900, scale: 2 })).toEqual({ x: 0, y: 400, scale: 2 })
    expect(clampView({ x: 100, y: 100, scale: 0.5 })).toEqual(FULL_VIEW)
    expect(zoomView(FULL_VIEW, 100, { x: 0.5, y: 0.5 }).scale).toBe(MAX_VIEW_SCALE)
  })
})
