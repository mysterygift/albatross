/**
 * Floor plan drawing model, shared by the editor, the repository and the PDF.
 *
 * Coordinates are plan units on a fixed canvas (`PLAN_WIDTH` x `PLAN_HEIGHT`, y pointing down, as
 * in SVG). Angles are degrees clockwise from +x (pointing right). `unitsPerMetre` gives the plan a
 * real scale (40 by default, so the canvas is 30 x 20 m); setting a background's scale changes it.
 */

import { catalogItem } from './catalog'

export const PLAN_WIDTH = 1200
export const PLAN_HEIGHT = 800
export const PLAN_GRID = 20
export const DEFAULT_UNITS_PER_METRE = 40

export type Point = { x: number; y: number }

/** Axis-aligned rectangle (a room, a table, a doorway). */
export type FloorPlanRect = { id: string; kind: 'rect'; x: number; y: number; width: number; height: number }

/** Point-to-point shape: an open line (a wall, a window) or a closed outline. */
export type FloorPlanPath = { id: string; kind: 'path'; points: Point[]; closed: boolean }

/** Text label: `x`/`y` is the unrotated top-left corner; it rotates about its centre. */
export type FloorPlanText = {
  id: string
  kind: 'text'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  text: string
  fontSize: number
}

/**
 * A piece of equipment from the catalogue (`type` is its id), centred on `x`/`y` and facing
 * `rotation`. `width` (across) and `depth` (along the way it faces) are in metres.
 */
export type FloorPlanItem = {
  id: string
  kind: 'item'
  type: string
  x: number
  y: number
  rotation: number
  label: string
  width: number
  depth: number
}

export type FloorPlanShape = FloorPlanRect | FloorPlanPath | FloorPlanText | FloorPlanItem

/** An image under the drawing: an uploaded picture or a map of the location. */
export type FloorPlanBackground = {
  source: 'image' | 'map'
  /** Placement in plan units. */
  x: number
  y: number
  width: number
  height: number
  /** 0 to 1. */
  opacity: number
  /** Map backgrounds: what was rendered, so it can be rendered again. */
  map?: { lat: number; lon: number; metresAcross: number } | null
}

/** Where the plan is on Earth, for the sun path and map backgrounds. */
export type FloorPlanGeo = { lat: number; lon: number; timezone: string | null }

export type FloorPlanLayout = {
  shapes: FloorPlanShape[]
  background: FloorPlanBackground | null
  unitsPerMetre: number
  /** Which way north points on the plan: degrees clockwise from straight up. 0 = north is up. */
  north: number
  geo: FloorPlanGeo | null
}

/** A camera position; cameras are coloured by their letter. */
export type FloorPlanCameraMarker = { id: string; kind: 'camera'; x: number; y: number; rotation: number; label: string }

/** A cast position; coloured with the person's booking calendar colour. */
export type FloorPlanActorMarker = {
  id: string
  kind: 'actor'
  x: number
  y: number
  rotation: number
  label: string
  personId: string | null
}

/** What a setup holds: cameras, cast and the equipment used for that scene or shot. */
export type FloorPlanMarker = FloorPlanCameraMarker | FloorPlanActorMarker | FloorPlanItem

export const FLOOR_PLAN_MARKER_KINDS = ['camera', 'actor', 'item'] as const
export type FloorPlanMarkerKind = (typeof FLOOR_PLAN_MARKER_KINDS)[number]

/** Radius a camera or actor is drawn at, in plan units (also used for bounds). */
export const MARKER_RADIUS = 16
/** Length of the camera's field-of-view wedge, in plan units. */
export const CAMERA_VIEW_LENGTH = 70
/** Half the camera's field-of-view angle, in degrees. */
export const CAMERA_VIEW_HALF_ANGLE = 22

export const DEFAULT_TEXT_FONT_SIZE = 18
export const MIN_TEXT_SIZE = 20

/** Camera colours by letter: A, B, C, D, E, then round again. */
export const CAMERA_COLORS = ['#f97316', '#22d3ee', '#a3e635', '#f472b6', '#facc15']

/** Lights are coloured by source. */
export const LIGHT_SOURCE_COLORS = { tungsten: '#f59e0b', hmi: '#bfdbfe', led: '#f1f5f9' } as const
export const GRIP_COLOR = '#94a3b8'
export const GRIP_FILL = '#475569'
export const FLAG_FILL = '#0a0a0a'
/** Cast with no booking colour (supporting artists, or no person linked). */
export const DEFAULT_ACTOR_COLOR = '#64748b'

export function emptyLayout(): FloorPlanLayout {
  return { shapes: [], background: null, unitsPerMetre: DEFAULT_UNITS_PER_METRE, north: 0, geo: null }
}

// ---------------------------------------------------------------------------
// Parsing (tolerant: bad entries are dropped, never thrown on)
// ---------------------------------------------------------------------------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

function parsePoint(v: unknown): Point | null {
  const p = obj(v)
  return p && isNum(p.x) && isNum(p.y) ? { x: p.x, y: p.y } : null
}

function parseItem(s: Record<string, unknown>, id: string): FloorPlanItem | null {
  const type = str(s.type)
  if (!type || !isNum(s.x) || !isNum(s.y)) return null
  const known = catalogItem(type)
  const size = (v: unknown, fallback: number) => (isNum(v) && v > 0 ? v : fallback)
  return {
    id,
    kind: 'item',
    type,
    x: s.x,
    y: s.y,
    rotation: isNum(s.rotation) ? s.rotation : 0,
    label: str(s.label),
    width: size(s.width, known?.width ?? 1),
    depth: size(s.depth, known?.depth ?? 1),
  }
}

function parseShape(v: unknown): FloorPlanShape | null {
  const s = obj(v)
  if (!s) return null
  const id = str(s.id)
  if (!id) return null
  if (s.kind === 'rect') {
    if (!isNum(s.x) || !isNum(s.y) || !isNum(s.width) || !isNum(s.height)) return null
    return { id, kind: 'rect', x: s.x, y: s.y, width: s.width, height: s.height }
  }
  if (s.kind === 'path') {
    const points = Array.isArray(s.points) ? s.points.map(parsePoint).filter((p): p is Point => p != null) : []
    if (points.length < 2) return null
    return { id, kind: 'path', points, closed: s.closed === true && points.length > 2 }
  }
  if (s.kind === 'text') {
    if (!isNum(s.x) || !isNum(s.y) || !isNum(s.width) || !isNum(s.height)) return null
    return {
      id,
      kind: 'text',
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      rotation: isNum(s.rotation) ? s.rotation : 0,
      text: str(s.text),
      fontSize: isNum(s.fontSize) && s.fontSize > 0 ? s.fontSize : DEFAULT_TEXT_FONT_SIZE,
    }
  }
  if (s.kind === 'item') return parseItem(s, id)
  return null
}

function parseBackground(v: unknown): FloorPlanBackground | null {
  const b = obj(v)
  if (!b || (b.source !== 'image' && b.source !== 'map')) return null
  if (!isNum(b.x) || !isNum(b.y) || !isNum(b.width) || !isNum(b.height) || b.width <= 0 || b.height <= 0) return null
  const m = obj(b.map)
  return {
    source: b.source,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    opacity: isNum(b.opacity) ? Math.min(1, Math.max(0, b.opacity)) : 0.6,
    map: m && isNum(m.lat) && isNum(m.lon) && isNum(m.metresAcross) ? { lat: m.lat, lon: m.lon, metresAcross: m.metresAcross } : null,
  }
}

function parseGeo(v: unknown): FloorPlanGeo | null {
  const g = obj(v)
  if (!g || !isNum(g.lat) || !isNum(g.lon) || Math.abs(g.lat) > 90 || Math.abs(g.lon) > 180) return null
  return { lat: g.lat, lon: g.lon, timezone: str(g.timezone) || null }
}

/** Parses stored layout JSON (or the object Postgres returns for JSONB). */
export function parseLayout(json: string | null | undefined): FloorPlanLayout {
  if (!json) return emptyLayout()
  try {
    const raw = obj(JSON.parse(json))
    if (!raw) return emptyLayout()
    return {
      shapes: Array.isArray(raw.shapes) ? raw.shapes.map(parseShape).filter((s): s is FloorPlanShape => s != null) : [],
      background: parseBackground(raw.background),
      unitsPerMetre: isNum(raw.unitsPerMetre) && raw.unitsPerMetre > 0 ? raw.unitsPerMetre : DEFAULT_UNITS_PER_METRE,
      north: isNum(raw.north) ? normalizeAngle(raw.north) : 0,
      geo: parseGeo(raw.geo),
    }
  } catch {
    return emptyLayout()
  }
}

function parseMarker(v: unknown): FloorPlanMarker | null {
  const m = obj(v)
  if (!m) return null
  const id = str(m.id)
  if (!id) return null
  if (m.kind === 'item') return parseItem(m, id)
  if (m.kind !== 'camera' && m.kind !== 'actor') return null
  if (!isNum(m.x) || !isNum(m.y)) return null
  const base = { id, x: m.x, y: m.y, rotation: isNum(m.rotation) ? m.rotation : 0, label: str(m.label) }
  return m.kind === 'camera' ? { ...base, kind: 'camera' } : { ...base, kind: 'actor', personId: str(m.personId) || null }
}

export function parseMarkers(json: string | null | undefined): FloorPlanMarker[] {
  if (!json) return []
  try {
    const raw = JSON.parse(json) as unknown
    return Array.isArray(raw) ? raw.map(parseMarker).filter((m): m is FloorPlanMarker => m != null) : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Angle in degrees normalised to [0, 360). */
export function normalizeAngle(deg: number): number {
  const a = deg % 360
  return a < 0 ? a + 360 : a
}

/** Snaps to the nearest multiple of `step` (90 by default). */
export function snapAngle(deg: number, step = 90): number {
  return normalizeAngle(Math.round(deg / step) * step)
}

/** Angle from `from` to `to` in degrees (clockwise from +x, y down). */
export function angleBetween(from: Point, to: Point): number {
  return normalizeAngle((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI)
}

/**
 * The next point of a line from `from` towards `to`. With `snap`, the segment runs horizontally or
 * vertically (whichever is closer), so walls meet at right angles.
 */
export function constrainSegment(from: Point, to: Point, snap: boolean): Point {
  if (!snap) return to
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
}

export function clampToPlan(p: Point): Point {
  return { x: Math.min(PLAN_WIDTH, Math.max(0, p.x)), y: Math.min(PLAN_HEIGHT, Math.max(0, p.y)) }
}

/** Rectangle spanning two corners, in any drag direction. */
export function rectFromCorners(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

export function textCentre(t: Pick<FloorPlanText, 'x' | 'y' | 'width' | 'height'>): Point {
  return { x: t.x + t.width / 2, y: t.y + t.height / 2 }
}

export function rotatePoint(p: Point, centre: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const dx = p.x - centre.x
  const dy = p.y - centre.y
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos }
}

/** The four corners of a text box after rotation, clockwise from the top-left. */
export function textCorners(t: FloorPlanText): Point[] {
  const c = textCentre(t)
  return [
    { x: t.x, y: t.y },
    { x: t.x + t.width, y: t.y },
    { x: t.x + t.width, y: t.y + t.height },
    { x: t.x, y: t.y + t.height },
  ].map((p) => rotatePoint(p, c, t.rotation))
}

/** Moves a shape by (dx, dy). */
export function translateShape<T extends FloorPlanShape>(shape: T, dx: number, dy: number): T {
  if (shape.kind === 'path') {
    return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
  }
  return { ...shape, x: shape.x + dx, y: shape.y + dy }
}

/** Half the item's largest extent in plan units, at least a marker's size so tiny kit stays visible. */
export function itemReach(item: Pick<FloorPlanItem, 'width' | 'depth'>, unitsPerMetre: number): number {
  return Math.max(MARKER_RADIUS, (Math.max(item.width, item.depth) * unitsPerMetre) / 2)
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Bounding box of everything drawn: shapes, markers (with a camera's view wedge) and equipment.
 * Null when there is nothing to draw. The background image is left out: it frames the drawing.
 */
export function drawingBounds(layout: FloorPlanLayout, markers: FloorPlanMarker[] = []): Bounds | null {
  const pts: Point[] = []
  const upm = layout.unitsPerMetre
  const around = (x: number, y: number, reach: number) => pts.push({ x: x - reach, y: y - reach }, { x: x + reach, y: y + reach })
  for (const s of layout.shapes) {
    if (s.kind === 'rect') pts.push({ x: s.x, y: s.y }, { x: s.x + s.width, y: s.y + s.height })
    else if (s.kind === 'path') pts.push(...s.points)
    else if (s.kind === 'text') pts.push(...textCorners(s))
    else around(s.x, s.y, itemReach(s, upm))
  }
  for (const m of markers) {
    if (m.kind === 'item') around(m.x, m.y, itemReach(m, upm))
    else around(m.x, m.y, m.kind === 'camera' ? CAMERA_VIEW_LENGTH : MARKER_RADIUS)
  }
  if (pts.length === 0) return null
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  }
}

/** SVG path data for a path shape (plan coordinates). */
export function pathData(shape: FloorPlanPath): string {
  const [first, ...rest] = shape.points
  if (!first) return ''
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}${shape.closed ? ' Z' : ''}`
}

/** Next default label for a new camera ("A", "B"…) or actor ("1", "2"…). */
export function nextMarkerLabel(markers: FloorPlanMarker[], kind: 'camera' | 'actor'): string {
  const used = new Set(markers.filter((m) => m.kind === kind).map((m) => m.label.trim().toUpperCase()))
  if (kind === 'camera') {
    for (let i = 0; i < 26; i += 1) {
      const label = String.fromCharCode(65 + i)
      if (!used.has(label)) return label
    }
    return ''
  }
  for (let i = 1; ; i += 1) if (!used.has(String(i))) return String(i)
}

/** A camera's colour from its letter (A orange, B cyan…); other labels take the first colour. */
export function cameraColor(label: string): string {
  const letter = label.trim().toUpperCase().charCodeAt(0)
  if (letter >= 65 && letter <= 90) return CAMERA_COLORS[(letter - 65) % CAMERA_COLORS.length]!
  return CAMERA_COLORS[0]!
}

/** The colour of an item: lights by source, flags black, everything else grip grey. */
export function itemColor(type: string): string {
  const entry = catalogItem(type)
  if (entry?.light) return LIGHT_SOURCE_COLORS[entry.light.source]
  if (entry?.glyph === 'flag') return FLAG_FILL
  return GRIP_COLOR
}

/** A round scale-bar length (1, 2, 5, 10, 20, 50… m) that draws between about 80 and 200 units. */
export function scaleBarMetres(unitsPerMetre: number): number {
  for (const m of [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
    if (m * unitsPerMetre >= 80) return m
  }
  return 1000
}

/**
 * Plan angle (degrees clockwise from +x, as everything else on the plan) of a compass bearing
 * (degrees clockwise from north), given which way north points on the plan.
 */
export function planAngleForBearing(north: number, bearing: number): number {
  return normalizeAngle(north + bearing - 90)
}
