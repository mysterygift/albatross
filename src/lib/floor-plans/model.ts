/**
 * Floor plan drawing model, shared by the editor, the repository and the PDF.
 *
 * Coordinates are plan units on a fixed canvas (`PLAN_WIDTH` x `PLAN_HEIGHT`, y pointing down, as
 * in SVG). Angles are degrees clockwise from +x (pointing right). Units are not a real-world scale.
 */

export const PLAN_WIDTH = 1200
export const PLAN_HEIGHT = 800
export const PLAN_GRID = 20

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

export type FloorPlanShape = FloorPlanRect | FloorPlanPath | FloorPlanText

export type FloorPlanLayout = { shapes: FloorPlanShape[] }

export const FLOOR_PLAN_MARKER_KINDS = ['camera', 'actor'] as const
export type FloorPlanMarkerKind = (typeof FLOOR_PLAN_MARKER_KINDS)[number]

/** A camera or actor position for a setup; `rotation` is the way it faces. */
export type FloorPlanMarker = {
  id: string
  kind: FloorPlanMarkerKind
  x: number
  y: number
  rotation: number
  label: string
}

/** Radius a marker is drawn at, in plan units (also used for bounds). */
export const MARKER_RADIUS = 16
/** Length of the camera's field-of-view wedge, in plan units. */
export const CAMERA_VIEW_LENGTH = 70
/** Half the camera's field-of-view angle, in degrees. */
export const CAMERA_VIEW_HALF_ANGLE = 22

export const DEFAULT_TEXT_FONT_SIZE = 18
export const MIN_TEXT_SIZE = 20

export function emptyLayout(): FloorPlanLayout {
  return { shapes: [] }
}

// ---------------------------------------------------------------------------
// Parsing (tolerant: bad entries are dropped, never thrown on)
// ---------------------------------------------------------------------------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function parsePoint(v: unknown): Point | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  return isNum(p.x) && isNum(p.y) ? { x: p.x, y: p.y } : null
}

function parseShape(v: unknown): FloorPlanShape | null {
  if (!v || typeof v !== 'object') return null
  const s = v as Record<string, unknown>
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
  return null
}

export function parseLayout(json: string | null | undefined): FloorPlanLayout {
  if (!json) return emptyLayout()
  try {
    const raw = JSON.parse(json) as unknown
    const shapes = raw && typeof raw === 'object' && Array.isArray((raw as { shapes?: unknown }).shapes)
      ? ((raw as { shapes: unknown[] }).shapes.map(parseShape).filter((s): s is FloorPlanShape => s != null))
      : []
    return { shapes }
  } catch {
    return emptyLayout()
  }
}

function parseMarker(v: unknown): FloorPlanMarker | null {
  if (!v || typeof v !== 'object') return null
  const m = v as Record<string, unknown>
  const id = str(m.id)
  if (!id || !FLOOR_PLAN_MARKER_KINDS.includes(m.kind as FloorPlanMarkerKind)) return null
  if (!isNum(m.x) || !isNum(m.y)) return null
  return {
    id,
    kind: m.kind as FloorPlanMarkerKind,
    x: m.x,
    y: m.y,
    rotation: isNum(m.rotation) ? m.rotation : 0,
    label: str(m.label),
  }
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

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Bounding box of everything drawn: shapes and markers (with a camera's view wedge). Null when
 * there is nothing to draw.
 */
export function drawingBounds(layout: FloorPlanLayout, markers: FloorPlanMarker[] = []): Bounds | null {
  const pts: Point[] = []
  for (const s of layout.shapes) {
    if (s.kind === 'rect') pts.push({ x: s.x, y: s.y }, { x: s.x + s.width, y: s.y + s.height })
    else if (s.kind === 'path') pts.push(...s.points)
    else pts.push(...textCorners(s))
  }
  for (const m of markers) {
    const reach = m.kind === 'camera' ? CAMERA_VIEW_LENGTH : MARKER_RADIUS
    pts.push({ x: m.x - reach, y: m.y - reach }, { x: m.x + reach, y: m.y + reach })
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

/** SVG path data for a camera's field-of-view wedge. */
export function cameraWedgeData(m: Pick<FloorPlanMarker, 'x' | 'y' | 'rotation'>): string {
  const a = ((m.rotation - CAMERA_VIEW_HALF_ANGLE) * Math.PI) / 180
  const b = ((m.rotation + CAMERA_VIEW_HALF_ANGLE) * Math.PI) / 180
  const p1 = { x: m.x + Math.cos(a) * CAMERA_VIEW_LENGTH, y: m.y + Math.sin(a) * CAMERA_VIEW_LENGTH }
  const p2 = { x: m.x + Math.cos(b) * CAMERA_VIEW_LENGTH, y: m.y + Math.sin(b) * CAMERA_VIEW_LENGTH }
  return `M ${m.x} ${m.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z`
}

/** Next default label for a new marker: "A", "B"… for cameras, "1", "2"… for actors. */
export function nextMarkerLabel(markers: FloorPlanMarker[], kind: FloorPlanMarkerKind): string {
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
