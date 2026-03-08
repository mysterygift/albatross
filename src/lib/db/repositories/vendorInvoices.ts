import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import type { VendorInvoice, VendorInvoiceStatus } from '../types'

const TABLE = 'vendor_invoices'

/**
 * Map a DB row to VendorInvoice. Keeps date/numeric/null handling consistent with the rest of the DB layer.
 */
function rowToVendorInvoice(r: Record<string, unknown>): VendorInvoice {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    vendor_id: r.vendor_id as string,
    invoice_number: r.invoice_number as string,
    issue_date: (r.issue_date as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    amount: r.amount != null ? (r.amount as number) : null,
    tax: r.tax != null ? (r.tax as number) : null,
    currency_code: (r.currency_code as string | null) ?? null,
    status: (r.status as VendorInvoiceStatus) ?? 'draft',
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** List active (non-deleted) invoices for a vendor. Order by issue_date desc, then created_at desc. */
export async function listVendorInvoicesByVendorId(
  productionId: string,
  vendorId: string
): Promise<VendorInvoice[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND vendor_id = $2 AND deleted_at IS NULL ORDER BY issue_date DESC, created_at DESC`,
    [productionId, vendorId]
  )
  return rows.map(rowToVendorInvoice)
}

/** Get a single invoice by id (active only). Returns null if not found or soft-deleted. */
export async function getVendorInvoiceById(invoiceId: string): Promise<VendorInvoice | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [invoiceId]
  )
  return rows.length > 0 ? rowToVendorInvoice(rows[0]!) : null
}

const EDITABLE_KEYS = [
  'invoice_number',
  'issue_date',
  'due_date',
  'amount',
  'tax',
  'currency_code',
  'status',
  'notes',
] as const

export type CreateVendorInvoiceData = {
  production_id: string
  vendor_id: string
  invoice_number: string
  issue_date?: string | null
  due_date?: string | null
  amount?: number | null
  tax?: number | null
  currency_code?: string | null
  status?: VendorInvoiceStatus
  notes?: string | null
}

/** @internal use CreateVendorInvoiceData for orchestration */
type CreateData = CreateVendorInvoiceData

/**
 * Returns statements to create a vendor invoice for use in executeBatch.
 * Does not include BEGIN/COMMIT. Caller provides id and ts.
 */
export function buildCreateVendorInvoiceStatements(
  id: string,
  ts: string,
  data: CreateVendorInvoiceData
): Array<{ sql: string; bindValues: unknown[] }> {
  const status = data.status ?? 'draft'
  const insert = {
    sql: `INSERT INTO ${TABLE} (id, production_id, vendor_id, invoice_number, issue_date, due_date, amount, tax, currency_code, status, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    bindValues: [
      id,
      data.production_id,
      data.vendor_id,
      data.invoice_number,
      data.issue_date ?? null,
      data.due_date ?? null,
      data.amount ?? null,
      data.tax ?? null,
      data.currency_code ?? null,
      status,
      data.notes ?? null,
      ts,
      ts,
    ],
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: id,
    operation: 'create',
    payloadJson: JSON.stringify({ ...data, id, status }),
  })
  return [insert, outbox]
}

/**
 * Creates a vendor invoice. Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md
 * so the INSERT and outbox row are in the same transaction.
 * invoice_number is required.
 */
export async function createVendorInvoice(data: CreateData): Promise<VendorInvoice> {
  const id = uuid()
  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildCreateVendorInvoiceStatements(id, ts, data),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToVendorInvoice(rows[0]!)
}

export type UpdateVendorInvoicePatch = Partial<Pick<VendorInvoice, (typeof EDITABLE_KEYS)[number]>>

/** @internal */
type UpdatePatch = UpdateVendorInvoicePatch

/**
 * Updates a vendor invoice. Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md
 * so the UPDATE and outbox row are in the same transaction.
 */
export async function updateVendorInvoice(
  invoiceId: string,
  patch: UpdatePatch
): Promise<VendorInvoice> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of EDITABLE_KEYS) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(patch[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [invoiceId]
    )
    if (rows.length === 0) throw new Error(`Vendor invoice not found: ${invoiceId}`)
    return rowToVendorInvoice(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, invoiceId)
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1} AND deleted_at IS NULL`,
      bindValues: vals,
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: invoiceId,
      operation: 'update',
      payloadJson: JSON.stringify(patch),
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, statements)
  })
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [
    invoiceId,
  ])
  return rowToVendorInvoice(rows[0]!)
}

/**
 * Returns statements to soft-delete a vendor invoice for use in executeBatch.
 * Does not include BEGIN/COMMIT.
 */
export function buildSoftDeleteVendorInvoiceStatements(
  invoiceId: string,
  ts: string
): Array<{ sql: string; bindValues: unknown[] }> {
  const update = {
    sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    bindValues: [ts, ts, invoiceId],
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: invoiceId,
    operation: 'delete',
    payloadJson: null,
  })
  return [update, outbox]
}

/**
 * Soft-deletes a vendor invoice. Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md
 * so the UPDATE and outbox row are in the same transaction.
 */
export async function softDeleteVendorInvoice(invoiceId: string): Promise<void> {
  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildSoftDeleteVendorInvoiceStatements(invoiceId, ts),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

/**
 * Returns statements to update a vendor invoice for use in executeBatch.
 * Does not include BEGIN/COMMIT. Returns empty array if patch has no keys.
 */
export function buildUpdateVendorInvoiceStatements(
  invoiceId: string,
  ts: string,
  patch: UpdateVendorInvoicePatch
): Array<{ sql: string; bindValues: unknown[] }> {
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of EDITABLE_KEYS) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(patch[k])
    }
  }
  if (cols.length === 0) return []
  cols.push(`updated_at = $${i}`)
  vals.push(ts, invoiceId)
  const update = {
    sql: `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1} AND deleted_at IS NULL`,
    bindValues: vals,
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: invoiceId,
    operation: 'update',
    payloadJson: JSON.stringify(patch),
  })
  return [update, outbox]
}

// ─── Query-key groundwork for Stage 3B UI ───────────────────────────────────
// Stage 3B will use these with React Query (or equivalent). No hooks in this stage.

/** Query key for list of invoices for a vendor: ['vendor-invoices', productionId, vendorId] */
export function vendorInvoicesQueryKey(productionId: string, vendorId: string): readonly [string, string, string] {
  return ['vendor-invoices', productionId, vendorId]
}

/** Query key for a single invoice: ['vendor-invoice', invoiceId] */
export function vendorInvoiceQueryKey(invoiceId: string): readonly [string, string] {
  return ['vendor-invoice', invoiceId]
}
