/**
 * Unified vendor recent activity feed (expenses, invoices, POs).
 * No new DB table; builds a combined list from existing repositories.
 */

import type { Expense, VendorInvoice, VendorPurchaseOrder } from '../types'
import { listExpensesByVendorId } from './budget'
import { listVendorInvoicesByVendorId } from './vendorInvoices'
import { listVendorPurchaseOrdersByVendorId } from './vendorPurchaseOrders'
import { getLineItemTypeConfig } from '../../budget/line-items/registry'

/** Internal shape for the Recent activity UI only. */
export type VendorActivityItem = {
  id: string
  entity_type: 'expense' | 'invoice' | 'purchase_order'
  entity_id: string
  activity_at: string
  title: string
  subtitle: string | null
  amount: number | null
  status: string | null
}

const DEFAULT_LIMIT = 8

/** Query key for vendor recent activity: ['vendor-recent-activity', productionId, vendorId] */
export function vendorRecentActivityQueryKey(
  productionId: string,
  vendorId: string
): readonly [string, string, string] {
  return ['vendor-recent-activity', productionId, vendorId]
}

function expenseToActivity(e: Expense, accountCode: string | null): VendorActivityItem {
  const typeLabel = e.transaction_type
    ? (getLineItemTypeConfig(e.transaction_type)?.label ?? e.transaction_type)
    : null
  const subtitle = [typeLabel, accountCode].filter(Boolean).join(' · ') || null
  return {
    id: `expense:${e.id}`,
    entity_type: 'expense',
    entity_id: e.id,
    activity_at: e.date,
    title: (e.notes || e.vendor || 'Expense').trim().slice(0, 60) || 'Expense',
    subtitle,
    amount: e.amount,
    status: null,
  }
}

function invoiceToActivity(inv: VendorInvoice): VendorActivityItem {
  const activity_at = inv.issue_date?.trim() ? inv.issue_date : inv.created_at
  const duePart = inv.due_date
    ? `Due ${new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : null
  const subtitle = [inv.status, duePart].filter(Boolean).join(' · ') || inv.status || null
  return {
    id: `invoice:${inv.id}`,
    entity_type: 'invoice',
    entity_id: inv.id,
    activity_at,
    title: `Invoice ${inv.invoice_number}`,
    subtitle,
    amount: inv.amount,
    status: inv.status,
  }
}

function poToActivity(po: VendorPurchaseOrder): VendorActivityItem {
  const activity_at = po.issue_date?.trim() ? po.issue_date : po.created_at
  const approvalPart = po.approval === 1 ? 'Approved' : 'Not approved'
  const subtitle = [po.status, approvalPart].filter(Boolean).join(' · ') || po.status || null
  return {
    id: `purchase_order:${po.id}`,
    entity_type: 'purchase_order',
    entity_id: po.id,
    activity_at,
    title: `PO ${po.po_number}`,
    subtitle,
    amount: po.amount,
    status: po.status,
  }
}

/**
 * Build the vendor's recent activity feed from expenses, invoices, and POs.
 * Only active records for the given production and vendor; sorted by activity_at desc; limited to limit.
 */
export async function listRecentVendorActivity(
  productionId: string,
  vendorId: string,
  limit: number = DEFAULT_LIMIT
): Promise<VendorActivityItem[]> {
  const [expenses, invoices, purchaseOrders] = await Promise.all([
    listExpensesByVendorId(productionId, vendorId),
    listVendorInvoicesByVendorId(productionId, vendorId),
    listVendorPurchaseOrdersByVendorId(productionId, vendorId),
  ])

  const { listAccounts } = await import('./budgetAccounts')
  const accounts = await listAccounts(productionId)
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  const items: VendorActivityItem[] = []

  for (const e of expenses) {
    const acc = e.account_id ? accountById.get(e.account_id) : null
    items.push(expenseToActivity(e, acc?.code ?? null))
  }
  for (const inv of invoices) {
    items.push(invoiceToActivity(inv))
  }
  for (const po of purchaseOrders) {
    items.push(poToActivity(po))
  }

  items.sort((a, b) => new Date(b.activity_at).getTime() - new Date(a.activity_at).getTime())
  return items.slice(0, limit)
}
