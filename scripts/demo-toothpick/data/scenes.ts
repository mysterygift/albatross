/**
 * Toothpick (V1, 04/12/2025) scene breakdown.
 *
 * Scene numbers, sluglines and page-eighths come from running the app's own PDF parser
 * (`parsePdfScript`) over the script. The parser leaves a few things for the reviewer to fix in
 * the Script Import dialog (en-dash sluglines, EVENING/MORNING not mapped to day/night, the
 * "DAY/NIGHT" montage read as NIGHT); the values below are the corrected, reviewed result.
 *
 * `parsed*` records what the parser returned so the demo guide can show the before/after.
 */
import type { SceneDayNight, SceneIntExt } from '@/lib/db/types'

export type SceneDef = {
  n: number
  /** Slugline body without the INT./EXT. prefix, hyphen-minus normalised. */
  title: string
  int_ext: SceneIntExt
  day_night: SceneDayNight
  /** Page length in eighths, as estimated by the app's PDF parser. */
  eighths: number
  /** Script pages the scene spans (parser's start/end page). */
  pages: string
  description: string
  /** Primary location key (see locations.ts). */
  location: string
  /** Extra locations the scene also uses (split-screen / montage). */
  extraLocations?: string[]
  /** Cast keys (see people.ts) appearing in the scene. */
  cast: string[]
  /** Raw parser output, for the demo guide. */
  parsedLocation: string
  parsedDayNight: SceneDayNight | null
}

export const SCENES: SceneDef[] = [
  {
    n: 1, title: 'BUS - EVENING', int_ext: 'INT', day_night: 'DUSK', eighths: 9, pages: '1-2',
    description: 'Hugh, crammed in the back of a rowdy bus, takes a call from Don (split-screen, Don at his bedroom mirror) about a festival job in Milton Keynes.',
    location: 'bus', extraLocations: ['donsFlat'], cast: ['hugh', 'don', 'sa1', 'sa2', 'sa3'],
    parsedLocation: 'BUS', parsedDayNight: null,
  },
  {
    n: 2, title: 'BAR - EVENING', int_ext: 'INT', day_night: 'DUSK', eighths: 12, pages: '2-3',
    description: 'A quiet Saturday. Hugh meets Maisie over a flat pint and a cold cider; banter about better friends, MMU and a student radio society.',
    location: 'bar', cast: ['hugh', 'maisie'],
    parsedLocation: 'BAR – EVENING', parsedDayNight: null,
  },
  {
    n: 3, title: "MAISIE'S FLAT - MORNING", int_ext: 'INT', day_night: 'DAY', eighths: 8, pages: '3-4',
    description: 'Hugh wakes in Maisie’s double bed, hunts for his shirt and tries to sneak out. Maisie catches him mid-escape.',
    location: 'maisiesFlat', cast: ['hugh', 'maisie'],
    parsedLocation: "MAISIE'S FLAT", parsedDayNight: null,
  },
  {
    n: 4, title: 'BATHROOM - EARLY MORNING', int_ext: 'INT', day_night: 'DAWN', eighths: 1, pages: '4',
    description: 'Hugh drinks from the cold tap, splashes his face and pockets a half-empty box of ibuprofen.',
    location: 'maisiesFlat', cast: ['hugh'],
    parsedLocation: 'BATHROOM – EARLY MORNING', parsedDayNight: null,
  },
  {
    n: 5, title: 'KITCHEN - EARLY MORNING', int_ext: 'INT', day_night: 'DAWN', eighths: 7, pages: '4-5',
    description: 'Cafetière coffee, two pills each, oat milk. Hugh offers to buy breakfast; Maisie accepts because her fridge is barren.',
    location: 'maisiesFlat', cast: ['hugh', 'maisie'],
    parsedLocation: 'KITCHEN - EARLY MORNING', parsedDayNight: null,
  },
  {
    n: 6, title: 'CAFÉ - DAY', int_ext: 'INT', day_night: 'DAY', eighths: 4, pages: '5-6',
    description: 'Booth in a greasy-spoon café. Hugh has wolfed his fry-up; Maisie is halfway through her oats. He heads to the loo.',
    location: 'cafe', cast: ['hugh', 'maisie'],
    parsedLocation: 'CAFÉ', parsedDayNight: 'DAY',
  },
  {
    n: 7, title: 'DINER BATHROOM - DAY', int_ext: 'INT', day_night: 'DAY', eighths: 16, pages: '6-8',
    description: 'Hugh phones Don from the café bathroom (split-screen, Don on his sofa). A customer queues outside, listening in. Shot over two days: Hugh’s side at the café, Don’s side at Don’s flat.',
    location: 'cafe', extraLocations: ['donsFlat'], cast: ['hugh', 'don', 'customer'],
    parsedLocation: 'DINER BATHROOM – DAY', parsedDayNight: 'DAY',
  },
  {
    n: 8, title: 'VARIOUS - DAY/NIGHT', int_ext: 'INT', day_night: 'MIXED', eighths: 3, pages: '8',
    description: 'MONTAGE. A year of Hugh and Maisie: stage kit onto a truck at night, Maisie hanging her degree-show work, Hugh alone in a cheap hotel bar, Maisie in a pub with coursemates. It’s nearly summer.',
    location: 'various', extraLocations: ['degreeShow', 'loadOut'], cast: ['hugh', 'maisie', 'sa4', 'sa5'],
    parsedLocation: 'VARIOUS - DAY/NIGHT', parsedDayNight: 'NIGHT',
  },
  {
    n: 9, title: "HUGH'S FLAT - NIGHT", int_ext: 'INT', day_night: 'NIGHT', eighths: 32, pages: '8-12',
    description: 'Heads-up poker over the slow cooker. A conversation about Maisie’s dissertation turns into the argument that ends them: "You’re an asshole."',
    location: 'hughsFlat', cast: ['hugh', 'maisie'],
    parsedLocation: "HUGH'S FLAT – NIGHT", parsedDayNight: 'NIGHT',
  },
  {
    n: 10, title: 'THE GOOSE AND GANDER - NIGHT', int_ext: 'INT', day_night: 'NIGHT', eighths: 24, pages: '12-15',
    description: 'Hugh, Don and Rose around a round table. Rose and Don tell Hugh, bluntly, why Maisie is upset. Last orders; "Another one?"',
    location: 'gooseAndGander', cast: ['hugh', 'don', 'rose'],
    parsedLocation: 'THE GOOSE AND GANDER', parsedDayNight: 'NIGHT',
  },
  {
    n: 11, title: 'CLUB - NIGHT', int_ext: 'EXT', day_night: 'NIGHT', eighths: 17, pages: '15-17',
    description: 'Outside a basement techno club, Hugh meets Minty, who bums a fag and tells him about Signal. Rose chats up a bouncer. SMASH CUT TO:',
    location: 'club', cast: ['hugh', 'rose', 'minty', 'bouncer', 'sa6'],
    parsedLocation: 'CLUB – NIGHT', parsedDayNight: 'NIGHT',
  },
  {
    n: 12, title: "MINTY'S FLAT - MORNING", int_ext: 'INT', day_night: 'DAY', eighths: 8, pages: '17-18',
    description: 'Windchimes, a balcony and instant coffee. Minty gently sends Hugh home: "You need to get home."',
    location: 'mintysFlat', cast: ['hugh', 'minty'],
    parsedLocation: "MINTY'S FLAT", parsedDayNight: null,
  },
  {
    n: 13, title: 'VARIOUS - DAY/NIGHT', int_ext: 'INT', day_night: 'MIXED', eighths: 1, pages: '18',
    description: 'MONTAGE. The cycle repeats: Hugh with different women in different bars, looking more and more checked out.',
    location: 'various', extraLocations: ['bar'], cast: ['hugh', 'woman1', 'woman2', 'woman3'],
    parsedLocation: 'VARIOUS - DAY/NIGHT', parsedDayNight: 'NIGHT',
  },
  {
    n: 14, title: 'THE GOOSE AND GANDER - DAY', int_ext: 'INT', day_night: 'DAY', eighths: 26, pages: '18-22',
    description: 'Hugh’s "Birthday Boy" badge. Festival stories, a worried intervention about his drinking and his phone, and the realisation that he’s been blowing his wages.',
    location: 'gooseAndGander', cast: ['hugh', 'don', 'rose', 'sa4', 'sa5'],
    parsedLocation: 'THE GOOSE AND GANDER', parsedDayNight: 'DAY',
  },
  {
    n: 15, title: "HUGH'S FLAT - DAY", int_ext: 'INT', day_night: 'DAY', eighths: 18, pages: '22-24',
    description: 'Hugh on the sofa with a Wii remote. Maisie knocks; they share tea and an awkward catch-up. "Mind if we walk and talk?"',
    location: 'hughsFlat', cast: ['hugh', 'maisie'],
    parsedLocation: "HUGH'S FLAT – DAY", parsedDayNight: 'DAY',
  },
  {
    n: 16, title: 'PARK - DAY', int_ext: 'EXT', day_night: 'DAY', eighths: 9, pages: '24-25',
    description: 'Hugh and Maisie amble down a leafy park path. "Get in the driver’s seat of your own life." They hug.',
    location: 'park', cast: ['hugh', 'maisie'],
    parsedLocation: 'PARK', parsedDayNight: 'DAY',
  },
  {
    n: 17, title: 'PARK - LATE AFTERNOON', int_ext: 'EXT', day_night: 'DUSK', eighths: 10, pages: '25-26',
    description: 'A park bench as the autumn sun dips. Lockdown memories and a gentle goodbye: "Look after yourself, Maisie."',
    location: 'park', cast: ['hugh', 'maisie'],
    parsedLocation: 'PARK - LATE AFTERNOON', parsedDayNight: null,
  },
  {
    n: 18, title: 'THE GOOSE AND GANDER - NIGHT', int_ext: 'INT', day_night: 'NIGHT', eighths: 1, pages: '26',
    description: 'A few months on. Hugh, moustache froth and all, spots a cottage-core girl across the pub. He looks down the camera. CUT TO BLACK.',
    location: 'gooseAndGander', cast: ['hugh', 'rose', 'cottagecore', 'sa4', 'sa5'],
    parsedLocation: 'THE GOOSE AND GANDER', parsedDayNight: 'NIGHT',
  },
]

export const TOTAL_EIGHTHS = SCENES.reduce((s, sc) => s + sc.eighths, 0)

export function sceneByNumber(n: number): SceneDef {
  const s = SCENES.find((x) => x.n === n)
  if (!s) throw new Error(`No scene ${n}`)
  return s
}
