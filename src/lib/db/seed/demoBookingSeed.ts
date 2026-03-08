/**
 * Demo cast bookings seed.
 * Used when initialising a new demo project (ensureDemoData / resetDemoData → runFullSeed).
 * Seeds bookings for cast only (is_cast = 1), derived from scene_cast and stripboard schedule.
 * Respects cast_availability clashes. Call after people, scene_cast, cast_availability, shoot_days.
 */
import { executeBatch, getDb } from '../client'
import { IDS } from './constants'
import { getSceneNumbersForDay } from './demoPeopleSeed'

export type DemoBookingSeedIdSource = {
  booking: (n: number) => string
  person: (n: number) => string
  shootDay: (n: number) => string
  scene: (n: number) => string
}

/**
 * Seed cast bookings for demo production. Derives from scene_cast and getSceneNumbersForDay;
 * skips days where person has cast_availability UNAVAILABLE. Only books people with is_cast = 1.
 */
export async function seedDemoBookings(
  pid: string,
  ts: string,
  idSource: DemoBookingSeedIdSource = IDS
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

  const sceneIdToSceneNum = new Map<string, number>()
  for (let s = 1; s <= 45; s++) {
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
    const sceneNumbers = getSceneNumbersForDay(day.day_number)
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
