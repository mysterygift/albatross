/**
 * Demo bookings seed.
 * Used when initialising a new demo project (ensureDemoData / resetDemoData → runFullSeed).
 *
 * - Cast (`seedDemoBookings`): is_cast = 1 only; derived from scene_cast and stripboard schedule.
 *   Respects cast_availability clashes. Call after people, scene_cast, cast_availability, shoot_days.
 * - Crew (`seedDemoCrewBookings`): is_cast = 0; one booking per crew member per shoot day with
 *   role from `people.role_name`. Call after `seedDemoCrew` so crew rows exist.
 */
import { executeBatch, getDb } from '../client'
import { IDS } from './constants'
import { getSceneNumbersForDay } from './demoPeopleSeed'

export type DemoBookingSeedIdSource = {
  booking: (n: number) => string
  crewBooking: (n: number) => string
  person: (n: number) => string
  shootDay: (n: number) => string
  scene: (n: number) => string
}

export type SeedDemoBookingsOptions = {
  /** When set (e.g. episodic stripboard matrix), used instead of Mint Heist `getSceneNumbersForDay`. */
  sceneNumbersForDay?: (dayNumber: number) => number[]
  /** Max scene index for building scene id → number map (default 45). */
  maxSceneNumber?: number
}

/**
 * Seed cast bookings for demo production. Derives from scene_cast and day scene lists;
 * skips days where person has cast_availability UNAVAILABLE. Only books people with is_cast = 1.
 */
export async function seedDemoBookings(
  pid: string,
  ts: string,
  idSource: DemoBookingSeedIdSource = IDS,
  options?: SeedDemoBookingsOptions
): Promise<void> {
  const db = await getDb()

  const shootDays = await db.select<{ id: string; day_number: number; shoot_date: string }[]>(
    `SELECT id, day_number, shoot_date FROM shoot_days WHERE production_id = $1 AND deleted_at IS NULL ORDER BY day_number`,
    [pid]
  )
  const sceneCastRows = await db.select<{ scene_id: string; person_id: string }[]>(
    `SELECT scene_id, person_id FROM scene_cast WHERE production_id = $1 AND deleted_at IS NULL`,
    [pid]
  )
  const availabilityRows = await db.select<{ person_id: string; start_date: string; end_date: string }[]>(
    `SELECT person_id, start_date, end_date FROM cast_availability WHERE production_id = $1 AND availability = 'UNAVAILABLE' AND deleted_at IS NULL`,
    [pid]
  )
  const castPersonIds = await db.select<{ id: string }[]>(
    `SELECT id FROM people WHERE production_id = $1 AND is_cast = 1 AND deleted_at IS NULL`,
    [pid]
  )
  const castSet = new Set(castPersonIds.map((r) => r.id))

  const unavailableByPersonAndDate = new Set<string>()
  for (const row of availabilityRows) {
    for (const day of shootDays) {
      const d = day.shoot_date
      if (d >= row.start_date && d <= row.end_date) {
        unavailableByPersonAndDate.add(`${row.person_id}-${d}`)
      }
    }
  }

  const maxScene = options?.maxSceneNumber ?? 45
  const sceneIdToSceneNum = new Map<string, number>()
  for (let s = 1; s <= maxScene; s++) {
    sceneIdToSceneNum.set(idSource.scene(s), s)
  }

  const personSceneSet = new Map<string, Set<number>>()
  for (const row of sceneCastRows) {
    const sceneNum = sceneIdToSceneNum.get(row.scene_id)
    if (sceneNum == null) continue
    let set = personSceneSet.get(row.person_id)
    if (!set) {
      set = new Set()
      personSceneSet.set(row.person_id, set)
    }
    set.add(sceneNum)
  }

  const seen = new Set<string>()
  const rows: Array<{ person_id: string; shoot_day_id: string }> = []

  for (const day of shootDays) {
    const sceneNumbers =
      options?.sceneNumbersForDay?.(day.day_number) ?? getSceneNumbersForDay(day.day_number)
    for (const [personId, sceneNums] of personSceneSet) {
      if (!castSet.has(personId)) continue
      const inAnyScene = sceneNumbers.some((sn) => sceneNums.has(sn))
      if (!inAnyScene) continue
      const key = `${personId}-${day.id}`
      if (seen.has(key)) continue
      if (unavailableByPersonAndDate.has(`${personId}-${day.shoot_date}`)) continue
      seen.add(key)
      rows.push({ person_id: personId, shoot_day_id: day.id })
    }
  }

  const statements = rows.map((r, i) => ({
    sql: `INSERT INTO bookings (id, production_id, person_id, shoot_day_id, start_date, end_date, role, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    bindValues: [
      idSource.booking(i + 1),
      pid,
      r.person_id,
      r.shoot_day_id,
      null,
      null,
      null,
      null,
      ts,
      ts,
    ],
  }))

  if (statements.length > 0) {
    await executeBatch(db, statements)
  }
}

/**
 * Seed crew bookings: every non-cast person on the production gets a row for every shoot day.
 * Uses `crewBooking` IDs (separate range from cast `booking`). Deterministic order: crew `ORDER BY id`, days by `day_number`.
 */
export async function seedDemoCrewBookings(
  pid: string,
  ts: string,
  idSource: DemoBookingSeedIdSource = IDS
): Promise<void> {
  const db = await getDb()

  const shootDays = await db.select<{ id: string; day_number: number; shoot_date: string }[]>(
    `SELECT id, day_number, shoot_date FROM shoot_days WHERE production_id = $1 AND deleted_at IS NULL ORDER BY day_number`,
    [pid]
  )
  const crewRows = await db.select<{ id: string; role_name: string | null }[]>(
    `SELECT id, role_name FROM people WHERE production_id = $1 AND is_cast = 0 AND deleted_at IS NULL ORDER BY id`,
    [pid]
  )
  if (shootDays.length === 0 || crewRows.length === 0) return

  let crewBookingIdx = 0
  const statements: Array<{ sql: string; bindValues: unknown[] }> = []
  for (const person of crewRows) {
    for (const day of shootDays) {
      crewBookingIdx++
      statements.push({
        sql: `INSERT INTO bookings (id, production_id, person_id, shoot_day_id, start_date, end_date, role, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        bindValues: [
          idSource.crewBooking(crewBookingIdx),
          pid,
          person.id,
          day.id,
          day.shoot_date,
          day.shoot_date,
          person.role_name,
          null,
          ts,
          ts,
        ],
      })
    }
  }

  await executeBatch(db, statements)
}
