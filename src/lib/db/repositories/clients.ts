/**
 * Instance-scoped clients (reusable across productions).
 * Full cross-device client sync awaits server workspace-level API; productions sync client_id via outbox.
 */

import { getDb, now, uuid } from '../client'
import { coerceIsoString } from '../sqlValueCoercion'
import type { Client } from '../types'

const TABLE = 'clients'

function rowToClient(r: Record<string, unknown>): Client {
  return {
    id: r.id as string,
    name: r.name as string,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    created_at: coerceIsoString(r.created_at),
    updated_at: coerceIsoString(r.updated_at),
    deleted_at: r.deleted_at == null ? null : coerceIsoString(r.deleted_at),
  }
}

export async function listClients(): Promise<Client[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE deleted_at IS NULL ORDER BY name`,
    []
  )
  return rows.map(rowToClient)
}

export async function getClientById(id: string): Promise<Client | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToClient(rows[0]!) : null
}

export type CreateClientData = {
  name: string
  email?: string | null
  phone?: string | null
}

function normalizeClientFields(data: { name: string; email?: string | null; phone?: string | null }) {
  const name = data.name.trim()
  if (!name) throw new Error('Client name is required')
  const email = data.email?.trim() ? data.email.trim() : null
  const phone = data.phone?.trim() ? data.phone.trim() : null
  return { name, email, phone }
}

export async function createClient(data: CreateClientData): Promise<Client> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const { name, email, phone } = normalizeClientFields(data)
  await db.execute(
    `INSERT INTO ${TABLE} (id, name, email, phone, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, name, email, phone, ts, ts]
  )
  return (await getClientById(id))!
}

export type UpdateClientData = Partial<CreateClientData>

export async function updateClient(id: string, data: UpdateClientData): Promise<Client> {
  const existing = await getClientById(id)
  if (!existing) throw new Error('Client not found')
  const name = data.name !== undefined ? data.name : existing.name
  const email = data.email !== undefined ? data.email : existing.email
  const phone = data.phone !== undefined ? data.phone : existing.phone
  const normalized = normalizeClientFields({ name, email, phone })
  const ts = now()
  const db = await getDb()
  await db.execute(
    `UPDATE ${TABLE} SET name = $1, email = $2, phone = $3, updated_at = $4 WHERE id = $5 AND deleted_at IS NULL`,
    [normalized.name, normalized.email, normalized.phone, ts, id]
  )
  return (await getClientById(id))!
}

export async function softDeleteClient(id: string): Promise<void> {
  const existing = await getClientById(id)
  if (!existing) throw new Error('Client not found')
  const ts = now()
  const db = await getDb()
  await db.execute(
    `UPDATE productions SET client_id = NULL, updated_at = $1 WHERE client_id = $2 AND deleted_at IS NULL`,
    [ts, id]
  )
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
    [ts, ts, id]
  )
}

export async function countProductionsForClient(clientId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT COUNT(*) AS cnt FROM productions WHERE client_id = $1 AND deleted_at IS NULL`,
    [clientId]
  )
  const raw = rows[0]?.cnt
  return typeof raw === 'number' ? raw : Number(raw ?? 0)
}

export type ClientWithProjectCount = Client & { project_count: number }

/** Clients with active (non-deleted) production link counts for settings UI. */
export async function listClientsWithProjectCounts(): Promise<ClientWithProjectCount[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT c.*, COUNT(p.id) AS project_count
     FROM ${TABLE} c
     LEFT JOIN productions p ON p.client_id = c.id AND p.deleted_at IS NULL
     WHERE c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.name`,
    []
  )
  return rows.map((r) => ({
    ...rowToClient(r),
    project_count: Number(r.project_count ?? 0),
  }))
}

export type ClientInsertParams = {
  id: string
  name: string
  email: string | null
  phone: string | null
  ts: string
}

/** Statement for batching client INSERT inside production create (same executeBatch). */
export function clientInsertStatement(params: ClientInsertParams): { sql: string; bindValues: unknown[] } {
  return {
    sql: `INSERT INTO ${TABLE} (id, name, email, phone, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    bindValues: [params.id, params.name, params.email, params.phone, params.ts, params.ts],
  }
}
