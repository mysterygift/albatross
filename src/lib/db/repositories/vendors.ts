import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import type { Vendor } from '../types'
import { isClientEncryptionEnabled } from '@/lib/security/dataEncryptionContext'
import { requireSensitiveDataAccess } from '@/lib/security/sensitiveDataAccess'
import {
  decryptVendorFields,
  encryptVendorFields,
  VENDOR_PROTECTED_FIELDS,
} from '@/lib/security/sensitiveEntityFieldCrypto'

const TABLE = 'vendors'

async function rowToVendor(r: Record<string, unknown>, encryptionEnabled: boolean): Promise<Vendor> {
  const fields = encryptionEnabled ? await decryptVendorFields(r) : r
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    is_global: Number(r.is_global ?? 0) === 1,
    company_name: fields.company_name as string,
    primary_contact_full_name: (fields.primary_contact_full_name as string | null) ?? null,
    primary_contact_email: (fields.primary_contact_email as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listVendors(productionId: string): Promise<Vendor[]> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT v.* FROM ${TABLE} v
     WHERE v.deleted_at IS NULL
       AND (v.production_id = $1 OR v.is_global = 1)
       AND NOT EXISTS (
         SELECT 1 FROM vendor_production_exclusions e
         WHERE e.vendor_id = v.id AND e.production_id = $1
       )
    `,
    [productionId]
  )
  const vendors = await Promise.all(rows.map((row) => rowToVendor(row, encryptionEnabled)))
  return vendors.sort((a, b) => a.company_name.localeCompare(b.company_name))
}

/** Returns active vendor by id (excludes soft-deleted). Use for pickers and active lists. */
export async function getVendor(id: string): Promise<Vendor | null> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id]
  )
  return rows.length > 0 ? await rowToVendor(rows[0]!, encryptionEnabled) : null
}

/** Returns vendor by id including archived (deleted_at set). Use for detail page to show archived state. */
export async function getVendorById(id: string): Promise<Vendor | null> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 LIMIT 1`,
    [id]
  )
  return rows.length > 0 ? await rowToVendor(rows[0]!, encryptionEnabled) : null
}

/**
 * Creates a vendor. Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md
 * so the INSERT and outbox row are in the same transaction.
 */
export async function createVendor(data: {
  production_id: string
  company_name: string
  primary_contact_full_name?: string | null
  primary_contact_email?: string | null
  is_global?: boolean
}): Promise<Vendor> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const isGlobal = data.is_global ? 1 : 0
  const stored: Record<string, unknown> = await isClientEncryptionEnabled(db) ? await encryptVendorFields(data) : data
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `INSERT INTO ${TABLE} (id, production_id, is_global, company_name, company_name_sort_key, primary_contact_full_name, primary_contact_email, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      bindValues: [
        id,
        data.production_id,
        isGlobal,
        stored.company_name,
        stored.company_name_sort_key ?? null,
        stored.primary_contact_full_name ?? null,
        stored.primary_contact_email ?? null,
        ts,
        ts,
      ],
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: id,
      operation: 'create',
      payloadJson: JSON.stringify({ ...stored, id, is_global: isGlobal === 1 }),
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToVendor(rows[0]!, await isClientEncryptionEnabled(db))
}

/**
 * Updates a vendor. Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md
 * so the UPDATE and outbox row are in the same transaction.
 */
export async function updateVendor(
  id: string,
  data: Partial<Pick<Vendor, 'company_name' | 'primary_contact_full_name' | 'primary_contact_email'>>
): Promise<Vendor> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  const protectedUpdates = Object.fromEntries(
    VENDOR_PROTECTED_FIELDS.filter((field) => data[field] !== undefined).map((field) => [field, data[field]])
  )
  const encryptedAll = Object.keys(protectedUpdates).length > 0 && encryptionEnabled
    ? await encryptVendorFields({ company_name: data.company_name ?? (await getVendor(id))?.company_name ?? '', ...protectedUpdates })
    : protectedUpdates
  const encryptedUpdates: Record<string, unknown> = Object.fromEntries(
    Object.keys(protectedUpdates).map((field) => [field, encryptedAll[field]])
  )
  if (data.company_name !== undefined && encryptedAll.company_name_sort_key !== undefined) {
    encryptedUpdates.company_name_sort_key = encryptedAll.company_name_sort_key
  }
  for (const k of ['company_name', 'primary_contact_full_name', 'primary_contact_email'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(encryptedUpdates[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? await rowToVendor(rows[0]!, encryptionEnabled) : (await listVendors(''))[0]!
  }
  if (data.company_name !== undefined && encryptedUpdates.company_name_sort_key !== undefined) {
    cols.push(`company_name_sort_key = $${i++}`)
    vals.push(encryptedUpdates.company_name_sort_key)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1} AND deleted_at IS NULL`,
      bindValues: vals,
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: id,
      operation: 'update',
      payloadJson: JSON.stringify({ ...data, ...encryptedUpdates }),
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, statements)
  })
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToVendor(rows[0]!, encryptionEnabled)
}

export class VendorPromoteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VendorPromoteError'
  }
}

export class VendorRemoveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VendorRemoveError'
  }
}

/**
 * Promotes a production vendor to global scope (identity shared across all productions).
 * Vendor must belong to `originProductionId` and not already be global.
 */
export async function promoteVendorToGlobal(
  id: string,
  originProductionId: string
): Promise<Vendor> {
  const db = await getDb()
  const existing = await getVendor(id)
  if (!existing) {
    throw new VendorPromoteError('Vendor not found or archived.')
  }
  if (existing.is_global) {
    throw new VendorPromoteError('Vendor is already shared across all projects.')
  }
  if (existing.production_id !== originProductionId) {
    throw new VendorPromoteError('Only vendors from the current project can be shared globally.')
  }

  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${TABLE} SET is_global = 1, updated_at = $1 WHERE id = $2 AND is_global = 0 AND deleted_at IS NULL`,
      bindValues: [ts, id],
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: id,
      operation: 'update',
      payloadJson: JSON.stringify({ is_global: true }),
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, statements)
  })
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToVendor(rows[0]!, await isClientEncryptionEnabled(db))
}

/**
 * Stops sharing a global vendor across projects; keeps it in its origin production only.
 */
export async function demoteVendorToLocal(
  id: string,
  originProductionId: string
): Promise<Vendor> {
  const existing = await getVendor(id)
  if (!existing) {
    throw new VendorRemoveError('Vendor not found or already removed.')
  }
  if (!existing.is_global) {
    throw new VendorRemoveError('Vendor is not shared across projects.')
  }
  if (existing.production_id !== originProductionId) {
    throw new VendorRemoveError('Only the origin project can make this vendor local again.')
  }

  const db = await getDb()
  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${TABLE} SET is_global = 0, updated_at = $1 WHERE id = $2 AND is_global = 1 AND deleted_at IS NULL`,
      bindValues: [ts, id],
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: id,
      operation: 'update',
      payloadJson: JSON.stringify({ is_global: false }),
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, statements)
  })
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToVendor(rows[0]!, await isClientEncryptionEnabled(db))
}

/**
 * Hides a global vendor from one production without affecting other projects.
 */
export async function excludeVendorFromProduction(
  vendorId: string,
  productionId: string
): Promise<void> {
  const existing = await getVendor(vendorId)
  if (!existing) {
    throw new VendorRemoveError('Vendor not found or already removed.')
  }
  if (!existing.is_global) {
    throw new VendorRemoveError('Only shared vendors can be removed from a single project this way.')
  }

  const db = await getDb()
  const ts = now()
  const id = uuid()
  await db.execute(
    `INSERT INTO vendor_production_exclusions (id, vendor_id, production_id, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(vendor_id, production_id) DO NOTHING`,
    [id, vendorId, productionId, ts]
  )
}

/**
 * Removes a vendor from the current project only.
 * - Project-scoped vendor: soft-delete.
 * - Global vendor on origin project: demote to local.
 * - Global vendor on another project: hide via exclusion.
 */
export async function removeVendorFromProject(
  vendorId: string,
  productionId: string
): Promise<void> {
  const existing = await getVendor(vendorId)
  if (!existing) {
    throw new VendorRemoveError('Vendor not found or already removed.')
  }
  if (!existing.is_global) {
    if (existing.production_id !== productionId) {
      throw new VendorRemoveError('Vendor not found for this project.')
    }
    await softDeleteVendor(vendorId)
    return
  }
  if (existing.production_id === productionId) {
    await demoteVendorToLocal(vendorId, productionId)
    return
  }
  await excludeVendorFromProduction(vendorId, productionId)
}

/**
 * Soft-deletes a vendor. Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md
 * so the UPDATE and outbox row are in the same transaction.
 */
export async function softDeleteVendor(id: string): Promise<void> {
  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [ts, ts, id],
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: id,
      operation: 'delete',
      payloadJson: null,
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}
