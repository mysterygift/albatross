import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import { coerceBoolean } from '../sqlValueCoercion'
import type { Person } from '../types'

const TABLE = 'people'

function rowToPerson(r: Record<string, unknown>): Person {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    is_cast: coerceBoolean(r.is_cast, false) ? 1 : 0,
    email: r.email as string | null,
    phone: r.phone as string | null,
    department: r.department as string | null,
    phases: r.phases as string | null,
    notes: r.notes as string | null,
    contributor_form_status: (r.contributor_form_status as Person['contributor_form_status']) ?? 'not_requested',
    cast_number: r.cast_number as string | null,
    agent_name: r.agent_name as string | null,
    agent_email: r.agent_email as string | null,
    agent_phone: r.agent_phone as string | null,
    role_name: r.role_name as string | null,
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
  const castPredicate = db.dialect === 'postgres' ? 'is_cast = TRUE' : 'is_cast = 1'
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND ${castPredicate} AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  return rows.map(rowToPerson)
}

export async function listCrew(productionId: string): Promise<Person[]> {
  const db = await getDb()
  const crewPredicate = db.dialect === 'postgres' ? 'is_cast = FALSE' : 'is_cast = 0'
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND ${crewPredicate} AND deleted_at IS NULL ORDER BY name`,
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

type PersonInsert = Pick<Person, 'production_id' | 'name' | 'is_cast'> &
  Partial<Pick<Person, 'email' | 'phone' | 'department' | 'phases' | 'notes' | 'contributor_form_status' | 'cast_number' | 'agent_name' | 'agent_email' | 'agent_phone' | 'role_name'>>

export async function createPerson(data: PersonInsert): Promise<Person> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, is_cast, email, phone, department, phases, notes, contributor_form_status, cast_number, agent_name, agent_email, agent_phone, role_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      id,
      data.production_id,
      data.name,
      coerceBoolean(data.is_cast, false),
      data.email ?? null,
      data.phone ?? null,
      data.department ?? null,
      data.phases ?? null,
      data.notes ?? null,
      data.contributor_form_status ?? 'not_requested',
      data.cast_number ?? null,
      data.agent_name ?? null,
      data.agent_email ?? null,
      data.agent_phone ?? null,
      data.role_name ?? null,
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
  const allowed = ['name', 'is_cast', 'email', 'phone', 'department', 'phases', 'notes', 'contributor_form_status', 'cast_number', 'agent_name', 'agent_email', 'agent_phone', 'role_name'] as const
  for (const k of allowed) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      if (k === 'is_cast') {
        vals.push(coerceBoolean(data[k], false))
      } else {
        vals.push(data[k])
      }
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
