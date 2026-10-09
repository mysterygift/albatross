import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UNITS_PER_METRE,
  angleBetween,
  cameraColor,
  emptyLayout,
  itemColor,
  planAngleForBearing,
  scaleBarMetres,
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
    expect(parseLayout('not json')).toEqual(emptyLayout())
    expect(parseLayout(null)).toEqual(emptyLayout())
    expect(layout.unitsPerMetre).toBe(DEFAULT_UNITS_PER_METRE)
  })

  it('parses scale, north, background, location and equipment', () => {
    const layout = parseLayout(
      JSON.stringify({
        shapes: [{ id: 'e', kind: 'item', type: 'easy-up-3x3', x: 10, y: 20, label: 'Easy-up' }],
        unitsPerMetre: 25,
        north: -15,
        background: { source: 'map', x: 0, y: 0, width: 1200, height: 800, opacity: 3, map: { lat: 51, lon: 0, metresAcross: 100 } },
        geo: { lat: 51.5, lon: -0.1, timezone: 'Europe/London' },
      })
    )
    expect(layout.shapes[0]).toEqual({ id: 'e', kind: 'item', type: 'easy-up-3x3', x: 10, y: 20, rotation: 0, label: 'Easy-up', width: 3, depth: 3 })
    expect(layout).toMatchObject({ unitsPerMetre: 25, north: 345, geo: { lat: 51.5, lon: -0.1, timezone: 'Europe/London' } })
    expect(layout.background).toMatchObject({ source: 'map', opacity: 1, map: { metresAcross: 100 } })
    expect(parseLayout(JSON.stringify({ shapes: [], background: { source: 'video' }, geo: { lat: 99, lon: 0 } }))).toMatchObject({
      background: null,
      geo: null,
    })
  })

  it('parses markers, dropping unknown kinds', () => {
    const markers = parseMarkers(
      JSON.stringify([
        { id: 'a', kind: 'camera', x: 1, y: 2, rotation: 90, label: 'A' },
        { id: 'b', kind: 'boom', x: 1, y: 2 },
        { id: 'c', kind: 'actor', x: 5, y: 6, personId: 'p1' },
        { id: 'd', kind: 'item', type: 'arri-m18', x: 7, y: 8, rotation: 45, label: 'M18 | HMI' },
      ])
    )
    expect(markers).toEqual([
      { id: 'a', kind: 'camera', x: 1, y: 2, rotation: 90, label: 'A' },
      { id: 'c', kind: 'actor', x: 5, y: 6, rotation: 0, label: '', personId: 'p1' },
      { id: 'd', kind: 'item', type: 'arri-m18', x: 7, y: 8, rotation: 45, label: 'M18 | HMI', width: 0.39, depth: 0.39 },
    ])
  })

  it('colours cameras by letter and lights by source', () => {
    expect(cameraColor('A')).toBe('#f97316')
    expect(cameraColor('b')).toBe('#22d3ee')
    expect(cameraColor('F')).toBe(cameraColor('A'))
    expect(itemColor('arri-650-plus')).toBe('#f59e0b')
    expect(itemColor('arri-m18')).toBe('#bfdbfe')
    expect(itemColor('arri-skypanel-s60')).toBe('#f1f5f9')
    expect(itemColor('floppy-4x4')).toBe('#0a0a0a')
    expect(itemColor('fisher-11')).toBe('#94a3b8')
  })

  it('picks a round scale bar and turns compass bearings into plan angles', () => {
    expect(scaleBarMetres(40)).toBe(2)
    expect(scaleBarMetres(4)).toBe(20)
    // North up: due east points right (0), due south points down (90).
    expect(planAngleForBearing(0, 90)).toBe(0)
    expect(planAngleForBearing(0, 180)).toBe(90)
    // North rotated 15° clockwise on the plan: east turns with it.
    expect(planAngleForBearing(15, 90)).toBe(15)
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
    expect(drawingBounds(emptyLayout())).toBeNull()
    const cam: FloorPlanMarker = { id: 'c', kind: 'camera', x: 500, y: 500, rotation: 0, label: 'A' }
    const bounds = drawingBounds(
      { ...emptyLayout(), shapes: [{ id: 'r', kind: 'rect', x: 100, y: 100, width: 200, height: 100 }] },
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
      { id: '2', kind: 'actor', x: 0, y: 0, rotation: 0, label: '1', personId: null },
    ]
    expect(nextMarkerLabel(markers, 'camera')).toBe('B')
    expect(nextMarkerLabel(markers, 'actor')).toBe('2')
  })
})
