/**
 * Floor plan PDF: each setup's plan drawn to scale with its camera and actor positions, and the
 * shot (or scene) details beneath. `buildFloorPlanPdfData` picks and orders the setups for a scope
 * (a shoot day, a location, a scene or chosen shots); `generateFloorPlanPdf` draws them on
 * `PdfLayout`, two to a page where they fit.
 */
import { LineCapStyle, degrees, rgb, type PDFImage } from 'pdf-lib'
import type { FloorPlan, FloorPlanSetup } from '@/lib/db/repositories/floor-plans'
import type { Location, Scene, Shot } from '@/lib/db/types'
import { catalogItem } from '@/lib/floor-plans/catalog'
import { itemLightColor, itemPrimitives, itemRoleStyle, itemToPlan } from '@/lib/floor-plans/itemGeometry'
import {
  CAMERA_VIEW_HALF_ANGLE,
  CAMERA_VIEW_LENGTH,
  DEFAULT_ACTOR_COLOR,
  DEFAULT_SHAPE_FILL_OPACITY,
  cameraColor,
  drawingBounds,
  itemReach,
  scaleBarMetres,
  textCentre,
  type Bounds,
  type FloorPlanItem,
  type FloorPlanLayout,
  type FloorPlanMarker,
  type FloorPlanShapeStyle,
  type Point,
} from '@/lib/floor-plans/model'
import {
  COLOR_FRAME,
  COLOR_INK,
  COLOR_MUTED,
  DEFAULT_PAPER_SIZE,
  PdfLayout,
  formatIssuedStamp,
  textForPdf,
  wrapLines,
  type PaperSize,
} from '@/lib/pdf/layoutKit'
import { sceneSlugline } from '@/lib/schedule/sceneDisplay'
import { sortScenesByNumber } from '@/lib/schedule/sceneFields'

const SEP = ' | '

export type FloorPlanExportScope =
  /** Shot ids in strip order; each scene's scene-wide blocking comes before its first shot. */
  | { kind: 'day'; shotOrder: string[] }
  /** Every plan at the location; a plan with no setups prints its bare layout. */
  | { kind: 'location'; locationId: string }
  /** Scene-wide blocking, then each shot in shot-number order. */
  | { kind: 'scene'; sceneId: string }
  /** Just these shots, in this order. */
  | { kind: 'shots'; shotIds: string[] }

export type FloorPlanPdfEntry = {
  locationName: string
  planName: string
  /** e.g. `Scene 4 | Shot 4A | CU`, `Scene 4 | Scene blocking` or `Layout`. */
  title: string
  /** Scene slugline. */
  heading: string | null
  description: string | null
  /** Camera details, e.g. `Lens 50mm | Support Dolly | Movement Track`. */
  details: string | null
  notes: string | null
  layout: FloorPlanLayout
  /** The plan's background picture (data URL), drawn under everything. */
  backgroundImage: string | null
  markers: FloorPlanMarker[]
  /** Shared by every entry of the same plan, so a plan is drawn at the same scale throughout. */
  bounds: Bounds | null
}

export type FloorPlanPdfData = {
  productionName: string
  scopeLabel: string
  entries: FloorPlanPdfEntry[]
  /** Cast booking colours by person id. */
  actorColors: Record<string, string>
}

export type FloorPlanPdfInput = {
  productionName: string
  scopeLabel: string
  scope: FloorPlanExportScope
  plans: FloorPlan[]
  setups: FloorPlanSetup[]
  scenes: Scene[]
  shots: Shot[]
  locations: Pick<Location, 'id' | 'name'>[]
  /** Cast booking colours by person id; cast without one are grey. */
  actorColors?: Map<string, string>
}

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const byShotNumber = (a: Shot, b: Shot) => a.shot_number.localeCompare(b.shot_number, undefined, { numeric: true })

export function buildFloorPlanPdfData(input: FloorPlanPdfInput): FloorPlanPdfData {
  const planById = new Map(input.plans.filter((p) => !p.deleted_at).map((p) => [p.id, p]))
  const sceneById = new Map(input.scenes.filter((s) => !s.deleted_at).map((s) => [s.id, s]))
  const shotById = new Map(input.shots.filter((s) => !s.deleted_at).map((s) => [s.id, s]))
  const locationNameById = new Map(input.locations.map((l) => [l.id, l.name]))
  const setups = input.setups.filter(
    (s) => !s.deleted_at && planById.has(s.floor_plan_id) && sceneById.has(s.scene_id) && (!s.shot_id || shotById.has(s.shot_id))
  )
  const planName = (planId: string) => planById.get(planId)?.name ?? ''
  const byPlanName = (a: FloorPlanSetup, b: FloorPlanSetup) => planName(a.floor_plan_id).localeCompare(planName(b.floor_plan_id))
  const sceneSetups = (sceneId: string) => setups.filter((s) => s.scene_id === sceneId && !s.shot_id).sort(byPlanName)
  const shotSetups = (shotId: string) => setups.filter((s) => s.shot_id === shotId).sort(byPlanName)

  // Setups in print order, plus bare plans (location scope only).
  const picked: Array<FloorPlanSetup | FloorPlan> = []
  const scope = input.scope
  if (scope.kind === 'day' || scope.kind === 'shots') {
    const seenScenes = new Set<string>()
    const seenShots = new Set<string>()
    for (const shotId of scope.kind === 'day' ? scope.shotOrder : scope.shotIds) {
      const shot = shotById.get(shotId)
      if (!shot || seenShots.has(shotId)) continue
      seenShots.add(shotId)
      if (scope.kind === 'day' && !seenScenes.has(shot.scene_id)) {
        seenScenes.add(shot.scene_id)
        picked.push(...sceneSetups(shot.scene_id))
      }
      picked.push(...shotSetups(shotId))
    }
  } else if (scope.kind === 'scene') {
    picked.push(...sceneSetups(scope.sceneId))
    const shots = [...shotById.values()].filter((s) => s.scene_id === scope.sceneId).sort(byShotNumber)
    for (const shot of shots) picked.push(...shotSetups(shot.id))
  } else {
    const plans = [...planById.values()]
      .filter((p) => p.location_id === scope.locationId)
      .sort((a, b) => a.name.localeCompare(b.name))
    const sceneOrder = sortScenesByNumber([...sceneById.values()]).map((s) => s.id)
    for (const plan of plans) {
      const onPlan = setups.filter((s) => s.floor_plan_id === plan.id)
      if (onPlan.length === 0) {
        picked.push(plan)
        continue
      }
      for (const sceneId of sceneOrder) {
        picked.push(...onPlan.filter((s) => s.scene_id === sceneId && !s.shot_id))
        const shots = onPlan
          .filter((s) => s.scene_id === sceneId && s.shot_id)
          .sort((a, b) => byShotNumber(shotById.get(a.shot_id!)!, shotById.get(b.shot_id!)!))
        picked.push(...shots)
      }
    }
  }

  // One scale per plan: everything any of its entries draws.
  const boundsByPlan = new Map<string, Bounds | null>()
  for (const item of picked) {
    const plan = 'floor_plan_id' in item ? planById.get(item.floor_plan_id)! : item
    const markers = picked
      .filter((p): p is FloorPlanSetup => 'floor_plan_id' in p && p.floor_plan_id === plan.id)
      .flatMap((s) => s.markers)
    if (!boundsByPlan.has(plan.id)) boundsByPlan.set(plan.id, planBounds(plan, markers))
  }

  const entries: FloorPlanPdfEntry[] = picked.map((item) => {
    if (!('floor_plan_id' in item)) {
      return {
        locationName: locationNameById.get(item.location_id) ?? '',
        planName: item.name,
        title: 'Layout',
        heading: null,
        description: null,
        details: null,
        notes: null,
        layout: item.layout,
        backgroundImage: item.background_image,
        markers: [],
        bounds: boundsByPlan.get(item.id) ?? null,
      }
    }
    const plan = planById.get(item.floor_plan_id)!
    const scene = sceneById.get(item.scene_id)!
    const shot = item.shot_id ? shotById.get(item.shot_id)! : null
    const title = shot
      ? [`Scene ${scene.scene_number}`, `Shot ${shot.shot_number}`, shot.shot_size].filter(Boolean).join(SEP)
      : [`Scene ${scene.scene_number}`, 'Scene blocking'].join(SEP)
    const details = shot
      ? [
          present(shot.lens) && `Lens ${shot.lens!.trim()}`,
          present(shot.support) && `Support ${shot.support!.trim()}`,
          present(shot.camera_movement) && `Movement ${shot.camera_movement}`,
        ]
          .filter(Boolean)
          .join(SEP) || null
      : null
    return {
      locationName: locationNameById.get(plan.location_id) ?? '',
      planName: plan.name,
      title,
      heading: sceneSlugline(scene, scene.location_id ? locationNameById.get(scene.location_id) : null),
      description: shot
        ? present(shot.shot_description) ?? present(shot.subject)
        : present(scene.description) ?? present(scene.title),
      details,
      notes: present(item.notes),
      layout: plan.layout,
      backgroundImage: plan.background_image,
      markers: item.markers,
      bounds: boundsByPlan.get(plan.id) ?? null,
    }
  })

  return {
    productionName: input.productionName,
    scopeLabel: input.scopeLabel,
    entries,
    actorColors: Object.fromEntries(input.actorColors ?? []),
  }
}

/** What a plan's drawing covers: the drawing and its markers, and the background picture if it has one. */
function planBounds(plan: FloorPlan, markers: FloorPlanMarker[]): Bounds | null {
  const drawn = drawingBounds(plan.layout, markers)
  const bg = plan.background_image ? plan.layout.background : null
  if (!bg) return drawn
  const pic = { minX: bg.x, minY: bg.y, maxX: bg.x + bg.width, maxY: bg.y + bg.height }
  if (!drawn) return pic
  return {
    minX: Math.min(drawn.minX, pic.minX),
    minY: Math.min(drawn.minY, pic.minY),
    maxX: Math.max(drawn.maxX, pic.maxX),
    maxY: Math.max(drawn.maxY, pic.maxY),
  }
}


// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const DRAWING_MAX_HEIGHT = 300
const DRAWING_PAD = 14
const MARKER_R = 7
const MARKER_LABEL_SIZE = 7
const ITEM_LABEL_SIZE = 6.5
const COLOR_SHAPE_FILL = rgb(0.95, 0.95, 0.95)
const COLOR_PAPER = rgb(1, 1, 1)

/** Maps plan coordinates into a box: `local` is points from the box's top-left, y down. */
type PlanTransform = { scale: number; local: (p: Point) => Point; originX: number; originY: number }

function polygon(points: Point[], close: boolean): string {
  const [first, ...rest] = points
  if (!first) return ''
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}${close ? ' Z' : ''}`
}

function hexColor(hex: string) {
  const c = hex.replace('#', '')
  const full = c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c.padEnd(6, '0').slice(0, 6)
  return rgb(parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255)
}

/** A rectangle's or closed shape's fill: its own colour and opacity, else a pale grey (lighter over a picture). */
function shapeFill(shape: FloorPlanShapeStyle, background: boolean): { color: ReturnType<typeof rgb>; opacity: number } {
  if (!shape.fill && shape.fillOpacity == null) return { color: COLOR_SHAPE_FILL, opacity: background ? 0.55 : 1 }
  return { color: shape.fill ? hexColor(shape.fill) : COLOR_SHAPE_FILL, opacity: shape.fillOpacity ?? DEFAULT_SHAPE_FILL_OPACITY }
}

/** Bytes of a `data:image/...;base64,` URL; null for anything else. */
export function dataUrlBytes(dataUrl: string): Uint8Array | null {
  const match = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  try {
    return Uint8Array.from(atob(match[1]!), (ch) => ch.charCodeAt(0))
  } catch {
    return null
  }
}

/** Height of the drawing box for `bounds` at the layout's width. */
function drawingSize(layout: PdfLayout, bounds: Bounds | null): { width: number; height: number; scale: number } {
  const width = layout.contentWidth
  if (!bounds) return { width, height: 60, scale: 1 }
  const bw = Math.max(bounds.maxX - bounds.minX, 1)
  const bh = Math.max(bounds.maxY - bounds.minY, 1)
  const scale = Math.min((width - DRAWING_PAD * 2) / bw, (DRAWING_MAX_HEIGHT - DRAWING_PAD * 2) / bh)
  return { width, height: bh * scale + DRAWING_PAD * 2, scale }
}

function centredText(layout: PdfLayout, text: string, x: number, y: number, size: number, bold = false, color = COLOR_INK): void {
  const safe = textForPdf(text)
  const font = bold ? layout.bold : layout.font
  layout.page.drawText(safe, { x: x - font.widthOfTextAtSize(safe, size) / 2, y, size, font, color })
}

function drawItem(layout: PdfLayout, t: PlanTransform, item: FloorPlanItem, upm: number): void {
  const page = layout.page
  const light = itemLightColor(item.type)
  const toBox = (local: Point) => t.local(itemToPlan(local, item, item.rotation))
  for (const p of itemPrimitives(item, upm)) {
    const style = itemRoleStyle(p.role, light)
    const opts = {
      x: t.originX,
      y: t.originY,
      color: style.fill ? hexColor(style.fill) : undefined,
      opacity: style.fillOpacity,
      borderColor: style.stroke ? hexColor(style.stroke) : undefined,
      borderWidth: style.stroke ? Math.max(0.4, style.strokeWidth * t.scale) : 0,
      borderDashArray: style.dash?.map((v) => Math.max(1, v * t.scale)),
    }
    if (p.shape === 'circle') {
      const c = toBox({ x: p.cx, y: p.cy })
      page.drawCircle({
        x: t.originX + c.x,
        y: t.originY - c.y,
        size: Math.max(1.5, p.r * t.scale),
        color: opts.color,
        opacity: opts.opacity,
        borderColor: opts.borderColor,
        borderWidth: opts.borderWidth,
        borderDashArray: opts.borderDashArray,
      })
      continue
    }
    const points =
      p.shape === 'rect'
        ? [
            { x: p.x, y: p.y },
            { x: p.x + p.w, y: p.y },
            { x: p.x + p.w, y: p.y + p.h },
            { x: p.x, y: p.y + p.h },
          ]
        : p.points
    const closed = p.shape === 'rect' || p.closed
    page.drawSvgPath(polygon(points.map(toBox), closed), { ...opts, color: closed ? opts.color : undefined, borderLineCap: LineCapStyle.Round })
  }
  if (item.label.trim()) {
    const at = t.local({ x: item.x, y: item.y + Math.min(itemReach(item, upm), 60) + 18 })
    centredText(layout, item.label.trim(), t.originX + at.x, t.originY - at.y, ITEM_LABEL_SIZE)
  }
}

function drawMarker(layout: PdfLayout, t: PlanTransform, m: Exclude<FloorPlanMarker, FloorPlanItem>, actorColors: Record<string, string>): void {
  const page = layout.page
  const c = t.local(m)
  const label = textForPdf(m.label.trim())
  const rad = (deg: number) => (deg * Math.PI) / 180
  const color = hexColor(m.kind === 'camera' ? cameraColor(m.label) : (m.personId && actorColors[m.personId]) || DEFAULT_ACTOR_COLOR)
  if (m.kind === 'camera') {
    // The view wedge is to scale, but never so small it cannot be read.
    const len = Math.max(CAMERA_VIEW_LENGTH * t.scale, MARKER_R * 4)
    const a = rad(m.rotation - CAMERA_VIEW_HALF_ANGLE)
    const b = rad(m.rotation + CAMERA_VIEW_HALF_ANGLE)
    page.drawSvgPath(
      polygon([c, { x: c.x + Math.cos(a) * len, y: c.y + Math.sin(a) * len }, { x: c.x + Math.cos(b) * len, y: c.y + Math.sin(b) * len }], true),
      { x: t.originX, y: t.originY, color, opacity: 0.22, borderColor: color, borderWidth: 0.6 }
    )
    page.drawCircle({ x: t.originX + c.x, y: t.originY - c.y, size: MARKER_R, color, borderColor: COLOR_INK, borderWidth: 0.6 })
    if (label) centredText(layout, label.slice(0, 3), t.originX + c.x, t.originY - c.y - MARKER_LABEL_SIZE * 0.35, label.length > 2 ? 5.5 : MARKER_LABEL_SIZE, true)
    return
  }
  // A small arrowhead on the rim shows which way the actor faces.
  const tip = { x: c.x + Math.cos(rad(m.rotation)) * (MARKER_R + 4), y: c.y + Math.sin(rad(m.rotation)) * (MARKER_R + 4) }
  const left = { x: c.x + Math.cos(rad(m.rotation - 35)) * MARKER_R, y: c.y + Math.sin(rad(m.rotation - 35)) * MARKER_R }
  const right = { x: c.x + Math.cos(rad(m.rotation + 35)) * MARKER_R, y: c.y + Math.sin(rad(m.rotation + 35)) * MARKER_R }
  page.drawSvgPath(polygon([left, tip, right], true), { x: t.originX, y: t.originY, color, borderWidth: 0 })
  page.drawCircle({ x: t.originX + c.x, y: t.originY - c.y, size: MARKER_R, color, borderColor: COLOR_INK, borderWidth: 1 })
  if (label) {
    page.drawText(label, {
      x: t.originX + c.x + MARKER_R + 3,
      y: t.originY - c.y - MARKER_R - MARKER_LABEL_SIZE,
      size: MARKER_LABEL_SIZE + 0.5,
      font: layout.bold,
      color: COLOR_INK,
    })
  }
}

/** North arrow in the box's top-right corner. */
function drawNorth(layout: PdfLayout, boxRight: number, boxTop: number, north: number): void {
  const page = layout.page
  const cx = boxRight - 18
  const cy = boxTop - 20
  page.drawCircle({ x: cx, y: cy, size: 9, color: COLOR_PAPER, borderColor: COLOR_FRAME, borderWidth: 0.6 })
  const turn = (p: Point) => {
    const r = (north * Math.PI) / 180
    return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) }
  }
  const arrow = [{ x: 0, y: -7 }, { x: 3, y: 3 }, { x: 0, y: 1 }, { x: -3, y: 3 }].map(turn)
  page.drawSvgPath(polygon(arrow, true), { x: cx, y: cy, color: COLOR_INK, borderWidth: 0 })
  const n = turn({ x: 0, y: -12.5 })
  centredText(layout, 'N', cx + n.x, cy - n.y - 2.5, 6.5, true)
}

/** Scale bar in the box's bottom-left corner. */
function drawScaleBar(layout: PdfLayout, boxLeft: number, boxBottom: number, unitsPerMetre: number, scale: number): void {
  const metres = scaleBarMetres(unitsPerMetre)
  const length = metres * unitsPerMetre * scale
  if (length < 8) return
  const x = boxLeft + 10
  const y = boxBottom + 14
  layout.page.drawRectangle({ x, y, width: length, height: 2.5, color: COLOR_INK })
  layout.page.drawRectangle({ x, y, width: length / 2, height: 2.5, color: COLOR_MUTED })
  layout.text('0', x, y - 8, { size: 6 })
  layout.textRight(`${metres} m`, y - 8, x + length, { size: 6 })
}

/** Draws the plan and markers in a framed box at the layout cursor, then moves the cursor below it. */
function drawPlanBox(layout: PdfLayout, entry: FloorPlanPdfEntry, background: PDFImage | null, actorColors: Record<string, string>): void {
  const { width, height, scale } = drawingSize(layout, entry.bounds)
  const page = layout.page
  const top = layout.y
  page.drawRectangle({ x: layout.xLeft, y: top - height, width, height, borderColor: COLOR_FRAME, borderWidth: 0.8 })
  const bounds = entry.bounds
  if (!bounds) {
    const text = 'Nothing drawn on this plan yet.'
    layout.text(text, layout.xLeft + (width - layout.textWidth(text, 8)) / 2, top - height / 2 - 3, { size: 8, color: COLOR_MUTED })
    layout.y -= height + 6
    return
  }
  const drawnW = (bounds.maxX - bounds.minX) * scale
  const offsetX = (width - drawnW) / 2
  const t: PlanTransform = {
    scale,
    originX: layout.xLeft,
    originY: top,
    local: (p) => ({ x: offsetX + (p.x - bounds.minX) * scale, y: DRAWING_PAD + (p.y - bounds.minY) * scale }),
  }
  const opts = { x: t.originX, y: t.originY }
  const { layout: plan } = entry
  const upm = plan.unitsPerMetre

  const bg = plan.background
  if (background && bg) {
    const a = t.local({ x: bg.x, y: bg.y })
    const b = t.local({ x: bg.x + bg.width, y: bg.y + bg.height })
    page.drawImage(background, { x: t.originX + a.x, y: t.originY - b.y, width: b.x - a.x, height: b.y - a.y, opacity: bg.opacity })
  }

  for (const shape of plan.shapes) {
    if (shape.kind === 'rect') {
      const a = t.local({ x: shape.x, y: shape.y })
      const b = t.local({ x: shape.x + shape.width, y: shape.y + shape.height })
      page.drawSvgPath(polygon([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], true), {
        ...opts,
        ...shapeFill(shape, !!background),
        borderColor: shape.stroke ? hexColor(shape.stroke) : COLOR_INK,
        borderWidth: 1.2,
      })
    } else if (shape.kind === 'path') {
      // Closed shapes print unfilled unless given a fill colour.
      const fill = shape.closed && (shape.fill || shape.fillOpacity != null) ? shapeFill(shape, !!background) : {}
      page.drawSvgPath(polygon(shape.points.map(t.local), shape.closed), {
        ...opts,
        ...fill,
        borderColor: shape.stroke ? hexColor(shape.stroke) : COLOR_INK,
        borderWidth: 1.6,
        borderLineCap: LineCapStyle.Round,
      })
    }
  }
  for (const shape of plan.shapes) if (shape.kind === 'item') drawItem(layout, t, shape, upm)
  // Labels above walls and furniture.
  for (const shape of plan.shapes) {
    if (shape.kind !== 'text' || !shape.text.trim()) continue
    const size = Math.max(shape.fontSize * scale, 4)
    const lineH = size * 1.2
    const lines = wrapLines(shape.text, Math.max(shape.width * scale - 2, size), layout.font, size)
    const centre = t.local(textCentre(shape))
    const r = (shape.rotation * Math.PI) / 180
    lines.forEach((line, i) => {
      const lw = layout.font.widthOfTextAtSize(line, size)
      // Baseline offset from the box centre in the box's own frame (y down), lines centred.
      const dx = -lw / 2
      const dy = -(lines.length * lineH) / 2 + i * lineH + size * 0.95
      const x = centre.x + dx * Math.cos(r) - dy * Math.sin(r)
      const y = centre.y + dx * Math.sin(r) + dy * Math.cos(r)
      page.drawText(line, { x: t.originX + x, y: t.originY - y, size, font: layout.font, color: COLOR_INK, rotate: degrees(-shape.rotation) })
    })
  }
  for (const m of entry.markers) if (m.kind === 'item') drawItem(layout, t, m, upm)
  for (const m of entry.markers) if (m.kind === 'camera') drawMarker(layout, t, m, actorColors)
  for (const m of entry.markers) if (m.kind === 'actor') drawMarker(layout, t, m, actorColors)

  drawNorth(layout, layout.xLeft + width, top, plan.north)
  drawScaleBar(layout, layout.xLeft, top - height, upm, scale)
  layout.y -= height + 6
}

function entryTextHeight(layout: PdfLayout, entry: FloorPlanPdfEntry): number {
  const blocks = [entry.description, entry.details, entry.notes && `Notes: ${entry.notes}`, markerSummary(entry.markers)]
  return blocks
    .filter((b): b is string => !!b)
    .reduce((sum, b) => sum + layout.wrap(b, layout.contentWidth, 8.5).length * layout.lineHeight(8.5), 0)
}

/** `Cameras A, B | Cast Marta, Joe | Lights M18, S60 | Grip Track` (labels without their source). */
export function markerSummary(markers: FloorPlanMarker[]): string | null {
  const names = (pick: (m: FloorPlanMarker) => boolean) =>
    markers.filter(pick).map((m) => m.label.split(' | ')[0]!.trim() || '?')
  const isLight = (m: FloorPlanMarker) => m.kind === 'item' && catalogItem(m.type)?.category === 'lighting'
  const groups: Array<[string, string, string[]]> = [
    ['Camera', 'Cameras', names((m) => m.kind === 'camera')],
    ['Cast', 'Cast', names((m) => m.kind === 'actor')],
    ['Light', 'Lights', names(isLight)],
    ['Grip', 'Grip', names((m) => m.kind === 'item' && !isLight(m))],
  ]
  const parts = groups
    .filter(([, , list]) => list.length > 0)
    .map(([one, many, list]) => `${list.length === 1 ? one : many} ${list.join(', ')}`)
  return parts.length ? parts.join(SEP) : null
}

export interface FloorPlanPdfOptions {
  paperSize?: PaperSize
  issuedAt?: Date
}

export async function generateFloorPlanPdf(data: FloorPlanPdfData, options: FloorPlanPdfOptions = {}): Promise<Uint8Array> {
  const layout = await PdfLayout.create({ paper: options.paperSize ?? DEFAULT_PAPER_SIZE })
  layout.onNewPage = (l) => l.runningHeader(['FLOOR PLANS', data.scopeLabel].join(SEP), data.productionName)
  layout.masthead({
    title: data.productionName,
    right: 'FLOOR PLANS',
    subLeft: data.scopeLabel,
    subRight: `Issued ${formatIssuedStamp(options.issuedAt ?? new Date())}`,
  })

  if (data.entries.length === 0) {
    layout.gap(12)
    layout.text('No floor plan setups for this selection yet.', layout.xLeft, layout.y - 9, { color: COLOR_MUTED })
    layout.gap(20)
  }

  // Each plan's background is embedded once, however many setups use it.
  const images = new Map<string, PDFImage | null>()
  const backgroundFor = async (dataUrl: string | null): Promise<PDFImage | null> => {
    if (!dataUrl) return null
    if (!images.has(dataUrl)) {
      const bytes = dataUrlBytes(dataUrl)
      images.set(dataUrl, bytes ? await layout.embedImage(bytes) : null)
    }
    return images.get(dataUrl) ?? null
  }

  for (const entry of data.entries) {
    const background = await backgroundFor(entry.backgroundImage)
    const drawingH = drawingSize(layout, entry.bounds).height
    const titleH = layout.lineHeight(10) + (entry.heading ? layout.lineHeight(8.5) : 0) + 4
    // The bar, title, drawing and text stay together on one page.
    layout.sectionBar([entry.locationName, entry.planName].filter(Boolean).join(SEP), titleH + drawingH + entryTextHeight(layout, entry) + 12)
    layout.gap(4)
    layout.text(entry.title, layout.xLeft, layout.y - 10, { size: 10, bold: true })
    layout.gap(layout.lineHeight(10))
    if (entry.heading) {
      layout.text(entry.heading, layout.xLeft, layout.y - 8.5, { size: 8.5, color: COLOR_MUTED })
      layout.gap(layout.lineHeight(8.5))
    }
    layout.gap(4)
    drawPlanBox(layout, entry, background, data.actorColors)
    const paragraphs: Array<{ text: string; color?: typeof COLOR_INK }> = []
    if (entry.description) paragraphs.push({ text: entry.description })
    if (entry.details) paragraphs.push({ text: entry.details, color: COLOR_MUTED })
    if (entry.notes) paragraphs.push({ text: `Notes: ${entry.notes}` })
    const summary = markerSummary(entry.markers)
    if (summary) paragraphs.push({ text: summary, color: COLOR_MUTED })
    for (const p of paragraphs) {
      for (const line of layout.wrap(p.text, layout.contentWidth, 8.5)) {
        layout.ensureSpace(layout.lineHeight(8.5))
        layout.text(line, layout.xLeft, layout.y - 8.5, { size: 8.5, color: p.color })
        layout.gap(layout.lineHeight(8.5))
      }
    }
    layout.gap(8)
  }

  layout.applyFooters({ left: [data.productionName, 'Floor plans', data.scopeLabel].join(SEP) })
  return layout.doc.save()
}
