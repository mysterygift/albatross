/**
 * Repository for vendor finance linkages: invoice ↔ expense, PO ↔ expense.
 * No outbox for link tables; sync is driven by vendor_invoices / vendor_purchase_orders / expenses.
 */

import { getDb, now, uuid } from '../client'
import type {
  VendorInvoiceExpenseLink,
  VendorPurchaseOrderExpenseLink,
} from '../types'
import { getVendorInvoiceById } from './vendorInvoices'
import { getVendorPurchaseOrderById } from './vendorPurchaseOrders'

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
  if ((expense.production_id as string) !== invoice.production_id) {
    throw new Error('Expense does not belong to the same production as the invoice')
  }
  if ((expense.vendor_id as string | null) !== invoice.vendor_id) {
    throw new Error('Expense does not belong to the same vendor as the invoice')
  }

  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${INVOICE_EXPENSE_TABLE} (id, vendor_invoice_id, expense_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, invoiceId, expenseId, ts, ts]
  )
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${INVOICE_EXPENSE_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToInvoiceExpenseLink(rows[0]!)
}

/** Remove the link between an invoice and an expense. */
export async function deleteVendorInvoiceExpenseLink(
  invoiceId: string,
  expenseId: string
): Promise<void> {
  const db = await getDb()
  await db.execute(
    `DELETE FROM ${INVOICE_EXPENSE_TABLE} WHERE vendor_invoice_id = $1 AND expense_id = $2`,
    [invoiceId, expenseId]
  )
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

/**
 * Create a link between a PO and an expense.
 * Validates: PO and expense exist, same production, same vendor.
 */
export async function createVendorPurchaseOrderExpenseLink(
  poId: string,
  expenseId: string
): Promise<VendorPurchaseOrderExpenseLink> {
  const po = await getVendorPurchaseOrderById(poId)
  if (!po) throw new Error('Vendor purchase order not found or deleted')

  const db = await getDb()
  const expenseRows = await db.select<Record<string, unknown>[]>(
    `SELECT id, production_id, vendor_id FROM expenses WHERE id = $1 AND deleted_at IS NULL`,
    [expenseId]
  )
  const expense = expenseRows[0]
  if (!expense) throw new Error('Expense not found or deleted')
  if ((expense.production_id as string) !== po.production_id) {
    throw new Error('Expense does not belong to the same production as the PO')
  }
  if ((expense.vendor_id as string | null) !== po.vendor_id) {
    throw new Error('Expense does not belong to the same vendor as the PO')
  }

  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${PO_EXPENSE_TABLE} (id, vendor_purchase_order_id, expense_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, poId, expenseId, ts, ts]
  )
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${PO_EXPENSE_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToPOExpenseLink(rows[0]!)
}

/** Remove the link between a PO and an expense. */
export async function deleteVendorPurchaseOrderExpenseLink(
  poId: string,
  expenseId: string
): Promise<void> {
  const db = await getDb()
  await db.execute(
    `DELETE FROM ${PO_EXPENSE_TABLE} WHERE vendor_purchase_order_id = $1 AND expense_id = $2`,
    [poId, expenseId]
  )
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
