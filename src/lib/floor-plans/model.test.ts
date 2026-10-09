import { describe, expect, it } from 'vitest'
import {
  angleBetween,
  constrainSegment,
  drawingBounds,
  nextMarkerLabel,
  parseLayout,
  parseMarkers,
  rectFromCorners,
  snapAngle,
  textCorners,
  translateShape,
  type FloorPlanMarker,
} from '@/lib/floor-plans/model'

describe('floor plan model', () => {
  it('parses layouts tolerantly, dropping broken shapes', () => {
    const json = JSON.stringify({
      shapes: [
        { id: 'r', kind: 'rect', x: 1, y: 2, width: 3, height: 4 },
        { id: 'p', kind: 'path', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: true },
        { id: 't', kind: 'text', x: 0, y: 0, width: 50, height: 20, text: 'Bar' },
        { id: 'bad', kind: 'rect', x: 'nope' },
        { kind: 'rect', x: 1, y: 1, width: 1, height: 1 },
        { id: 'short', kind: 'path', points: [{ x: 0, y: 0 }] },
      ],
    })
    const layout = parseLayout(json)
    expect(layout.shapes.map((s) => s.id)).toEqual(['r', 'p', 't'])
    // A two-point path cannot be closed; a text box gets the default rotation and size.
    expect(layout.shapes[1]).toMatchObject({ closed: false })
    expect(layout.shapes[2]).toMatchObject({ rotation: 0, fontSize: 18 })
    expect(parseLayout('not json')).toEqual({ shapes: [] })
    expect(parseLayout(null)).toEqual({ shapes: [] })
  })

  it('parses markers, dropping unknown kinds', () => {
    const markers = parseMarkers(
      JSON.stringify([
        { id: 'a', kind: 'camera', x: 1, y: 2, rotation: 90, label: 'A' },
        { id: 'b', kind: 'boom', x: 1, y: 2 },
        { id: 'c', kind: 'actor', x: 5, y: 6 },
      ])
    )
    expect(markers).toEqual([
      { id: 'a', kind: 'camera', x: 1, y: 2, rotation: 90, label: 'A' },
      { id: 'c', kind: 'actor', x: 5, y: 6, rotation: 0, label: '' },
    ])
  })

  it('snaps angles to 90 degree steps', () => {
    expect(snapAngle(44)).toBe(0)
    expect(snapAngle(46)).toBe(90)
    expect(snapAngle(-80)).toBe(270)
    expect(snapAngle(359)).toBe(0)
    expect(angleBetween({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90)
  })

  it('constrains a segment to horizontal or vertical when snapping', () => {
    const from = { x: 10, y: 10 }
    expect(constrainSegment(from, { x: 100, y: 30 }, true)).toEqual({ x: 100, y: 10 })
    expect(constrainSegment(from, { x: 20, y: 90 }, true)).toEqual({ x: 10, y: 90 })
    expect(constrainSegment(from, { x: 20, y: 90 }, false)).toEqual({ x: 20, y: 90 })
  })

  it('builds rectangles from corners dragged in any direction', () => {
    expect(rectFromCorners({ x: 50, y: 40 }, { x: 10, y: 100 })).toEqual({ x: 10, y: 40, width: 40, height: 60 })
  })

  it('rotates text corners about the centre', () => {
    const corners = textCorners({ id: 't', kind: 'text', x: 0, y: 0, width: 40, height: 20, rotation: 90, text: '', fontSize: 18 })
    expect(corners[0]!.x).toBeCloseTo(30)
    expect(corners[0]!.y).toBeCloseTo(-10)
  })

  it('measures everything drawn, including a camera’s view', () => {
    expect(drawingBounds({ shapes: [] })).toBeNull()
    const cam: FloorPlanMarker = { id: 'c', kind: 'camera', x: 500, y: 500, rotation: 0, label: 'A' }
    const bounds = drawingBounds(
      { shapes: [{ id: 'r', kind: 'rect', x: 100, y: 100, width: 200, height: 100 }] },
      [cam]
    )
    expect(bounds).toEqual({ minX: 100, minY: 100, maxX: 570, maxY: 570 })
  })

  it('moves shapes', () => {
    expect(translateShape({ id: 'p', kind: 'path', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], closed: false }, 10, 20).points).toEqual([
      { x: 10, y: 20 },
      { x: 15, y: 25 },
    ])
  })

  it('suggests the next free marker label', () => {
    const markers: FloorPlanMarker[] = [
      { id: '1', kind: 'camera', x: 0, y: 0, rotation: 0, label: 'A' },
      { id: '2', kind: 'actor', x: 0, y: 0, rotation: 0, label: '1' },
    ]
    expect(nextMarkerLabel(markers, 'camera')).toBe('B')
    expect(nextMarkerLabel(markers, 'actor')).toBe('2')
  })
})
