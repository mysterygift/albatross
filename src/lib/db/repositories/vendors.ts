import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Vendor } from '../types'

const TABLE = 'vendors'

function rowToVendor(r: Record<string, unknown>): Vendor {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    company_name: r.company_name as string,
    primary_contact_full_name: (r.primary_contact_full_name as string | null) ?? null,
    primary_contact_email: (r.primary_contact_email as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listVendors(productionId: string): Promise<Vendor[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY company_name`,
    [productionId]
  )
  return rows.map(rowToVendor)
}

export async function createVendor(data: {
  production_id: string
  company_name: string
  primary_contact_full_name?: string | null
  primary_contact_email?: string | null
}): Promise<Vendor> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, company_name, primary_contact_full_name, primary_contact_email, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      data.production_id,
      data.company_name,
      data.primary_contact_full_name ?? null,
      data.primary_contact_email ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToVendor(rows[0]!)
}

export async function updateVendor(
  id: string,
  data: Partial<Pick<Vendor, 'company_name' | 'primary_contact_full_name' | 'primary_contact_email'>>
): Promise<Vendor> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['company_name', 'primary_contact_full_name', 'primary_contact_email'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToVendor(rows[0]!) : (await listVendors(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1} AND deleted_at IS NULL`, vals)
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToVendor(rows[0]!)
}

export async function softDeleteVendor(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(`UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`, [ts, ts, id])
  await outboxPush(TABLE, id, 'delete', null)
}

