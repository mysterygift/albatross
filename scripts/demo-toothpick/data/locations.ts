/**
 * Manchester locations for Toothpick.
 *
 * Public venues use their real, verified street addresses (and published venue phone numbers).
 * Private homes deliberately carry area-level addresses only (district + postcode area): a real
 * location manager would not circulate a householder's address in a project file.
 *
 * Location `name` is the *story set* name so the app's Script Import links scenes to these rows
 * by name (it matches case-insensitively); the real venue that stands in for it is in `address`.
 */
export type LocationKey =
  | 'bus' | 'donsFlat' | 'bar' | 'maisiesFlat' | 'cafe' | 'various' | 'hughsFlat'
  | 'gooseAndGander' | 'club' | 'mintysFlat' | 'park' | 'degreeShow' | 'loadOut'

export type LocationDef = {
  key: LocationKey
  name: string
  booked_status: 'unbooked' | 'hold' | 'booked' | 'wrap'
  address: string
  availability_constraints: string | null
  location_fee: number | null
  notes: string
  parking_info: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  /** WGS84, only where a published coordinate was found. */
  coords?: { lat: number; lng: number }
}

const SCREEN_MANCHESTER =
  'Permit via Screen Manchester (Manchester City Council film office); evidence of public liability insurance (min. £5m) and a risk assessment are required.'

export const LOCATIONS: LocationDef[] = [
  {
    key: 'bus', name: 'Bus', booked_status: 'booked',
    address: 'Static bus rig — Trafford Coach & Bus Hire yard, Trafford Park, Manchester M17 (gate to be confirmed)',
    availability_constraints: 'Yard access from 12:00. Vehicle must be back in service by 06:00 the next day.',
    location_fee: 250,
    notes: 'Single-decker, rear bench seat for Hugh. Interior only (scene 1): bus is parked, engine off, rocked by grips for the "turbulent" feel. 6 background artists. Side windows get dusk-blue gels.',
    parking_info: 'Unit trucks inside the yard. Crew car park on Trafford Park Road (pay & display).',
    contact_name: 'Yard supervisor (name TBC)', contact_email: 'yard@trafford-coach-demo.example', contact_phone: '0161 496 0140',
  },
  {
    key: 'donsFlat', name: "Don's Flat", booked_status: 'booked',
    address: 'Private house-share — Withington, Manchester M20 (address on call sheet only)',
    availability_constraints: 'Weekday daytime only (housemates at work). Out by 17:00.',
    location_fee: 250,
    notes: 'Don’s side of the split-screen: bedroom mirror (scene 1) and living-room sofa with drab telly (scene 7). Two rooms, one setup each. Housemates informed; bedroom door must be lockable.',
    parking_info: 'Residents’ parking — 2 crew vehicles max on the street. Unit base is the bus yard later that day.',
    contact_name: 'Householder (name TBC)', contact_email: 'dons.flat@toothpick-demo.example', contact_phone: '07700 900611',
  },
  {
    key: 'bar', name: 'Bar', booked_status: 'hold',
    address: 'Sandbar, 120 Grosvenor Street, Manchester M1 7HL',
    availability_constraints: 'Weekday afternoons only, before evening trade. Out by 17:30.',
    location_fee: 450,
    notes: 'Independent student/academic bar near Oxford Road: sticky tables, fringe corner for Hugh and Maisie (scene 2). Also stands in for the "different bars" in montage scene 13. Hold only until venue manager signs the location agreement.',
    parking_info: 'No on-site parking. Loading bay on Grosvenor Street, 30 minutes max.',
    contact_name: 'Venue manager (name TBC)', contact_email: null, contact_phone: '0161 273 1552',
  },
  {
    key: 'maisiesFlat', name: "Maisie's Flat", booked_status: 'booked',
    address: 'Private flat — Fallowfield, Manchester M14 (address on call sheet only)',
    availability_constraints: 'Access from 06:30; quiet working after 17:00 (neighbours above).',
    location_fee: 300,
    notes: 'Bedroom (green curtains, double bed), bathroom and kitchen — scenes 3, 4, 5 in script order, all in one flat. Need blackout for the blue early-morning look. Landlord’s damage deposit held by production.',
    parking_info: 'Residents’ permit zone: 2 crew parking permits arranged. Everything else at Platt Fields Park unit base (10 min walk).',
    contact_name: 'Householder (name TBC)', contact_email: 'maisies.flat@toothpick-demo.example', contact_phone: '07700 900612',
  },
  {
    key: 'cafe', name: 'Café', booked_status: 'hold',
    address: 'The Koffee Pot, 84-86 Oldham Street, Northern Quarter, Manchester M4 1LE',
    availability_constraints: 'Filming before opening only: 05:30–10:00. Small back bathroom for scene 7 is shared with staff.',
    location_fee: 420,
    notes: 'Long-running Northern Quarter café with booths — Hugh’s finished fry-up, Maisie’s oats (scene 6), and the tiny bathroom Hugh phones Don from (scene 7). Food dressing by the café; production covers the breakfasts.',
    parking_info: 'No parking on Oldham Street. Unit base: Northern Quarter car park, Church Street (M4 1LX) — confirm with Locations Manager.',
    contact_name: 'Café manager (name TBC)', contact_email: null, contact_phone: '0161 236 8918',
    coords: { lat: 53.4841325, lng: -2.2330831 },
  },
  {
    key: 'various', name: 'Various', booked_status: 'unbooked',
    address: 'Montage locations — see "Montage – Degree show", "Montage – Venue load-out" and Bar',
    availability_constraints: null,
    location_fee: null,
    notes: 'Placeholder set for the two MONTAGE scenes (8 and 13). The real locations are split across the Second Unit (degree show, pub) and Main Unit (load-out, bars) on day 7.',
    parking_info: null,
    contact_name: null, contact_email: null, contact_phone: null,
  },
  {
    key: 'hughsFlat', name: "Hugh's Flat", booked_status: 'booked',
    address: 'Private flat — Ancoats, Manchester M4 (address on call sheet only)',
    availability_constraints: 'Whole day access incl. evening. No filming after 21:00 (shared stairwell).',
    location_fee: 350,
    notes: 'Open-plan living area: slow cooker, speaker, round poker table (scene 9), then the same room in daylight with the sofa, Wii remote and kit-cat clock (scene 15). Undecorated walls are the point — do not dress them.',
    parking_info: 'Two bays in the building’s courtyard; remaining vehicles at the Northern Quarter car park.',
    contact_name: 'Householder (name TBC)', contact_email: 'hughs.flat@toothpick-demo.example', contact_phone: '07700 900613',
  },
  {
    key: 'gooseAndGander', name: 'The Goose and Gander', booked_status: 'booked',
    address: 'Peveril of the Peak, 127 Great Bridgewater Street, Manchester M1 5JQ',
    availability_constraints: 'Closed-pub hire 08:00–20:30 on the shoot day. Back of house for holding and make-up.',
    location_fee: 900,
    notes: 'Grade II listed pub with a green-tiled exterior and surviving Victorian interior. Three scenes: 14 (day, Birthday Boy), 10 (night, last orders), 18 (night, the look to camera). Interior only: windows get ND/blackout to flip day to night. Pub dressing by Art; bar staff are SAs.',
    parking_info: 'Loading on Great Bridgewater Street (one lane). Crew parking at the Northern Quarter car park or Oxford Road station area.',
    contact_name: 'Duty manager (name TBC)', contact_email: null, contact_phone: '0161 236 6364',
    coords: { lat: 53.4753, lng: -2.2416 },
  },
  {
    key: 'club', name: 'Club', booked_status: 'hold',
    address: 'SOUP, 31-33 Spear Street, Northern Quarter, Manchester M1 1DF',
    availability_constraints: 'Exterior only. Street closed to our use after 23:30; neighbours and bar staff to be notified in writing.',
    location_fee: 600,
    notes: 'Basement venue on the corner of Stevenson Square: brick wall, hard techno booming through the door (playback track + sub). The queue and bouncer live on the pavement. Fire exits to remain clear.',
    parking_info: 'No parking. Drop-off only; unit base at Northern Quarter car park, Church Street.',
    contact_name: 'Venue manager (name TBC)', contact_email: null, contact_phone: '0161 236 5100',
    coords: { lat: 53.4827, lng: -2.2347 },
  },
  {
    key: 'mintysFlat', name: "Minty's Flat", booked_status: 'hold',
    address: 'Private apartment — Castlefield, Manchester M15 (address on call sheet only)',
    availability_constraints: 'Daytime only, concierge sign-in required. Lift booked 07:00–09:00 and 17:00–19:00.',
    location_fee: 300,
    notes: 'Modern flat with floor-to-ceiling windows and a Juliet balcony (scene 12). Art to dress trinkets, art prints, incense and windchimes. Balcony railings in shot — harness not needed, no one leans out.',
    parking_info: 'Building loading bay by arrangement with concierge, 1 hour max.',
    contact_name: 'Householder (name TBC)', contact_email: 'mintys.flat@toothpick-demo.example', contact_phone: '07700 900614',
  },
  {
    key: 'park', name: 'Park', booked_status: 'hold',
    address: 'Platt Fields Park, Wilmslow Road, Fallowfield, Manchester M14 6LA',
    availability_constraints: 'Park stays open to the public. Filming days 1 and 6. The late-afternoon bench scene (day 6) needs the light between about 14:15 and 16:15 in early November.',
    location_fee: 480,
    notes: `Leafy path (scene 16, day 1) and a park bench as the autumn sun dips (scene 17, day 6). ${SCREEN_MANCHESTER} Public stays in the park: 2 locations marshals on the path, SAs not needed.`,
    parking_info: 'Unit base in the Wilmslow Road car park (permit to be confirmed). Crew parking on adjacent streets — pay & display.',
    contact_name: 'Parks filming liaison (name TBC)', contact_email: null, contact_phone: null,
    coords: { lat: 53.4483, lng: -2.2245 },
  },
  {
    key: 'degreeShow', name: 'Montage – Degree show', booked_status: 'hold',
    address: 'Benzie Building, Manchester School of Art, Higher Ormond Street, Manchester M15 6BR',
    availability_constraints: 'Second Unit, weekday daytime, subject to the school’s timetable.',
    location_fee: 400,
    notes: 'Maisie clips photographs to a metal display grid for her graduation show (scene 8). Inserts only; 2 coursemate SAs.',
    parking_info: 'No parking on site. Second Unit travels light by van with drop-off on Higher Ormond Street.',
    contact_name: 'School events office (name TBC)', contact_email: null, contact_phone: null,
  },
  {
    key: 'loadOut', name: 'Montage – Venue load-out', booked_status: 'hold',
    address: 'Albert Hall, 27 Peter Street, Manchester M2 5QR',
    availability_constraints: 'Exterior load-out dock only, after the venue’s evening event has cleared (21:30 earliest).',
    location_fee: 650,
    notes: 'Grade II listed former chapel turned live-music venue. Hugh shunts stage kit onto a truck in the middle of the night (scene 8): flight cases, a rental box truck and a sodium-lit street.',
    parking_info: 'Truck parks on Peter Street under the venue’s loading licence; unit base at the Northern Quarter car park.',
    contact_name: 'Production manager (venue, name TBC)', contact_email: null, contact_phone: null,
  },
]

export function locationByKey(key: LocationKey): LocationDef {
  const l = LOCATIONS.find((x) => x.key === key)
  if (!l) throw new Error(`No location ${key}`)
  return l
}
