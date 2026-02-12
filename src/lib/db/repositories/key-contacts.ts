import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { KeyContact } from '../types'

const TABLE = 'key_contacts'

function rowToKeyContact(r: Record<string, unknown>): KeyContact {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    department: r.department as string,
    name: r.name as string | null,
    phone: r.phone as string | null,
    email: r.email as string | null,
    notes: r.notes as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listKeyContactsByProduction(productionId: string): Promise<KeyContact[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY department`,
    [productionId]
  )
  return rows.map(rowToKeyContact)
}

export async function createKeyContact(data: {
  production_id: string
  department: string
  name?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
}): Promise<KeyContact> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, department, name, phone, email, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.production_id,
      data.department,
      data.name ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.notes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToKeyContact(rows[0]!)
}

export async function updateKeyContact(
  id: string,
  data: Partial<Pick<KeyContact, 'department' | 'name' | 'phone' | 'email' | 'notes'>>
): Promise<KeyContact> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['department', 'name', 'phone', 'email', 'notes'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToKeyContact(rows[0]!) : (await listKeyContactsByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToKeyContact(rows[0]!)
}

export async function deleteKeyContact(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
