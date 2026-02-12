import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Person } from '../types'

const TABLE = 'people'

function rowToPerson(r: Record<string, unknown>): Person {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    is_cast: (r.is_cast as number) ?? 0,
    email: r.email as string | null,
    phone: r.phone as string | null,
    department: r.department as string | null,
    phases: r.phases as string | null,
    notes: r.notes as string | null,
    contributor_form_status: (r.contributor_form_status as Person['contributor_form_status']) ?? 'not_requested',
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listPeopleByProduction(productionId: string): Promise<Person[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  return rows.map(rowToPerson)
}

export async function listCast(productionId: string): Promise<Person[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND is_cast = 1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  return rows.map(rowToPerson)
}

export async function listCrew(productionId: string): Promise<Person[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND is_cast = 0 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  return rows.map(rowToPerson)
}

export async function getPersonById(id: string): Promise<Person | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToPerson(rows[0]!) : null
}

type PersonInsert = Pick<Person, 'production_id' | 'name' | 'is_cast'> & Partial<Pick<Person, 'email' | 'phone' | 'department' | 'phases' | 'notes' | 'contributor_form_status'>>

export async function createPerson(data: PersonInsert): Promise<Person> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, is_cast, email, phone, department, phases, notes, contributor_form_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      data.production_id,
      data.name,
      data.is_cast ?? 0,
      data.email ?? null,
      data.phone ?? null,
      data.department ?? null,
      data.phases ?? null,
      data.notes ?? null,
      data.contributor_form_status ?? 'not_requested',
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  return (await getPersonById(id))!
}

export async function updatePerson(
  id: string,
  data: Partial<Omit<Person, 'id' | 'production_id' | 'created_at' | 'updated_at' | 'deleted_at'>>
): Promise<Person> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  const allowed = ['name', 'is_cast', 'email', 'phone', 'department', 'phases', 'notes', 'contributor_form_status'] as const
  for (const k of allowed) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) return (await getPersonById(id))!
  cols.push(`updated_at = $${i}`)
  vals.push(ts)
  vals.push(id)
  await db.execute(
    `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`,
    vals
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  return (await getPersonById(id))!
}

export async function deletePerson(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
