import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Location } from '../types'

const TABLE = 'locations'

function rowToLocation(r: Record<string, unknown>): Location {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    booked_status: (r.booked_status as Location['booked_status']) ?? 'unbooked',
    address: r.address as string | null,
    what3words: r.what3words as string | null,
    availability_constraints: r.availability_constraints as string | null,
    permit_fee: r.permit_fee as number | null,
    location_fee: r.location_fee as number | null,
    notes: r.notes as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listLocationsByProduction(productionId: string): Promise<Location[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  return rows.map(rowToLocation)
}

export async function getLocationById(id: string): Promise<Location | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToLocation(rows[0]!) : null
}

type LocationInsert = Pick<Location, 'production_id' | 'name' | 'booked_status'> &
  Partial<Pick<Location, 'address' | 'what3words' | 'availability_constraints' | 'permit_fee' | 'location_fee' | 'notes'>>

export async function createLocation(data: LocationInsert): Promise<Location> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, booked_status, address, what3words, availability_constraints, permit_fee, location_fee, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      data.production_id,
      data.name,
      data.booked_status ?? 'unbooked',
      data.address ?? null,
      data.what3words ?? null,
      data.availability_constraints ?? null,
      data.permit_fee ?? null,
      data.location_fee ?? null,
      data.notes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  return (await getLocationById(id))!
}

export async function updateLocation(
  id: string,
  data: Partial<Omit<Location, 'id' | 'production_id' | 'created_at' | 'updated_at' | 'deleted_at'>>
): Promise<Location> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  const allowed = ['name', 'booked_status', 'address', 'what3words', 'availability_constraints', 'permit_fee', 'location_fee', 'notes'] as const
  for (const k of allowed) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      const raw = data[k]
      if (k === 'permit_fee' || k === 'location_fee') {
        const n = raw === '' || raw == null ? null : Number(raw)
        vals.push(n == null || Number.isNaN(n) ? null : n)
      } else {
        vals.push(raw)
      }
    }
  }
  if (cols.length === 0) return (await getLocationById(id))!
  cols.push(`updated_at = $${i}`)
  vals.push(ts)
  vals.push(id)
  await db.execute(
    `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`,
    vals
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  return (await getLocationById(id))!
}

export async function deleteLocation(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
