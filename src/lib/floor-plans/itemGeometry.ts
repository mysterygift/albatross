/**
 * How each piece of equipment is drawn, as simple shapes in the item's own frame: centred on
 * (0, 0), facing +x, in plan units. The editor (SVG) and the PDF both draw from these, so an item
 * looks the same in both. A role says how a shape is coloured; see `ITEM_ROLE_STYLE`.
 */
import { catalogItem, type CatalogItem } from './catalog'
import { GRIP_COLOR, GRIP_FILL, FLAG_FILL, LIGHT_SOURCE_COLORS, type FloorPlanItem, type Point } from './model'

export type ItemRole = 'lightBody' | 'beam' | 'halo' | 'gripBody' | 'rail' | 'detail' | 'flag' | 'frame' | 'outline'

export type ItemPrimitive =
  | { shape: 'rect'; x: number; y: number; w: number; h: number; rx?: number; role: ItemRole }
  | { shape: 'circle'; cx: number; cy: number; r: number; role: ItemRole }
  | { shape: 'path'; points: Point[]; closed: boolean; role: ItemRole }

/** Fill and stroke for each role; `light` is the light's source colour. */
export function itemRoleStyle(role: ItemRole, light: string | null): {
  fill: string | null
  fillOpacity?: number
  stroke: string | null
  strokeWidth: number
  dash?: number[]
} {
  switch (role) {
    case 'lightBody':
      return { fill: light ?? LIGHT_SOURCE_COLORS.led, stroke: '#0f1115', strokeWidth: 1.5 }
    case 'beam':
      return { fill: light ?? LIGHT_SOURCE_COLORS.led, fillOpacity: 0.16, stroke: null, strokeWidth: 0 }
    case 'halo':
      return { fill: null, stroke: light ?? LIGHT_SOURCE_COLORS.led, strokeWidth: 2, dash: [5, 4] }
    case 'gripBody':
      return { fill: GRIP_FILL, stroke: GRIP_COLOR, strokeWidth: 2 }
    case 'rail':
      return { fill: null, stroke: GRIP_COLOR, strokeWidth: 2 }
    case 'detail':
      return { fill: null, stroke: GRIP_COLOR, strokeWidth: 1.5 }
    case 'flag':
      return { fill: FLAG_FILL, stroke: GRIP_COLOR, strokeWidth: 1.5 }
    case 'frame':
      return { fill: '#e5e7eb', fillOpacity: 0.12, stroke: GRIP_COLOR, strokeWidth: 2 }
    case 'outline':
      return { fill: null, stroke: GRIP_COLOR, strokeWidth: 2.5, dash: [8, 6] }
  }
}

/** The light's source colour, or null for anything that is not a light. */
export function itemLightColor(type: string): string | null {
  const entry = catalogItem(type)
  return entry?.light ? LIGHT_SOURCE_COLORS[entry.light.source] : null
}

const clampMin = (v: number, min: number) => Math.max(v, min)

/** Beam length in plan units: about 3 m, but always readable. */
function beamLength(upm: number): number {
  return Math.min(160, Math.max(50, 3 * upm))
}

function beam(fromX: number, halfAngleDeg: number, length: number): ItemPrimitive {
  const half = (Math.min(halfAngleDeg, 60) * Math.PI) / 180
  return {
    shape: 'path',
    closed: true,
    role: 'beam',
    points: [
      { x: fromX, y: 0 },
      { x: fromX + Math.cos(half) * length, y: -Math.sin(half) * length },
      { x: fromX + Math.cos(half) * length, y: Math.sin(half) * length },
    ],
  }
}

function lightPrimitives(entry: CatalogItem, w: number, d: number, upm: number): ItemPrimitive[] {
  const { form, beam: beamAngle } = entry.light!
  const half = beamAngle / 2
  const length = beamLength(upm)
  switch (form) {
    case 'fresnel':
    case 'par': {
      const r = clampMin(Math.max(w, d) / 2, 8)
      return [beam(r * 0.6, half, length), { shape: 'circle', cx: 0, cy: 0, r, role: 'lightBody' }]
    }
    case 'open-face': {
      const bw = clampMin(w, 16)
      const bd = clampMin(d, 16)
      return [beam(bd / 2, half, length), { shape: 'rect', x: -bd / 2, y: -bw / 2, w: bd, h: bw, rx: 3, role: 'lightBody' }]
    }
    case 'cob': {
      const s = clampMin(Math.max(w, d), 12)
      return [beam(s / 2, half, length), { shape: 'rect', x: -s / 2, y: -s / 2, w: s, h: s, rx: 3, role: 'lightBody' }]
    }
    case 'panel': {
      const bw = clampMin(w, 16)
      const bd = clampMin(d, 6)
      return [beam(bd / 2, half, length * 0.8), { shape: 'rect', x: -bd / 2, y: -bw / 2, w: bd, h: bw, rx: 1.5, role: 'lightBody' }]
    }
    case 'tube': {
      const bw = clampMin(w, 16)
      const bd = clampMin(d, 4)
      return [{ shape: 'rect', x: -bd / 2, y: -bw / 2, w: bd, h: bw, rx: bd / 2, role: 'lightBody' }]
    }
    case 'balloon': {
      const r = clampMin(w / 2, 10)
      return [
        { shape: 'circle', cx: 0, cy: 0, r: r * 1.35, role: 'halo' },
        { shape: 'circle', cx: 0, cy: 0, r, role: 'lightBody' },
      ]
    }
    case 'practical': {
      const r = clampMin(w / 2, 6)
      return [{ shape: 'circle', cx: 0, cy: 0, r: r * 1.6, role: 'halo' }, { shape: 'circle', cx: 0, cy: 0, r, role: 'lightBody' }]
    }
  }
}

/** Shapes for one item in its own frame (facing +x), sized by its width and depth in metres. */
export function itemPrimitives(item: Pick<FloorPlanItem, 'type' | 'width' | 'depth'>, upm: number): ItemPrimitive[] {
  const entry = catalogItem(item.type)
  const w = item.width * upm
  const d = item.depth * upm
  if (entry?.light) return lightPrimitives(entry, w, d, upm)
  const bw = clampMin(w, 8)
  const bd = clampMin(d, 8)
  const box = (role: ItemRole, rx = 3): ItemPrimitive => ({ shape: 'rect', x: -bd / 2, y: -bw / 2, w: bd, h: bw, rx, role })
  switch (entry?.glyph) {
    case 'dolly':
      return [box('gripBody', 5), { shape: 'circle', cx: 0, cy: 0, r: Math.min(bw, bd) * 0.22, role: 'detail' }]
    case 'track': {
      const gauge = clampMin(w, 10)
      const shapes: ItemPrimitive[] = []
      const sleeperStep = clampMin(0.6 * upm, 8)
      for (let x = -d / 2 + sleeperStep / 2; x < d / 2; x += sleeperStep) {
        shapes.push({ shape: 'path', closed: false, role: 'detail', points: [{ x, y: -gauge / 2 - 3 }, { x, y: gauge / 2 + 3 }] })
      }
      shapes.push(
        { shape: 'path', closed: false, role: 'rail', points: [{ x: -d / 2, y: -gauge / 2 }, { x: d / 2, y: -gauge / 2 }] },
        { shape: 'path', closed: false, role: 'rail', points: [{ x: -d / 2, y: gauge / 2 }, { x: d / 2, y: gauge / 2 }] }
      )
      return shapes
    }
    case 'curved-track': {
      // A quarter circle: depth is the radius to the centre line, width the gauge.
      const gauge = clampMin(w, 10)
      const arc = (radius: number): Point[] =>
        Array.from({ length: 13 }, (_, i) => {
          const a = (i / 12) * (Math.PI / 2)
          return { x: -d / 2 + radius * Math.sin(a), y: d / 2 - radius * Math.cos(a) }
        })
      return [
        { shape: 'path', closed: false, role: 'rail', points: arc(d - gauge / 2) },
        { shape: 'path', closed: false, role: 'rail', points: arc(d + gauge / 2) },
      ]
    }
    case 'slider':
      return [
        { shape: 'rect', x: -bd / 2, y: -clampMin(w, 5) / 2, w: bd, h: clampMin(w, 5), rx: 2, role: 'gripBody' },
        { shape: 'rect', x: -5, y: -clampMin(w, 5) / 2 - 2, w: 10, h: clampMin(w, 5) + 4, rx: 2, role: 'detail' },
      ]
    case 'tripod':
    case 'stand': {
      const r = clampMin(w / 2, 8)
      const legs: ItemPrimitive[] = [0, 120, 240].map((deg) => {
        const a = ((deg + 180) * Math.PI) / 180
        return { shape: 'path', closed: false, role: 'rail', points: [{ x: 0, y: 0 }, { x: Math.cos(a) * r, y: Math.sin(a) * r }] }
      })
      const arm: ItemPrimitive[] =
        entry?.glyph === 'stand' ? [{ shape: 'path', closed: false, role: 'detail', points: [{ x: 0, y: 0 }, { x: r * 1.1, y: 0 }] }] : []
      return [...legs, ...arm, { shape: 'circle', cx: 0, cy: 0, r: 3, role: 'gripBody' }]
    }
    case 'jib':
    case 'crane': {
      const base = clampMin(w, 10)
      return [
        { shape: 'rect', x: -base / 2, y: -base / 2, w: base, h: base, rx: 3, role: 'gripBody' },
        { shape: 'path', closed: false, role: 'rail', points: [{ x: 0, y: 0 }, { x: d, y: 0 }] },
        { shape: 'circle', cx: d, cy: 0, r: 5, role: 'gripBody' },
      ]
    }
    case 'flag':
      return [{ shape: 'rect', x: -clampMin(d, 3) / 2, y: -bw / 2, w: clampMin(d, 3), h: bw, rx: 0, role: 'flag' }]
    case 'frame':
      return [
        box('frame', 0),
        { shape: 'path', closed: false, role: 'detail', points: [{ x: -bd / 2, y: -bw / 2 }, { x: bd / 2, y: bw / 2 }] },
        { shape: 'path', closed: false, role: 'detail', points: [{ x: bd / 2, y: -bw / 2 }, { x: -bd / 2, y: bw / 2 }] },
      ]
    case 'tent':
      return [
        box('outline', 0),
        { shape: 'path', closed: false, role: 'detail', points: [{ x: -bd / 2, y: -bw / 2 }, { x: bd / 2, y: bw / 2 }] },
        { shape: 'path', closed: false, role: 'detail', points: [{ x: bd / 2, y: -bw / 2 }, { x: -bd / 2, y: bw / 2 }] },
      ]
    case 'vehicle':
      return [box('gripBody', 6), { shape: 'rect', x: bd / 2 - bd * 0.22, y: -bw / 2 + 3, w: bd * 0.22 - 3, h: bw - 6, rx: 3, role: 'detail' }]
    case 'generator':
      return [
        box('gripBody', 3),
        {
          shape: 'path',
          closed: false,
          role: 'detail',
          points: [{ x: 4, y: -bw * 0.3 }, { x: -3, y: 0 }, { x: 3, y: 0 }, { x: -4, y: bw * 0.3 }],
        },
      ]
    case 'monitor':
      return [box('gripBody', 3), { shape: 'rect', x: -bd * 0.3, y: -bw * 0.35, w: bd * 0.6, h: bw * 0.3, rx: 1, role: 'detail' }]
    default:
      return [box('gripBody', 3)]
  }
}

/** Plan-unit point of a local point on an item placed at `at`, facing `rotation`. */
export function itemToPlan(local: Point, at: Point, rotation: number): Point {
  const r = (rotation * Math.PI) / 180
  return { x: at.x + local.x * Math.cos(r) - local.y * Math.sin(r), y: at.y + local.x * Math.sin(r) + local.y * Math.cos(r) }
}
