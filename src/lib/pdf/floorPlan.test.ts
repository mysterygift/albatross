import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildFloorPlanPdfData, dataUrlBytes, generateFloorPlanPdf, markerSummary } from '@/lib/pdf/floorPlan'
import { extractPdfText } from '@/test/episodicIntegrationHelpers'
import type { FloorPlan, FloorPlanSetup } from '@/lib/db/repositories/floor-plans'
import { EQUIPMENT_CATALOG, defaultItemLabel } from '@/lib/floor-plans/catalog'
import { emptyLayout, type FloorPlanMarker } from '@/lib/floor-plans/model'
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
  ...emptyLayout(),
  shapes: [
    { id: 'r', kind: 'rect' as const, x: 100, y: 100, width: 600, height: 400 },
    { id: 'w', kind: 'path' as const, points: [{ x: 100, y: 100 }, { x: 700, y: 100 }], closed: false },
    { id: 't', kind: 'text' as const, x: 300, y: 250, width: 160, height: 30, rotation: 90, text: 'Counter', fontSize: 18 },
  ],
}

const plan = (id: string, locationId: string, name: string): FloorPlan =>
  ({ id, production_id: 'p', location_id: locationId, name, layout, background_image: null, ...ts }) as FloorPlan

const plans = [plan('main', 'diner', 'Main room'), plan('kitchen', 'diner', 'Kitchen'), plan('bay', 'garage', 'Bay')]

const cam: FloorPlanMarker = { id: 'c', kind: 'camera', x: 150, y: 150, rotation: 45, label: 'A' }
const marta: FloorPlanMarker = { id: 'm', kind: 'actor', x: 400, y: 300, rotation: 180, label: 'Marta', personId: 'p-marta' }

const setup = (id: string, planId: string, sceneId: string, shotId: string | null, markers: FloorPlanMarker[] = [cam, marta], notes: string | null = null) =>
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
  it('lists cameras, cast, lights and grip by label', () => {
    const hmi: FloorPlanMarker = { id: 'h', kind: 'item', type: 'arri-m18', x: 0, y: 0, rotation: 0, label: 'M18 | HMI', width: 0.47, depth: 0.54 }
    const track: FloorPlanMarker = { id: 't', kind: 'item', type: 'track-straight', x: 0, y: 0, rotation: 0, label: 'Track', width: 0.62, depth: 3.6 }
    expect(markerSummary([cam, { ...cam, id: 'c2', label: 'B' }, marta, hmi, track])).toBe('Cameras A, B | Cast Marta | Light M18 | Grip Track')
    expect(markerSummary([])).toBeNull()
    const stand: FloorPlanMarker = { id: 's', kind: 'item', type: 'c-stand', x: 0, y: 0, rotation: 0, label: '', width: 0.7, depth: 0.7 }
    expect(markerSummary([hmi, stand])).toBe('Light M18 | Grip C-stand')
  })
})

const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('generateFloorPlanPdf', () => {
  it('draws equipment with labels, cast colours and a background picture', async () => {
    const kit: FloorPlanMarker[] = [
      cam,
      marta,
      { id: 'h', kind: 'item', type: 'arri-m18', x: 600, y: 600, rotation: 270, label: 'M18 | HMI', width: 0.47, depth: 0.54 },
      { id: 'f', kind: 'item', type: 'floppy-4x4', x: 560, y: 560, rotation: 270, label: '4x4 floppy', width: 1.22, depth: 0.03 },
    ]
    const tent = { id: 'e', kind: 'item' as const, type: 'easy-up-3x3', x: 900, y: 650, rotation: 0, label: 'Easy-up | Video village', width: 3, depth: 3 }
    const withBackground = {
      ...plans[0]!,
      background_image: PNG_1x1,
      layout: {
        ...layout,
        shapes: [...layout.shapes, tent],
        north: 15,
        background: { source: 'image' as const, x: 0, y: 0, width: 1200, height: 800, opacity: 0.5, map: null },
      },
    }
    const data = buildFloorPlanPdfData({
      ...base,
      plans: [withBackground],
      setups: [setup('s', 'main', 'sc4', '4a', kit)],
      scope: { kind: 'scene', sceneId: 'sc4' },
      actorColors: new Map([['p-marta', '#8b5cf6']]),
    })
    expect(data.actorColors).toEqual({ 'p-marta': '#8b5cf6' })
    // The background widens the drawing to the whole picture.
    expect(data.entries[0]!.bounds).toEqual({ minX: 0, minY: 0, maxX: 1200, maxY: 800 })
    const bytes = await generateFloorPlanPdf(data)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    const text = await extractPdfText(bytes)
    expect(text).toContain('M18 | HMI')
    expect(text).toContain('4x4 floppy')
    expect(text).toContain('Easy-up | Video village')
    expect(text).toContain('Light M18 | Grip 4x4 floppy')
  })

  it('draws every item in the catalogue', async () => {
    const kit: FloorPlanMarker[] = EQUIPMENT_CATALOG.map((item, i) => ({
      id: item.id,
      kind: 'item',
      type: item.id,
      x: 60 + (i % 12) * 95,
      y: 60 + Math.floor(i / 12) * 60,
      rotation: (i * 30) % 360,
      label: defaultItemLabel(item),
      width: item.width,
      depth: item.depth,
    }))
    const data = buildFloorPlanPdfData({
      ...base,
      setups: [setup('s', 'main', 'sc4', '4a', kit)],
      scope: { kind: 'shots', shotIds: ['4a'] },
    })
    const bytes = await generateFloorPlanPdf(data)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    const text = await extractPdfText(bytes)
    expect(text).toContain('Techno 30')
    expect(text).toContain('Honeywagon')
  })

  it('draws shapes in their own colours', async () => {
    const coloured = {
      ...plans[0]!,
      layout: {
        ...layout,
        shapes: [
          { id: 'grass', kind: 'rect' as const, x: 0, y: 0, width: 300, height: 200, stroke: '#22c55e', fill: '#22c55e', fillOpacity: 0.3 },
          { id: 'pond', kind: 'path' as const, points: [{ x: 400, y: 100 }, { x: 500, y: 100 }, { x: 450, y: 180 }], closed: true, fill: '#3b82f6' },
        ],
      },
    }
    const data = buildFloorPlanPdfData({ ...base, plans: [coloured], setups: [], scope: { kind: 'location', locationId: 'diner' } })
    const bytes = await generateFloorPlanPdf(data)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })

  it('reads data URLs and ignores anything else', () => {
    expect(dataUrlBytes(PNG_1x1)?.[1]).toBe(0x50)
    expect(dataUrlBytes('https://example.com/a.png')).toBeNull()
  })

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
      plans: [{ ...plans[0]!, layout: emptyLayout() }],
      setups: [],
      scope: { kind: 'location', locationId: 'diner' },
    })
    expect(await extractPdfText(await generateFloorPlanPdf(blank))).toContain('Nothing drawn on this plan yet.')
  })
})
