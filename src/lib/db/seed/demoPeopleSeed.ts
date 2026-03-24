/**
 * Rich demo People / Cast seed. Used when initialising demo production or Demo template.
 * Seeds: cast (14) only; scene_cast, shot_cast, cast_availability.
 * Crew are seeded by demoCrewSeed.ts. Deterministic and demo-only.
 * Integrates with Cast Manager, DooD, Bookings, Call Sheets.
 */
import { executeBatch, getDb } from '../client'
import type { DemoSeedIdSource } from './demoSeedContext'
import { northShoreGlobalShotIndex } from './northShoreDemoContent'

/** Cast index 1–14 maps to idSource.person(1)..person(14). */
export const DEMO_CAST_INDEX_MAX = 14

/** Shoot day number (1–12) → scene numbers scheduled that day. Matches stripboard formula in demoProductionSeed. */
export function getSceneNumbersForDay(dayNum: number): number[] {
  const scenes: number[] = []
  for (let sc = 1; sc <= 5; sc++) {
    const n = (dayNum - 1) * 4 + sc
    if (n >= 1 && n <= 45) scenes.push(n)
  }
  return scenes
}

/** Same distribution as demoProductionSeed shot build. Used to resolve shot ID from (sceneNum, shotNumber). */
function getDemoSceneShotCounts(): number[] {
  const a: number[] = []
  for (let s = 0; s < 5; s++) a.push(6)
  for (let s = 0; s < 10; s++) a.push(s % 2 === 0 ? 1 : 2)
  for (let s = 0; s < 20; s++) a.push(s % 2 === 0 ? 2 : 3)
  for (let s = 0; s < 10; s++) a.push(s % 2 === 0 ? 2 : 3)
  return a
}

/** Global shot index (1-based) for scene number and shot number within that scene. */
export function getGlobalShotIndex(sceneNum: number, shotNumber: number): number {
  const counts = getDemoSceneShotCounts()
  let sum = 0
  for (let i = 0; i < sceneNum - 1 && i < counts.length; i++) sum += counts[i]!
  return sum + shotNumber
}

// -------------------------------------------------------------------------
// Cast dataset (source of truth)
// -------------------------------------------------------------------------
const DEMO_CAST: Array<{
  name: string
  cast_number: string
  role_name: string
  email: string
  phone: string
  agent_name: string
  agent_email: string
  agent_phone: string
  contributor_form_status: 'signed' | 'requested' | 'not_requested'
  notes: string | null
}> = [
  {
    name: 'Jade Mercer',
    cast_number: '1',
    role_name: "Eleanor 'Jade' Mercer",
    email: 'jade.mercer@mintheist-demo.com',
    phone: '07700 900101',
    agent_name: 'Harriet Bloom',
    agent_email: 'harriet.bloom@northstarartists-demo.co.uk',
    agent_phone: '020 7001 1101',
    contributor_form_status: 'signed',
    notes: 'Lead. Available for full principal block except known clash seeded below.',
  },
  {
    name: 'Alex Vale',
    cast_number: '2',
    role_name: 'Alex Vale',
    email: 'alex.vale@mintheist-demo.com',
    phone: '07700 900102',
    agent_name: 'Simon Reddick',
    agent_email: 'simon.reddick@mercuryactors-demo.co.uk',
    agent_phone: '020 7001 1102',
    contributor_form_status: 'signed',
    notes: 'Co-lead.',
  },
  {
    name: 'DCI Naomi Reed',
    cast_number: '3',
    role_name: 'DCI Naomi Reed',
    email: 'naomi.reed@mintheist-demo.com',
    phone: '07700 900103',
    agent_name: 'Clare Donnelly',
    agent_email: 'clare.donnelly@fleetstreettalent-demo.co.uk',
    agent_phone: '020 7001 1103',
    contributor_form_status: 'signed',
    notes: 'Police lead.',
  },
  {
    name: 'Owen Fisk',
    cast_number: '4',
    role_name: 'Owen Fisk',
    email: 'owen.fisk@mintheist-demo.com',
    phone: '07700 900104',
    agent_name: 'Daniel Wren',
    agent_email: 'daniel.wren@redhouseartists-demo.co.uk',
    agent_phone: '020 7001 1104',
    contributor_form_status: 'requested',
    notes: 'Vault specialist.',
  },
  {
    name: 'Evelyn Cross',
    cast_number: '5',
    role_name: 'Evelyn Cross',
    email: 'evelyn.cross@mintheist-demo.com',
    phone: '07700 900105',
    agent_name: 'Martha King',
    agent_email: 'martha.king@ivorymanagement-demo.co.uk',
    agent_phone: '020 7001 1105',
    contributor_form_status: 'signed',
    notes: 'Board chair / recurring.',
  },
  {
    name: 'Milo Hart',
    cast_number: '6',
    role_name: 'Milo Hart',
    email: 'milo.hart@mintheist-demo.com',
    phone: '07700 900106',
    agent_name: 'Paul Devlin',
    agent_email: 'paul.devlin@harbouragency-demo.co.uk',
    agent_phone: '020 7001 1106',
    contributor_form_status: 'requested',
    notes: 'Surveillance specialist.',
  },
  {
    name: 'Priya Nair',
    cast_number: '7',
    role_name: 'Priya Nair',
    email: 'priya.nair@mintheist-demo.com',
    phone: '07700 900107',
    agent_name: 'Leah Morton',
    agent_email: 'leah.morton@parklaneartists-demo.co.uk',
    agent_phone: '020 7001 1107',
    contributor_form_status: 'signed',
    notes: 'Analyst / supporting.',
  },
  {
    name: 'Tomasz Krol',
    cast_number: '8',
    role_name: 'Tomasz Krol',
    email: 'tomasz.krol@mintheist-demo.com',
    phone: '07700 900108',
    agent_name: 'Eva Sorrell',
    agent_email: 'eva.sorrell@bridgeactors-demo.co.uk',
    agent_phone: '020 7001 1108',
    contributor_form_status: 'not_requested',
    notes: 'Security contractor.',
  },
  {
    name: 'Leah Quinn',
    cast_number: '9',
    role_name: 'Leah Quinn',
    email: 'leah.quinn@mintheist-demo.com',
    phone: '07700 900109',
    agent_name: 'Nina Calder',
    agent_email: 'nina.calder@chapteroneartists-demo.co.uk',
    agent_phone: '020 7001 1109',
    contributor_form_status: 'signed',
    notes: 'Journalist / supporting.',
  },
  {
    name: 'Marcus Bell',
    cast_number: '10',
    role_name: 'Marcus Bell',
    email: 'marcus.bell@mintheist-demo.com',
    phone: '07700 900110',
    agent_name: 'Tom Halley',
    agent_email: 'tom.halley@riversidetalent-demo.co.uk',
    agent_phone: '020 7001 1110',
    contributor_form_status: 'requested',
    notes: 'Detective / recurring.',
  },
  {
    name: 'Serena Cole',
    cast_number: '11',
    role_name: 'Serena Cole',
    email: 'serena.cole@mintheist-demo.com',
    phone: '07700 900111',
    agent_name: 'Rachel Ives',
    agent_email: 'rachel.ives@ashgroveartists-demo.co.uk',
    agent_phone: '020 7001 1111',
    contributor_form_status: 'signed',
    notes: 'Lawyer / advisor.',
  },
  {
    name: 'Ben Volkov',
    cast_number: '12',
    role_name: 'Ben Volkov',
    email: 'ben.volkov@mintheist-demo.com',
    phone: '07700 900112',
    agent_name: 'Julian Price',
    agent_email: 'julian.price@crownmanagement-demo.co.uk',
    agent_phone: '020 7001 1112',
    contributor_form_status: 'requested',
    notes: 'Fixer / featured supporting.',
  },
  {
    name: 'Nadia Flores',
    cast_number: '13',
    role_name: 'Nadia Flores',
    email: 'nadia.flores@mintheist-demo.com',
    phone: '07700 900113',
    agent_name: 'Imogen Hart',
    agent_email: 'imogen.hart@horizonartists-demo.co.uk',
    agent_phone: '020 7001 1113',
    contributor_form_status: 'signed',
    notes: 'Café owner / featured day player.',
  },
  {
    name: 'Theo Mercer',
    cast_number: '14',
    role_name: 'Theo Mercer',
    email: 'theo.mercer@mintheist-demo.com',
    phone: '07700 900114',
    agent_name: 'Giles Warren',
    agent_email: 'giles.warren@albionagency-demo.co.uk',
    agent_phone: '020 7001 1114',
    contributor_form_status: 'not_requested',
    notes: 'Relative / flashback scenes.',
  },
]

/** Expand a string like "1-8" or "1-8, 12-18" into an array of scene numbers. */
function expandSceneRanges(ranges: string): number[] {
  const out: number[] = []
  for (const part of ranges.split(',').map((s) => s.trim())) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map((s) => parseInt(s.trim(), 10))
      if (!Number.isNaN(a) && !Number.isNaN(b)) for (let i = a; i <= b; i++) out.push(i)
    } else {
      const n = parseInt(part, 10)
      if (!Number.isNaN(n)) out.push(n)
    }
  }
  return out
}

/** Cast index (1–14) → scene numbers that cast member is in. Source of truth for scene_cast. */
/** Mint Heist 45-scene cast ↔ scene presence. */
const CAST_SCENE_MAP: Record<number, number[]> = {
  1: expandSceneRanges('1-8, 12-18, 21-24, 28-32, 36-40, 44-45'),
  2: expandSceneRanges('1-6, 10-16, 20-24, 29-31, 37-41, 45'),
  3: expandSceneRanges('4-5, 9-13, 17-19, 25-27, 33-35, 41-43'),
  4: expandSceneRanges('2-3, 7-11, 15-18, 22-23, 30-34, 42'),
  5: [6, 12, 18, 24, 30, 36, 42, 45],
  6: expandSceneRanges('8-10, 14-16, 21, 26, 31, 38, 44'),
  7: [5, 11, 17, 23, 29, 35, 41],
  8: expandSceneRanges('13-15, 19-20, 27-28, 34-36, 43-44'),
  9: [3, 9, 16, 22, 28, 33, 39, 45],
  10: expandSceneRanges('18-20, 24-26, 32-34, 40-42'),
  11: [7, 14, 21, 25, 31, 37, 44],
  12: [10, 17, 23, 30, 36, 43],
  13: [11, 29, 35],
  14: [2, 24, 45],
}

/** North Shore 30-scene episodic demo: same 14 cast rows, story-driven presence. */
const NORTH_SHORE_CAST_SCENE_MAP: Record<number, number[]> = {
  1: expandSceneRanges('1-10, 12, 14, 21-24, 28-30'),
  2: expandSceneRanges('1-7, 10, 17, 21-23, 30'),
  3: expandSceneRanges('3, 12-14, 18, 26-27, 29'),
  4: expandSceneRanges('8-9, 14, 19-20, 28'),
  5: expandSceneRanges('7, 15, 24-25'),
  6: expandSceneRanges('5-6, 15-16, 18, 23'),
  7: expandSceneRanges('3, 9, 16, 22, 27, 29'),
  8: expandSceneRanges('6, 9, 19, 25'),
  9: expandSceneRanges('5, 11, 15, 22, 27'),
  10: expandSceneRanges('10, 18, 23, 26'),
  11: expandSceneRanges('9, 18, 24, 28'),
  12: expandSceneRanges('12, 19'),
  13: expandSceneRanges('5, 11, 13, 27, 29'),
  14: expandSceneRanges('8, 13, 21'),
}

function northShoreCastIndicesForShot(sceneNum: number, shotNum: number): number[] {
  const inScene: number[] = []
  for (let c = 1; c <= DEMO_CAST_INDEX_MAX; c++) {
    if ((NORTH_SHORE_CAST_SCENE_MAP[c] ?? []).includes(sceneNum)) inScene.push(c)
  }
  if (inScene.length === 0) return []
  const principals = [1, 2, 3].filter((x) => inScene.includes(x))
  if (shotNum <= 2) return inScene
  if (shotNum <= 4) return inScene.filter((_, i) => i % 2 === 0)
  if (shotNum <= 6) return inScene.filter((_, i) => i % 2 === 1)
  return principals.length > 0 ? principals : [inScene[0]!]
}

/** Hero shot participation: scene number, shot number within scene, cast indices (1–14) in that shot. */
const SHOT_CAST_ENTRIES: Array<{ scene: number; shot: number; castIndices: number[] }> = [
  { scene: 1, shot: 1, castIndices: [1, 2] },
  { scene: 1, shot: 2, castIndices: [1] },
  { scene: 2, shot: 1, castIndices: [1, 4, 14] },
  { scene: 5, shot: 1, castIndices: [1, 3, 7] },
  { scene: 5, shot: 2, castIndices: [3] },
  { scene: 8, shot: 1, castIndices: [1, 6] },
  { scene: 8, shot: 2, castIndices: [1] },
  { scene: 10, shot: 1, castIndices: [2, 6, 12] },
  { scene: 12, shot: 1, castIndices: [1, 5] },
  { scene: 12, shot: 2, castIndices: [2] },
  { scene: 15, shot: 1, castIndices: [2, 4, 8] },
  { scene: 18, shot: 1, castIndices: [1, 4, 5, 10] },
  { scene: 21, shot: 1, castIndices: [1, 6, 11] },
  { scene: 24, shot: 1, castIndices: [1, 2, 5, 14] },
  { scene: 29, shot: 1, castIndices: [7, 13] },
  { scene: 29, shot: 2, castIndices: [1] },
  { scene: 30, shot: 1, castIndices: [4, 5, 12] },
  { scene: 33, shot: 1, castIndices: [3, 9] },
  { scene: 35, shot: 1, castIndices: [7, 13] },
  { scene: 38, shot: 1, castIndices: [1, 6] },
  { scene: 41, shot: 1, castIndices: [3, 2, 7] },
  { scene: 41, shot: 2, castIndices: [10] },
  { scene: 44, shot: 1, castIndices: [1, 6, 11, 8] },
  { scene: 45, shot: 1, castIndices: [1, 2, 5, 9, 14] },
  { scene: 45, shot: 2, castIndices: [3] },
]

/** Cast availability clashes: cast index (1–14) → { dayNumber (1–12), notes }. */
const DEMO_AVAILABILITY_CLASHES: Array<{ castIndex: number; dayNumber: number; notes: string }> = [
  { castIndex: 1, dayNumber: 4, notes: 'Press day clash' },
  { castIndex: 3, dayNumber: 8, notes: 'Prior contractual hold' },
  { castIndex: 6, dayNumber: 11, notes: 'Medical appointment' },
  { castIndex: 10, dayNumber: 10, notes: 'Travel hold' },
]

/**
 * Seed rich demo People (cast only), scene_cast, shot_cast, and cast_availability.
 * Call after scenes and shots are seeded. Uses idSource.person(1..14), sceneCast, shotCast, availability.
 * Crew are seeded by demoCrewSeed.ts.
 */
export type SeedDemoPeopleOptions = {
  castScheduleVariant?: 'mint-heist' | 'north-shore-episodic'
}

export async function seedDemoPeople(
  productionId: string,
  startDate: string,
  ts: string,
  idSource: DemoSeedIdSource,
  options?: SeedDemoPeopleOptions
): Promise<void> {
  const db = await getDb()
  const variant = options?.castScheduleVariant ?? 'mint-heist'
  const sceneCastMap = variant === 'north-shore-episodic' ? NORTH_SHORE_CAST_SCENE_MAP : CAST_SCENE_MAP

  const addDays = (yyyyMmDd: string, days: number): string => {
    const [y, m, d] = yyyyMmDd.split('-').map(Number)
    const date = new Date(y!, m! - 1, d! + days)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  const statements: Array<{ sql: string; bindValues: unknown[] }> = []

  // People: cast 1–14
  for (let i = 0; i < DEMO_CAST.length; i++) {
    const c = DEMO_CAST[i]!
    statements.push({
      sql: `INSERT INTO people (id, production_id, name, is_cast, cast_number, role_name, email, phone, agent_name, agent_email, agent_phone, contributor_form_status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      bindValues: [
        idSource.person(i + 1),
        productionId,
        c.name,
        c.cast_number,
        c.role_name,
        c.email,
        c.phone,
        c.agent_name,
        c.agent_email,
        c.agent_phone,
        c.contributor_form_status,
        c.notes,
        ts,
        ts,
      ],
    })
  }

  // scene_cast: one row per (scene, person)
  let sceneCastIdx = 0
  for (let castIndex = 1; castIndex <= DEMO_CAST_INDEX_MAX; castIndex++) {
    const sceneNumbers = sceneCastMap[castIndex] ?? []
    for (const sceneNum of sceneNumbers) {
      statements.push({
        sql: `INSERT INTO scene_cast (id, production_id, scene_id, person_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        bindValues: [
          idSource.sceneCast(sceneCastIdx),
          productionId,
          idSource.scene(sceneNum),
          idSource.person(castIndex),
          ts,
          ts,
        ],
      })
      sceneCastIdx++
    }
  }

  // shot_cast: only for people already in scene_cast; refinement layer
  let shotCastIdx = 0
  if (variant === 'north-shore-episodic') {
    for (let sceneNum = 1; sceneNum <= 30; sceneNum++) {
      for (let shotNum = 1; shotNum <= 8; shotNum++) {
        const globalShotIndex = northShoreGlobalShotIndex(sceneNum, shotNum)
        const shotId = idSource.shot(globalShotIndex)
        for (const castIndex of northShoreCastIndicesForShot(sceneNum, shotNum)) {
          const inScene = (NORTH_SHORE_CAST_SCENE_MAP[castIndex] ?? []).includes(sceneNum)
          if (!inScene) continue
          statements.push({
            sql: `INSERT INTO shot_cast (id, production_id, shot_id, person_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
            bindValues: [
              idSource.shotCast(shotCastIdx),
              productionId,
              shotId,
              idSource.person(castIndex),
              ts,
              ts,
            ],
          })
          shotCastIdx++
        }
      }
    }
  } else {
    for (const entry of SHOT_CAST_ENTRIES) {
      const sceneNum = entry.scene
      const shotNum = entry.shot
      const globalShotIndex = getGlobalShotIndex(sceneNum, shotNum)
      const shotId = idSource.shot(globalShotIndex)
      for (const castIndex of entry.castIndices) {
        const inScene = (CAST_SCENE_MAP[castIndex] ?? []).includes(sceneNum)
        if (!inScene) continue
        statements.push({
          sql: `INSERT INTO shot_cast (id, production_id, shot_id, person_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
          bindValues: [
            idSource.shotCast(shotCastIdx),
            productionId,
            shotId,
            idSource.person(castIndex),
            ts,
            ts,
          ],
        })
        shotCastIdx++
      }
    }
  }

  // cast_availability: clashes on specific shoot dates
  for (let a = 0; a < DEMO_AVAILABILITY_CLASHES.length; a++) {
    const clash = DEMO_AVAILABILITY_CLASHES[a]!
    const shootDate = addDays(startDate, clash.dayNumber - 1)
    statements.push({
      sql: `INSERT INTO cast_availability (id, production_id, person_id, start_date, end_date, availability, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'UNAVAILABLE', $6, $7, $8)`,
      bindValues: [
        idSource.availability(a + 1),
        productionId,
        idSource.person(clash.castIndex),
        shootDate,
        shootDate,
        clash.notes,
        ts,
        ts,
      ],
    })
  }

  if (statements.length > 0) {
    await executeBatch(db, statements)
  }
}
