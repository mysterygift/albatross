import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Booking } from '../types'

const TABLE = 'bookings'

function rowToBooking(r: Record<string, unknown>): Booking {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    person_id: r.person_id as string,
    shoot_day_id: r.shoot_day_id as string | null,
    start_date: r.start_date as string | null,
    end_date: r.end_date as string | null,
    role: r.role as string | null,
    notes: r.notes as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listBookingsByProduction(productionId: string): Promise<Booking[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY start_date, person_id`,
    [productionId]
  )
  return rows.map(rowToBooking)
}

export async function listBookingsByPerson(personId: string): Promise<Booking[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE person_id = $1 AND deleted_at IS NULL ORDER BY start_date`,
    [personId]
  )
  return rows.map(rowToBooking)
}

export async function listBookingsByShootDay(shootDayId: string): Promise<Booking[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shoot_day_id = $1 AND deleted_at IS NULL ORDER BY person_id`,
    [shootDayId]
  )
  return rows.map(rowToBooking)
}

export async function createBooking(data: {
  production_id: string
  person_id: string
  shoot_day_id?: string | null
  start_date?: string | null
  end_date?: string | null
  role?: string | null
  notes?: string | null
}): Promise<Booking> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, person_id, shoot_day_id, start_date, end_date, role, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      data.production_id,
      data.person_id,
      data.shoot_day_id ?? null,
      data.start_date ?? null,
      data.end_date ?? null,
      data.role ?? null,
      data.notes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToBooking(rows[0]!)
}

export async function updateBooking(
  id: string,
  data: Partial<Pick<Booking, 'person_id' | 'shoot_day_id' | 'start_date' | 'end_date' | 'role' | 'notes'>>
): Promise<Booking> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['person_id', 'shoot_day_id', 'start_date', 'end_date', 'role', 'notes'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToBooking(rows[0]!) : (await listBookingsByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToBooking(rows[0]!)
}

export async function deleteBooking(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
