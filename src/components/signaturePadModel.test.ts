import { describe, expect, it, vi } from 'vitest'
import {
  BASE_STROKE_WIDTH,
  drawStrokes,
  inkBounds,
  normalisePoint,
  shouldAcceptPointer,
  strokeWidth,
  toPadPointerType,
  type Stroke,
} from '@/components/signaturePadModel'

const rect = { left: 100, top: 50, width: 400, height: 200 }

describe('normalisePoint', () => {
  it('maps client coordinates to 0–1 of the pad and clamps outside points', () => {
    expect(normalisePoint(300, 150, rect, 0.4)).toEqual({ x: 0.5, y: 0.5, pressure: 0.4 })
    expect(normalisePoint(0, 1000, rect, 2)).toEqual({ x: 0, y: 1, pressure: 1 })
  })
})

describe('strokeWidth', () => {
  it('varies with Apple Pencil pressure', () => {
    const light = strokeWidth('pen', 0.1, 500)
    const firm = strokeWidth('pen', 0.9, 500)
    expect(firm).toBeGreaterThan(light * 2)
  })

  it('uses a constant width for mouse and finger', () => {
    expect(strokeWidth('mouse', 0.5, 500)).toBe(BASE_STROKE_WIDTH)
    expect(strokeWidth('touch', 0.9, 500)).toBe(BASE_STROKE_WIDTH)
  })

  it('scales with the pad so ink keeps its weight on wider pads', () => {
    expect(strokeWidth('mouse', 0.5, 1000)).toBe(BASE_STROKE_WIDTH * 2)
  })
})

describe('shouldAcceptPointer', () => {
  it('ignores finger touches once a pencil has been used (palm rejection)', () => {
    expect(shouldAcceptPointer({ pointerType: 'touch', penSeen: false, activePointerId: null, pointerId: 1 })).toBe(true)
    expect(shouldAcceptPointer({ pointerType: 'touch', penSeen: true, activePointerId: null, pointerId: 1 })).toBe(false)
    expect(shouldAcceptPointer({ pointerType: 'pen', penSeen: true, activePointerId: null, pointerId: 2 })).toBe(true)
    expect(shouldAcceptPointer({ pointerType: 'mouse', penSeen: true, activePointerId: null, pointerId: 3 })).toBe(true)
  })

  it('lets only one pointer draw at a time', () => {
    expect(shouldAcceptPointer({ pointerType: 'touch', penSeen: false, activePointerId: 1, pointerId: 2 })).toBe(false)
    expect(shouldAcceptPointer({ pointerType: 'touch', penSeen: false, activePointerId: 1, pointerId: 1 })).toBe(true)
  })

  it('treats unknown pointer types as a mouse', () => {
    expect(toPadPointerType('')).toBe('mouse')
    expect(toPadPointerType('pen')).toBe('pen')
  })
})

describe('inkBounds', () => {
  const strokes: Stroke[] = [
    { pointerType: 'mouse', points: [{ x: 0.25, y: 0.5, pressure: 0.5 }, { x: 0.5, y: 0.25, pressure: 0.5 }] },
  ]

  it('returns the padded bounds of all ink in pixels', () => {
    expect(inkBounds(strokes, 400, 200, 4)).toEqual({ x: 96, y: 46, width: 108, height: 58 })
  })

  it('returns null when there is no ink', () => {
    expect(inkBounds([], 400, 200, 4)).toBeNull()
  })
})

describe('drawStrokes', () => {
  function fakeCtx() {
    return {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      lineWidth: 0,
      lineCap: 'butt' as CanvasLineCap,
      lineJoin: 'miter' as CanvasLineJoin,
      strokeStyle: '',
      fillStyle: '',
    }
  }

  it('draws a dot for a tap and smoothed segments for a stroke, offset for export', () => {
    const ctx = fakeCtx()
    drawStrokes(
      ctx,
      [
        { pointerType: 'pen', points: [{ x: 0.5, y: 0.5, pressure: 0.5 }] },
        {
          pointerType: 'pen',
          points: [
            { x: 0.1, y: 0.1, pressure: 0.5 },
            { x: 0.2, y: 0.2, pressure: 0.5 },
            { x: 0.3, y: 0.1, pressure: 0.5 },
          ],
        },
      ],
      100,
      100,
      '#000',
      10,
      10
    )
    expect(ctx.arc).toHaveBeenCalledWith(40, 40, expect.any(Number), 0, Math.PI * 2)
    expect(ctx.quadraticCurveTo).toHaveBeenCalledTimes(2)
    expect(ctx.moveTo).toHaveBeenNthCalledWith(1, 0, 0)
    expect(ctx.lineTo).toHaveBeenCalledWith(20, 0)
  })
})
