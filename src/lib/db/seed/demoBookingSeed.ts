/**
 * Demo cast bookings seed.
 * Used when initialising a new demo project (ensureDemoData / resetDemoData → runFullSeed).
 * Seeds bookings for cast only (is_cast = 1), aligned with scene_cast and stripboard schedule.
 * Deterministic and demo-only. Respects cast availability clashes.
 */
import { executeBatch, getDb } from '../client'
import { IDS } from './constants'

/** Person index (1-based) → shoot day numbers (1-12) when that person is UNAVAILABLE. */
const CLASH_DAY_BY_PERSON: Record<number, number> = {
  1: 2,
  2: 4,
  3: 6,
  4: 9,
  5: 11,
}

/**
 * Derive cast in scene s from demo scene_cast formula:
 * numCast = 1 + (s % 4), person IDs = (s % 18) + c + 1 for c = 0..numCast-1.
 */
function getCastPersonIndicesForScene(s: number): number[] {
  const numCast = 1 + (s % 4)
  const indices: number[] = []
  for (let c = 0; c < numCast && c < 18; c++) {
    indices.push((s % 18) + c + 1)
  }
  return indices
}

/**
 * Get scene numbers scheduled on shoot day d (1-12) from stripboard formula:
 * scenes = (d-1)*4+1 .. (d-1)*4+5, clamped to 1-45.
 */
function getSceneNumbersForDay(d: number): number[] {
  const scenes: number[] = []
  for (let sc = 1; sc <= 5; sc++) {
    const n = (d - 1) * 4 + sc
    if (n >= 1 && n <= 45) scenes.push(n)
  }
  return scenes
}

/**
 * Seed cast bookings for demo production. Call after people, scenes, scene_cast, shoot_days
 * and stripboard have been created.
 * Bookings align with stripboard schedule and scene_cast; avoids clash days.
 */
export async function seedDemoBookings(
  pid: string,
  ts: string
): Promise<void> {
  const db = await getDb()

  const seen = new Set<string>()
  const rows: Array<{ personIdx: number; dayNum: number }> = []

  for (let dayNum = 1; dayNum <= 12; dayNum++) {
    const sceneNumbers = getSceneNumbersForDay(dayNum)
    const personIndices = new Set<number>()
    for (const s of sceneNumbers) {
      for (const p of getCastPersonIndicesForScene(s)) {
        if (p >= 1 && p <= 18) personIndices.add(p)
      }
    }
    for (const personIdx of personIndices) {
      const clashDay = CLASH_DAY_BY_PERSON[personIdx]
      if (clashDay === dayNum) continue
      const key = `${personIdx}-${dayNum}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ personIdx, dayNum })
    }
  }

  const statements = rows.map((r, i) => ({
    sql: `INSERT INTO bookings (id, production_id, person_id, shoot_day_id, start_date, end_date, role, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    bindValues: [
      IDS.booking(i + 1),
      pid,
      IDS.person(r.personIdx),
      IDS.shootDay(r.dayNum),
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
