import { isDeepStrictEqual } from 'node:util'

import { catalogItem, defaultItemLabel } from '@/lib/floor-plans/catalog'
import {
  DEFAULT_TEXT_FONT_SIZE,
  PLAN_HEIGHT,
  PLAN_WIDTH,
  emptyLayout,
  parseLayout,
  parseMarkers,
  type FloorPlanItem,
  type FloorPlanLayout,
  type FloorPlanMarker,
  type FloorPlanShape,
} from '@/lib/floor-plans/model'

import { FLOOR_PLANS, type KitDef, type MarkerDef, type PlanDef, type ShapeDef } from '../data/floorPlans'
import { locationByKey } from '../data/locations'
import { CAST } from '../data/people'
import { sceneByNumber } from '../data/scenes'
import { SHOTS } from '../data/shots'
import { add, type Ctx } from './ctx'

const round1 = (n: number) => Math.round(n * 10) / 10

function item(plan: PlanDef, id: string, k: KitDef): FloorPlanItem {
  const entry = catalogItem(k.type)
  if (!entry) throw new Error(`Floor plan ${plan.key}: no catalogue item "${k.type}"`)
  return {
    id,
    kind: 'item',
    type: k.type,
    x: round1(k.x * plan.upm),
    y: round1(k.y * plan.upm),
    rotation: k.rot,
    label: k.label ?? defaultItemLabel(entry),
    width: k.w ?? entry.width,
    depth: k.d ?? entry.depth,
  }
}

function shape(plan: PlanDef, id: string, s: ShapeDef): FloorPlanShape {
  const m = (v: number) => round1(v * plan.upm)
  const style = (d: { stroke?: string; fill?: string; fillOpacity?: number }) => ({
    ...(d.stroke ? { stroke: d.stroke } : {}),
    ...(d.fill ? { fill: d.fill } : {}),
    ...(d.fillOpacity != null ? { fillOpacity: d.fillOpacity } : {}),
  })
  switch (s.kind) {
    case 'rect':
      return { id, kind: 'rect', x: m(s.x), y: m(s.y), width: m(s.w), height: m(s.h), ...style(s) }
    case 'path':
      return { id, kind: 'path', points: s.pts.map(([x, y]) => ({ x: m(x), y: m(y) })), closed: s.closed === true, ...style(s) }
    case 'text': {
      const fontSize = s.size ?? DEFAULT_TEXT_FONT_SIZE
      return { id, kind: 'text', x: m(s.x), y: m(s.y), width: m(s.w), height: Math.round(fontSize * 1.7), rotation: s.rotation ?? 0, text: s.text, fontSize }
    }
    case 'item':
      return item(plan, id, s)
  }
}

function castLabel(key: string): string {
  const person = CAST.find((c) => c.key === key)
  if (!person) throw new Error(`No cast member ${key}`)
  // Supporting artists share role names, so they go by first name.
  return key.startsWith('sa') ? `SA | ${person.name.split(' ')[0]}` : person.role_name
}

function marker(ctx: Ctx, plan: PlanDef, scene: number, id: string, d: MarkerDef): FloorPlanMarker {
  const m = (v: number) => round1(v * plan.upm)
  if (d.kind === 'camera') return { id, kind: 'camera', x: m(d.x), y: m(d.y), rotation: d.rot, label: d.label }
  if (d.kind === 'cast') {
    if (!sceneByNumber(scene).cast.includes(d.who)) throw new Error(`Floor plan ${plan.key}: ${d.who} is not in scene ${scene}`)
    return { id, kind: 'actor', x: m(d.x), y: m(d.y), rotation: d.rot, label: castLabel(d.who), personId: ctx.idOf.person('cast', d.who) }
  }
  return item(plan, id, d)
}

/** Everything drawn must stay on the plan, or it was authored at the wrong scale. */
function assertOnPlan(plan: PlanDef, where: string, points: Array<{ x: number; y: number }>): void {
  for (const p of points) {
    if (p.x < 0 || p.y < 0 || p.x > PLAN_WIDTH + 0.01 || p.y > PLAN_HEIGHT + 0.01) {
      throw new Error(`Floor plan ${plan.key}: ${where} at (${p.x}, ${p.y}) is off the plan`)
    }
  }
}

function positions(s: FloorPlanShape | FloorPlanMarker): Array<{ x: number; y: number }> {
  if (s.kind === 'path') return s.points
  if (s.kind === 'rect' || s.kind === 'text') return [{ x: s.x, y: s.y }, { x: s.x + s.width, y: s.y + s.height }]
  return [{ x: s.x, y: s.y }]
}

/** Floor plans and their setups (Floor Plans, experimental). */
export function buildFloorPlans(ctx: Ctx): { plans: number; setups: number } {
  let setups = 0
  for (const plan of FLOOR_PLANS) {
    const location = locationByKey(plan.location)
    const layout: FloorPlanLayout = {
      ...emptyLayout(),
      unitsPerMetre: plan.upm,
      north: plan.north ?? 0,
      geo: location.coords ? { lat: location.coords.lat, lon: location.coords.lng, timezone: 'Europe/London' } : null,
      shapes: plan.shapes.map((s, i) => shape(plan, `${plan.key}-${i + 1}`, s)),
    }
    for (const s of layout.shapes) assertOnPlan(plan, s.id, positions(s))
    // What the app reads back must be what was written.
    const json = JSON.stringify(layout)
    if (!isDeepStrictEqual(parseLayout(json), JSON.parse(json))) throw new Error(`Floor plan ${plan.key}: layout does not round-trip`)
    const planId = ctx.ids('floorPlan', plan.key)
    add(ctx, 'floor_plans', {
      id: planId, production_id: ctx.pid, location_id: ctx.idOf.location(plan.location), name: plan.name,
      layout_json: json, background_image: null, created_at: ctx.ts, updated_at: ctx.ts, deleted_at: null,
    })

    for (const setup of plan.setups) {
      if (setup.shot != null && !SHOTS[setup.scene]?.[setup.shot - 1]) {
        throw new Error(`Floor plan ${plan.key}: no shot ${setup.scene}.${setup.shot}`)
      }
      const key = `${plan.key}.${setup.scene}.${setup.shot ?? 'scene'}`
      const markers = setup.markers.map((d, i) => marker(ctx, plan, setup.scene, `${key}-${i + 1}`, d))
      for (const mk of markers) assertOnPlan(plan, mk.id, positions(mk))
      const markersJson = JSON.stringify(markers)
      if (!isDeepStrictEqual(parseMarkers(markersJson), JSON.parse(markersJson))) throw new Error(`Setup ${key}: markers do not round-trip`)
      add(ctx, 'floor_plan_setups', {
        id: ctx.ids('floorPlanSetup', key), production_id: ctx.pid, floor_plan_id: planId,
        scene_id: ctx.idOf.scene(setup.scene), shot_id: setup.shot == null ? null : ctx.idOf.shot(setup.scene, setup.shot),
        markers_json: markersJson, notes: setup.notes ?? null, created_at: ctx.ts, updated_at: ctx.ts, deleted_at: null,
      })
      setups += 1
    }
  }
  return { plans: FLOOR_PLANS.length, setups }
}
