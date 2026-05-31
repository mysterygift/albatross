import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { CrewAvailability, PersonAvailabilityStatus } from '../types'

const TABLE = 'crew_availability'

function rowToAvailability(r: Record<string, unknown>): CrewAvailability {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    person_id: r.person_id as string,
    start_date: r.start_date as string,
    end_date: r.end_date as string,
    availability: (r.availability as PersonAvailabilityStatus) ?? 'UNAVAILABLE',
    notes: r.notes as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listCrewAvailabilityByPerson(personId: string): Promise<CrewAvailability[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE person_id = $1 AND deleted_at IS NULL ORDER BY start_date`,
    [personId]
  )
  return rows.map(rowToAvailability)
}

export async function listCrewAvailabilityByProduction(productionId: string): Promise<CrewAvailability[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY person_id, start_date`,
    [productionId]
  )
  return rows.map(rowToAvailability)
}

/** Check if person is UNAVAILABLE on a given date. */
export function isCrewUnavailableOnDate(
  windows: CrewAvailability[],
  date: string
): boolean {
  return windows.some(
    (w) =>
      w.availability === 'UNAVAILABLE' &&
      date >= w.start_date &&
      date <= w.end_date
  )
}

export async function createCrewAvailability(data: {
  production_id: string
  person_id: string
  start_date: string
  end_date: string
  availability?: PersonAvailabilityStatus
  notes?: string | null
}): Promise<CrewAvailability> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, person_id, start_date, end_date, availability, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.production_id,
      data.person_id,
      data.start_date,
      data.end_date,
      data.availability ?? 'UNAVAILABLE',
      data.notes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToAvailability(rows[0]!)
}

export async function updateCrewAvailability(
  id: string,
  data: Partial<Pick<CrewAvailability, 'start_date' | 'end_date' | 'availability' | 'notes'>>
): Promise<CrewAvailability> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['start_date', 'end_date', 'availability', 'notes'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    return rowToAvailability(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToAvailability(rows[0]!)
}

export async function deleteCrewAvailability(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
