/**
 * Dashboard vendor finance — read-only helpers for vendor invoice and PO summary cards.
 * Deterministic, production-scoped, no persistence.
 */
import type { VendorInvoice, VendorPurchaseOrder } from '@/lib/db/types'
import { listVendorInvoicesByProduction } from '@/lib/db/repositories/vendorInvoices'
import { listVendorPurchaseOrdersByProduction } from '@/lib/db/repositories/vendorPurchaseOrders'

const INVOICES_DUE_SOON_DAYS = 7

/** Overdue: due_date in the past and status not paid. */
export function getOverdueVendorInvoices(invoices: VendorInvoice[]): VendorInvoice[] {
  const today = new Date().toISOString().slice(0, 10)
  return invoices.filter(
    (inv) => inv.status !== 'paid' && inv.due_date != null && inv.due_date.trim() !== '' && inv.due_date < today
  )
}

/** Due soon: due_date within the next windowDays (default 7), status not paid. */
export function getVendorInvoicesDueSoon(
  invoices: VendorInvoice[],
  today: string,
  windowDays: number = INVOICES_DUE_SOON_DAYS
): VendorInvoice[] {
  const end = new Date(today)
  end.setDate(end.getDate() + windowDays)
  const endStr = end.toISOString().slice(0, 10)
  return invoices.filter(
    (inv) =>
      inv.status !== 'paid' &&
      inv.due_date != null &&
      inv.due_date.trim() !== '' &&
      inv.due_date >= today &&
      inv.due_date <= endStr
  )
}

/** Open POs: status not closed or cancelled. */
export function getOpenVendorPurchaseOrders(pos: VendorPurchaseOrder[]): VendorPurchaseOrder[] {
  return pos.filter((po) => po.status !== 'closed' && po.status !== 'cancelled')
}

/** POs awaiting approval: approval = 0 and status not closed or cancelled. */
export function getVendorPurchaseOrdersAwaitingApproval(pos: VendorPurchaseOrder[]): VendorPurchaseOrder[] {
  return pos.filter(
    (po) => po.approval === 0 && po.status !== 'closed' && po.status !== 'cancelled'
  )
}

export type DashboardVendorFinanceData = {
  overdueInvoices: { count: number; total: number }
  invoicesDueSoon: { count: number; total: number }
  openPOs: { count: number; total: number }
  posAwaitingApproval: { count: number; total: number }
}

/** Fetches production invoices and POs and returns summary for dashboard cards. */
export async function getDashboardVendorFinanceData(
  productionId: string
): Promise<DashboardVendorFinanceData> {
  const [invoices, pos] = await Promise.all([
    listVendorInvoicesByProduction(productionId),
    listVendorPurchaseOrdersByProduction(productionId),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const overdue = getOverdueVendorInvoices(invoices)
  const dueSoon = getVendorInvoicesDueSoon(invoices, today, INVOICES_DUE_SOON_DAYS)
  const openPOs = getOpenVendorPurchaseOrders(pos)
  const awaitingApproval = getVendorPurchaseOrdersAwaitingApproval(pos)

  return {
    overdueInvoices: {
      count: overdue.length,
      total: overdue.reduce((s, inv) => s + (inv.amount ?? 0), 0),
    },
    invoicesDueSoon: {
      count: dueSoon.length,
      total: dueSoon.reduce((s, inv) => s + (inv.amount ?? 0), 0),
    },
    openPOs: {
      count: openPOs.length,
      total: openPOs.reduce((s, po) => s + (po.amount ?? 0), 0),
    },
    posAwaitingApproval: {
      count: awaitingApproval.length,
      total: awaitingApproval.reduce((s, po) => s + (po.amount ?? 0), 0),
    },
  }
}

/** Query key for dashboard vendor finance: ['dashboard-vendor-finance', productionId] */
export function dashboardVendorFinanceQueryKey(productionId: string): readonly [string, string] {
  return ['dashboard-vendor-finance', productionId]
}
