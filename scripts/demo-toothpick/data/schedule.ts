/**
 * Toothpick shoot schedule: 7 shoot days over two weeks, Main Unit every day and a Second Unit
 * on days 2 and 7. Days are grouped by geography (Fallowfield/Withington → Ancoats → Great
 * Bridgewater St → Northern Quarter → Trafford Park) and by light (park scenes need daylight,
 * the bus scene needs dusk).
 *
 * Strips are shot-level (one per planned shot) so the Calendar, Stripboard, Sides builder and
 * Script Supervisor all have real data to work with. Shots are referenced as [scene, shot#].
 */
import type { LocationKey } from './locations'

export type StripPlan =
  | { type: 'call'; time: string }
  | { type: 'shots'; scene: number; shots: number[] }
  | { type: 'move'; from: LocationKey; to: LocationKey; title: string; minutes: number }
  | { type: 'lunch'; time: string; label?: string }
  | { type: 'wrap'; time: string }
  | { type: 'note'; title: string; text: string }

export type UnitPlan = { unit: 'main' | 'second'; strips: StripPlan[] }

export type DayDef = {
  n: number
  date: string
  call: string
  wrap: string
  meals: Array<{ name: string; time: string }>
  headline: string
  notes: string
  special: string
  /** Hospital / police for the call sheet and RAMS. */
  base: LocationKey
  parkingBase: string
  pins: Array<{ id: string; kind: 'unit_base' | 'parking' | 'other'; label: string; notes: string | null; lat: number; lng: number }>
  units: UnitPlan[]
}

const HOSPITAL = {
  name: 'Manchester Royal Infirmary (A&E)',
  address: 'Oxford Road, Manchester M13 9WL — A&E entrance via Upper Brook Street. A&E 0161 276 4147',
}
const POLICE_SOUTH = { name: 'Longsight Police Station (GMP)', address: '2 Grindlow Street, Longsight, Manchester M13 0LL' }
const POLICE_CITY = { name: 'GMP City Centre Public Enquiry Counter', address: 'Ground Floor, Mount Street elevation, Town Hall Extension, Manchester M2 5DB' }
export const EMERGENCY = {
  hospital: HOSPITAL,
  policeSouth: POLICE_SOUTH,
  policeCity: POLICE_CITY,
}

export const DAYS: DayDef[] = [
  {
    n: 1, date: '2026-11-02', call: '07:30', wrap: '17:30',
    meals: [{ name: 'Breakfast', time: '07:00' }, { name: 'Lunch', time: '12:30' }],
    headline: 'Maisie’s flat (3, 4, 5) → Platt Fields Park (16)',
    notes: 'First day. Interiors in the Fallowfield flat in script order, then a short company move to Platt Fields for the daylight walk-and-talk. Rehearse scene 9 at lunch if time allows.',
    special: 'Park permit via Screen Manchester covers days 1 and 6. 2 locations marshals on the path. Neighbours in the flat building notified.',
    base: 'park',
    parkingBase: 'Platt Fields Park car park, Wilmslow Road, Fallowfield, Manchester M14 6LA (permit to be confirmed)',
    pins: [{ id: 'pin-d1-base', kind: 'unit_base', label: 'Unit base — Platt Fields Park', notes: 'Trucks and catering. Crew car parking on Wilmslow Road.', lat: 53.4483, lng: -2.2245 }],
    units: [{
      unit: 'main', strips: [
        { type: 'call', time: '07:30' },
        { type: 'shots', scene: 3, shots: [1, 2, 3, 4, 5, 6] },
        { type: 'shots', scene: 4, shots: [1, 2, 3] },
        { type: 'shots', scene: 5, shots: [1, 2, 3, 4, 5, 6] },
        { type: 'lunch', time: '12:30' },
        { type: 'move', from: 'maisiesFlat', to: 'park', title: 'Company move: Maisie’s flat → Platt Fields Park', minutes: 30 },
        { type: 'shots', scene: 16, shots: [1, 2, 3, 4, 5, 6, 7] },
        { type: 'note', title: 'Light check', text: 'Sunset about 16:37. Walk-and-talk wides (16.1, 16.2, 16.6) first, close-ups last.' },
        { type: 'wrap', time: '17:30' },
      ],
    }],
  },
  {
    n: 2, date: '2026-11-03', call: '08:00', wrap: '19:00',
    meals: [{ name: 'Breakfast', time: '07:30' }, { name: 'Lunch', time: '13:00' }],
    headline: 'Hugh’s flat (9 night look, 15 day look) + Second Unit inserts',
    notes: 'One location, two looks: scene 9 in lamp-lit "night" with blackout, then scene 15 in daylight. Second Unit picks up the macro inserts (slow cooker, cards, kit-cat clock) in the same flat. Heavy dialogue day — flag sound for wild tracks.',
    special: 'No filming after 21:00 (shared stairwell). Fire exits on the landing to stay clear. Cast holding in the flat next door by arrangement.',
    base: 'hughsFlat',
    parkingBase: 'Courtyard of the building (2 bays) + Northern Quarter car park, Church Street, Manchester M4 1LX',
    pins: [],
    units: [
      {
        unit: 'main', strips: [
          { type: 'call', time: '08:00' },
          { type: 'shots', scene: 9, shots: [1, 3, 4, 5, 6, 8, 9, 10] },
          { type: 'lunch', time: '13:00' },
          { type: 'note', title: 'Turnaround', text: 'Flip the room from lamp-lit to daylight: remove blackout, reset the sofa and kit-cat clock.' },
          { type: 'shots', scene: 15, shots: [1, 3, 4, 5, 6] },
          { type: 'wrap', time: '19:00' },
        ],
      },
      {
        unit: 'second', strips: [
          { type: 'call', time: '10:00' },
          { type: 'shots', scene: 9, shots: [2, 7] },
          { type: 'shots', scene: 15, shots: [2] },
          { type: 'wrap', time: '14:00' },
        ],
      },
    ],
  },
  {
    n: 3, date: '2026-11-04', call: '08:00', wrap: '20:00',
    meals: [{ name: 'Breakfast', time: '07:30' }, { name: 'Lunch', time: '13:00' }, { name: 'Supper', time: '18:00' }],
    headline: 'The Goose and Gander: day (14), night (10), the closing look (18)',
    notes: 'One pub, three scenes. Shoot 14 in daylight, then blackout for 10 and 18. Rose, Don and Hugh all day; the cottage-core girl and two pub regulars come in after lunch for scene 18.',
    special: 'Pub closed to the public for the hire (08:00–20:30). Tiled floor protection. No smoking props indoors: herbal only, extinguished between takes.',
    base: 'gooseAndGander',
    parkingBase: 'Northern Quarter car park, Church Street, Manchester M4 1LX (confirm with Locations Manager); loading on Great Bridgewater Street',
    pins: [{ id: 'pin-d3-base', kind: 'unit_base', label: 'Peveril of the Peak — loading', notes: 'One lane on Great Bridgewater Street, 30 min loading.', lat: 53.4753, lng: -2.2416 }],
    units: [{
      unit: 'main', strips: [
        { type: 'call', time: '08:00' },
        { type: 'shots', scene: 14, shots: [1, 2, 3, 4, 5, 6, 7, 8] },
        { type: 'lunch', time: '13:00' },
        { type: 'note', title: 'Day → night', text: 'Window blackout and practicals only after lunch. Supporting artists: 2 pub regulars.' },
        { type: 'shots', scene: 10, shots: [1, 2, 3, 4, 5, 6, 7] },
        { type: 'shots', scene: 18, shots: [1, 2, 3, 4] },
        { type: 'wrap', time: '20:00' },
      ],
    }],
  },
  {
    n: 4, date: '2026-11-05', call: '06:00', wrap: '17:00',
    meals: [{ name: 'Breakfast', time: '05:30' }, { name: 'Lunch', time: '12:00' }],
    headline: 'Café (6, 7 Hugh’s side) → Minty’s flat (12)',
    notes: 'Before-opening café hire from 05:30, then a company move to the Castlefield flat. Scene 7 is intercut: today is Hugh’s side in the café bathroom; Don’s side is on day 6. CLASH: Noor Haddad (Minty) is unavailable today — see cast availability.',
    special: 'Boom operator cover (Dayo Adeyemi) on days 4–5. Café bathroom is tiny: skeleton crew only, monitor in the corridor.',
    base: 'cafe',
    parkingBase: 'Northern Quarter car park, Church Street, Manchester M4 1LX (confirm with Locations Manager)',
    pins: [{ id: 'pin-d4-base', kind: 'unit_base', label: 'The Koffee Pot — Oldham Street', notes: 'No parking on Oldham Street; load by hand from Church Street.', lat: 53.4841325, lng: -2.2330831 }],
    units: [{
      unit: 'main', strips: [
        { type: 'call', time: '06:00' },
        { type: 'shots', scene: 6, shots: [1, 2, 3, 4] },
        { type: 'shots', scene: 7, shots: [1, 2, 5] },
        { type: 'lunch', time: '12:00' },
        { type: 'move', from: 'cafe', to: 'mintysFlat', title: 'Company move: Northern Quarter → Castlefield', minutes: 25 },
        { type: 'shots', scene: 12, shots: [1, 2, 3, 4, 5, 6] },
        { type: 'note', title: 'Cast clash', text: 'Minty (Noor Haddad) is unavailable on 5 Nov. Options: swap scene 12 with a day-5 slot, or move to day 7.' },
        { type: 'wrap', time: '17:00' },
      ],
    }],
  },
  {
    n: 5, date: '2026-11-06', call: '12:00', wrap: '23:30',
    meals: [{ name: 'Lunch', time: '12:30' }, { name: 'Dinner', time: '18:30' }],
    headline: 'Bar (2) → Club exterior at night (11)',
    notes: 'Afternoon at the Grosvenor Street bar, then a company move to the Northern Quarter for the night exterior. Hard techno playback through the venue door; neighbours and bar staff informed in writing.',
    special: 'Street closed to our use after 23:30. Playback via sub at the door. Boom operator cover again today. Locations marshals on both pavements.',
    base: 'club',
    parkingBase: 'Northern Quarter car park, Church Street, Manchester M4 1LX; drop-off only at Spear Street',
    pins: [{ id: 'pin-d5-base', kind: 'unit_base', label: 'SOUP — Spear Street', notes: 'Drop-off only; unit trucks wait on Church Street.', lat: 53.4827, lng: -2.2347 }],
    units: [{
      unit: 'main', strips: [
        { type: 'call', time: '12:00' },
        { type: 'shots', scene: 2, shots: [1, 2, 3, 4, 5, 6] },
        { type: 'move', from: 'bar', to: 'club', title: 'Company move: Oxford Road → Northern Quarter', minutes: 30 },
        { type: 'lunch', time: '18:30', label: 'Dinner' },
        { type: 'shots', scene: 11, shots: [1, 2, 3, 4, 5, 6, 7, 8] },
        { type: 'wrap', time: '23:30' },
      ],
    }],
  },
  {
    n: 6, date: '2026-11-09', call: '08:00', wrap: '19:30',
    meals: [{ name: 'Breakfast', time: '07:30' }, { name: 'Lunch', time: '12:30' }, { name: 'Supper', time: '17:00' }],
    headline: 'Don’s flat (1, 7 Don’s sides) → Platt Fields (17) → bus (1)',
    notes: 'Three locations in one day. Don’s split-screen halves in Withington first, then the autumn-sun park bench at Platt Fields in the late-afternoon light window (about 14:15–16:15), then the static bus at Trafford Park at dusk. Heavy day for the 1st AD.',
    special: 'Park permit (days 1 and 6). 6 background artists for the bus (3 bus youths are scene 1). Static bus: rocked by grips, no driving. Sunset about 16:25.',
    base: 'park',
    parkingBase: 'Platt Fields Park car park, Wilmslow Road, Fallowfield, Manchester M14 6LA; bus yard parking inside the gate at Trafford Park',
    pins: [{ id: 'pin-d6-base', kind: 'unit_base', label: 'Unit base — Platt Fields Park', notes: 'Same car park as day 1.', lat: 53.4483, lng: -2.2245 }],
    units: [{
      unit: 'main', strips: [
        { type: 'call', time: '08:00' },
        { type: 'shots', scene: 1, shots: [3, 4] },
        { type: 'shots', scene: 7, shots: [3, 4, 6] },
        { type: 'lunch', time: '12:30' },
        { type: 'move', from: 'donsFlat', to: 'park', title: 'Company move: Withington → Platt Fields Park', minutes: 15 },
        { type: 'shots', scene: 17, shots: [1, 2, 3, 4, 5, 6] },
        { type: 'move', from: 'park', to: 'bus', title: 'Company move: Fallowfield → Trafford Park', minutes: 40 },
        { type: 'shots', scene: 1, shots: [1, 2, 5, 6] },
        { type: 'wrap', time: '19:30' },
      ],
    }],
  },
  {
    n: 7, date: '2026-11-10', call: '11:00', wrap: '22:30',
    meals: [{ name: 'Lunch', time: '14:00' }, { name: 'Dinner', time: '19:00' }],
    headline: 'Montage and pickups: bars (13), load-out (8) + Second Unit degree show',
    notes: 'Main Unit: the "different bars" montage in the afternoon, then the Albert Hall load-out after the venue’s event clears. Second Unit: Maisie hanging her degree-show work and the coursemates pub. Buffer for pickups from earlier days.',
    special: 'Albert Hall exterior only after 21:30. Truck on Peter Street under the venue loading licence. Second Unit travels light: 1 van, no generator.',
    base: 'loadOut',
    parkingBase: 'Northern Quarter car park, Church Street, Manchester M4 1LX; truck on Peter Street',
    pins: [],
    units: [
      {
        unit: 'main', strips: [
          { type: 'call', time: '11:00' },
          { type: 'shots', scene: 13, shots: [1, 2, 3, 4] },
          { type: 'lunch', time: '14:00' },
          { type: 'move', from: 'bar', to: 'loadOut', title: 'Company move: Oxford Road → Peter Street', minutes: 20 },
          { type: 'shots', scene: 8, shots: [1, 3, 5] },
          { type: 'note', title: 'Pickups', text: 'Reserve 45 minutes for any pickups flagged by the script supervisor in the daily progress reports.' },
          { type: 'wrap', time: '22:30' },
        ],
      },
      {
        unit: 'second', strips: [
          { type: 'call', time: '09:00' },
          { type: 'shots', scene: 8, shots: [2, 4] },
          { type: 'wrap', time: '16:00' },
        ],
      },
    ],
  },
]
