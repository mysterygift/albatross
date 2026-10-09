import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'
import {
  CAMERA_VIEW_HALF_ANGLE,
  CAMERA_VIEW_LENGTH,
  DEFAULT_TEXT_FONT_SIZE,
  MARKER_RADIUS,
  MIN_TEXT_SIZE,
  PLAN_GRID,
  PLAN_HEIGHT,
  PLAN_WIDTH,
  angleBetween,
  clampToPlan,
  constrainSegment,
  nextMarkerLabel,
  normalizeAngle,
  pathData,
  rectFromCorners,
  rotatePoint,
  snapAngle,
  textCentre,
  translateShape,
  type FloorPlanLayout,
  type FloorPlanMarker,
  type FloorPlanMarkerKind,
  type FloorPlanRect,
  type FloorPlanShape,
  type FloorPlanText,
  type Point,
} from '@/lib/floor-plans/model'

export type FloorPlanTool = 'select' | 'rect' | 'path' | 'text' | 'camera' | 'actor'

/** Clicking within this distance of a path's first point closes it. */
const CLOSE_DISTANCE = 12
const HANDLE = 10
const ROTATE_HANDLE_GAP = 28
const DOUBLE_CLICK_MS = 500
const NUDGE = 1
const NUDGE_FAST = 10

type Gesture =
  | { kind: 'move-shape'; id: string; start: Point; original: FloorPlanShape }
  | { kind: 'move-marker'; id: string; start: Point; original: FloorPlanMarker }
  | { kind: 'draw-rect'; start: Point }
  | { kind: 'resize-rect'; id: string; fixed: Point }
  | { kind: 'move-vertex'; id: string; index: number }
  | { kind: 'resize-text'; id: string; original: FloorPlanText }
  | { kind: 'rotate-text'; id: string; centre: Point }
  | { kind: 'rotate-marker'; id: string }

export type FloorPlanCanvasProps = {
  layout: FloorPlanLayout
  /** Set when the layout is being edited (Draw layout mode). */
  onLayoutChange?: (next: FloorPlanLayout, transient: boolean) => void
  markers?: FloorPlanMarker[]
  /** Set when markers are being edited (Plot setups mode). */
  onMarkersChange?: (next: FloorPlanMarker[], transient: boolean) => void
  tool: FloorPlanTool
  onToolChange: (tool: FloorPlanTool) => void
  /** Lines, rotations and facing snap to 90° steps. */
  snap: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUndo: () => void
  onRedo: () => void
  /** Called after a text box is placed, so its text can be typed straight away. */
  onTextCreated?: (id: string) => void
  className?: string
}

/** Editable SVG floor plan: draw rectangles, point-to-point shapes and labels, or place cameras and actors. */
export function FloorPlanCanvas({
  layout,
  onLayoutChange,
  markers = [],
  onMarkersChange,
  tool,
  onToolChange,
  snap,
  selectedId,
  onSelect,
  onUndo,
  onRedo,
  onTextCreated,
  className,
}: FloorPlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  /** Where and when the last point of a line was clicked, to spot the second click of a double-click. */
  const lastPathClick = useRef<{ at: Point; time: number } | null>(null)
  const [rectDraft, setRectDraft] = useState<{ a: Point; b: Point } | null>(null)
  const [pathDraft, setPathDraft] = useState<Point[] | null>(null)
  const [hover, setHover] = useState<Point | null>(null)

  const editingLayout = !!onLayoutChange
  const editingMarkers = !!onMarkersChange

  /** Pointer position in plan units. The SVG keeps the plan's aspect ratio, so its box maps straight on. */
  const toPlan = (e: { clientX: number; clientY: number }): Point => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 }
    const x = ((e.clientX - box.left) / box.width) * PLAN_WIDTH
    const y = ((e.clientY - box.top) / box.height) * PLAN_HEIGHT
    return clampToPlan({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
  }

  const setShapes = (shapes: FloorPlanShape[], transient: boolean) => onLayoutChange?.({ shapes }, transient)
  const replaceShape = (shape: FloorPlanShape, transient: boolean) =>
    setShapes(layout.shapes.map((s) => (s.id === shape.id ? shape : s)), transient)
  const replaceMarker = (marker: FloorPlanMarker, transient: boolean) =>
    onMarkersChange?.(markers.map((m) => (m.id === marker.id ? marker : m)), transient)

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
    containerRef.current?.focus({ preventScroll: true })
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic events (tests) have no active pointer to capture.
    }
  }

  const onBackgroundPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    capture(e)
    const p = toPlan(e)
    if (editingLayout && tool === 'rect') {
      gesture.current = { kind: 'draw-rect', start: p }
      setRectDraft({ a: p, b: p })
      return
    }
    if (editingLayout && tool === 'path') {
      // The second click of a double-click (which finishes the line) adds no point of its own.
      const prev = lastPathClick.current
      lastPathClick.current = { at: p, time: e.timeStamp }
      if (pathDraft && prev && e.timeStamp - prev.time < DOUBLE_CLICK_MS && Math.hypot(p.x - prev.at.x, p.y - prev.at.y) < 6) return
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
    if (editingMarkers && (tool === 'camera' || tool === 'actor')) {
      const kind: FloorPlanMarkerKind = tool
      const id = crypto.randomUUID()
      onMarkersChange?.([...markers, { id, kind, x: p.x, y: p.y, rotation: 270, label: nextMarkerLabel(markers, kind) }], false)
      onSelect(id)
      return
    }
    onSelect(null)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = toPlan(e)
    if (pathDraft) setHover(p)
    const g = gesture.current
    if (!g) return
    if (g.kind === 'draw-rect') {
      setRectDraft({ a: g.start, b: p })
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
    } else if (g.kind === 'rotate-marker') {
      const marker = markers.find((m) => m.id === g.id)
      if (!marker) return
      const raw = angleBetween(marker, p)
      replaceMarker({ ...marker, rotation: snap ? snapAngle(raw) : Math.round(raw) }, true)
    }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.kind === 'draw-rect') {
      setRectDraft(null)
      const r = rectFromCorners(g.start, toPlan(e))
      if (r.width < 4 || r.height < 4) return
      const id = crypto.randomUUID()
      setShapes([...layout.shapes, { id, kind: 'rect', ...r }], false)
      onSelect(id)
      return
    }
    // Commit the drag as one undo step.
    if (g.kind === 'move-marker' || g.kind === 'rotate-marker') onMarkersChange?.(markers, false)
    else onLayoutChange?.(layout, false)
  }

  const startOnShape = (e: ReactPointerEvent, shape: FloorPlanShape) => {
    if (!editingLayout || tool !== 'select' || e.button !== 0) return
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
  const drawing = editingLayout ? tool !== 'select' : tool === 'camera' || tool === 'actor'
  const lastDraft = pathDraft?.[pathDraft.length - 1]
  const previewPoint = lastDraft && hover ? constrainSegment(lastDraft, hover, snap) : null

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="Floor plan editor"
      onKeyDown={onKeyDown}
      className={cn('relative overflow-hidden rounded-lg border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring/40', className)}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${PLAN_WIDTH} ${PLAN_HEIGHT}`}
        className={cn('block aspect-[3/2] h-auto w-full touch-none select-none text-foreground', drawing ? 'cursor-crosshair' : 'cursor-default')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => pathDraft && finishPath(pathDraft, false)}
        data-testid="floor-plan-canvas"
      >
        <defs>
          <pattern id="fp-grid" width={PLAN_GRID} height={PLAN_GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${PLAN_GRID} 0 L 0 0 0 ${PLAN_GRID}`} fill="none" className="stroke-border" strokeWidth={0.6} />
          </pattern>
          <pattern id="fp-grid-major" width={PLAN_GRID * 5} height={PLAN_GRID * 5} patternUnits="userSpaceOnUse">
            <rect width={PLAN_GRID * 5} height={PLAN_GRID * 5} fill="url(#fp-grid)" />
            <path d={`M ${PLAN_GRID * 5} 0 L 0 0 0 ${PLAN_GRID * 5}`} fill="none" className="stroke-border" strokeWidth={1.4} />
          </pattern>
        </defs>
        <rect
          width={PLAN_WIDTH}
          height={PLAN_HEIGHT}
          fill="url(#fp-grid-major)"
          onPointerDown={onBackgroundPointerDown}
          data-testid="floor-plan-background"
        />

        {/* While drawing, clicks pass through existing shapes to the background. */}
        <g opacity={editingLayout ? 1 : 0.55} pointerEvents={editingLayout && tool === 'select' ? undefined : 'none'}>
          {layout.shapes.map((shape) => (
            <ShapeView
              key={shape.id}
              shape={shape}
              selected={shape.id === selectedId}
              interactive={editingLayout && tool === 'select'}
              onPointerDown={(e) => startOnShape(e, shape)}
            />
          ))}
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

        {markers.map((m) => (
          <MarkerView
            key={m.id}
            marker={m}
            selected={m.id === selectedId}
            interactive={editingMarkers}
            onPointerDown={(e) => startOnMarker(e, m)}
          />
        ))}

        {selectedShape && tool === 'select' ? (
          <ShapeHandles shape={selectedShape} startHandle={startHandle} />
        ) : null}
        {selectedMarker ? (
          <MarkerHandle marker={selectedMarker} onPointerDown={(e) => startHandle(e, { kind: 'rotate-marker', id: selectedMarker.id })} />
        ) : null}
      </svg>
      {pathDraft ? (
        <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          Click to add points. Double-click or press Enter to finish; click the first point to close the shape. Esc cancels.
        </p>
      ) : null}
    </div>
  )
}

function ShapeView({
  shape,
  selected,
  interactive,
  onPointerDown,
}: {
  shape: FloorPlanShape
  selected: boolean
  interactive: boolean
  onPointerDown: (e: ReactPointerEvent) => void
}) {
  const cursor = interactive ? 'cursor-move' : undefined
  const tone = selected ? 'stroke-primary' : 'stroke-current'
  if (shape.kind === 'rect') {
    return (
      <rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        className={cn('fill-muted/60', tone, cursor)}
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
          className={cn(shape.closed ? 'fill-muted/60' : 'fill-none', tone)}
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

function ShapeHandles({
  shape,
  startHandle,
}: {
  shape: FloorPlanShape
  startHandle: (e: ReactPointerEvent, g: Gesture) => void
}) {
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
  const common = { className: cn('fill-background stroke-primary', cursor), strokeWidth: 2, onPointerDown, 'aria-label': label }
  return round ? (
    <circle cx={at.x} cy={at.y} r={HANDLE / 1.6} {...common} />
  ) : (
    <rect x={at.x - HANDLE / 2} y={at.y - HANDLE / 2} width={HANDLE} height={HANDLE} {...common} />
  )
}

function MarkerView({
  marker: m,
  selected,
  interactive,
  onPointerDown,
}: {
  marker: FloorPlanMarker
  selected: boolean
  interactive: boolean
  onPointerDown: (e: ReactPointerEvent) => void
}) {
  const label = m.label.trim()
  const inside = label.length > 0 && label.length <= 2
  const r = MARKER_RADIUS
  const a = (-CAMERA_VIEW_HALF_ANGLE * Math.PI) / 180
  return (
    <g
      onPointerDown={onPointerDown}
      className={interactive ? 'cursor-move' : undefined}
      pointerEvents={interactive ? undefined : 'none'}
      data-marker-id={m.id}
    >
      <g transform={`translate(${m.x} ${m.y}) rotate(${m.rotation})`}>
        {m.kind === 'camera' ? (
          <>
            <path
              d={`M 0 0 L ${Math.cos(a) * CAMERA_VIEW_LENGTH} ${Math.sin(a) * CAMERA_VIEW_LENGTH} L ${Math.cos(-a) * CAMERA_VIEW_LENGTH} ${Math.sin(-a) * CAMERA_VIEW_LENGTH} Z`}
              className="fill-primary/15 stroke-primary/60"
              strokeWidth={1.5}
            />
            <circle r={r} className={cn('fill-foreground', selected ? 'stroke-primary' : 'stroke-background')} strokeWidth={3} />
          </>
        ) : (
          <>
            <path d={`M ${r * 0.82} ${-r * 0.57} L ${r + 8} 0 L ${r * 0.82} ${r * 0.57} Z`} className="fill-foreground" />
            <circle r={r} className={cn('fill-background', selected ? 'stroke-primary' : 'stroke-foreground')} strokeWidth={3.5} />
          </>
        )}
      </g>
      {label ? (
        <text
          x={m.x}
          y={inside ? m.y : m.y + r + 18}
          textAnchor="middle"
          dominantBaseline={inside ? 'central' : 'auto'}
          className={cn('font-semibold', m.kind === 'camera' && inside ? 'fill-background' : 'fill-foreground')}
          style={{ fontSize: 15 }}
          pointerEvents="none"
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}

function MarkerHandle({ marker, onPointerDown }: { marker: FloorPlanMarker; onPointerDown: (e: ReactPointerEvent) => void }) {
  const r = (marker.rotation * Math.PI) / 180
  const dist = MARKER_RADIUS + ROTATE_HANDLE_GAP
  const knob = { x: marker.x + Math.cos(r) * dist, y: marker.y + Math.sin(r) * dist }
  return (
    <g>
      <line x1={marker.x} y1={marker.y} x2={knob.x} y2={knob.y} className="stroke-primary" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />
      <Handle at={knob} round cursor="cursor-grab" label="Turn" onPointerDown={onPointerDown} />
    </g>
  )
}
