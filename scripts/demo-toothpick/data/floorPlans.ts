/**
 * Floor plans for Toothpick (the experimental Floor Plans feature): set plans with a setup for
 * each key shot, and unit base layouts.
 *
 * Everything is authored in metres from the plan's top-left corner and converted to plan units
 * (`upm` per metre) by `build/floorPlans.ts`. Angles are degrees clockwise from pointing right
 * (0 right, 90 down, 180 left, 270 up), as on the plan. Kit ids and sizes come from the app's
 * equipment catalogue (`src/lib/floor-plans/catalog.ts`).
 *
 * Interiors are drawn from the scene descriptions and location notes, not surveyed: they show a
 * plausible layout for each real venue, not its exact floor plan. Plans at locations with a
 * published coordinate carry it, so the sun path works for the shoot days.
 */
import type { CastKey } from './people'
import type { LocationKey } from './locations'

type Style = { stroke?: string; fill?: string; fillOpacity?: number }

export type ShapeDef =
  | ({ kind: 'rect'; x: number; y: number; w: number; h: number } & Style)
  | ({ kind: 'path'; pts: Array<[number, number]>; closed?: boolean } & Style)
  | { kind: 'text'; x: number; y: number; w: number; text: string; size?: number; rotation?: number }
  | KitDef

/** Equipment: `type` is a catalogue id; `w`/`d` override its size (track length, tent size). */
export type KitDef = { kind: 'item'; type: string; x: number; y: number; rot: number; label?: string; w?: number; d?: number }

export type MarkerDef =
  | { kind: 'camera'; label: string; x: number; y: number; rot: number }
  | { kind: 'cast'; who: CastKey; x: number; y: number; rot: number }
  | KitDef

export type SetupDef = { scene: number; shot: number | null; notes?: string; markers: MarkerDef[] }

export type PlanDef = {
  key: string
  location: LocationKey
  name: string
  /** Plan units per metre: the 1200 x 800 canvas is 1200/upm metres across. */
  upm: number
  north?: number
  shapes: ShapeDef[]
  setups: SetupDef[]
}

// ─── Small helpers ───────────────────────────────────────────────────────────

const rect = (x: number, y: number, w: number, h: number, style: Style = {}): ShapeDef => ({ kind: 'rect', x, y, w, h, ...style })
const line = (pts: Array<[number, number]>, style: Style = {}): ShapeDef => ({ kind: 'path', pts, ...style })
const area = (pts: Array<[number, number]>, style: Style = {}): ShapeDef => ({ kind: 'path', pts, closed: true, ...style })
const label = (x: number, y: number, w: number, text: string, size?: number): ShapeDef => ({ kind: 'text', x, y, w, text, ...(size ? { size } : {}) })
const kit = (type: string, x: number, y: number, rot: number, extra: Partial<Omit<KitDef, 'kind' | 'type' | 'x' | 'y' | 'rot'>> = {}): KitDef => ({
  kind: 'item', type, x, y, rot, ...extra,
})
const cam = (label: string, x: number, y: number, rot: number): MarkerDef => ({ kind: 'camera', label, x, y, rot })
const who = (cast: CastKey, x: number, y: number, rot: number): MarkerDef => ({ kind: 'cast', who: cast, x, y, rot })
/** A round thing (table, tree, lake) as a closed outline. */
const round = (cx: number, cy: number, r: number, style: Style = {}, n = 12): ShapeDef =>
  area(Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [Math.round((cx + Math.cos(a) * r) * 100) / 100, Math.round((cy + Math.sin(a) * r) * 100) / 100] as [number, number]
  }), style)

/** Colours used across the plans. */
const C = {
  street: '#64748b',
  glass: '#3b82f6',
  wood: '#f59e0b',
  vinyl: '#ef4444',
  felt: '#22c55e',
  grass: '#22c55e',
  water: '#3b82f6',
  tiles: '#22c55e',
  brick: '#ef4444',
  soft: '#8b5cf6',
  white: '#ffffff',
}

// ─── Set plans ───────────────────────────────────────────────────────────────

/** The Koffee Pot, Oldham Street: booths along the front window, the counter and the back bathroom. */
const CAFE: PlanDef = {
  key: 'cafe', location: 'cafe', name: 'Café floor', upm: 50,
  shapes: [
    rect(0, 12.6, 24, 3.4, { stroke: C.street, fill: C.street, fillOpacity: 0.25 }),
    label(9, 14, 6, 'Oldham Street'),
    // Walls, with the front door between the windows.
    line([[10.5, 12], [3, 12], [3, 3], [21, 3], [21, 12], [12.5, 12]]),
    line([[3.4, 12], [10.1, 12]], { stroke: C.glass }),
    line([[12.9, 12], [20.6, 12]], { stroke: C.glass }),
    label(10.4, 11.2, 2.2, 'Door', 14),
    label(3.6, 3.3, 5, 'The Koffee Pot'),
    // Kitchen and counter.
    line([[13, 3], [13, 4.8]]),
    label(15.4, 3.3, 3, 'Kitchen'),
    rect(13, 5, 6.5, 1, { fill: C.wood, fillOpacity: 0.35 }),
    label(14.7, 5.1, 3, 'Counter', 16),
    // Booths: a table between two vinyl benches.
    ...[4.8, 7.6, 15.2, 18.2].flatMap((cx) => [
      rect(cx - 1.0, 10.1, 0.5, 1.5, { fill: C.vinyl, fillOpacity: 0.35 }),
      rect(cx - 0.35, 10.25, 0.7, 1.2, { fill: C.white, fillOpacity: 0.5 }),
      rect(cx + 0.5, 10.1, 0.5, 1.5, { fill: C.vinyl, fillOpacity: 0.35 }),
    ]),
    label(6.1, 9.3, 3, 'Booth 2', 14),
    // Middle tables.
    rect(5.6, 6.2, 0.8, 0.8, { fill: C.white, fillOpacity: 0.5 }),
    rect(8.6, 6.2, 0.8, 0.8, { fill: C.white, fillOpacity: 0.5 }),
    // Back bathroom, door on its west wall.
    line([[17.5, 8.4], [17.5, 6.8], [21, 6.8]]),
    line([[17.5, 9.4], [21, 9.4]]),
    rect(20.2, 7, 0.6, 0.5, { fill: C.white, fillOpacity: 0.7 }),
    label(18, 7.6, 2.6, 'Bathroom', 16),
  ],
  setups: [
    {
      scene: 6, shot: null,
      notes: 'Booth 2 by the front window. Hugh on the window-left bench, Maisie opposite. Café dresses the food; production pays for the breakfasts.',
      markers: [who('hugh', 6.85, 10.85, 0), who('maisie', 8.35, 10.85, 180), cam('A', 7.6, 6.4, 90)],
    },
    {
      scene: 6, shot: 1,
      notes: 'Daylight through the front window: M18 on the pavement through a 6x6 of light grid. S60 lifts the room.',
      markers: [
        cam('A', 7.6, 6.2, 90), kit('tripod', 7.6, 6.2, 90),
        who('hugh', 6.85, 10.85, 0), who('maisie', 8.35, 10.85, 180),
        kit('arri-m18', 5.6, 14.8, 295), kit('frame-6x6', 6.4, 13.4, 295, { label: '6x6 | Light grid' }),
        kit('arri-skypanel-s60', 11.6, 7, 150), kit('c-stand', 12, 6.4, 150, { label: '' }),
      ],
    },
    {
      scene: 6, shot: 2,
      notes: '85mm over Maisie’s shoulder. 300d through a lantern as a soft key; flag the window spill off the table.',
      markers: [
        cam('A', 9.7, 9.7, 157), kit('tripod', 9.7, 9.7, 157),
        who('hugh', 6.85, 10.85, 0), who('maisie', 8.35, 10.85, 180),
        kit('aputure-300d', 8.6, 8.1, 125, { label: '300d | LED (lantern)' }), kit('flag-18x24', 7.3, 9.5, 0),
      ],
    },
    {
      scene: 6, shot: 3,
      notes: 'Reverse on Maisie: mirror the key to camera left.',
      markers: [
        cam('A', 5.5, 9.7, 23), kit('tripod', 5.5, 9.7, 23),
        who('hugh', 6.85, 10.85, 0), who('maisie', 8.35, 10.85, 180),
        kit('aputure-300d', 6.6, 8.1, 55, { label: '300d | LED (lantern)' }), kit('flag-18x24', 7.9, 9.5, 180),
      ],
    },
    {
      scene: 6, shot: 4,
      notes: 'Top shot on the hands: camera on a high-hat on the booth table edge, Gemini as a soft top light.',
      markers: [
        cam('A', 7.6, 9.6, 90), kit('hi-hat', 7.6, 9.6, 90),
        who('hugh', 6.85, 10.85, 0), who('maisie', 8.35, 10.85, 180),
        kit('gemini-1x1', 6.2, 8.8, 40),
      ],
    },
    {
      scene: 7, shot: 1,
      notes: 'Tiny room: Titan taped above the mirror, a practical over the sink. Handheld, operator against the door.',
      markers: [
        cam('A', 18.1, 7.6, 25), kit('handheld', 18.1, 7.6, 25),
        who('hugh', 19.6, 8.3, 0),
        kit('astera-titan', 20.6, 7.4, 180), kit('practical', 20.5, 7.2, 180, { label: 'Practical | Sink light' }),
      ],
    },
    {
      scene: 7, shot: 2,
      markers: [
        cam('A', 18.3, 8.9, 335), kit('handheld', 18.3, 8.9, 335),
        who('hugh', 19.6, 8.3, 180),
        kit('astera-titan', 20.6, 7.4, 180),
      ],
    },
    {
      scene: 7, shot: 5,
      notes: 'Customer queues at the bathroom door, listening in. Hugh’s voice plays in from inside.',
      markers: [
        cam('A', 12.6, 8.6, 0), kit('tripod', 12.6, 8.6, 0),
        who('customer', 16.8, 8.9, 0), who('hugh', 19.4, 8.2, 0),
        kit('arri-skypanel-s60', 14.8, 6.3, 60),
      ],
    },
  ],
}

/** Peveril of the Peak (The Goose and Gander): green-tiled wedge, island bar, round table by the window. */
const PUB: PlanDef = {
  key: 'pub', location: 'gooseAndGander', name: 'Front bar', upm: 50,
  shapes: [
    rect(0, 12.6, 24, 3.4, { stroke: C.street, fill: C.street, fillOpacity: 0.25 }),
    label(7.5, 14, 9, 'Great Bridgewater Street'),
    // The wedge-shaped building, its green tiles as the wall colour.
    area([[3, 3], [19, 3], [22, 12], [3, 12]], { stroke: C.tiles, fill: C.tiles, fillOpacity: 0.06 }),
    line([[6, 12], [9, 12]], { stroke: '#0f172a' }),
    line([[13, 12], [20, 12]], { stroke: '#0f172a' }),
    label(3.4, 10.8, 6, 'Windows: ND / blackout', 14),
    // Island bar and the snug.
    rect(9, 5.2, 5, 2.2, { fill: C.wood, fillOpacity: 0.4 }),
    label(10.2, 5.8, 2.6, 'Bar'),
    line([[3, 8], [6.5, 8], [6.5, 9.2]]),
    label(3.6, 9.5, 2.4, 'Snug', 16),
    // Round table by the window.
    round(16, 10, 0.6, { fill: C.wood, fillOpacity: 0.45 }),
    label(4, 3.4, 6, 'Peveril of the Peak'),
    label(16.5, 4, 4.5, 'Back of house →', 14),
  ],
  setups: [
    {
      scene: 10, shot: null,
      notes: 'The round table by the window. Hugh slumped with his back to the room, Don and Rose either side. Pub nearly dead: no SAs.',
      markers: [who('hugh', 15.3, 10.4, 330), who('don', 16.7, 10.4, 210), who('rose', 16, 9.3, 90), cam('A', 11.6, 11, 347)],
    },
    {
      scene: 10, shot: 1,
      notes: 'Night look: windows blacked out, warm practicals on the walls and a china ball over the table.',
      markers: [
        cam('A', 11.6, 11, 347), kit('tripod', 11.6, 11, 347),
        who('hugh', 15.3, 10.4, 330), who('don', 16.7, 10.4, 210), who('rose', 16, 9.3, 90),
        kit('china-ball', 16, 9.95, 0, { label: 'China ball | Tungsten (overhead)' }),
        kit('arri-t1', 19.6, 6.4, 125), kit('practical', 20.6, 8, 180), kit('practical', 12.6, 3.4, 90),
      ],
    },
    {
      scene: 10, shot: 2,
      notes: 'Rose single from between Hugh and Don. L7 key from camera right, flagged off the wall.',
      markers: [
        cam('A', 16, 11.6, 270), kit('tripod', 16, 11.6, 270),
        who('hugh', 15.3, 10.4, 330), who('don', 16.7, 10.4, 210), who('rose', 16, 9.3, 90),
        kit('arri-l7', 18, 8.4, 155), kit('flag-24x36', 17.4, 7.6, 60),
      ],
    },
    {
      scene: 10, shot: 3,
      markers: [
        cam('A', 14.5, 9.6, 21), kit('tripod', 14.5, 9.6, 21),
        who('hugh', 15.3, 10.4, 330), who('don', 16.7, 10.4, 210), who('rose', 16, 9.3, 90),
        kit('arri-l7', 15, 7.4, 60),
      ],
    },
    {
      scene: 10, shot: 4,
      markers: [
        cam('A', 17.5, 9.6, 159), kit('tripod', 17.5, 9.6, 159),
        who('hugh', 15.3, 10.4, 330), who('don', 16.7, 10.4, 210), who('rose', 16, 9.3, 90),
        kit('arri-l7', 17, 7.4, 120),
      ],
    },
    {
      scene: 10, shot: 7,
      notes: 'Last orders: the bell, then everyone necks their pint. Handheld from the bar end.',
      markers: [
        cam('A', 13, 8.6, 25), kit('handheld', 13, 8.6, 25),
        who('hugh', 15.3, 10.4, 330), who('don', 16.7, 10.4, 210), who('rose', 16, 9.3, 90),
        kit('china-ball', 16, 9.95, 0, { label: 'China ball | Tungsten (overhead)' }),
      ],
    },
    {
      scene: 14, shot: 1,
      notes: 'Day look: the windows open up. M18 on the street through 4x4 diffusion; the pub regulars at the bar.',
      markers: [
        cam('A', 11.6, 11, 347), kit('tripod', 11.6, 11, 347),
        who('hugh', 15.3, 10.4, 330), who('don', 16.7, 10.4, 210), who('rose', 16, 9.3, 90),
        who('sa4', 11.2, 7.9, 270), who('sa5', 12.4, 7.9, 270),
        kit('arri-m18', 15.2, 15, 285), kit('frame-4x4', 15.6, 13.3, 285, { label: '4x4 | 1/2 Grid' }),
      ],
    },
    {
      scene: 14, shot: 8,
      notes: 'Slow push in on Hugh: Fisher 11 on 2.4 m of straight track along the window bench.',
      markers: [
        cam('A', 18.6, 11, 191), kit('fisher-11', 18.6, 11, 191), kit('track-straight', 19.3, 11.15, 191, { d: 2.44 }),
        who('hugh', 15.3, 10.4, 330), who('don', 16.7, 10.4, 210), who('rose', 16, 9.3, 90),
        kit('aputure-600d', 18.4, 7.4, 125, { label: '600d | LED (through 4x4)' }), kit('frame-4x4', 17.6, 8.3, 125),
      ],
    },
    {
      scene: 18, shot: 1,
      notes: 'A few months on. Hugh at the bar end, Rose mingling, the cottage-core girl across the room.',
      markers: [
        cam('A', 20, 9, 205), kit('tripod', 20, 9, 205),
        who('hugh', 12.1, 7.8, 90), who('rose', 13.6, 8.4, 200), who('cottagecore', 16.5, 5.2, 160),
        who('sa4', 9.8, 4.6, 90), who('sa5', 12.8, 4.6, 90),
        kit('practical', 20.6, 8, 180), kit('arri-650-plus', 7.4, 4.2, 40),
      ],
    },
    {
      scene: 18, shot: 4,
      notes: 'Hugh looks down the lens. Camera dead ahead, 50mm, eyeline on the matte box.',
      markers: [
        cam('A', 12.1, 10.6, 270), kit('tripod', 12.1, 10.6, 270),
        who('hugh', 12.1, 7.8, 90),
        kit('arri-l5', 13.8, 9.4, 220),
      ],
    },
  ],
}

/** Hugh’s flat, Ancoats: one open-plan room, poker table at night (9), sofa in daylight (15). */
const HUGH: PlanDef = {
  key: 'hugh', location: 'hughsFlat', name: 'Open-plan living room', upm: 60,
  shapes: [
    line([[16, 4], [16, 2], [2, 2], [2, 11], [16, 11], [16, 5.2]]),
    line([[9.5, 11], [15.2, 11]], { stroke: C.glass }),
    label(15.2, 4.2, 2.8, 'Front door', 14),
    rect(2, 2, 7, 0.7, { fill: C.white, fillOpacity: 0.4 }),
    label(3, 2.05, 4, 'Kitchen (slow cooker)', 14),
    round(6, 7, 0.55, { fill: C.felt, fillOpacity: 0.55 }),
    label(4.6, 8, 3, 'Poker table', 14),
    rect(10.5, 8.5, 2.6, 0.9, { fill: C.soft, fillOpacity: 0.35 }),
    label(10.9, 8.65, 2, 'Sofa', 14),
    rect(11.1, 10.55, 1.4, 0.2, { fill: '#0f172a', fillOpacity: 0.9 }),
    label(11, 9.8, 2, 'TV / Wii', 12),
    label(12.3, 2.1, 3.4, 'Kit-cat clock', 12),
    label(2.4, 9.9, 4.5, 'Speaker in the corner', 12),
  ],
  setups: [
    {
      scene: 9, shot: null,
      notes: 'Night look with the blackout up. Hugh on the kitchen side of the poker table, Maisie facing him.',
      markers: [who('hugh', 5.4, 7, 0), who('maisie', 6.6, 7, 180), cam('A', 6, 10.3, 270)],
    },
    {
      scene: 9, shot: 1,
      notes: 'Lamp-lit: practicals do the work. L5 bounced off the ceiling as a soft key; LED mat as a top light.',
      markers: [
        cam('A', 6, 10.3, 270), kit('tripod', 6, 10.3, 270),
        who('hugh', 5.4, 7, 0), who('maisie', 6.6, 7, 180),
        kit('practical', 2.6, 9.6, 0), kit('practical', 8.8, 2.9, 90),
        kit('arri-l5', 8.6, 4.8, 140), kit('led-mat-2x2', 6, 5.6, 90, { label: 'Mat | LED (top light)' }),
      ],
    },
    {
      scene: 9, shot: 3,
      markers: [
        cam('A', 6, 9.2, 270), kit('tripod', 6, 9.2, 270),
        who('hugh', 5.4, 7, 0), who('maisie', 6.6, 7, 180),
        kit('led-mat-2x2', 6, 5.6, 90, { label: 'Mat | LED (top light)' }), kit('arri-l5', 8.6, 4.8, 140),
      ],
    },
    {
      scene: 9, shot: 4,
      markers: [
        cam('A', 7.7, 6.3, 160), kit('tripod', 7.7, 6.3, 160),
        who('hugh', 5.4, 7, 0), who('maisie', 6.6, 7, 180),
        kit('aputure-300d', 7.8, 8.6, 220, { label: '300d | LED (lantern)' }), kit('flag-18x24', 4.6, 6, 45),
      ],
    },
    {
      scene: 9, shot: 5,
      markers: [
        cam('A', 4.3, 6.3, 20), kit('tripod', 4.3, 6.3, 20),
        who('hugh', 5.4, 7, 0), who('maisie', 6.6, 7, 180),
        kit('aputure-300d', 4.2, 8.6, 320, { label: '300d | LED (lantern)' }),
      ],
    },
    {
      scene: 9, shot: 8,
      notes: 'Maisie stands and steps away; operator follows her round the table.',
      markers: [
        cam('A', 4.2, 8.6, 330), kit('handheld', 4.2, 8.6, 330),
        who('hugh', 5.4, 7, 0), who('maisie', 7.6, 6.1, 180),
        kit('practical', 8.8, 2.9, 90),
      ],
    },
    {
      scene: 9, shot: 10,
      notes: 'Hugh alone at the table: Dana Dolly push in from the sofa side.',
      markers: [
        cam('A', 8.4, 7, 180), kit('dana-dolly', 9.4, 7, 180, { d: 2.4 }),
        who('hugh', 5.4, 7, 0),
        kit('led-mat-2x2', 6, 5.6, 90, { label: 'Mat | LED (top light)' }),
      ],
    },
    {
      scene: 15, shot: 1,
      notes: 'Daylight: 1200d outside the window through a 4x4 of diffusion. Hugh sprawled on the sofa with the Wii remote.',
      markers: [
        cam('A', 11.4, 10.3, 270), kit('tripod', 11.4, 10.3, 270),
        who('hugh', 11.2, 9, 90),
        kit('aputure-1200d', 13.6, 12.6, 250), kit('frame-4x4', 13.2, 11.6, 250, { label: '4x4 | Full grid' }),
      ],
    },
    {
      scene: 15, shot: 3,
      notes: 'Hugh opens the door: Maisie’s changed her hair. Handheld from behind Hugh.',
      markers: [
        cam('A', 13.8, 5.6, 340), kit('handheld', 13.8, 5.6, 340),
        who('hugh', 14.9, 4.6, 0), who('maisie', 15.6, 4.6, 180),
        kit('gemini-2x1', 13.4, 3, 45),
      ],
    },
    {
      scene: 15, shot: 4,
      markers: [
        cam('A', 11.8, 10.3, 270), kit('tripod', 11.8, 10.3, 270),
        who('hugh', 11, 9, 90), who('maisie', 12.6, 9, 90),
        kit('aputure-1200d', 13.6, 12.6, 250), kit('frame-4x4', 13.2, 11.6, 250, { label: '4x4 | Full grid' }),
        kit('v-flat', 9, 8.6, 0, { label: 'V-flat | Neg fill' }),
      ],
    },
  ],
}

/** Maisie’s flat, Fallowfield: bedroom, bathroom and kitchen, shot in script order on day 1. */
const MAISIE: PlanDef = {
  key: 'maisie', location: 'maisiesFlat', name: 'Bedroom, bathroom and kitchen', upm: 60,
  shapes: [
    area([[2, 1.5], [16, 1.5], [16, 11], [2, 11]]),
    line([[9, 1.5], [9, 6.2]]),
    line([[9, 7.2], [9, 11]]),
    line([[2, 8], [7.2, 8]]),
    line([[9, 6.2], [11.6, 6.2]]),
    line([[12.6, 6.2], [16, 6.2]]),
    line([[13, 1.5], [13, 6.2]]),
    line([[3.5, 1.5], [7.5, 1.5]], { stroke: C.felt }),
    label(3.6, 1.7, 4, 'Green curtains', 12),
    rect(3, 2.8, 1.8, 2.1, { fill: C.white, fillOpacity: 0.6 }),
    label(2.6, 5.1, 3, 'Double bed', 12),
    label(9.4, 4.8, 3.2, 'Bathroom', 14),
    rect(11.8, 1.6, 0.8, 0.5, { fill: C.white, fillOpacity: 0.7 }),
    label(10, 9.6, 3, 'Kitchen', 16),
    rect(13.8, 6.3, 2.1, 0.7, { fill: C.white, fillOpacity: 0.4 }),
    label(14, 7.1, 2, 'Cafetière', 12),
    line([[16, 8], [16, 10.4]], { stroke: C.glass }),
    label(2.6, 9.2, 4, 'Hall', 14),
  ],
  setups: [
    {
      scene: 3, shot: 1,
      notes: 'Blue early-morning look: M18 outside through the green curtains with half CTB; everything else blacked out.',
      markers: [
        cam('A', 8, 7.2, 215), kit('tripod', 8, 7.2, 215),
        who('hugh', 3.6, 3.4, 90), who('maisie', 4.3, 4.6, 90),
        kit('arri-m18', 5.5, 0.6, 90, { label: 'M18 | HMI (1/2 CTB)' }),
      ],
    },
    {
      scene: 3, shot: 4,
      notes: 'Hugh peels the covers off and nearly falls out of bed. Handheld.',
      markers: [
        cam('A', 8, 6.4, 200), kit('handheld', 8, 6.4, 200),
        who('hugh', 5.6, 5, 0), who('maisie', 4, 4.4, 90),
        kit('arri-m18', 5.5, 0.6, 90, { label: 'M18 | HMI (1/2 CTB)' }), kit('bounce-4x4', 7.8, 3, 160, { label: 'Bounce | Poly' }),
      ],
    },
    {
      scene: 3, shot: 6,
      markers: [
        cam('A', 8.4, 2.6, 160), kit('tripod', 8.4, 2.6, 160),
        who('maisie', 4, 4.4, 0), who('hugh', 7.4, 7.2, 180),
        kit('aputure-300d', 8.4, 4.6, 190, { label: '300d | LED (1/2 CTB)' }),
      ],
    },
    {
      scene: 4, shot: 1,
      notes: 'Cold tap: operator wedged in the doorway, Helios tube above the mirror.',
      markers: [
        cam('A', 10, 5.6, 315), kit('handheld', 10, 5.6, 315),
        who('hugh', 12.2, 2.9, 270),
        kit('astera-helios', 12.2, 2, 90),
      ],
    },
    {
      scene: 5, shot: 1,
      notes: 'Kitchen two-shot: Maisie at the cafetière, Hugh in the doorway. 600d outside the kitchen window.',
      markers: [
        cam('A', 10.2, 10.3, 330), kit('tripod', 10.2, 10.3, 330),
        who('maisie', 14.6, 7.5, 180), who('hugh', 9.6, 7.6, 0),
        kit('aputure-600d', 17.2, 9.2, 200), kit('arri-skypanel-s30', 12, 10.6, 300),
      ],
    },
  ],
}

/** Platt Fields Park, north up: the path by the boating lake (16) and the bench (17), 30 x 20 m. */
const PARK: PlanDef = {
  key: 'park', location: 'park', name: 'Lakeside path and bench', upm: 40, north: 0,
  shapes: [
    rect(0, 0, 30, 20, { stroke: C.grass, fill: C.grass, fillOpacity: 0.12 }),
    area([[0, 0], [9, 0], [8, 2.5], [5, 4.2], [0, 4.8]], { stroke: C.water, fill: C.water, fillOpacity: 0.35 }),
    label(0.6, 1.2, 5, 'Boating lake', 16),
    // The gravel path, from the lake side round past the bench.
    area([[0, 12.5], [12, 11.4], [20, 9.2], [30, 6.4], [30, 8.4], [20.5, 11.2], [12.4, 13.4], [0, 14.5]], { stroke: C.wood, fill: C.wood, fillOpacity: 0.3 }),
    label(2, 15, 6, 'Path (public stays)', 14),
    rect(20.6, 6.3, 2.2, 0.7, { fill: C.wood, fillOpacity: 0.8 }),
    label(20.2, 4.8, 3, 'Bench', 14),
    // Trees.
    ...[[15, 7.5], [25, 3.5], [27.5, 12.5], [9, 17], [17.5, 16], [13, 3]].map(([x, y]) => round(x!, y!, 1.6, { stroke: '#166534', fill: '#166534', fillOpacity: 0.45 }, 10)),
    label(0.6, 18.4, 10, 'Unit base: Wilmslow Road car park ↙', 12),
  ],
  setups: [
    {
      scene: 16, shot: 1,
      notes: 'Gimbal leads them down the path. Marshals hold the public at both ends; sunset is about 16:37, so the wides go first.',
      markers: [
        cam('A', 10.5, 12.1, 185), kit('steadicam', 10.5, 12.1, 185, { label: 'Gimbal | Ronin 2' }),
        who('maisie', 5.2, 12.6, 355), who('hugh', 5.4, 13.8, 355),
        kit('frame-6x6', 8, 9.4, 90, { label: '6x6 | Ultrabounce (walked)' }),
      ],
    },
    {
      scene: 16, shot: 2,
      notes: '12 m of track along the path edge, PeeWee IV. Bounce walked alongside.',
      markers: [
        kit('track-straight', 7.5, 16.2, 355, { d: 12, label: 'Track | 12 m' }),
        cam('A', 3, 16.6, 330), kit('peewee-4', 3, 16.6, 330),
        who('maisie', 5.2, 12.6, 355), who('hugh', 5.4, 13.8, 355),
        kit('frame-6x6', 8, 9.4, 90, { label: '6x6 | Ultrabounce' }),
      ],
    },
    {
      scene: 16, shot: 6,
      notes: 'Maisie steps out in front of him. Same track, dolly pulls back.',
      markers: [
        kit('track-straight', 7.5, 16.2, 355, { d: 12, label: 'Track | 12 m' }),
        cam('A', 12, 15.8, 200), kit('peewee-4', 12, 15.8, 200),
        who('maisie', 9.4, 12.4, 175), who('hugh', 7.6, 12.9, 355),
        kit('arri-m18', 16, 18, 215, { label: 'M18 | HMI (sun top-up)' }),
      ],
    },
    {
      scene: 17, shot: 1,
      notes: 'Turn on Sun (Day 6, 15:30) to see the sun drop towards the trees. Wide first, while it clears them.',
      markers: [
        cam('A', 21.7, 15.5, 270), kit('tripod', 21.7, 15.5, 270),
        who('hugh', 21.1, 7.2, 90), who('maisie', 22.3, 7.2, 90),
      ],
    },
    {
      scene: 17, shot: 2,
      markers: [
        cam('A', 21.7, 11.5, 270), kit('tripod', 21.7, 11.5, 270),
        who('hugh', 21.1, 7.2, 90), who('maisie', 22.3, 7.2, 90),
        kit('bounce-4x4', 19, 9.4, 330, { label: 'Bounce | Gold' }), kit('arri-m18', 16.4, 12.2, 330, { label: 'M18 | HMI (sun top-up)' }),
      ],
    },
    {
      scene: 17, shot: 3,
      markers: [
        cam('A', 19.4, 9.6, 300), kit('tripod', 19.4, 9.6, 300),
        who('hugh', 21.1, 7.2, 90), who('maisie', 22.3, 7.2, 180),
        kit('bounce-4x4', 24.6, 9.2, 210, { label: 'Bounce | Gold' }),
      ],
    },
    {
      scene: 17, shot: 4,
      markers: [
        cam('A', 24.2, 9.6, 240), kit('tripod', 24.2, 9.6, 240),
        who('hugh', 21.1, 7.2, 0), who('maisie', 22.3, 7.2, 90),
        kit('bounce-4x4', 19, 9.4, 330, { label: 'Bounce | Gold' }),
      ],
    },
  ],
}

/** SOUP, Spear Street: the basement club’s door, the queue and the bouncer on the pavement. */
const CLUB: PlanDef = {
  key: 'club', location: 'club', name: 'Spear Street pavement', upm: 30,
  shapes: [
    rect(0, 14, 40, 8, { stroke: C.street, fill: C.street, fillOpacity: 0.3 }),
    label(15, 17.2, 10, 'Spear Street'),
    rect(0, 10, 40, 4, { stroke: C.street, fill: '#94a3b8', fillOpacity: 0.15 }),
    label(1, 12.6, 6, 'Pavement', 14),
    line([[0, 10], [18, 10]], { stroke: C.brick }),
    line([[20.4, 10], [40, 10]], { stroke: C.brick }),
    rect(18, 8, 2.4, 2, { fill: '#0f172a', fillOpacity: 0.6 }),
    label(15.6, 6.6, 8, 'SOUP (stairs down)', 14),
    label(31, 6.6, 9, 'Stevenson Square →', 14),
    label(1, 6.6, 12, 'Brick wall', 14),
  ],
  setups: [
    {
      scene: 11, shot: 1,
      notes: 'Hugh against the brick wall, techno thumping up the stairs (playback through a sub at the door). M40 on a wind-up does the sodium streetlight.',
      markers: [
        cam('A', 14, 19, 270), kit('tripod', 14, 19, 270),
        who('hugh', 14, 10.6, 90), who('sa6', 21.6, 10.8, 180),
        kit('arri-m40', 30, 18.5, 200, { label: 'M40 | HMI (sodium gel)' }), kit('wind-up-stand', 30, 18.5, 200, { label: '' }),
        kit('arri-skypanel-s60', 19.2, 10.6, 90, { label: 'S60 | LED (spill)' }),
      ],
    },
    {
      scene: 11, shot: 3,
      notes: 'Over Hugh’s shoulder as Minty slides in. Handheld.',
      markers: [
        cam('A', 12.4, 12.4, 340), kit('handheld', 12.4, 12.4, 340),
        who('hugh', 14, 10.8, 0), who('minty', 15.3, 11, 180),
        kit('arri-m40', 30, 18.5, 200, { label: 'M40 | HMI (sodium gel)' }), kit('aputure-300d', 12, 15, 300, { label: '300d | LED (fill, CTO)' }),
      ],
    },
    {
      scene: 11, shot: 5,
      notes: 'Whip pan to Rose chatting up the bouncer at the door.',
      markers: [
        cam('A', 15.4, 12.8, 345), kit('handheld', 15.4, 12.8, 345),
        who('rose', 18.6, 11, 0), who('bouncer', 19.8, 10.6, 180), who('hugh', 14, 10.8, 0), who('minty', 15.3, 11, 180),
        kit('arri-skypanel-s60', 19.2, 10.6, 90, { label: 'S60 | LED (spill)' }),
      ],
    },
    {
      scene: 11, shot: 6,
      notes: 'Two-shot from the road on a short slider; the queue soft behind them.',
      markers: [
        cam('A', 14.6, 15.4, 270), kit('slider', 14.6, 15.4, 0),
        who('hugh', 14, 10.8, 0), who('minty', 15.3, 11, 180), who('sa6', 21.6, 10.8, 180),
        kit('arri-m40', 30, 18.5, 200, { label: 'M40 | HMI (sodium gel)' }), kit('wind-up-stand', 30, 18.5, 200, { label: '' }),
        kit('astera-titan', 18.2, 9.6, 90, { label: 'Titan | LED (in the stairwell)' }),
      ],
    },
  ],
}

/** The static bus rig in the Trafford Park yard: Hugh on the back bench, youths at the front. */
const BUS: PlanDef = {
  key: 'bus', location: 'bus', name: 'Bus interior (static rig)', upm: 80,
  shapes: [
    rect(1.5, 3.5, 11.5, 2.5, { fill: '#94a3b8', fillOpacity: 0.2 }),
    label(1.6, 2.6, 3, 'Front (driver)', 12),
    label(10.6, 2.6, 3, 'Back bench', 12),
    rect(12.3, 3.6, 0.6, 2.3, { fill: C.vinyl, fillOpacity: 0.45 }),
    ...[3, 4.6, 6.2, 7.8, 9.4, 11].flatMap((x) => [
      rect(x, 3.6, 0.8, 0.8, { fill: C.vinyl, fillOpacity: 0.3 }),
      rect(x, 5.1, 0.8, 0.8, { fill: C.vinyl, fillOpacity: 0.3 }),
    ]),
    line([[1.5, 3.5], [13, 3.5]], { stroke: C.glass }),
    line([[1.5, 6], [13, 6]], { stroke: C.glass }),
    label(4.5, 6.4, 7, 'Windows: dusk-blue gel', 12),
    label(4.5, 1.6, 7, 'Grips rock the bus from outside', 12),
  ],
  setups: [
    {
      scene: 1, shot: 1,
      notes: 'Bus parked, engine off. Grips rock it; the M18 passes the windows on a wobbler as streetlight.',
      markers: [
        cam('A', 10.8, 5.3, 350), kit('handheld', 10.8, 5.3, 350),
        who('hugh', 12.5, 4.75, 180),
        kit('astera-titan', 6, 4.75, 90, { label: 'Titan | LED (ceiling)' }), kit('astera-titan', 9.5, 4.75, 90, { label: 'Titan | LED (ceiling)' }),
        kit('arri-m18', 8, 8.6, 270, { label: 'M18 | HMI (streetlight pass)' }),
      ],
    },
    {
      scene: 1, shot: 5,
      notes: 'Youths jeering from the front. Camera tucked beside Hugh on the back bench.',
      markers: [
        cam('A', 12.4, 4.1, 180), kit('handheld', 12.4, 4.1, 180),
        who('hugh', 12.5, 5.2, 180), who('sa1', 3.4, 4, 0), who('sa2', 3.4, 5.5, 0), who('sa3', 5, 4, 0),
        kit('astera-titan', 6, 4.75, 90, { label: 'Titan | LED (ceiling)' }), kit('astera-titan', 9.5, 4.75, 90, { label: 'Titan | LED (ceiling)' }),
      ],
    },
  ],
}

/** Sandbar, Grosvenor Street: the fringe corner table (2). */
const BAR: PlanDef = {
  key: 'bar', location: 'bar', name: 'Fringe corner', upm: 60,
  shapes: [
    area([[2, 2], [17, 2], [17, 11], [2, 11]]),
    rect(6, 2, 8, 1.2, { fill: C.wood, fillOpacity: 0.4 }),
    label(8.8, 2.2, 3, 'Bar', 16),
    rect(3.6, 8.3, 1.4, 0.9, { fill: C.wood, fillOpacity: 0.45 }),
    label(2.5, 9.5, 4, 'Sticky table', 12),
    rect(9, 6, 1.2, 1.2, { fill: C.white, fillOpacity: 0.4 }),
    rect(12, 6, 1.2, 1.2, { fill: C.white, fillOpacity: 0.4 }),
    line([[2.5, 11], [8, 11]], { stroke: C.glass }),
    label(12.8, 10.2, 4, 'Door to Grosvenor St', 12),
  ],
  setups: [
    {
      scene: 2, shot: 1,
      notes: 'The quiet fringe of the room. Two 650s bounced off the ceiling; a V-flat kills the white wall.',
      markers: [
        cam('A', 9.2, 9.2, 185), kit('tripod', 9.2, 9.2, 185),
        who('hugh', 3.9, 8.8, 0), who('maisie', 4.7, 8.8, 180),
        kit('arri-650-plus', 7, 4.6, 140), kit('arri-650-plus', 2.8, 4.8, 60), kit('v-flat', 2.6, 10.4, 315, { label: 'V-flat | Neg fill' }),
      ],
    },
    {
      scene: 2, shot: 6,
      notes: 'Pints stacking up: 60 cm slider tracking right across the table.',
      markers: [
        cam('A', 4.3, 7.3, 90), kit('slider-60', 4.3, 7.3, 0),
        who('hugh', 3.9, 8.8, 0), who('maisie', 4.7, 8.8, 180),
        kit('aputure-600d', 7, 6.8, 160, { label: '600d | LED (lantern)' }),
      ],
    },
  ],
}

/** Albert Hall, Peter Street: the night load-out for montage scene 8. */
const LOAD_OUT: PlanDef = {
  key: 'loadOut', location: 'loadOut', name: 'Peter Street load-out', upm: 25,
  shapes: [
    rect(0, 18, 48, 9, { stroke: C.street, fill: C.street, fillOpacity: 0.3 }),
    label(20, 22, 8, 'Peter Street'),
    area([[4, 2], [30, 2], [30, 16], [4, 16]], { stroke: C.brick, fill: C.brick, fillOpacity: 0.08 }),
    label(10, 7, 12, 'Albert Hall'),
    rect(18, 14.6, 5, 1.4, { fill: '#0f172a', fillOpacity: 0.5 }),
    label(17.6, 12.8, 6, 'Load-out dock', 12),
    rect(16.5, 16.4, 1.2, 0.8, { fill: '#0f172a', fillOpacity: 0.6 }),
    rect(18.2, 16.6, 1.2, 0.8, { fill: '#0f172a', fillOpacity: 0.6 }),
    rect(19.9, 16.4, 1.2, 0.8, { fill: '#0f172a', fillOpacity: 0.6 }),
    label(14, 17.4, 6, 'Flight cases', 12),
  ],
  setups: [
    {
      scene: 8, shot: 1,
      notes: 'Hugh shunts kit onto the box truck after the venue clears. A 4K PAR on the cherry picker for moonlight; the M40 is the sodium street.',
      markers: [
        kit('camera-truck', 21, 22, 180, { label: 'Box truck (picture vehicle)' }),
        cam('A', 11, 24.5, 330), kit('handheld', 11, 24.5, 330),
        who('hugh', 17.6, 17.6, 0),
        kit('cherry-picker', 42, 26, 215, { d: 12, label: 'Cherry picker | 12 m' }),
        kit('hmi-4k-par', 32.2, 19.1, 215, { label: '4K PAR | HMI (moonlight)' }),
        kit('arri-m40', 6, 21, 340, { label: 'M40 | HMI (sodium gel)' }), kit('wind-up-stand', 6, 21, 340, { label: '' }),
      ],
    },
  ],
}

// ─── Unit bases ──────────────────────────────────────────────────────────────

const parkingRow = (x: number, y: number, n: number, rot = 90): KitDef[] =>
  Array.from({ length: n }, (_, i) => kit('parking-bay', x + i * 2.6, y, rot, { label: i === 0 ? 'Crew parking' : '' }))

/** Platt Fields Park, Wilmslow Road car park: the main base for days 1 and 6. 120 x 80 m. */
const PARK_BASE: PlanDef = {
  key: 'parkBase', location: 'park', name: 'Unit base | Wilmslow Road car park', upm: 10, north: 0,
  shapes: [
    rect(0, 0, 10, 80, { stroke: C.street, fill: C.street, fillOpacity: 0.3 }),
    label(0.5, 52, 9, 'Wilmslow Road', 14),
    rect(16, 8, 86, 64, { stroke: C.street, fill: '#94a3b8', fillOpacity: 0.15 }),
    line([[10, 40], [16, 40]], { stroke: C.felt }),
    label(17, 9, 40, 'Car park (permit via Screen Manchester)', 14),
    rect(106, 0, 14, 80, { stroke: C.grass, fill: C.grass, fillOpacity: 0.2 }),
    label(106.5, 38, 13, 'Park → set (8 min walk)', 14),
    kit('camera-truck', 26, 18, 0), kit('grip-truck', 42, 18, 0), kit('lighting-truck', 58, 18, 0),
    kit('generator', 72, 18, 0, { label: 'Genny | 60 kVA (silent)' }), kit('distro', 78, 22, 0),
    kit('makeup-trailer', 26, 32, 0), kit('costume-trailer', 42, 32, 0),
    kit('trailer', 58, 32, 0, { label: 'Artist | Hugh' }), kit('trailer', 72, 32, 0, { label: 'Artist | Don' }),
    kit('honeywagon', 92, 18, 0), kit('toilet-block', 92, 32, 0, { label: 'Toilets | Welfare' }),
    kit('catering-truck', 92, 46, 0), kit('marquee', 64, 50, 90, { label: 'Marquee | Dining' }),
    kit('easy-up-3x3', 28, 48, 0, { label: 'Easy-up | First aid' }), kit('easy-up-3x3', 48, 48, 0, { label: 'Easy-up | SA holding' }),
    kit('table-6ft', 80, 50, 90, { label: 'Tea and coffee' }),
    ...parkingRow(22, 64, 12),
    kit('van', 62, 64, 270, { label: 'Van | Art' }), kit('minibus', 74, 64, 270, { label: 'Minibus | Unit' }),
    kit('cone', 12, 37, 0, { label: 'Cones' }), kit('cone', 12, 43, 0, { label: '' }),
    kit('crowd-barrier', 17.5, 47, 0, { label: 'Barrier' }),
  ],
  setups: [],
}

/** Northern Quarter car park, Church Street: base for the café, club, Hugh’s flat and the pub. 120 x 80 m. */
const NQ_BASE: PlanDef = {
  key: 'nqBase', location: 'cafe', name: 'Unit base | Church Street car park', upm: 10,
  shapes: [
    rect(0, 68, 120, 12, { stroke: C.street, fill: C.street, fillOpacity: 0.3 }),
    label(48, 72.5, 24, 'Church Street (M4 1LX)'),
    rect(8, 8, 104, 56, { stroke: C.street, fill: '#94a3b8', fillOpacity: 0.15 }),
    line([[54, 64], [62, 64]], { stroke: C.felt }),
    label(53, 60.5, 10, 'Way in', 14),
    label(10, 9.5, 50, 'Northern Quarter car park (bays reserved via Locations)', 14),
    kit('camera-truck', 20, 18, 0), kit('grip-truck', 37, 18, 0, { label: 'Grip and lighting truck' }),
    kit('generator-small', 76, 24, 0, { label: 'Genny | 7 kVA' }),
    kit('honeywagon', 64, 18, 0), kit('catering-truck', 86, 18, 0),
    kit('makeup-trailer', 20, 34, 0), kit('costume-trailer', 37, 34, 0),
    kit('minibus', 54, 34, 270, { label: 'Minibus | Cast' }), kit('van', 64, 34, 270, { label: 'Van | Art' }),
    kit('easy-up-6x3', 88, 34, 90, { label: 'Easy-up | Dining' }),
    kit('table-6ft', 88, 40, 0, { label: 'Tables' }), kit('table-6ft', 92, 40, 0, { label: '' }),
    ...parkingRow(18, 52, 14),
    label(64, 54, 44, 'Walk: café 4 min | SOUP 3 min | Hugh’s flat 8 min', 12),
  ],
  setups: [],
}

/** The bus yard at Trafford Park: the picture bus, its lighting and a small village. */
const BUS_BASE: PlanDef = {
  key: 'busBase', location: 'bus', name: 'Unit base | Trafford Park bus yard', upm: 15,
  shapes: [
    rect(2, 2, 76, 49, { stroke: C.street, fill: '#94a3b8', fillOpacity: 0.12 }),
    label(4, 3, 30, 'Coach yard (inside the gate)', 14),
    line([[2, 40], [2, 47]], { stroke: C.felt }),
    label(3, 47.5, 10, 'Gate', 12),
    kit('dining-bus', 30, 24, 0, { label: 'Picture bus (static rig)', w: 2.55, d: 12 }),
    label(23, 18, 20, 'Grips rock the bus from both sides', 12),
    kit('arri-m18', 30, 31, 270, { label: 'M18 | HMI' }),
    kit('generator', 52, 12, 0, { label: 'Genny | 60 kVA' }), kit('distro', 46, 16, 0),
    kit('lighting-truck', 62, 12, 0),
    kit('easy-up-6x3', 47, 31, 0, { label: 'Easy-up | Video village' }),
    kit('video-village', 47, 30.2, 0, { label: '' }), kit('dit-cart', 53, 31, 90, { label: 'DIT' }), kit('sound-cart', 41.5, 31, 90, { label: 'Sound' }),
    kit('camera-truck', 62, 26, 0),
    kit('makeup-trailer', 14, 10, 0), kit('honeywagon', 14, 40, 0), kit('catering-truck', 62, 40, 0),
    ...parkingRow(30, 42, 8, 90),
    kit('cone', 22, 20, 0, { label: 'Cones round the rig' }), kit('cone', 38, 20, 0, { label: '' }),
    kit('cone', 22, 28, 0, { label: '' }), kit('cone', 38, 28, 0, { label: '' }),
  ],
  setups: [],
}

/** Peveril of the Peak: loading lane, smokers’ point and holding for day 3. */
const PUB_BASE: PlanDef = {
  key: 'pubBase', location: 'gooseAndGander', name: 'Loading and holding', upm: 15,
  shapes: [
    rect(0, 34, 80, 10, { stroke: C.street, fill: C.street, fillOpacity: 0.3 }),
    label(28, 38, 22, 'Great Bridgewater Street'),
    rect(0, 30, 80, 4, { stroke: C.street, fill: '#94a3b8', fillOpacity: 0.15 }),
    area([[24, 10], [46, 10], [52, 30], [24, 30]], { stroke: C.tiles, fill: C.tiles, fillOpacity: 0.12 }),
    label(28, 18, 22, 'Peveril of the Peak (set)'),
    label(26, 24, 26, 'Back of house: cast holding and make-up', 12),
    label(4, 31, 30, 'Loading on the near lane only', 12),
  ],
  setups: [],
}

// Equipment for the pub base sits on the street; kept separate so the shapes read first.
PUB_BASE.shapes.push(
  kit('van', 22, 36.5, 0, { label: 'Van | Grip and lighting' }), kit('van', 8, 36.5, 0, { label: 'Van | Camera' }),
  kit('generator-small', 56, 31.8, 0, { label: 'Genny | 7 kVA' }),
  kit('easy-up-3x3', 60, 24, 0, { label: 'Easy-up | Smokers’ point' }),
  kit('crowd-barrier', 22, 32, 0, { label: 'Barrier' }), kit('crowd-barrier', 54.5, 32, 0, { label: '' }),
  kit('cone', 2, 35.5, 0, { label: 'Cones' }), kit('cone', 28, 35.5, 0, { label: '' }),
)

export const FLOOR_PLANS: PlanDef[] = [CAFE, PUB, HUGH, MAISIE, PARK, CLUB, BUS, BAR, LOAD_OUT, PARK_BASE, NQ_BASE, BUS_BASE, PUB_BASE]
