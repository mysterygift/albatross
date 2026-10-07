/**
 * PO amendment audit trail. `vendor_purchase_orders.amount` is the CURRENT PO value;
 * every change made through `amendPurchaseOrderAmount` also writes a row here.
 */
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import { coerceNumber } from '../sqlValueCoercion'
import { moneyEquals, roundMoney, roundMoneyOrNull } from '@/lib/money/roundMoney'
import type { VendorPurchaseOrder, VendorPurchaseOrderAmendment } from '../types'
import {
  buildUpdateVendorPurchaseOrderStatements,
  getVendorPurchaseOrderById,
  type UpdateVendorPurchaseOrderPatch,
} from './vendorPurchaseOrders'

const TABLE = 'vendor_purchase_order_amendments'

type Stmt = { sql: string; bindValues: unknown[] }

function rowToAmendment(r: Record<string, unknown>): VendorPurchaseOrderAmendment {
  return {
    id: r.id as string,
    vendor_purchase_order_id: r.vendor_purchase_order_id as string,
    previous_amount: r.previous_amount != null ? coerceNumber(r.previous_amount, 0) : null,
    new_amount: coerceNumber(r.new_amount, 0),
    reason: (r.reason as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** Query key for a vendor's PO amendments: ['vendor-po-amendments', productionId, vendorId] */
export function vendorPoAmendmentsByVendorQueryKey(
  productionId: string,
  vendorId: string
): readonly [string, string, string] {
  return ['vendor-po-amendments', productionId, vendorId]
}

/**
 * Active amendments for many POs in ONE query (no N+1), grouped by PO id, newest first.
 * Every requested id is present (empty array = never amended).
 */
export async function listAmendmentsByPurchaseOrderIds(
  poIds: readonly string[]
): Promise<Record<string, VendorPurchaseOrderAmendment[]>> {
  const out: Record<string, VendorPurchaseOrderAmendment[]> = {}
  for (const id of poIds) out[id] = []
  if (poIds.length === 0) return out
  const db = await getDb()
  const placeholders = poIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE vendor_purchase_order_id IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY created_at DESC, id DESC`,
    [...poIds]
  )
  for (const r of rows) out[r.vendor_purchase_order_id as string]?.push(rowToAmendment(r))
  return out
}

type AmendPurchaseOrderAmountParams = {
  poId: string
  newAmount: number
  /** Optional free-text reason; blank is stored as null. */
  reason?: string | null
  /** Other PO fields to save in the SAME transaction (e.g. from the PO edit dialog). */
  patch?: Omit<UpdateVendorPurchaseOrderPatch, 'amount'>
}

/** Throws if the new amount is not a positive finite number. */
function assertValidAmendmentAmount(newAmount: number): void {
  if (typeof newAmount !== 'number' || !Number.isFinite(newAmount) || roundMoney(newAmount) <= 0) {
    throw new Error('New PO amount must be greater than 0')
  }
}

/**
 * Statements that record an amendment and set the PO's current amount, for use in executeBatch
 * (no BEGIN/COMMIT). Caller supplies the PO's current amount as `previousAmount`.
 */
function buildAmendPurchaseOrderStatements(
  amendmentId: string,
  ts: string,
  params: {
    poId: string
    previousAmount: number | null
    newAmount: number
    reason?: string | null
    patch?: Omit<UpdateVendorPurchaseOrderPatch, 'amount'>
  }
): Stmt[] {
  const reason = params.reason?.trim() ? params.reason.trim() : null
  const insert: Stmt = {
    sql: `INSERT INTO ${TABLE} (id, vendor_purchase_order_id, previous_amount, new_amount, reason, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    bindValues: [amendmentId, params.poId, params.previousAmount, params.newAmount, reason, ts, ts],
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: amendmentId,
    operation: 'create',
    payloadJson: JSON.stringify({
      id: amendmentId,
      vendor_purchase_order_id: params.poId,
      previous_amount: params.previousAmount,
      new_amount: params.newAmount,
      reason,
    }),
  })
  return [
    insert,
    outbox,
    ...buildUpdateVendorPurchaseOrderStatements(params.poId, ts, { ...params.patch, amount: params.newAmount }),
  ]
}

/**
 * Change a PO's current value and record the amendment in ONE transaction
 * (runInSerializedTransaction + executeBatch per DOCS/database.md).
 * The PO is read inside the serialized slot so `previous_amount` reflects the committed value.
 */
export async function amendPurchaseOrderAmount(
  params: AmendPurchaseOrderAmountParams
): Promise<{ purchaseOrder: VendorPurchaseOrder; amendment: VendorPurchaseOrderAmendment }> {
  assertValidAmendmentAmount(params.newAmount)
  const newAmount = roundMoney(params.newAmount)
  const amendmentId = uuid()
  const ts = now()

  await runInSerializedTransaction(async () => {
    const po = await getVendorPurchaseOrderById(params.poId)
    if (!po) throw new Error('Vendor purchase order not found or deleted')
    if (po.amount != null && moneyEquals(po.amount, newAmount)) {
      throw new Error('New PO amount is the same as the current amount')
    }
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      ...buildAmendPurchaseOrderStatements(amendmentId, ts, {
        poId: params.poId,
        previousAmount: roundMoneyOrNull(po.amount),
        newAmount,
        reason: params.reason,
        patch: params.patch,
      }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })

  const purchaseOrder = await getVendorPurchaseOrderById(params.poId)
  if (!purchaseOrder) throw new Error('Vendor purchase order not found after amend')
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [
    amendmentId,
  ])
  return { purchaseOrder, amendment: rowToAmendment(rows[0]!) }
}
