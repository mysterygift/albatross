/**
 * Instance-scoped clients (reusable across productions).
 * Full cross-device client sync awaits server workspace-level API; productions sync client_id via outbox.
 *
 * When the users table exists (UAM1), name/email/phone are encrypted at rest (v1: AES-256-GCM).
 */

import { getDb, now, uuid } from '../client'
import { coerceIsoString } from '../sqlValueCoercion'
import type { Client } from '../types'
import {
  decryptClientRowFields,
  encryptClientFieldsForStorage,
  isEncryptedClientField,
  readLegacyClientRowFields,
  type PlainClientContactFields,
} from '@/lib/security/clientFieldCrypto'
import { isClientEncryptionEnabled } from '@/lib/security/dataEncryptionContext'
import { requireSensitiveDataAccess } from '@/lib/security/sensitiveDataAccess'

const TABLE = 'clients'

const CLIENT_ORDER_BY = `ORDER BY COALESCE(name_sort_key, lower(name))`

/** ID-only existence check; does not read or decrypt PII columns. Safe without DEK. */
export async function clientExistsById(id: string): Promise<boolean> {
  const db = await getDb()
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT id FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id]
  )
  return rows.length > 0
}

async function rowToClient(r: Record<string, unknown>, encryptionEnabled: boolean): Promise<Client> {
  let fields: PlainClientContactFields
  if (encryptionEnabled) {
    const nameStored = r.name == null ? '' : String(r.name)
    if (isEncryptedClientField(nameStored)) {
      fields = await decryptClientRowFields(r)
    } else {
      fields = readLegacyClientRowFields(r)
    }
  } else {
    fields = readLegacyClientRowFields(r)
  }
  return {
    id: r.id as string,
    name: fields.name,
    email: fields.email,
    phone: fields.phone,
    created_at: coerceIsoString(r.created_at),
    updated_at: coerceIsoString(r.updated_at),
    deleted_at: r.deleted_at == null ? null : coerceIsoString(r.deleted_at),
  }
}

async function storageFieldsFromPlain(
  plain: PlainClientContactFields
): Promise<{ name: string; email: string | null; phone: string | null; name_sort_key: string | null }> {
  const db = await getDb()
  if (await isClientEncryptionEnabled(db)) {
    const stored = await encryptClientFieldsForStorage(plain)
    return stored
  }
  return {
    name: plain.name,
    email: plain.email,
    phone: plain.phone,
    name_sort_key: plain.name.trim().toLowerCase() || null,
  }
}

export async function listClients(): Promise<Client[]> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE deleted_at IS NULL ${CLIENT_ORDER_BY}`,
    []
  )
  return Promise.all(rows.map((r) => rowToClient(r, encryptionEnabled)))
}

export async function getClientById(id: string): Promise<Client | null> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? await rowToClient(rows[0]!, encryptionEnabled) : null
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
  await requireSensitiveDataAccess()
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const plain = normalizeClientFields(data)
  const stored = await storageFieldsFromPlain(plain)
  await db.execute(
    `INSERT INTO ${TABLE} (id, name, email, phone, name_sort_key, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, stored.name, stored.email, stored.phone, stored.name_sort_key, ts, ts]
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
  const plain = normalizeClientFields({ name, email, phone })
  const stored = await storageFieldsFromPlain(plain)
  const ts = now()
  const db = await getDb()
  await db.execute(
    `UPDATE ${TABLE} SET name = $1, email = $2, phone = $3, name_sort_key = $4, updated_at = $5 WHERE id = $6 AND deleted_at IS NULL`,
    [stored.name, stored.email, stored.phone, stored.name_sort_key, ts, id]
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
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const rowsFixed = await db.select<Record<string, unknown>[]>(
    `SELECT c.*, COUNT(p.id) AS project_count
     FROM ${TABLE} c
     LEFT JOIN productions p ON p.client_id = c.id AND p.deleted_at IS NULL
     WHERE c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY COALESCE(c.name_sort_key, lower(c.name))`,
    []
  )
  return Promise.all(
    rowsFixed.map(async (r) => ({
      ...(await rowToClient(r, encryptionEnabled)),
      project_count: Number(r.project_count ?? 0),
    }))
  )
}

export type ClientInsertParams = {
  id: string
  name: string
  email: string | null
  phone: string | null
  name_sort_key?: string | null
  ts: string
}

/** Statement for batching client INSERT inside production create (same executeBatch). */
export function clientInsertStatement(params: ClientInsertParams): { sql: string; bindValues: unknown[] } {
  return {
    sql: `INSERT INTO ${TABLE} (id, name, email, phone, name_sort_key, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    bindValues: [
      params.id,
      params.name,
      params.email,
      params.phone,
      params.name_sort_key ?? null,
      params.ts,
      params.ts,
    ],
  }
}

/** Build INSERT for inline client create during production create (encrypts when UAM1 is enabled). */
export async function clientInsertStatementForPlain(
  params: Omit<ClientInsertParams, 'name_sort_key'> & { name: string; email: string | null; phone: string | null }
): Promise<{ sql: string; bindValues: unknown[] }> {
  await requireSensitiveDataAccess()
  const stored = await storageFieldsFromPlain({
    name: params.name,
    email: params.email,
    phone: params.phone,
  })
  return clientInsertStatement({
    id: params.id,
    name: stored.name,
    email: stored.email,
    phone: stored.phone,
    name_sort_key: stored.name_sort_key,
    ts: params.ts,
  })
}

export { EncryptionKeyUnavailableError } from '@/lib/security/sensitiveDataAccess'
