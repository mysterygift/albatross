/**
 * Repository for vendor finance linkages: invoice ↔ expense, PO ↔ expense.
 * Link writes record outbox rows (create / update / delete) like their sibling tables, so an
 * allocation change or an unlink is journalled even when no PO / invoice / expense row changes.
 */

import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import { coerceNumber } from '../sqlValueCoercion'
import type {
  VendorInvoiceExpenseLink,
  VendorPurchaseOrderExpenseLink,
} from '../types'
import { getVendorInvoiceById } from './vendorInvoices'
import { getVendorPurchaseOrderById } from './vendorPurchaseOrders'
import type { PoCommitmentLink } from '@/lib/budget/vendors/poMatching'
import { roundMoney, roundMoneyOrNull } from '@/lib/money/roundMoney'

const INVOICE_EXPENSE_TABLE = 'vendor_invoice_expenses'
const PO_EXPENSE_TABLE = 'vendor_purchase_order_expenses'

function rowToInvoiceExpenseLink(r: Record<string, unknown>): VendorInvoiceExpenseLink {
  return {
    id: r.id as string,
    vendor_invoice_id: r.vendor_invoice_id as string,
    expense_id: r.expense_id as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }
}

function rowToPOExpenseLink(r: Record<string, unknown>): VendorPurchaseOrderExpenseLink {
  return {
    id: r.id as string,
    vendor_purchase_order_id: r.vendor_purchase_order_id as string,
    expense_id: r.expense_id as string,
    allocated_amount: r.allocated_amount != null ? coerceNumber(r.allocated_amount, 0) : null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }
}

/** Query key for invoice expense links: ['vendor-invoice-expense-links', invoiceId] */
export function vendorInvoiceExpenseLinksQueryKey(invoiceId: string): readonly [string, string] {
  return ['vendor-invoice-expense-links', invoiceId]
}

/** Query key for PO expense links: ['vendor-po-expense-links', poId] */
export function vendorPurchaseOrderExpenseLinksQueryKey(poId: string): readonly [string, string] {
  return ['vendor-po-expense-links', poId]
}

/** Query key for invoice links by expense: ['vendor-invoice-links-by-expense', expenseId] */
export function vendorInvoiceLinksByExpenseQueryKey(expenseId: string): readonly [string, string] {
  return ['vendor-invoice-links-by-expense', expenseId]
}

/** Query key for PO links by expense: ['vendor-po-links-by-expense', expenseId] */
export function vendorPurchaseOrderLinksByExpenseQueryKey(expenseId: string): readonly [string, string] {
  return ['vendor-po-links-by-expense', expenseId]
}

/** Prefix for every batched PO-link-count query of a production: ['expense-po-link-counts', productionId] */
export function expensePoLinkCountsBaseQueryKey(productionId: string): readonly [string, string] {
  return ['expense-po-link-counts', productionId]
}

/** Query key for the batched PO link counts of a set of expenses (order-insensitive). */
export function expensePoLinkCountsQueryKey(
  productionId: string,
  expenseIds: readonly string[]
): readonly [string, string, string] {
  return ['expense-po-link-counts', productionId, [...expenseIds].sort().join(',')]
}

/** Keep IN (...) lists well under SQLite's bound-variable limit. */
const ID_CHUNK_SIZE = 400

/**
 * How many (live) POs each expense is matched to, in batched queries (no N+1). Every requested id is
 * present in the result (0 = no PO). Feeds the "No PO" badge.
 */
export async function listPoLinkCountsByExpenseIds(
  expenseIds: readonly string[]
): Promise<Record<string, number>> {
  const unique = [...new Set(expenseIds)]
  const out: Record<string, number> = {}
  for (const id of unique) out[id] = 0
  if (unique.length === 0) return out
  const db = await getDb()
  for (let i = 0; i < unique.length; i += ID_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + ID_CHUNK_SIZE)
    const placeholders = chunk.map((_, j) => `$${j + 1}`).join(', ')
    const rows = await db.select<{ expense_id: string; c: unknown }[]>(
      `SELECT vpoe.expense_id AS expense_id, COUNT(*) AS c
       FROM ${PO_EXPENSE_TABLE} vpoe
       INNER JOIN vendor_purchase_orders vpo ON vpo.id = vpoe.vendor_purchase_order_id AND vpo.deleted_at IS NULL
       WHERE vpoe.expense_id IN (${placeholders})
       GROUP BY vpoe.expense_id`,
      chunk
    )
    for (const r of rows) out[r.expense_id] = coerceNumber(r.c, 0)
  }
  return out
}

// ─── Invoice ↔ Expense ─────────────────────────────────────────────────────

/** List all expense links for an invoice. */
export async function listExpenseLinksByInvoice(
  invoiceId: string
): Promise<VendorInvoiceExpenseLink[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${INVOICE_EXPENSE_TABLE} WHERE vendor_invoice_id = $1 ORDER BY created_at`,
    [invoiceId]
  )
  return rows.map(rowToInvoiceExpenseLink)
}

/**
 * Return expense link counts per invoice id for the given invoice IDs.
 * Keys are invoice IDs; missing key means 0. Used to avoid N+1 on vendor detail.
 */
export async function listExpenseLinkCountsByInvoiceIds(
  invoiceIds: string[]
): Promise<Record<string, number>> {
  if (invoiceIds.length === 0) return {}
  const db = await getDb()
  const placeholders = invoiceIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<{ vendor_invoice_id: string; count: number }[]>(
    `SELECT vendor_invoice_id, COUNT(*) as count FROM ${INVOICE_EXPENSE_TABLE}
     WHERE vendor_invoice_id IN (${placeholders}) GROUP BY vendor_invoice_id`,
    invoiceIds
  )
  const out: Record<string, number> = {}
  for (const id of invoiceIds) out[id] = 0
  for (const r of rows) out[r.vendor_invoice_id] = r.count
  return out
}

/**
 * Return expense link counts per PO id for the given PO IDs.
 * Keys are PO IDs; missing key means 0.
 */
export async function listExpenseLinkCountsByPurchaseOrderIds(
  poIds: string[]
): Promise<Record<string, number>> {
  if (poIds.length === 0) return {}
  const db = await getDb()
  const placeholders = poIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<{ vendor_purchase_order_id: string; count: number }[]>(
    `SELECT vendor_purchase_order_id, COUNT(*) as count FROM ${PO_EXPENSE_TABLE}
     WHERE vendor_purchase_order_id IN (${placeholders}) GROUP BY vendor_purchase_order_id`,
    poIds
  )
  const out: Record<string, number> = {}
  for (const id of poIds) out[id] = 0
  for (const r of rows) out[r.vendor_purchase_order_id] = r.count
  return out
}

/**
 * Create a link between an invoice and an expense.
 * Validates: invoice and expense exist, same production, same vendor.
 */
export async function createVendorInvoiceExpenseLink(
  invoiceId: string,
  expenseId: string
): Promise<VendorInvoiceExpenseLink> {
  const invoice = await getVendorInvoiceById(invoiceId)
  if (!invoice) throw new Error('Vendor invoice not found or deleted')

  const db = await getDb()
  const expenseRows = await db.select<Record<string, unknown>[]>(
    `SELECT id, production_id, vendor_id FROM expenses WHERE id = $1 AND deleted_at IS NULL`,
    [expenseId]
  )
  const expense = expenseRows[0]
  if (!expense) throw new Error('Expense not found or deleted')
  assertExpenseLinkableToInvoice(invoice, {
    production_id: expense.production_id as string,
    vendor_id: (expense.vendor_id as string | null) ?? null,
  })

  const id = uuid()
  const ts = now()
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, [
      { sql: 'BEGIN', bindValues: [] },
      ...buildCreateVendorInvoiceExpenseLinkStatements(id, ts, invoiceId, expenseId),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${INVOICE_EXPENSE_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToInvoiceExpenseLink(rows[0]!)
}

/** Remove the link between an invoice and an expense (outbox row + DELETE in one transaction). */
export async function deleteVendorInvoiceExpenseLink(
  invoiceId: string,
  expenseId: string
): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const rows = await db.select<{ id: string }[]>(
      `SELECT id FROM ${INVOICE_EXPENSE_TABLE} WHERE vendor_invoice_id = $1 AND expense_id = $2`,
      [invoiceId, expenseId]
    )
    if (rows.length === 0) return
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      ...buildDeleteVendorInvoiceExpenseLinkStatements(rows[0]!.id),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}

// ─── PO ↔ Expense ─────────────────────────────────────────────────────────

/** List all expense links for a purchase order. */
export async function listExpenseLinksByPurchaseOrder(
  poId: string
): Promise<VendorPurchaseOrderExpenseLink[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${PO_EXPENSE_TABLE} WHERE vendor_purchase_order_id = $1 ORDER BY created_at`,
    [poId]
  )
  return rows.map(rowToPOExpenseLink)
}

type Stmt = { sql: string; bindValues: unknown[] }

/** Allocated amount must be null (whole expense) or a positive finite number. */
export function assertValidAllocatedAmount(allocatedAmount: number | null | undefined): void {
  if (allocatedAmount == null) return
  if (typeof allocatedAmount !== 'number' || !Number.isFinite(allocatedAmount) || roundMoney(allocatedAmount) <= 0) {
    throw new Error('Allocated amount must be greater than 0')
  }
}

/**
 * Pure validation for linking an expense to a PO: same production and same vendor.
 * Shared by the standalone link function and the atomic create-expense flow (where the
 * expense row does not exist yet, so the caller passes the values it is about to insert).
 */
export function assertExpenseLinkableToPurchaseOrder(
  po: { production_id: string; vendor_id: string },
  expense: { production_id: string; vendor_id: string | null }
): void {
  if (expense.production_id !== po.production_id) {
    throw new Error('Expense does not belong to the same production as the PO')
  }
  if (expense.vendor_id !== po.vendor_id) {
    throw new Error('Expense does not belong to the same vendor as the PO')
  }
}

/** Pure validation for linking an expense to an invoice: same production and same vendor. */
export function assertExpenseLinkableToInvoice(
  invoice: { production_id: string; vendor_id: string },
  expense: { production_id: string; vendor_id: string | null }
): void {
  if (expense.production_id !== invoice.production_id) {
    throw new Error('Expense does not belong to the same production as the invoice')
  }
  if (expense.vendor_id !== invoice.vendor_id) {
    throw new Error('Expense does not belong to the same vendor as the invoice')
  }
}

/** INSERT + outbox row for a PO ↔ expense link, for use inside executeBatch. */
export function buildCreateVendorPurchaseOrderExpenseLinkStatements(
  id: string,
  ts: string,
  poId: string,
  expenseId: string,
  allocatedAmountInput: number | null = null
): Stmt[] {
  const allocatedAmount = roundMoneyOrNull(allocatedAmountInput)
  return [
    {
      sql: `INSERT INTO ${PO_EXPENSE_TABLE} (id, vendor_purchase_order_id, expense_id, allocated_amount, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
      bindValues: [id, poId, expenseId, allocatedAmount, ts, ts],
    },
    outboxStatementForRow({
      entity: PO_EXPENSE_TABLE,
      entityId: id,
      operation: 'create',
      payloadJson: JSON.stringify({
        id,
        vendor_purchase_order_id: poId,
        expense_id: expenseId,
        allocated_amount: allocatedAmount,
      }),
    }),
  ]
}

/** UPDATE + outbox row changing one PO ↔ expense link's allocation (null = whole expense). */
export function buildUpdatePoExpenseLinkAllocationStatements(
  linkId: string,
  ts: string,
  allocatedAmountInput: number | null
): Stmt[] {
  const allocatedAmount = roundMoneyOrNull(allocatedAmountInput)
  return [
    {
      sql: `UPDATE ${PO_EXPENSE_TABLE} SET allocated_amount = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [allocatedAmount, ts, linkId],
    },
    outboxStatementForRow({
      entity: PO_EXPENSE_TABLE,
      entityId: linkId,
      operation: 'update',
      payloadJson: JSON.stringify({ id: linkId, allocated_amount: allocatedAmount }),
    }),
  ]
}

/**
 * When an expense gains a second PO, a NULL ("whole expense") allocation on its existing link
 * would silently collapse to 0 (NULL only means "whole expense" for a single-PO expense).
 * Pin those NULLs to the explicit expense amount so the PO's committed value is unchanged;
 * the new link's allocation (and any resulting sum mismatch) is then surfaced via poMatching.
 */
function buildPinNullPoAllocationStatements(
  ts: string,
  existingLinks: ReadonlyArray<Pick<VendorPurchaseOrderExpenseLink, 'id' | 'allocated_amount'>>,
  expenseAmount: number
): Stmt[] {
  return existingLinks
    .filter((l) => l.allocated_amount == null)
    .flatMap((l) => buildUpdatePoExpenseLinkAllocationStatements(l.id, ts, expenseAmount))
}

/** Outbox row + DELETE for one PO ↔ expense link. */
export function buildDeleteVendorPurchaseOrderExpenseLinkStatements(linkId: string): Stmt[] {
  return [
    outboxStatementForRow({ entity: PO_EXPENSE_TABLE, entityId: linkId, operation: 'delete', payloadJson: null }),
    { sql: `DELETE FROM ${PO_EXPENSE_TABLE} WHERE id = $1`, bindValues: [linkId] },
  ]
}

/** INSERT + outbox row for an invoice ↔ expense link, for use inside executeBatch. */
export function buildCreateVendorInvoiceExpenseLinkStatements(
  id: string,
  ts: string,
  invoiceId: string,
  expenseId: string
): Stmt[] {
  return [
    {
      sql: `INSERT INTO ${INVOICE_EXPENSE_TABLE} (id, vendor_invoice_id, expense_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
      bindValues: [id, invoiceId, expenseId, ts, ts],
    },
    outboxStatementForRow({
      entity: INVOICE_EXPENSE_TABLE,
      entityId: id,
      operation: 'create',
      payloadJson: JSON.stringify({ id, vendor_invoice_id: invoiceId, expense_id: expenseId }),
    }),
  ]
}

/** Outbox row + DELETE for one invoice ↔ expense link. */
export function buildDeleteVendorInvoiceExpenseLinkStatements(linkId: string): Stmt[] {
  return [
    outboxStatementForRow({ entity: INVOICE_EXPENSE_TABLE, entityId: linkId, operation: 'delete', payloadJson: null }),
    { sql: `DELETE FROM ${INVOICE_EXPENSE_TABLE} WHERE id = $1`, bindValues: [linkId] },
  ]
}

/**
 * Create a link between a PO and an expense.
 * Validates: PO and expense exist, same production, same vendor.
 * `allocatedAmount` null = whole expense (only meaningful while the expense has a single PO).
 */
export async function createVendorPurchaseOrderExpenseLink(
  poId: string,
  expenseId: string,
  allocatedAmount: number | null = null
): Promise<VendorPurchaseOrderExpenseLink> {
  assertValidAllocatedAmount(allocatedAmount)
  const po = await getVendorPurchaseOrderById(poId)
  if (!po) throw new Error('Vendor purchase order not found or deleted')

  const db = await getDb()
  const expenseRows = await db.select<Record<string, unknown>[]>(
    `SELECT id, production_id, vendor_id, amount FROM expenses WHERE id = $1 AND deleted_at IS NULL`,
    [expenseId]
  )
  const expense = expenseRows[0]
  if (!expense) throw new Error('Expense not found or deleted')
  assertExpenseLinkableToPurchaseOrder(po, {
    production_id: expense.production_id as string,
    vendor_id: (expense.vendor_id as string | null) ?? null,
  })

  const id = uuid()
  const ts = now()
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    // Read the existing links inside the serialized slot so the pin sees committed state.
    const existingLinks = await listPurchaseOrderLinksByExpenseId(expenseId)
    await executeBatch(conn, [
      { sql: 'BEGIN', bindValues: [] },
      ...buildPinNullPoAllocationStatements(ts, existingLinks, coerceNumber(expense.amount, 0)),
      ...buildCreateVendorPurchaseOrderExpenseLinkStatements(id, ts, poId, expenseId, allocatedAmount),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${PO_EXPENSE_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToPOExpenseLink(rows[0]!)
}

/** Remove the link between a PO and an expense (outbox row + DELETE in one transaction). */
export async function deleteVendorPurchaseOrderExpenseLink(
  poId: string,
  expenseId: string
): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const rows = await db.select<{ id: string }[]>(
      `SELECT id FROM ${PO_EXPENSE_TABLE} WHERE vendor_purchase_order_id = $1 AND expense_id = $2`,
      [poId, expenseId]
    )
    if (rows.length === 0) return
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      ...buildDeleteVendorPurchaseOrderExpenseLinkStatements(rows[0]!.id),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}

/** List invoice expense links for a given expense. */
export async function listInvoiceLinksByExpenseId(
  expenseId: string
): Promise<VendorInvoiceExpenseLink[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${INVOICE_EXPENSE_TABLE} WHERE expense_id = $1 ORDER BY created_at`,
    [expenseId]
  )
  return rows.map(rowToInvoiceExpenseLink)
}

/** List PO expense links for a given expense. */
export async function listPurchaseOrderLinksByExpenseId(
  expenseId: string
): Promise<VendorPurchaseOrderExpenseLink[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${PO_EXPENSE_TABLE} WHERE expense_id = $1 ORDER BY created_at`,
    [expenseId]
  )
  return rows.map(rowToPOExpenseLink)
}

/**
 * Return set of expense IDs that are linked to any invoice or PO for this vendor.
 * Used for "expenses not linked to any invoice/PO" summary metric.
 */
export async function getLinkedExpenseIdsForVendor(
  productionId: string,
  vendorId: string
): Promise<Set<string>> {
  const db = await getDb()
  const [fromInvoices, fromPOs] = await Promise.all([
    db.select<{ expense_id: string }[]>(
      `SELECT vie.expense_id FROM ${INVOICE_EXPENSE_TABLE} vie
       INNER JOIN vendor_invoices vi ON vi.id = vie.vendor_invoice_id AND vi.deleted_at IS NULL
       WHERE vi.production_id = $1 AND vi.vendor_id = $2`,
      [productionId, vendorId]
    ),
    db.select<{ expense_id: string }[]>(
      `SELECT vpoe.expense_id FROM ${PO_EXPENSE_TABLE} vpoe
       INNER JOIN vendor_purchase_orders vpo ON vpo.id = vpoe.vendor_purchase_order_id AND vpo.deleted_at IS NULL
       WHERE vpo.production_id = $1 AND vpo.vendor_id = $2`,
      [productionId, vendorId]
    ),
  ])
  const set = new Set<string>()
  for (const r of fromInvoices) set.add(r.expense_id)
  for (const r of fromPOs) set.add(r.expense_id)
  return set
}

function rowToPoCommitmentLink(r: Record<string, unknown>): PoCommitmentLink {
  return {
    poId: r.vendor_purchase_order_id as string,
    expenseId: r.expense_id as string,
    allocatedAmount: r.allocated_amount != null ? coerceNumber(r.allocated_amount, 0) : null,
    expenseAmount: coerceNumber(r.expense_amount, 0),
    expenseLinkCount: coerceNumber(r.expense_link_count, 1),
  }
}

const COMMITMENT_SELECT = `
  SELECT vpoe.vendor_purchase_order_id, vpoe.expense_id, vpoe.allocated_amount,
         e.amount AS expense_amount,
         (SELECT COUNT(*) FROM ${PO_EXPENSE_TABLE} x
            INNER JOIN vendor_purchase_orders xp ON xp.id = x.vendor_purchase_order_id AND xp.deleted_at IS NULL
            WHERE x.expense_id = vpoe.expense_id) AS expense_link_count
  FROM ${PO_EXPENSE_TABLE} vpoe
  INNER JOIN expenses e ON e.id = vpoe.expense_id AND e.deleted_at IS NULL`

/**
 * Link rows (with expense amount and total PO-link count per expense) for the given POs.
 * Input for `computePoCommitments` in `@/lib/budget/vendors/poMatching`.
 */
export async function listPoCommitmentLinksByPurchaseOrderIds(
  poIds: string[]
): Promise<PoCommitmentLink[]> {
  if (poIds.length === 0) return []
  const db = await getDb()
  const placeholders = poIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<Record<string, unknown>[]>(
    `${COMMITMENT_SELECT} WHERE vpoe.vendor_purchase_order_id IN (${placeholders})`,
    poIds
  )
  return rows.map(rowToPoCommitmentLink)
}

/** Commitment link rows for every active PO in a production. */
export async function listPoCommitmentLinksByProduction(
  productionId: string
): Promise<PoCommitmentLink[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `${COMMITMENT_SELECT}
     INNER JOIN vendor_purchase_orders vpo ON vpo.id = vpoe.vendor_purchase_order_id AND vpo.deleted_at IS NULL
     WHERE vpo.production_id = $1`,
    [productionId]
  )
  return rows.map(rowToPoCommitmentLink)
}

/** Query key for PO commitment links: ['vendor-po-commitment-links', productionId] */
export function vendorPoCommitmentLinksQueryKey(productionId: string): readonly [string, string] {
  return ['vendor-po-commitment-links', productionId]
}
