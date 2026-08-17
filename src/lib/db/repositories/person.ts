import { getDb, now, runInSerializedTransaction, uuid } from '../client'
import type { DatabaseAdapter } from '../databaseAdapter'
import { backfillPeopleIsCastIntegerIfNeeded } from '../migrations/backfillPeopleIsCastInteger'
import { outboxPush } from '../outbox'
import { coerceBoolean } from '../sqlValueCoercion'
import type { Person } from '../types'
import { isClientEncryptionEnabled } from '@/lib/security/dataEncryptionContext'
import { requireSensitiveDataAccess } from '@/lib/security/sensitiveDataAccess'
import {
  decryptPersonFields,
  encryptPersonFields,
  PERSON_PROTECTED_FIELDS,
} from '@/lib/security/sensitiveEntityFieldCrypto'

const TABLE = 'people'

let isCastBackfillPromise: Promise<void> | null = null

async function ensurePeopleIsCastNormalized(db: DatabaseAdapter): Promise<void> {
  if (db.dialect !== 'sqlite') return
  if (!isCastBackfillPromise) {
    isCastBackfillPromise = backfillPeopleIsCastIntegerIfNeeded(db).then(() => undefined)
  }
  await isCastBackfillPromise
}

/** SQLite INTEGER columns expect 0/1; boolean binds can break `is_cast = 0` list filters. */
function bindIsCast(db: DatabaseAdapter, isCast: unknown): boolean | 0 | 1 {
  const bool = coerceBoolean(isCast, false)
  return db.dialect === 'postgres' ? bool : bool ? 1 : 0
}

async function rowToPerson(r: Record<string, unknown>, encryptionEnabled: boolean): Promise<Person> {
  const fields = encryptionEnabled ? await decryptPersonFields(r) : r
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: fields.name as string,
    is_cast: coerceBoolean(r.is_cast, false) ? 1 : 0,
    email: fields.email as string | null,
    phone: fields.phone as string | null,
    department: fields.department as string | null,
    phases: r.phases as string | null,
    notes: fields.notes as string | null,
    contributor_form_status: (r.contributor_form_status as Person['contributor_form_status']) ?? 'not_requested',
    cast_number: fields.cast_number as string | null,
    agent_name: fields.agent_name as string | null,
    agent_email: fields.agent_email as string | null,
    agent_phone: fields.agent_phone as string | null,
    role_name: fields.role_name as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listPeopleByProduction(productionId: string): Promise<Person[]> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  await ensurePeopleIsCastNormalized(db)
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL`,
    [productionId]
  )
  const people = await Promise.all(rows.map((row) => rowToPerson(row, encryptionEnabled)))
  return people.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listCast(productionId: string): Promise<Person[]> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  await ensurePeopleIsCastNormalized(db)
  const castPredicate = db.dialect === 'postgres' ? 'is_cast = TRUE' : 'is_cast = 1'
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND ${castPredicate} AND deleted_at IS NULL`,
    [productionId]
  )
  const people = await Promise.all(rows.map((row) => rowToPerson(row, encryptionEnabled)))
  return people.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listCrew(productionId: string): Promise<Person[]> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  await ensurePeopleIsCastNormalized(db)
  const crewPredicate = db.dialect === 'postgres' ? 'is_cast = FALSE' : 'is_cast = 0'
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND ${crewPredicate} AND deleted_at IS NULL`,
    [productionId]
  )
  const people = await Promise.all(rows.map((row) => rowToPerson(row, encryptionEnabled)))
  return people.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPersonById(id: string): Promise<Person | null> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? await rowToPerson(rows[0]!, encryptionEnabled) : null
}

type PersonInsert = Pick<Person, 'production_id' | 'name' | 'is_cast'> &
  Partial<Pick<Person, 'email' | 'phone' | 'department' | 'phases' | 'notes' | 'contributor_form_status' | 'cast_number' | 'agent_name' | 'agent_email' | 'agent_phone' | 'role_name'>>

export async function createPerson(data: PersonInsert): Promise<Person> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const plain = { ...data }
  const stored: Record<string, unknown> = await isClientEncryptionEnabled(db) ? await encryptPersonFields(plain) : plain
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, name_sort_key, is_cast, email, phone, department, phases, notes, contributor_form_status, cast_number, agent_name, agent_email, agent_phone, role_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      id,
      data.production_id,
      stored.name,
      stored.name_sort_key ?? null,
      bindIsCast(db, data.is_cast),
      stored.email ?? null,
      stored.phone ?? null,
      stored.department ?? null,
      data.phases ?? null,
      stored.notes ?? null,
      data.contributor_form_status ?? 'not_requested',
      stored.cast_number ?? null,
      stored.agent_name ?? null,
      stored.agent_email ?? null,
      stored.agent_phone ?? null,
      stored.role_name ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...stored, id, is_cast: data.is_cast }))
  return (await getPersonById(id))!
}

export async function updatePerson(
  id: string,
  data: Partial<Omit<Person, 'id' | 'production_id' | 'created_at' | 'updated_at' | 'deleted_at'>>
): Promise<Person> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  const allowed = ['name', 'is_cast', 'email', 'phone', 'department', 'phases', 'notes', 'contributor_form_status', 'cast_number', 'agent_name', 'agent_email', 'agent_phone', 'role_name'] as const
  const protectedUpdates = Object.fromEntries(
    PERSON_PROTECTED_FIELDS.filter((field) => data[field] !== undefined).map((field) => [field, data[field]])
  )
  const encryptedAll = Object.keys(protectedUpdates).length > 0 && await isClientEncryptionEnabled(db)
    ? await encryptPersonFields({ name: data.name ?? (await getPersonById(id))?.name ?? '', ...protectedUpdates })
    : protectedUpdates
  const encryptedUpdates: Record<string, unknown> = Object.fromEntries(
    Object.keys(protectedUpdates).map((field) => [field, encryptedAll[field]])
  )
  if (data.name !== undefined && encryptedAll.name_sort_key !== undefined) {
    encryptedUpdates.name_sort_key = encryptedAll.name_sort_key
  }
  for (const k of allowed) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      if (k === 'is_cast') {
        vals.push(bindIsCast(db, data[k]))
      } else if ((PERSON_PROTECTED_FIELDS as readonly string[]).includes(k)) {
        vals.push(encryptedUpdates[k])
      } else {
        vals.push(data[k])
      }
    }
  }
  if (data.name !== undefined && encryptedUpdates.name_sort_key !== undefined) {
    cols.push(`name_sort_key = $${i++}`)
    vals.push(encryptedUpdates.name_sort_key)
  }
  if (cols.length === 0) return (await getPersonById(id))!
  cols.push(`updated_at = $${i}`)
  vals.push(ts)
  vals.push(id)
  await db.execute(
    `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`,
    vals
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify({ ...data, ...encryptedUpdates }))
  return (await getPersonById(id))!
}

const PERSON_ASSOCIATION_TABLES = [
  'scene_cast',
  'shot_cast',
  'cast_availability',
  'crew_availability',
  'bookings',
  'floats',
] as const

async function softDeletePersonAssociations(
  db: DatabaseAdapter,
  personId: string,
  ts: string
): Promise<void> {
  for (const table of PERSON_ASSOCIATION_TABLES) {
    const rows = await db.select<Array<{ id: string }>>(
      `SELECT id FROM ${table} WHERE person_id = $1 AND deleted_at IS NULL`,
      [personId]
    )
    for (const row of rows) {
      await db.execute(
        `UPDATE ${table} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
        [ts, ts, row.id]
      )
      await outboxPush(table, row.id, 'delete', null)
    }
  }
}

export async function deletePerson(id: string): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const ts = now()
    await softDeletePersonAssociations(db, id, ts)
    await db.execute(
      `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
      [ts, ts, id]
    )
    await outboxPush(TABLE, id, 'delete', null)
  })
}
