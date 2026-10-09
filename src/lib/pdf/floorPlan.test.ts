import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildFloorPlanPdfData, generateFloorPlanPdf, markerSummary } from '@/lib/pdf/floorPlan'
import { extractPdfText } from '@/test/episodicIntegrationHelpers'
import type { FloorPlan, FloorPlanSetup } from '@/lib/db/repositories/floor-plans'
import type { FloorPlanMarker } from '@/lib/floor-plans/model'
import type { Scene, Shot } from '@/lib/db/types'

const ts = { created_at: 't', updated_at: 't', deleted_at: null }

const scenes = [
  { id: 'sc4', production_id: 'p', scene_number: '4', title: 'Breakfast', description: 'Marta waits', int_ext: 'INT', day_night: 'DAY', location_id: 'diner', ...ts },
  { id: 'sc7', production_id: 'p', scene_number: '7', title: 'Repairs', description: null, int_ext: 'INT', day_night: 'NIGHT', location_id: 'garage', ...ts },
] as unknown as Scene[]

const shots = [
  { id: '4b', scene_id: 'sc4', shot_number: '4B', shot_size: 'CU', shot_description: 'Marta’s hands on the cup', lens: '85mm', support: 'Sticks', camera_movement: null, ...ts },
  { id: '4a', scene_id: 'sc4', shot_number: '4A', shot_size: 'WS', shot_description: 'The diner from the door', lens: '24mm', support: 'Dolly', camera_movement: 'Track', ...ts },
  { id: '7a', scene_id: 'sc7', shot_number: '7A', shot_size: 'MS', shot_description: null, subject: 'Joe under the car', ...ts },
] as unknown as Shot[]

const locations = [
  { id: 'diner', name: 'Rosie’s Diner' },
  { id: 'garage', name: 'Garage' },
]

const layout = {
  shapes: [
    { id: 'r', kind: 'rect' as const, x: 100, y: 100, width: 600, height: 400 },
    { id: 'w', kind: 'path' as const, points: [{ x: 100, y: 100 }, { x: 700, y: 100 }], closed: false },
    { id: 't', kind: 'text' as const, x: 300, y: 250, width: 160, height: 30, rotation: 90, text: 'Counter', fontSize: 18 },
  ],
}

const plan = (id: string, locationId: string, name: string): FloorPlan =>
  ({ id, production_id: 'p', location_id: locationId, name, layout, ...ts }) as FloorPlan

const plans = [plan('main', 'diner', 'Main room'), plan('kitchen', 'diner', 'Kitchen'), plan('bay', 'garage', 'Bay')]

const cam: FloorPlanMarker = { id: 'c', kind: 'camera', x: 150, y: 150, rotation: 45, label: 'A' }
const marta: FloorPlanMarker = { id: 'm', kind: 'actor', x: 400, y: 300, rotation: 180, label: 'Marta' }

const setup = (id: string, planId: string, sceneId: string, shotId: string | null, markers = [cam, marta], notes: string | null = null) =>
  ({ id, production_id: 'p', floor_plan_id: planId, scene_id: sceneId, shot_id: shotId, markers, notes, ...ts }) as FloorPlanSetup

const setups = [
  setup('s-4b', 'main', 'sc4', '4b'),
  setup('s-4a', 'main', 'sc4', '4a', [cam], 'Track along the counter'),
  setup('s-4', 'main', 'sc4', null, [marta]),
  setup('s-7a', 'bay', 'sc7', '7a'),
]

const base = { productionName: 'Night Shift', scopeLabel: 'Scene 4', plans, setups, scenes, shots, locations }

describe('buildFloorPlanPdfData', () => {
  it('scene: scene blocking first, then shots in number order, with the shot description', () => {
    const data = buildFloorPlanPdfData({ ...base, scope: { kind: 'scene', sceneId: 'sc4' } })
    expect(data.entries.map((e) => e.title)).toEqual(['Scene 4 | Scene blocking', 'Scene 4 | Shot 4A | WS', 'Scene 4 | Shot 4B | CU'])
    expect(data.entries[0]).toMatchObject({ locationName: 'Rosie’s Diner', planName: 'Main room', description: 'Marta waits' })
    expect(data.entries[1]).toMatchObject({
      heading: 'INT. Rosie’s Diner - DAY',
      description: 'The diner from the door',
      details: 'Lens 24mm | Support Dolly | Movement Track',
      notes: 'Track along the counter',
    })
  })

  it('day: strip order, each scene’s blocking before its first shot', () => {
    const data = buildFloorPlanPdfData({ ...base, scope: { kind: 'day', shotOrder: ['7a', '4b', '4a'] } })
    expect(data.entries.map((e) => e.title)).toEqual([
      'Scene 7 | Shot 7A | MS',
      'Scene 4 | Scene blocking',
      'Scene 4 | Shot 4B | CU',
      'Scene 4 | Shot 4A | WS',
    ])
    expect(data.entries[0]!.description).toBe('Joe under the car')
  })

  it('shots: only the chosen shots, in the given order', () => {
    const data = buildFloorPlanPdfData({ ...base, scope: { kind: 'shots', shotIds: ['4b', '7a', '4b'] } })
    expect(data.entries.map((e) => e.title)).toEqual(['Scene 4 | Shot 4B | CU', 'Scene 7 | Shot 7A | MS'])
  })

  it('location: every plan by name, bare layouts for plans with no setups', () => {
    const data = buildFloorPlanPdfData({ ...base, scope: { kind: 'location', locationId: 'diner' } })
    expect(data.entries.map((e) => `${e.planName}: ${e.title}`)).toEqual([
      'Kitchen: Layout',
      'Main room: Scene 4 | Scene blocking',
      'Main room: Scene 4 | Shot 4A | WS',
      'Main room: Scene 4 | Shot 4B | CU',
    ])
  })

  it('draws a plan at one scale across its setups', () => {
    const data = buildFloorPlanPdfData({ ...base, scope: { kind: 'scene', sceneId: 'sc4' } })
    const bounds = data.entries.map((e) => JSON.stringify(e.bounds))
    expect(new Set(bounds).size).toBe(1)
  })

  it('skips setups for deleted shots', () => {
    const gone = shots.map((s) => (s.id === '4b' ? { ...s, deleted_at: 't' } : s))
    const data = buildFloorPlanPdfData({ ...base, shots: gone, scope: { kind: 'scene', sceneId: 'sc4' } })
    expect(data.entries.map((e) => e.title)).not.toContain('Scene 4 | Shot 4B | CU')
  })
})

describe('markerSummary', () => {
  it('lists cameras and actors by label', () => {
    expect(markerSummary([cam, { ...cam, id: 'c2', label: 'B' }, marta])).toBe('Cameras A, B | Actor Marta')
    expect(markerSummary([])).toBeNull()
  })
})

describe('generateFloorPlanPdf', () => {
  it('draws each setup with its title, description and markers', async () => {
    const data = buildFloorPlanPdfData({ ...base, scope: { kind: 'location', locationId: 'diner' } })
    const bytes = await generateFloorPlanPdf(data)
    // Load before extracting text: pdf.js takes over the buffer.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2)
    const text = await extractPdfText(bytes)
    expect(text).toContain('FLOOR PLANS')
    expect(text).toContain('Scene 4 | Shot 4A | WS')
    expect(text).toContain('The diner from the door')
    expect(text).toContain('Counter')
    expect(text).toContain('Marta')
  })

  it('says so when there is nothing to print, and copes with an empty plan', async () => {
    const empty = await generateFloorPlanPdf(buildFloorPlanPdfData({ ...base, scope: { kind: 'shots', shotIds: [] } }))
    expect(await extractPdfText(empty)).toContain('No floor plan setups for this selection yet.')

    const blank = buildFloorPlanPdfData({
      ...base,
      plans: [{ ...plans[0]!, layout: { shapes: [] } }],
      setups: [],
      scope: { kind: 'location', locationId: 'diner' },
    })
    expect(await extractPdfText(await generateFloorPlanPdf(blank))).toContain('Nothing drawn on this plan yet.')
  })
})
