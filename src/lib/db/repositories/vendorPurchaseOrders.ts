import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import { coerceBoolean, coerceNumber } from '../sqlValueCoercion'
import type { VendorPurchaseOrder, PurchaseOrderStatus } from '../types'

const TABLE = 'vendor_purchase_orders'

/**
 * Map a DB row to VendorPurchaseOrder. Keeps date/numeric/null handling consistent with the rest of the DB layer.
 */
function rowToVendorPurchaseOrder(r: Record<string, unknown>): VendorPurchaseOrder {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    vendor_id: r.vendor_id as string,
    po_number: r.po_number as string,
    description: (r.description as string | null) ?? null,
    issue_date: (r.issue_date as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    amount: r.amount != null ? coerceNumber(r.amount, 0) : null,
    status: (r.status as PurchaseOrderStatus) ?? 'draft',
    approval: coerceBoolean(r.approval, false) ? 1 : 0,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** List active (non-deleted) purchase orders for a vendor. Order by issue_date desc, then created_at desc. */
export async function listVendorPurchaseOrdersByVendorId(
  productionId: string,
  vendorId: string
): Promise<VendorPurchaseOrder[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND vendor_id = $2 AND deleted_at IS NULL ORDER BY issue_date DESC, created_at DESC`,
    [productionId, vendorId]
  )
  return rows.map(rowToVendorPurchaseOrder)
}

/** List active (non-deleted) purchase orders for a production. Order by issue_date desc, then created_at desc. */
export async function listVendorPurchaseOrdersByProduction(
  productionId: string
): Promise<VendorPurchaseOrder[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY issue_date DESC, created_at DESC`,
    [productionId]
  )
  return rows.map(rowToVendorPurchaseOrder)
}

/** Get a single purchase order by id (active only). Returns null if not found or soft-deleted. */
export async function getVendorPurchaseOrderById(poId: string): Promise<VendorPurchaseOrder | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [poId]
  )
  return rows.length > 0 ? rowToVendorPurchaseOrder(rows[0]!) : null
}

const EDITABLE_KEYS = [
  'po_number',
  'description',
  'issue_date',
  'due_date',
  'amount',
  'status',
  'approval',
  'notes',
] as const

export type CreateVendorPurchaseOrderData = {
  production_id: string
  vendor_id: string
  po_number: string
  description?: string | null
  issue_date?: string | null
  due_date?: string | null
  amount?: number | null
  status?: PurchaseOrderStatus
  approval?: number
  notes?: string | null
}

/**
 * Returns statements to create a vendor purchase order for use in executeBatch.
 * Does not include BEGIN/COMMIT. Caller provides id and ts.
 */
export function buildCreateVendorPurchaseOrderStatements(
  id: string,
  ts: string,
  data: CreateVendorPurchaseOrderData
): Array<{ sql: string; bindValues: unknown[] }> {
  const status = data.status ?? 'draft'
  const approval = coerceBoolean(data.approval ?? 0, false)
  const insert = {
    sql: `INSERT INTO ${TABLE} (id, production_id, vendor_id, po_number, description, issue_date, due_date, amount, status, approval, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    bindValues: [
      id,
      data.production_id,
      data.vendor_id,
      data.po_number,
      data.description ?? null,
      data.issue_date ?? null,
      data.due_date ?? null,
      data.amount ?? null,
      status,
      approval,
      data.notes ?? null,
      ts,
      ts,
    ],
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: id,
    operation: 'create',
    payloadJson: JSON.stringify({ ...data, id, status, approval }),
  })
  return [insert, outbox]
}

/**
 * Creates a vendor purchase order. Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md
 * so the INSERT and outbox row are in the same transaction.
 * production_id, vendor_id, and po_number are required. status defaults to 'draft', approval to 0.
 */
export async function createVendorPurchaseOrder(
  data: CreateVendorPurchaseOrderData
): Promise<VendorPurchaseOrder> {
  const id = uuid()
  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildCreateVendorPurchaseOrderStatements(id, ts, data),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToVendorPurchaseOrder(rows[0]!)
}

export type UpdateVendorPurchaseOrderPatch = Partial<
  Pick<VendorPurchaseOrder, (typeof EDITABLE_KEYS)[number]>
>

/**
 * Updates a vendor purchase order. Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md
 * so the UPDATE and outbox row are in the same transaction.
 */
export async function updateVendorPurchaseOrder(
  poId: string,
  patch: UpdateVendorPurchaseOrderPatch
): Promise<VendorPurchaseOrder> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of EDITABLE_KEYS) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      if (k === 'approval') {
        vals.push(coerceBoolean(patch[k], false))
      } else {
        vals.push(patch[k])
      }
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [poId]
    )
    if (rows.length === 0) throw new Error(`Vendor purchase order not found: ${poId}`)
    return rowToVendorPurchaseOrder(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, poId)
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1} AND deleted_at IS NULL`,
      bindValues: vals,
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: poId,
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
    poId,
  ])
  return rowToVendorPurchaseOrder(rows[0]!)
}

/**
 * Soft-deletes a vendor purchase order. Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md
 * so the UPDATE and outbox row are in the same transaction.
 */
export async function softDeleteVendorPurchaseOrder(poId: string): Promise<void> {
  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [ts, ts, poId],
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: poId,
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

// ─── Query-key groundwork for Stage 5B UI ───────────────────────────────────

/** Query key for list of purchase orders for a vendor: ['vendor-purchase-orders', productionId, vendorId] */
export function vendorPurchaseOrdersQueryKey(
  productionId: string,
  vendorId: string
): readonly [string, string, string] {
  return ['vendor-purchase-orders', productionId, vendorId]
}

/** Query key for a single purchase order: ['vendor-purchase-order', poId] */
export function vendorPurchaseOrderQueryKey(poId: string): readonly [string, string] {
  return ['vendor-purchase-order', poId]
}
