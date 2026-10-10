import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isMobilePlatform } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { applyTwoFinger, twoFingerTransform, type TwoFingerTransform } from './twoFinger'
import { FULL_VIEW, MAX_VIEW_SCALE, PlanViewContext, clampView, viewFractionToPlan, zoomView, type PlanView } from './planView'
import { catalogItem, defaultItemLabel, isArmGlyph } from '@/lib/floor-plans/catalog'
import { itemLightColor, itemPrimitives, itemRoleStyle, type ItemPrimitive } from '@/lib/floor-plans/itemGeometry'
import {
  CAMERA_VIEW_HALF_ANGLE,
  CAMERA_VIEW_LENGTH,
  DEFAULT_ACTOR_COLOR,
  DEFAULT_SHAPE_FILL_OPACITY,
  DEFAULT_TEXT_FONT_SIZE,
  MARKER_RADIUS,
  MIN_TEXT_SIZE,
  PLAN_HEIGHT,
  PLAN_WIDTH,
  angleBetween,
  backgroundCentre,
  backgroundCorners,
  cameraColor,
  clampToPlan,
  constrainSegment,
  itemReach,
  nextMarkerLabel,
  normalizeAngle,
  pathData,
  planAngleForBearing,
  rectFromCorners,
  rotateBackground,
  rotatePoint,
  scaleBackgroundFromCorner,
  scaleBarMetres,
  snapAngle,
  textCentre,
  translateShape,
  type FloorPlanBackground,
  type FloorPlanItem,
  type FloorPlanLayout,
  type FloorPlanMarker,
  type FloorPlanRect,
  type FloorPlanShape,
  type FloorPlanText,
  type Point,
} from '@/lib/floor-plans/model'
import type { SunOverlay } from '@/lib/floor-plans/sun'

export type FloorPlanTool = 'select' | 'rect' | 'path' | 'text' | 'camera' | 'actor' | 'item' | 'measure' | 'background'

/** Clicking within this distance of a path's first point closes it. */
const CLOSE_DISTANCE = 12
const DOUBLE_CLICK_MS = 500
const HANDLE = 10
/** Invisible hit radius round a handle on touch screens, in screen-sized plan units. */
const TOUCH_HANDLE_HIT = 22
/** A finger that moves less than this (px) before lifting is a tap. */
const TAP_SLOP = 10
const ZOOM_STEP = 1.5

/** Handles stay the same size on screen at any zoom (`k` = 1 / zoom), and grow a hit area on touch. */
const HandleSizeContext = createContext<{ k: number; touch: boolean }>({ k: 1, touch: false })
const ROTATE_HANDLE_GAP = 28
const NUDGE = 1
const NUDGE_FAST = 10
const SUN_RING = Math.min(PLAN_WIDTH, PLAN_HEIGHT) / 2 - 28
const CENTRE: Point = { x: PLAN_WIDTH / 2, y: PLAN_HEIGHT / 2 }

type Gesture =
  | { kind: 'move-shape'; id: string; start: Point; original: FloorPlanShape }
  | { kind: 'move-marker'; id: string; start: Point; original: FloorPlanMarker }
  | { kind: 'draw-rect'; start: Point }
  | { kind: 'resize-rect'; id: string; fixed: Point }
  | { kind: 'move-vertex'; id: string; index: number }
  | { kind: 'resize-text'; id: string; original: FloorPlanText }
  | { kind: 'rotate-text'; id: string; centre: Point }
  | { kind: 'rotate'; id: string; target: 'shape' | 'marker' }
  | { kind: 'resize-item'; id: string; target: 'shape' | 'marker' }
  | { kind: 'reach-item'; id: string; target: 'shape' | 'marker' }
  | { kind: 'measure'; start: Point }
  | { kind: 'move-background'; start: Point; original: FloorPlanBackground }
  /** A touch on the plan that places something when the finger lifts (unless it became a pinch). */
  | { kind: 'tap'; start: Point; client: Point }
  | { kind: 'pan'; client: Point; view: PlanView }
  | { kind: 'pinch'; distance: number; mid: Point; view: PlanView }
  /** Two fingers on the background (Background tool): spread to scale it, twist to turn it. */
  | { kind: 'pinch-background'; a0: Point; b0: Point; original: FloorPlanBackground; north: number; unitsPerMetre: number }
  /** Two fingers on a shape or marker: twist to turn it, spread to scale it where it has a size. */
  | { kind: 'pinch-target'; a0: Point; b0: Point; original: FloorPlanShape | FloorPlanMarker; target: 'shape' | 'marker' }
  | { kind: 'resize-background'; original: FloorPlanBackground; corner: number; unitsPerMetre: number }
  | { kind: 'rotate-background'; original: FloorPlanBackground; north: number; start: Point }

export type FloorPlanCanvasProps = {
  layout: FloorPlanLayout
  /** The background picture or map (data URL), placed by `layout.background`. */
  backgroundImage?: string | null
  /** Set when the layout is being edited (Layout mode). */
  onLayoutChange?: (next: FloorPlanLayout, transient: boolean) => void
  markers?: FloorPlanMarker[]
  /** Set when a setup is being edited (Setups mode). */
  onMarkersChange?: (next: FloorPlanMarker[], transient: boolean) => void
  tool: FloorPlanTool
  onToolChange: (tool: FloorPlanTool) => void
  /** Equipment the `item` tool places (catalogue id). */
  placingItem?: string | null
  /** Cast member the `actor` tool places. */
  placingPerson?: { personId: string | null; label: string } | null
  /** Lines, rotations and facing snap to 90° steps. */
  snap: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUndo: () => void
  onRedo: () => void
  /** Called after a text box is placed, so its text can be typed straight away. */
  onTextCreated?: (id: string) => void
  /** Called when a measuring line is finished, with its length in plan units. */
  onMeasure?: (length: number) => void
  /** A cast member's booking colour. */
  actorColor?: (personId: string | null) => string
  sun?: SunOverlay | null
  /** Floating panels positioned over the plan (selection popover, chips). */
  children?: ReactNode
  className?: string
}

/** Editable SVG floor plan: draw the space, place equipment, plot cameras and cast. */
export function FloorPlanCanvas({
  layout,
  backgroundImage,
  onLayoutChange,
  markers = [],
  onMarkersChange,
  tool,
  onToolChange,
  placingItem,
  placingPerson,
  snap,
  selectedId,
  onSelect,
  onUndo,
  onRedo,
  onTextCreated,
  onMeasure,
  actorColor = () => DEFAULT_ACTOR_COLOR,
  sun,
  children,
  className,
}: FloorPlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  /** Where and when the last point of a line was clicked, to spot the second click of a double-click. */
  const lastPathClick = useRef<{ at: Point; time: number } | null>(null)
  const [rectDraft, setRectDraft] = useState<{ a: Point; b: Point } | null>(null)
  const [pathDraft, setPathDraft] = useState<Point[] | null>(null)
  const [measureDraft, setMeasureDraft] = useState<{ a: Point; b: Point } | null>(null)
  const [hover, setHover] = useState<Point | null>(null)
  const [view, setView] = useState<PlanView>(FULL_VIEW)
  const [touchUi] = useState(() => isMobilePlatform())
  /** Fingers on the plan, by pointer id, in client pixels: two make a pinch. */
  const pointers = useRef(new Map<number, Point>())
  /** Whether the current gesture has changed anything yet (so a pinch can undo it). */
  const moved = useRef(false)

  const editingLayout = !!onLayoutChange
  const editingMarkers = !!onMarkersChange
  const upm = layout.unitsPerMetre

  /** Pointer position as fractions of the canvas box. */
  const toFraction = (e: { clientX: number; clientY: number }): Point | null => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return null
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }
  }

  /** Pointer position in plan units. The SVG keeps the plan's aspect ratio, so its box maps straight on. */
  const toPlan = (e: { clientX: number; clientY: number }, clamp = true): Point => {
    const f = toFraction(e)
    if (!f) return { x: 0, y: 0 }
    const at = viewFractionToPlan(view, f)
    const p = { x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10 }
    return clamp ? clampToPlan(p) : p
  }

  // Ctrl/⌘ + scroll (and a trackpad pinch, which arrives as one) zooms round the pointer.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const box = svg.getBoundingClientRect()
      if (box.width === 0) return
      const at = { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }
      setView((v) => zoomView(v, v.scale * Math.exp(-e.deltaY * 0.01), at))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (factor: number) => setView((v) => zoomView(v, v.scale * factor, { x: 0.5, y: 0.5 }))

  const setLayout = (patch: Partial<FloorPlanLayout>, transient: boolean) => onLayoutChange?.({ ...layout, ...patch }, transient)
  const setShapes = (shapes: FloorPlanShape[], transient: boolean) => setLayout({ shapes }, transient)
  const replaceShape = (shape: FloorPlanShape, transient: boolean) =>
    setShapes(layout.shapes.map((s) => (s.id === shape.id ? shape : s)), transient)
  const replaceMarker = (marker: FloorPlanMarker, transient: boolean) =>
    onMarkersChange?.(markers.map((m) => (m.id === marker.id ? marker : m)), transient)
  const findItem = (id: string, target: 'shape' | 'marker'): FloorPlanItem | FloorPlanMarker | undefined =>
    target === 'shape' ? (layout.shapes.find((s) => s.id === id && s.kind === 'item') as FloorPlanItem | undefined) : markers.find((m) => m.id === id)
  const replaceTarget = (next: FloorPlanItem | FloorPlanMarker, target: 'shape' | 'marker', transient: boolean) =>
    target === 'shape' ? replaceShape(next as FloorPlanItem, transient) : replaceMarker(next as FloorPlanMarker, transient)

  const finishPath = (draft: Point[], closed: boolean) => {
    setPathDraft(null)
    setHover(null)
    // A double-click lands two clicks on the same spot; keep one point.
    const points = draft.filter((p, i) => i === 0 || Math.hypot(p.x - draft[i - 1]!.x, p.y - draft[i - 1]!.y) > 1)
    if (points.length < 2) return
    const id = crypto.randomUUID()
    setShapes([...layout.shapes, { id, kind: 'path', points, closed: closed && points.length > 2 }], false)
    onSelect(id)
  }

  const capture = (e: ReactPointerEvent) => {
    moved.current = false
    containerRef.current?.focus({ preventScroll: true })
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic events (tests) have no active pointer to capture.
    }
  }

  const newItem = (type: string, at: Point): FloorPlanItem | null => {
    const entry = catalogItem(type)
    if (!entry) return null
    return {
      id: crypto.randomUUID(),
      kind: 'item',
      type,
      x: at.x,
      y: at.y,
      rotation: entry.category === 'lighting' || entry.category === 'camera-support' ? 270 : 0,
      label: defaultItemLabel(entry),
      width: entry.width,
      depth: entry.depth,
    }
  }

  const onBackgroundPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    capture(e)
    const p = toPlan(e)
    if (tool === 'measure') {
      gesture.current = { kind: 'measure', start: p }
      setMeasureDraft({ a: p, b: p })
      return
    }
    if (editingLayout && tool === 'rect') {
      gesture.current = { kind: 'draw-rect', start: p }
      setRectDraft({ a: p, b: p })
      return
    }
    const placing = (editingLayout && (tool === 'path' || tool === 'text')) || (tool === 'item' && !!placingItem) || (editingMarkers && (tool === 'camera' || tool === 'actor'))
    if (placing && e.pointerType === 'touch') {
      // On touch, place when the finger lifts, so a pinch that starts here zooms instead.
      gesture.current = { kind: 'tap', start: p, client: { x: e.clientX, y: e.clientY } }
      return
    }
    if (placing) return placeAt(p, e.timeStamp, false)
    if (view.scale > 1) gesture.current = { kind: 'pan', client: { x: e.clientX, y: e.clientY }, view }
    onSelect(null)
  }

  /** Adds a line point, label, item, camera or cast member at `p`, for the current tool. */
  const placeAt = (p: Point, time: number, touch: boolean) => {
    if (editingLayout && tool === 'path') {
      // The second click of a double-click (which finishes the line) adds no point of its own.
      // On touch a double tap finishes the line (iOS sends no double-click).
      const prev = lastPathClick.current
      lastPathClick.current = { at: p, time }
      if (pathDraft && prev && time - prev.time < DOUBLE_CLICK_MS && Math.hypot(p.x - prev.at.x, p.y - prev.at.y) < (touch ? 16 / view.scale : 6)) {
        if (touch) finishPath(pathDraft, false)
        return
      }
      const points = pathDraft ?? []
      const first = points[0]
      if (first && points.length > 2 && Math.hypot(p.x - first.x, p.y - first.y) <= CLOSE_DISTANCE) {
        finishPath(points, true)
        return
      }
      const last = points[points.length - 1]
      const next = last ? constrainSegment(last, p, snap) : p
      setPathDraft([...points, next])
      return
    }
    if (editingLayout && tool === 'text') {
      const width = 160
      const height = 40
      const id = crypto.randomUUID()
      const x = Math.min(Math.max(0, p.x - width / 2), PLAN_WIDTH - width)
      const y = Math.min(Math.max(0, p.y - height / 2), PLAN_HEIGHT - height)
      setShapes(
        [...layout.shapes, { id, kind: 'text', x, y, width, height, rotation: 0, text: 'Label', fontSize: DEFAULT_TEXT_FONT_SIZE }],
        false
      )
      onSelect(id)
      onToolChange('select')
      onTextCreated?.(id)
      return
    }
    if (tool === 'item' && placingItem) {
      const item = newItem(placingItem, p)
      if (!item) return
      if (editingLayout) setShapes([...layout.shapes, item], false)
      else if (editingMarkers) onMarkersChange?.([...markers, item], false)
      onSelect(item.id)
      onToolChange('select')
      return
    }
    if (editingMarkers && tool === 'camera') {
      const id = crypto.randomUUID()
      onMarkersChange?.([...markers, { id, kind: 'camera', x: p.x, y: p.y, rotation: 270, label: nextMarkerLabel(markers, 'camera') }], false)
      onSelect(id)
      onToolChange('select')
      return
    }
    if (editingMarkers && tool === 'actor') {
      const id = crypto.randomUUID()
      const label = placingPerson?.label || nextMarkerLabel(markers, 'actor')
      onMarkersChange?.([...markers, { id, kind: 'actor', x: p.x, y: p.y, rotation: 270, label, personId: placingPerson?.personId ?? null }], false)
      onSelect(id)
      onToolChange('select')
      return
    }
  }

  /** Ends the current gesture because a second finger turned it into a pinch. */
  const cancelGesture = () => {
    const g = gesture.current
    gesture.current = null
    setRectDraft(null)
    setMeasureDraft(null)
    if (!g || !moved.current) return
    if (g.kind === 'move-shape') replaceShape(g.original, false)
    else if (g.kind === 'move-marker') replaceMarker(g.original, false)
    else commitGesture(g)
  }

  const onPointerDownCapture = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') return
    // The first finger down starts afresh, in case a lift was missed.
    if (e.isPrimary) pointers.current.clear()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size < 2) return
    // A second finger pinches to zoom and pan, instead of whatever the first one started.
    e.stopPropagation()
    if (pointers.current.size > 2) return
    capture(e)
    const [a, b] = [...pointers.current.values()] as [Point, Point]
    const a0 = toPlan({ clientX: a.x, clientY: a.y }, false)
    const b0 = toPlan({ clientX: b.x, clientY: b.y }, false)
    const first = gesture.current
    // With the Background tool, two fingers scale and turn the picture.
    if (tool === 'background' && layout.background) {
      const original = first?.kind === 'move-background' ? first.original : layout.background
      if (first?.kind === 'move-background' && moved.current) setLayout({ background: original }, true)
      gesture.current = { kind: 'pinch-background', a0, b0, original, north: layout.north, unitsPerMetre: upm }
      return
    }
    // The first finger on a shape or marker: the second one twists and scales it, from where it was.
    if (first?.kind === 'move-shape' || first?.kind === 'move-marker') {
      const target = first.kind === 'move-shape' ? 'shape' : 'marker'
      if (moved.current) replaceTarget(first.original as FloorPlanItem, target, true)
      gesture.current = { kind: 'pinch-target', a0, b0, original: first.original, target }
      return
    }
    // Anywhere else, two fingers zoom and pan the view.
    cancelGesture()
    const mid = toFraction({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
    if (mid) gesture.current = { kind: 'pinch', distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid, view }
  }

  /** The current two-finger transform, in plan units. */
  const fingers = (a0: Point, b0: Point): TwoFingerTransform | null => {
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return null
    return twoFingerTransform(a0, b0, toPlan({ clientX: a.x, clientY: a.y }, false), toPlan({ clientX: b.x, clientY: b.y }, false))
  }

  const pinchBackground = (g: Extract<Gesture, { kind: 'pinch-background' }>) => {
    const t = fingers(g.a0, g.b0)
    if (!t) return
    const o = g.original
    const scale = Math.max(60 / o.width, t.scale)
    const centre = applyTwoFinger({ ...t, scale }, t.turn, backgroundCentre(o))
    const width = o.width * scale
    const height = o.height * scale
    const background = { ...o, x: centre.x - width / 2, y: centre.y - height / 2, width, height }
    // The picture set the plan's scale, so it follows; north turns with the picture.
    setLayout(
      { ...rotateBackground({ ...layout, background, north: g.north }, o.rotation + t.turn), unitsPerMetre: g.unitsPerMetre * scale },
      true
    )
  }

  const pinchTarget = (g: Extract<Gesture, { kind: 'pinch-target' }>) => {
    const t = fingers(g.a0, g.b0)
    if (!t) return
    const o = g.original
    const turnTo = (rotation: number) => (snap ? snapAngle(rotation + t.turn) : Math.round(rotation + t.turn))
    const carry = (p: Point, turn = t.turn, scale = t.scale) => applyTwoFinger({ ...t, scale }, turn, p)
    let next: FloorPlanShape | FloorPlanMarker
    if (o.kind === 'item') {
      const rotation = turnTo(o.rotation)
      const sized = catalogItem(o.type)?.resizable
      const size = (m: number) => Math.max(0.1, Math.round(m * t.scale * 10) / 10)
      next = {
        ...o,
        ...clampToPlan(carry(o, rotation - o.rotation, 1)),
        rotation,
        ...(sized ? { width: size(o.width), depth: size(o.depth) } : {}),
      }
    } else if (o.kind === 'camera' || o.kind === 'actor') {
      const rotation = turnTo(o.rotation)
      next = { ...o, ...clampToPlan(carry(o, rotation - o.rotation, 1)), rotation }
    } else if (o.kind === 'text') {
      const rotation = turnTo(o.rotation)
      const scale = Math.max(MIN_TEXT_SIZE / Math.min(o.width, o.height), t.scale)
      const c = carry(textCentre(o), rotation - o.rotation, 1)
      const width = o.width * scale
      const height = o.height * scale
      next = { ...o, x: c.x - width / 2, y: c.y - height / 2, width, height, rotation, fontSize: Math.round(o.fontSize * scale) }
    } else if (o.kind === 'rect') {
      // Rectangles stay square to the plan: two fingers scale them about their centre.
      const c = carry({ x: o.x + o.width / 2, y: o.y + o.height / 2 }, 0)
      const width = Math.max(4, o.width * t.scale)
      const height = Math.max(4, o.height * t.scale)
      next = { ...o, x: c.x - width / 2, y: c.y - height / 2, width, height }
    } else {
      const turn = snap ? snapAngle(t.turn) : t.turn
      next = { ...o, points: o.points.map((p) => carry(p, turn)) }
    }
    replaceTarget(next as FloorPlanItem, g.target, true)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (g?.kind === 'pinch-background') return pinchBackground(g)
    if (g?.kind === 'pinch-target') return pinchTarget(g)
    if (g?.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()]
      if (!a || !b) return
      const mid = toFraction({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      if (mid) setView(zoomView(g.view, (g.view.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.distance, g.mid, mid))
      return
    }
    if (g?.kind === 'pan') {
      const box = svgRef.current?.getBoundingClientRect()
      if (!box || box.width === 0) return
      const dx = ((e.clientX - g.client.x) / box.width) * (PLAN_WIDTH / g.view.scale)
      const dy = ((e.clientY - g.client.y) / box.height) * (PLAN_HEIGHT / g.view.scale)
      setView(clampView({ ...g.view, x: g.view.x - dx, y: g.view.y - dy }))
      return
    }
    if (g?.kind === 'tap') return
    const p = toPlan(e)
    if (pathDraft) setHover(p)
    if (!g) return
    moved.current = true
    if (g.kind === 'draw-rect') {
      setRectDraft({ a: g.start, b: p })
    } else if (g.kind === 'measure') {
      setMeasureDraft({ a: g.start, b: constrainSegment(g.start, p, snap) })
    } else if (g.kind === 'move-shape') {
      replaceShape(translateShape(g.original, p.x - g.start.x, p.y - g.start.y), true)
    } else if (g.kind === 'move-marker') {
      const moved = clampToPlan({ x: g.original.x + p.x - g.start.x, y: g.original.y + p.y - g.start.y })
      replaceMarker({ ...g.original, ...moved }, true)
    } else if (g.kind === 'resize-rect') {
      const shape = layout.shapes.find((s) => s.id === g.id)
      if (shape?.kind === 'rect') replaceShape({ ...shape, ...rectFromCorners(g.fixed, p) }, true)
    } else if (g.kind === 'move-vertex') {
      const shape = layout.shapes.find((s) => s.id === g.id)
      if (shape?.kind !== 'path') return
      const neighbour = shape.points[g.index === 0 ? 1 : g.index - 1]
      const point = neighbour ? constrainSegment(neighbour, p, snap) : p
      replaceShape({ ...shape, points: shape.points.map((q, i) => (i === g.index ? point : q)) }, true)
    } else if (g.kind === 'resize-text') {
      const t = g.original
      // The rotated top-left corner stays put; the box grows towards the pointer in its own frame.
      const fixed = rotatePoint({ x: t.x, y: t.y }, textCentre(t), t.rotation)
      const local = rotatePoint(p, fixed, -t.rotation)
      const width = Math.max(MIN_TEXT_SIZE, local.x - fixed.x)
      const height = Math.max(MIN_TEXT_SIZE, local.y - fixed.y)
      const centre = rotatePoint({ x: fixed.x + width / 2, y: fixed.y + height / 2 }, fixed, t.rotation)
      replaceShape({ ...t, width, height, x: centre.x - width / 2, y: centre.y - height / 2 }, true)
    } else if (g.kind === 'rotate-text') {
      const shape = layout.shapes.find((s) => s.id === g.id)
      if (shape?.kind !== 'text') return
      const raw = normalizeAngle(angleBetween(g.centre, p) + 90)
      replaceShape({ ...shape, rotation: snap ? snapAngle(raw) : Math.round(raw) }, true)
    } else if (g.kind === 'rotate') {
      const target = findItem(g.id, g.target)
      if (!target) return
      const raw = angleBetween(target, p)
      replaceTarget({ ...target, rotation: snap ? snapAngle(raw) : Math.round(raw) }, g.target, true)
    } else if (g.kind === 'resize-item') {
      const target = findItem(g.id, g.target)
      if (!target || target.kind !== 'item') return
      // Pointer in the item's own frame: x along the way it faces, y across.
      const local = rotatePoint(p, target, -target.rotation)
      const depth = Math.max(0.1, Math.round(((Math.abs(local.x - target.x) * 2) / upm) * 10) / 10)
      const width = Math.max(0.1, Math.round(((Math.abs(local.y - target.y) * 2) / upm) * 10) / 10)
      replaceTarget({ ...target, width, depth }, g.target, true)
    } else if (g.kind === 'reach-item') {
      // Dragging an arm's tip swings it round and sets how far it reaches.
      const target = findItem(g.id, g.target)
      if (!target || target.kind !== 'item') return
      const raw = angleBetween(target, p)
      const depth = Math.max(0.5, Math.round((Math.hypot(p.x - target.x, p.y - target.y) / upm) * 10) / 10)
      replaceTarget({ ...target, rotation: snap ? snapAngle(raw) : Math.round(raw), depth }, g.target, true)
    } else if (g.kind === 'move-background') {
      const free = toPlan(e, false)
      setLayout({ background: { ...g.original, x: g.original.x + free.x - g.start.x, y: g.original.y + free.y - g.start.y } }, true)
    } else if (g.kind === 'resize-background') {
      // The opposite corner stays put and the picture keeps its shape. The plan's scale was set on
      // the picture, so it grows and shrinks with it.
      const { background, factor } = scaleBackgroundFromCorner(g.original, g.corner, toPlan(e, false))
      setLayout({ background, unitsPerMetre: g.unitsPerMetre * factor }, true)
    } else if (g.kind === 'rotate-background') {
      // Turns about the picture's centre by how far the pointer has swung round it; north follows.
      // Shift snaps to 15° steps.
      const c = backgroundCentre(g.original)
      let rotation = g.original.rotation + angleBetween(c, toPlan(e, false)) - angleBetween(c, g.start)
      if (e.shiftKey) rotation = Math.round(rotation / 15) * 15
      setLayout(rotateBackground({ ...layout, background: g.original, north: g.north }, rotation), true)
    }
  }

  /** Records a finished drag as one undo step. */
  const commitGesture = (g: Gesture) => {
    const onMarker = g.kind === 'move-marker' || ((g.kind === 'rotate' || g.kind === 'resize-item' || g.kind === 'reach-item') && g.target === 'marker')
    if (onMarker) onMarkersChange?.(markers, false)
    else onLayoutChange?.(layout, false)
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    gesture.current = null
    if (!g || g.kind === 'pinch' || g.kind === 'pan') return
    // Lifting a finger ends a two-finger change as one undo step.
    if (g.kind === 'pinch-background') return void onLayoutChange?.(layout, false)
    if (g.kind === 'pinch-target') {
      if (g.target === 'marker') onMarkersChange?.(markers, false)
      else onLayoutChange?.(layout, false)
      return
    }
    if (g.kind === 'tap') {
      if (e.type !== 'pointercancel' && Math.hypot(e.clientX - g.client.x, e.clientY - g.client.y) < TAP_SLOP) placeAt(g.start, e.timeStamp, true)
      return
    }
    if (g.kind === 'draw-rect') {
      setRectDraft(null)
      const r = rectFromCorners(g.start, toPlan(e))
      if (r.width < 4 || r.height < 4) return
      const id = crypto.randomUUID()
      setShapes([...layout.shapes, { id, kind: 'rect', ...r }], false)
      onSelect(id)
      return
    }
    if (g.kind === 'measure') {
      const end = constrainSegment(g.start, toPlan(e), snap)
      const length = Math.hypot(end.x - g.start.x, end.y - g.start.y)
      setMeasureDraft(length >= 10 ? { a: g.start, b: end } : null)
      if (length >= 10) onMeasure?.(length)
      return
    }
    commitGesture(g)
  }

  const interactiveLayout = editingLayout && tool === 'select'
  const startOnShape = (e: ReactPointerEvent, shape: FloorPlanShape) => {
    if (!interactiveLayout || e.button !== 0) return
    e.stopPropagation()
    capture(e)
    onSelect(shape.id)
    gesture.current = { kind: 'move-shape', id: shape.id, start: toPlan(e), original: shape }
  }

  const startOnMarker = (e: ReactPointerEvent, marker: FloorPlanMarker) => {
    if (!editingMarkers || e.button !== 0) return
    e.stopPropagation()
    capture(e)
    onSelect(marker.id)
    if (tool !== 'select') onToolChange('select')
    gesture.current = { kind: 'move-marker', id: marker.id, start: toPlan(e), original: marker }
  }

  const startHandle = (e: ReactPointerEvent, g: Gesture) => {
    if (e.button !== 0) return
    e.stopPropagation()
    capture(e)
    gesture.current = g
  }

  const startOnBackground = (e: ReactPointerEvent) => {
    if (tool !== 'background' || !layout.background || e.button !== 0) return onBackgroundPointerDown(e)
    e.stopPropagation()
    capture(e)
    gesture.current = { kind: 'move-background', start: toPlan(e, false), original: layout.background }
  }

  const deleteSelected = () => {
    if (!selectedId) return
    if (editingLayout && layout.shapes.some((s) => s.id === selectedId)) {
      setShapes(layout.shapes.filter((s) => s.id !== selectedId), false)
      onSelect(null)
    } else if (editingMarkers && markers.some((m) => m.id === selectedId)) {
      onMarkersChange?.(markers.filter((m) => m.id !== selectedId), false)
      onSelect(null)
    }
  }

  const nudge = (dx: number, dy: number) => {
    const shape = editingLayout ? layout.shapes.find((s) => s.id === selectedId) : undefined
    if (shape) return replaceShape(translateShape(shape, dx, dy), false)
    const marker = editingMarkers ? markers.find((m) => m.id === selectedId) : undefined
    if (marker) replaceMarker({ ...marker, ...clampToPlan({ x: marker.x + dx, y: marker.y + dy }) }, false)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) onRedo()
      else onUndo()
      return
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      onRedo()
      return
    }
    if (pathDraft && e.key === 'Enter') {
      e.preventDefault()
      finishPath(pathDraft, false)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      if (pathDraft) {
        setPathDraft(null)
        setHover(null)
      } else if (tool !== 'select') onToolChange('select')
      else onSelect(null)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      deleteSelected()
      return
    }
    const step = e.shiftKey ? NUDGE_FAST : NUDGE
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const delta = arrows[e.key]
    if (delta && selectedId) {
      e.preventDefault()
      nudge(delta[0], delta[1])
    }
  }

  const selectedShape = editingLayout ? layout.shapes.find((s) => s.id === selectedId) : undefined
  const selectedMarker = editingMarkers ? markers.find((m) => m.id === selectedId) : undefined
  const drawing = tool !== 'select' && tool !== 'background'
  const lastDraft = pathDraft?.[pathDraft.length - 1]
  const previewPoint = lastDraft && hover ? constrainSegment(lastDraft, hover, snap) : null
  const bg = layout.background
  const gridStep = gridStepUnits(upm)
  // The scale bar is drawn at screen size, so it measures the zoomed plan.
  const screenUpm = upm * view.scale
  const barMetres = scaleBarMetres(screenUpm)

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="Floor plan editor"
      data-slot="floor-plan-canvas"
      onKeyDown={onKeyDown}
      className={cn('relative overflow-hidden rounded-xl border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring/40', className)}
    >
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${PLAN_WIDTH / view.scale} ${PLAN_HEIGHT / view.scale}`}
        className={cn('block aspect-[3/2] h-auto w-full touch-none select-none text-foreground', drawing ? 'cursor-crosshair' : 'cursor-default')}
        onPointerDownCapture={onPointerDownCapture}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => pathDraft && finishPath(pathDraft, false)}
        data-testid="floor-plan-canvas"
      >
        <defs>
          <pattern id="fp-grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
            <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" className="stroke-border" strokeWidth={0.6} />
          </pattern>
        </defs>
        <rect width={PLAN_WIDTH} height={PLAN_HEIGHT} className="fill-card" />
        {bg && backgroundImage ? (
          <image
            href={backgroundImage}
            x={bg.x}
            y={bg.y}
            width={bg.width}
            height={bg.height}
            opacity={bg.opacity}
            transform={bg.rotation ? `rotate(${bg.rotation} ${bg.x + bg.width / 2} ${bg.y + bg.height / 2})` : undefined}
            preserveAspectRatio="none"
            data-testid="floor-plan-background-image"
          />
        ) : null}
        <rect
          width={PLAN_WIDTH}
          height={PLAN_HEIGHT}
          fill="url(#fp-grid)"
          opacity={bg && backgroundImage ? 0.45 : 1}
          onPointerDown={startOnBackground}
          className={tool === 'background' ? 'cursor-move' : undefined}
          data-testid="floor-plan-background"
        />

        {/* While drawing, clicks pass through existing shapes to the background. */}
        <g opacity={editingLayout ? 1 : 0.6} pointerEvents={interactiveLayout ? undefined : 'none'}>
          {layout.shapes.map((shape) =>
            shape.kind === 'item' ? (
              <ItemView
                key={shape.id}
                item={shape}
                upm={upm}
                selected={shape.id === selectedId}
                interactive={interactiveLayout}
                onPointerDown={(e) => startOnShape(e, shape)}
              />
            ) : (
              <ShapeView
                key={shape.id}
                shape={shape}
                selected={shape.id === selectedId}
                interactive={interactiveLayout}
                onPointerDown={(e) => startOnShape(e, shape)}
              />
            )
          )}
        </g>

        {rectDraft ? (
          <rect
            {...rectFromCorners(rectDraft.a, rectDraft.b)}
            className="fill-primary/10 stroke-primary"
            strokeWidth={2}
            strokeDasharray="8 6"
            pointerEvents="none"
          />
        ) : null}

        {pathDraft ? (
          <g pointerEvents="none">
            <path d={pathData({ id: 'draft', kind: 'path', points: pathDraft.length > 1 ? pathDraft : [pathDraft[0]!, pathDraft[0]!], closed: false })} fill="none" className="stroke-primary" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            {previewPoint && lastDraft ? (
              <line x1={lastDraft.x} y1={lastDraft.y} x2={previewPoint.x} y2={previewPoint.y} className="stroke-primary" strokeWidth={2} strokeDasharray="8 6" />
            ) : null}
            {pathDraft.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={i === 0 && pathDraft.length > 2 ? CLOSE_DISTANCE / 1.5 : 4} className={i === 0 ? 'fill-primary/30 stroke-primary' : 'fill-primary'} strokeWidth={2} />
            ))}
          </g>
        ) : null}

        <g pointerEvents={editingMarkers ? undefined : 'none'}>
          {markers.filter((m) => m.kind === 'item').map((m) => (
            <ItemView
              key={m.id}
              item={m as FloorPlanItem}
              upm={upm}
              selected={m.id === selectedId}
              interactive={editingMarkers}
              onPointerDown={(e) => startOnMarker(e, m)}
            />
          ))}
          {markers.filter((m) => m.kind !== 'item').map((m) => (
            <MarkerView
              key={m.id}
              marker={m}
              color={m.kind === 'camera' ? cameraColor(m.label) : actorColor(m.kind === 'actor' ? m.personId : null)}
              selected={m.id === selectedId}
              interactive={editingMarkers}
              onPointerDown={(e) => startOnMarker(e, m)}
            />
          ))}
        </g>

        {/* The sun, north arrow and scale bar stay put on screen while the plan zooms. */}
        <g transform={`translate(${view.x} ${view.y}) scale(${1 / view.scale})`}>
          {sun ? <SunView sun={sun} north={layout.north} /> : null}

          <NorthArrow north={layout.north} />
          <g transform={`translate(24 ${PLAN_HEIGHT - 34})`} pointerEvents="none" data-testid="floor-plan-scale-bar">
            <rect x={0} y={0} width={barMetres * screenUpm} height={6} className="fill-foreground" />
            <rect x={0} y={0} width={(barMetres * screenUpm) / 2} height={6} className="fill-muted-foreground" />
            <text x={0} y={22} className="fill-foreground" style={{ fontSize: 13 }}>0</text>
            <text x={barMetres * screenUpm} y={22} textAnchor="end" className="fill-foreground" style={{ fontSize: 13 }}>
              {barMetres} m
            </text>
          </g>
        </g>

        {measureDraft ? (
          <g pointerEvents="none">
            <line x1={measureDraft.a.x} y1={measureDraft.a.y} x2={measureDraft.b.x} y2={measureDraft.b.y} className="stroke-primary" strokeWidth={3} strokeDasharray="10 6" />
            <circle cx={measureDraft.a.x} cy={measureDraft.a.y} r={6} className="fill-primary" />
            <circle cx={measureDraft.b.x} cy={measureDraft.b.y} r={6} className="fill-primary" />
          </g>
        ) : null}

        <HandleSizeContext.Provider value={{ k: 1 / view.scale, touch: touchUi }}>
          {tool === 'background' && bg ? (
            <BackgroundHandles
              bg={bg}
              onScale={(e, corner) => startHandle(e, { kind: 'resize-background', original: bg, corner, unitsPerMetre: upm })}
              onRotate={(e) => startHandle(e, { kind: 'rotate-background', original: bg, north: layout.north, start: toPlan(e, false) })}
            />
          ) : null}
          {selectedShape && tool === 'select' ? <ShapeHandles shape={selectedShape} upm={upm} startHandle={startHandle} /> : null}
          {selectedMarker ? <MarkerHandles marker={selectedMarker} upm={upm} startHandle={startHandle} /> : null}
        </HandleSizeContext.Provider>
      </svg>
      {pathDraft ? (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-background/90 px-2 py-1 shadow-sm">
          {touchUi ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => { setPathDraft(null); setHover(null) }}>
              Cancel
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Double-click to finish | Esc to cancel</span>
          )}
          <Button type="button" size="sm" disabled={pathDraft.length < 2} onClick={() => finishPath(pathDraft, false)}>
            Done
          </Button>
        </div>
      ) : null}
      <div className="absolute right-2 bottom-2 flex items-center rounded-lg border bg-background/90 shadow-sm">
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Zoom out" disabled={view.scale <= 1} onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <Minus />
        </Button>
        {view.scale > 1 ? (
          <Button type="button" size="sm" variant="ghost" aria-label="Show the whole plan" className="px-1.5 tabular-nums" onClick={() => setView(FULL_VIEW)}>
            {Math.round(view.scale * 100)}%
          </Button>
        ) : null}
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Zoom in" disabled={view.scale >= MAX_VIEW_SCALE} onClick={() => zoomBy(ZOOM_STEP)}>
          <Plus />
        </Button>
      </div>
      <PlanViewContext.Provider value={view}>{children}</PlanViewContext.Provider>
    </div>
  )
}

/** Grid spacing in plan units: a round number of metres, 15 to 75 units apart. */
function gridStepUnits(upm: number): number {
  for (const m of [0.25, 0.5, 1, 2, 5, 10, 20, 50]) {
    if (m * upm >= 15) return m * upm
  }
  return 50 * upm
}

function ShapeView({
  shape,
  selected,
  interactive,
  onPointerDown,
}: {
  shape: Exclude<FloorPlanShape, FloorPlanItem>
  selected: boolean
  interactive: boolean
  onPointerDown: (e: ReactPointerEvent) => void
}) {
  const cursor = interactive ? 'cursor-move' : undefined
  const tone = selected ? 'stroke-primary' : 'stroke-current'
  // Chosen colours go in `style`, which beats the theme classes.
  const paint = (filled: boolean) =>
    shape.kind === 'text'
      ? {}
      : {
          fill: filled ? shape.fill : undefined,
          fillOpacity: filled ? (shape.fillOpacity ?? DEFAULT_SHAPE_FILL_OPACITY) : undefined,
          stroke: shape.stroke,
        }
  if (shape.kind === 'rect') {
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        className={cn('fill-muted', tone, cursor)}
        style={paint(true)}
        strokeWidth={3}
        onPointerDown={onPointerDown}
        data-shape-id={shape.id}
      />
    )
  }
  if (shape.kind === 'path') {
    const d = pathData(shape)
    return (
      <g onPointerDown={onPointerDown} className={cursor} data-shape-id={shape.id}>
        {/* A wide transparent stroke makes thin walls easy to grab. */}
        <path d={d} fill="none" stroke="transparent" strokeWidth={16} strokeLinecap="round" />
        <path
          d={d}
          className={cn(shape.closed ? 'fill-muted' : 'fill-none', tone)}
          style={paint(shape.closed)}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    )
  }
  const c = textCentre(shape)
  return (
    <g transform={`rotate(${shape.rotation} ${c.x} ${c.y})`} onPointerDown={onPointerDown} className={cursor} data-shape-id={shape.id}>
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill="transparent"
        className={selected ? 'stroke-primary' : shape.text.trim() ? 'stroke-transparent' : 'stroke-border'}
        strokeWidth={1.5}
        strokeDasharray="6 4"
      />
      <foreignObject x={shape.x} y={shape.y} width={shape.width} height={shape.height} pointerEvents="none">
        <div
          className="flex h-full w-full items-center justify-center overflow-visible text-center leading-[1.2] break-words text-foreground"
          style={{ fontSize: shape.fontSize, fontFamily: 'Helvetica, Arial, sans-serif' }}
        >
          {shape.text}
        </div>
      </foreignObject>
    </g>
  )
}

function PrimitiveView({ p, light }: { p: ItemPrimitive; light: string | null }) {
  const style = itemRoleStyle(p.role, light)
  const common = {
    fill: style.fill ?? 'none',
    fillOpacity: style.fillOpacity,
    stroke: style.stroke ?? 'none',
    strokeWidth: style.strokeWidth,
    strokeDasharray: style.dash?.join(' '),
    strokeLinecap: 'round' as const,
  }
  if (p.shape === 'rect') return <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} {...common} />
  if (p.shape === 'circle') return <circle cx={p.cx} cy={p.cy} r={p.r} {...common} />
  const d = p.points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ') + (p.closed ? ' Z' : '')
  return <path d={d} {...common} fill={p.closed ? common.fill : 'none'} />
}

function ItemView({
  item,
  upm,
  selected,
  interactive,
  onPointerDown,
}: {
  item: FloorPlanItem
  upm: number
  selected: boolean
  interactive: boolean
  onPointerDown: (e: ReactPointerEvent) => void
}) {
  const reach = itemReach(item, upm)
  const light = itemLightColor(item.type)
  // An arm is selected at its base; its reach handle shows how far it goes.
  const ring = isArmGlyph(catalogItem(item.type)?.glyph) ? Math.max(MARKER_RADIUS, (item.width * upm) / 2) : reach
  return (
    <g onPointerDown={onPointerDown} className={interactive ? 'cursor-move' : undefined} data-item-id={item.id}>
      <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        {itemPrimitives(item, upm).map((p, i) => (
          <PrimitiveView key={i} p={p} light={light} />
        ))}
        {/* An invisible disc so small kit is easy to grab. */}
        <circle r={Math.max(14, Math.min(reach, 40))} fill="transparent" />
      </g>
      {selected ? (
        <circle cx={item.x} cy={item.y} r={ring + 6} fill="none" className="stroke-primary" strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
      ) : null}
      {item.label.trim() ? (
        <text
          x={item.x}
          y={item.y + Math.min(reach, 60) + 18}
          textAnchor="middle"
          className="fill-foreground font-medium"
          style={{ fontSize: 14, paintOrder: 'stroke', stroke: 'var(--card)', strokeWidth: 4 }}
          pointerEvents="none"
        >
          {item.label}
        </text>
      ) : null}
    </g>
  )
}

function ShapeHandles({
  shape,
  upm,
  startHandle,
}: {
  shape: FloorPlanShape
  upm: number
  startHandle: (e: ReactPointerEvent, g: Gesture) => void
}) {
  if (shape.kind === 'item') return <ItemHandles item={shape} upm={upm} target="shape" startHandle={startHandle} />
  if (shape.kind === 'rect') {
    const r = shape as FloorPlanRect
    const corners: Point[] = [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
      { x: r.x, y: r.y + r.height },
    ]
    return (
      <g>
        {corners.map((p, i) => {
          const fixed = corners[(i + 2) % 4]!
          return (
            <Handle
              key={i}
              at={p}
              cursor={i % 2 === 0 ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}
              label="Resize"
              onPointerDown={(e) => startHandle(e, { kind: 'resize-rect', id: r.id, fixed })}
            />
          )
        })}
      </g>
    )
  }
  if (shape.kind === 'path') {
    return (
      <g>
        {shape.points.map((p, i) => (
          <Handle
            key={i}
            at={p}
            round
            cursor="cursor-move"
            label="Move point"
            onPointerDown={(e) => startHandle(e, { kind: 'move-vertex', id: shape.id, index: i })}
          />
        ))}
      </g>
    )
  }
  const c = textCentre(shape)
  const corner = rotatePoint({ x: shape.x + shape.width, y: shape.y + shape.height }, c, shape.rotation)
  const topMid = rotatePoint({ x: c.x, y: shape.y }, c, shape.rotation)
  const knob = rotatePoint({ x: c.x, y: shape.y - ROTATE_HANDLE_GAP }, c, shape.rotation)
  return (
    <g>
      <line x1={topMid.x} y1={topMid.y} x2={knob.x} y2={knob.y} className="stroke-primary" strokeWidth={1.5} pointerEvents="none" />
      <Handle at={knob} round cursor="cursor-grab" label="Rotate" onPointerDown={(e) => startHandle(e, { kind: 'rotate-text', id: shape.id, centre: c })} />
      <Handle at={corner} cursor="cursor-nwse-resize" label="Resize" onPointerDown={(e) => startHandle(e, { kind: 'resize-text', id: shape.id, original: shape })} />
    </g>
  )
}

function ItemHandles({
  item,
  upm,
  target,
  startHandle,
}: {
  item: FloorPlanItem
  upm: number
  target: 'shape' | 'marker'
  startHandle: (e: ReactPointerEvent, g: Gesture) => void
}) {
  const r = (item.rotation * Math.PI) / 180
  if (isArmGlyph(catalogItem(item.type)?.glyph)) {
    const tip = { x: item.x + Math.cos(r) * item.depth * upm, y: item.y + Math.sin(r) * item.depth * upm }
    return <Handle at={tip} round cursor="cursor-grab" label="Reach" onPointerDown={(e) => startHandle(e, { kind: 'reach-item', id: item.id, target })} />
  }
  const reach = itemReach(item, upm)
  const dist = Math.min(reach, 60) + ROTATE_HANDLE_GAP
  const knob = { x: item.x + Math.cos(r) * dist, y: item.y + Math.sin(r) * dist }
  const corner = rotatePoint({ x: item.x + (item.depth * upm) / 2, y: item.y + (item.width * upm) / 2 }, item, item.rotation)
  return (
    <g>
      <line x1={item.x} y1={item.y} x2={knob.x} y2={knob.y} className="stroke-primary" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />
      <Handle at={knob} round cursor="cursor-grab" label="Turn" onPointerDown={(e) => startHandle(e, { kind: 'rotate', id: item.id, target })} />
      {catalogItem(item.type)?.resizable ? (
        <Handle at={corner} cursor="cursor-nwse-resize" label="Resize" onPointerDown={(e) => startHandle(e, { kind: 'resize-item', id: item.id, target })} />
      ) : null}
    </g>
  )
}

const BACKGROUND_CORNER_LABELS = ['Scale from top left', 'Scale from top right', 'Scale from bottom right', 'Scale from bottom left']

/**
 * The background's outline with a dot on each corner (scale, keeping its shape) and one on a stalk
 * above its top edge (turn). Handles that would fall off the plan are kept just inside it.
 */
function BackgroundHandles({
  bg,
  onScale,
  onRotate,
}: {
  bg: FloorPlanBackground
  onScale: (e: ReactPointerEvent, corner: number) => void
  onRotate: (e: ReactPointerEvent) => void
}) {
  const { k } = useContext(HandleSizeContext)
  const inside = (p: Point) => ({ x: Math.min(Math.max(p.x, 8 * k), PLAN_WIDTH - 8 * k), y: Math.min(Math.max(p.y, 8 * k), PLAN_HEIGHT - 8 * k) })
  const corners = backgroundCorners(bg)
  const c = backgroundCentre(bg)
  const topMid = rotatePoint({ x: c.x, y: bg.y }, c, bg.rotation)
  const knob = inside(rotatePoint({ x: c.x, y: bg.y - ROTATE_HANDLE_GAP * k }, c, bg.rotation))
  const stalkFrom = inside(topMid)
  return (
    <g data-testid="floor-plan-background-handles">
      <polygon
        points={corners.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        className="stroke-primary"
        strokeWidth={2 * k}
        strokeDasharray={`${10 * k} ${6 * k}`}
        pointerEvents="none"
      />
      <line x1={stalkFrom.x} y1={stalkFrom.y} x2={knob.x} y2={knob.y} className="stroke-primary" strokeWidth={1.5 * k} pointerEvents="none" />
      <Handle at={knob} round cursor="cursor-grab" label="Rotate background" onPointerDown={onRotate} />
      {corners.map((p, i) => (
        <Handle
          key={i}
          at={inside(p)}
          cursor={i % 2 === 0 ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}
          label={BACKGROUND_CORNER_LABELS[i]!}
          onPointerDown={(e) => onScale(e, i)}
        />
      ))}
    </g>
  )
}

function Handle({
  at,
  round,
  cursor,
  label,
  onPointerDown,
}: {
  at: Point
  round?: boolean
  cursor: string
  label: string
  onPointerDown: (e: ReactPointerEvent) => void
}) {
  const { k, touch } = useContext(HandleSizeContext)
  const size = HANDLE * k
  const common = { className: cn('fill-background stroke-primary', cursor), strokeWidth: 2 * k, onPointerDown, 'aria-label': label }
  return (
    <>
      {touch ? <circle cx={at.x} cy={at.y} r={TOUCH_HANDLE_HIT * k} fill="transparent" className={cursor} onPointerDown={onPointerDown} /> : null}
      {round ? (
        <circle cx={at.x} cy={at.y} r={size / 1.6} {...common} />
      ) : (
        <rect x={at.x - size / 2} y={at.y - size / 2} width={size} height={size} {...common} />
      )}
    </>
  )
}

function MarkerView({
  marker: m,
  color,
  selected,
  interactive,
  onPointerDown,
}: {
  marker: Exclude<FloorPlanMarker, FloorPlanItem>
  color: string
  selected: boolean
  interactive: boolean
  onPointerDown: (e: ReactPointerEvent) => void
}) {
  const label = m.label.trim()
  const r = MARKER_RADIUS
  const a = (-CAMERA_VIEW_HALF_ANGLE * Math.PI) / 180
  const camera = m.kind === 'camera'
  return (
    <g onPointerDown={onPointerDown} className={interactive ? 'cursor-move' : undefined} data-marker-id={m.id}>
      <g transform={`translate(${m.x} ${m.y}) rotate(${m.rotation})`}>
        {camera ? (
          <path
            d={`M 0 0 L ${Math.cos(a) * CAMERA_VIEW_LENGTH} ${Math.sin(a) * CAMERA_VIEW_LENGTH} L ${Math.cos(-a) * CAMERA_VIEW_LENGTH} ${Math.sin(-a) * CAMERA_VIEW_LENGTH} Z`}
            fill={color}
            fillOpacity={0.16}
            stroke={color}
            strokeOpacity={0.7}
            strokeWidth={1.5}
          />
        ) : (
          <path d={`M ${r * 0.82} ${-r * 0.57} L ${r + 8} 0 L ${r * 0.82} ${r * 0.57} Z`} fill={color} />
        )}
        <circle r={r} fill={color} className={selected ? 'stroke-primary' : camera ? 'stroke-background' : 'stroke-foreground'} strokeWidth={3} />
      </g>
      {label ? (
        camera ? (
          <text x={m.x} y={m.y} textAnchor="middle" dominantBaseline="central" fill="#0f1115" className="font-bold" style={{ fontSize: label.length > 2 ? 11 : 15 }} pointerEvents="none">
            {label.length > 3 ? label.slice(0, 3) : label}
          </text>
        ) : (
          <text
            x={m.x + r + 8}
            y={m.y + r + 6}
            className="fill-foreground font-semibold"
            style={{ fontSize: 15, paintOrder: 'stroke', stroke: 'var(--card)', strokeWidth: 4 }}
            pointerEvents="none"
          >
            {label}
          </text>
        )
      ) : null}
    </g>
  )
}

function MarkerHandles({
  marker,
  upm,
  startHandle,
}: {
  marker: FloorPlanMarker
  upm: number
  startHandle: (e: ReactPointerEvent, g: Gesture) => void
}) {
  if (marker.kind === 'item') return <ItemHandles item={marker} upm={upm} target="marker" startHandle={startHandle} />
  const r = (marker.rotation * Math.PI) / 180
  const dist = MARKER_RADIUS + ROTATE_HANDLE_GAP
  const knob = { x: marker.x + Math.cos(r) * dist, y: marker.y + Math.sin(r) * dist }
  return (
    <g>
      <line x1={marker.x} y1={marker.y} x2={knob.x} y2={knob.y} className="stroke-primary" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />
      <Handle at={knob} round cursor="cursor-grab" label="Turn" onPointerDown={(e) => startHandle(e, { kind: 'rotate', id: marker.id, target: 'marker' })} />
    </g>
  )
}

function NorthArrow({ north }: { north: number }) {
  return (
    <g transform={`translate(${PLAN_WIDTH - 44} 44)`} pointerEvents="none" data-testid="floor-plan-north">
      <circle r={24} className="fill-background stroke-border" strokeWidth={2} />
      <g transform={`rotate(${north})`}>
        <path d="M0 -18L7 6L0 1L-7 6Z" className="fill-foreground" />
        <text y={-28} textAnchor="middle" className="fill-foreground font-bold" style={{ fontSize: 13 }}>
          N
        </text>
      </g>
    </g>
  )
}

const SUN_COLOR = '#fbbf24'
/** A halo in the canvas colour so sun labels stay readable over walls and pictures. */
const SUN_TEXT_BACKING = { paintOrder: 'stroke', stroke: 'var(--card)', strokeWidth: 4 } as const

/** The sun's path round the plan, and a ray from where the sun is now. */
function SunView({ sun, north }: { sun: SunOverlay; north: number }) {
  const onRing = (azimuth: number, inset = 0) => {
    const a = (planAngleForBearing(north, azimuth) * Math.PI) / 180
    return { x: CENTRE.x + Math.cos(a) * (SUN_RING - inset), y: CENTRE.y + Math.sin(a) * (SUN_RING - inset) }
  }
  const visible = sun.path.filter((p) => p.elevation > -0.5)
  const now = sun.now
  const up = now.elevation > 0
  const at = onRing(now.azimuth)
  // Light falls away from the sun; a lower sun throws a longer ray.
  const reach = Math.min(SUN_RING * 0.9, 90 + (90 - Math.max(0, now.elevation)) * 2.2)
  const towards = onRing(now.azimuth, reach)
  return (
    <g pointerEvents="none" data-testid="floor-plan-sun">
      {visible.length > 1 ? (
        <path
          d={visible.map((p, i) => {
            const q = onRing(p.azimuth)
            return `${i === 0 ? 'M' : 'L'} ${q.x} ${q.y}`
          }).join(' ')}
          fill="none"
          stroke={SUN_COLOR}
          strokeOpacity={0.55}
          strokeWidth={2}
          strokeDasharray="6 8"
        />
      ) : null}
      {visible.map((p, i) => {
        const q = onRing(p.azimuth)
        return (
          <g key={i}>
            <circle cx={q.x} cy={q.y} r={3} fill={SUN_COLOR} />
            {p.label ? (
              <text x={q.x} y={q.y - 8} textAnchor="middle" fill={SUN_COLOR} style={{ fontSize: 12, ...SUN_TEXT_BACKING }}>
                {p.label}
              </text>
            ) : null}
          </g>
        )
      })}
      {up ? (
        <>
          <line x1={at.x} y1={at.y} x2={towards.x} y2={towards.y} stroke={SUN_COLOR} strokeWidth={2.5} strokeDasharray="8 6" />
          <circle cx={at.x} cy={at.y} r={13} fill={SUN_COLOR} />
          <text x={at.x} y={at.y + 30} textAnchor="middle" fill={SUN_COLOR} className="font-semibold" style={{ fontSize: 14, ...SUN_TEXT_BACKING }}>
            {now.label}
          </text>
        </>
      ) : null}
    </g>
  )
}
