import { describe, expect, it } from 'vitest'
import { applyTwoFinger, twoFingerTransform } from './twoFinger'

describe('two-finger gestures', () => {
  it('measures spread, twist and movement', () => {
    const t = twoFingerTransform({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -50 }, { x: 50, y: 150 })
    expect(t.scale).toBeCloseTo(2)
    expect(t.turn).toBeCloseTo(90)
    expect(t.from).toEqual({ x: 50, y: 0 })
    expect(t.to).toEqual({ x: 50, y: 50 })
  })

  it('takes the short way round', () => {
    // A small twist anticlockwise across the ±180° line reads as -10°, not 350°.
    const t = twoFingerTransform({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 17.6 })
    expect(t.turn).toBeCloseTo(-10, 0)
  })

  it('carries a point as if stuck to the fingers', () => {
    const t = twoFingerTransform({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -50 }, { x: 50, y: 150 })
    // The start of the line between the fingers lands on the start of it now.
    const p = applyTwoFinger(t, t.turn, { x: 0, y: 0 })
    expect(p.x).toBeCloseTo(50)
    expect(p.y).toBeCloseTo(-50)
  })
})
