/**
 * Risk Watch — vendor finance alerts for the Dashboard.
 * Read-only; derives risk items from invoice, PO, expense, and reconciliation data.
 * No UI dependencies; no new DB tables.
 */
import type {
  BudgetItemExpenseLink,
  Expense,
  VendorInvoice,
  VendorPurchaseOrder,
} from '@/lib/db/types'
import {
  getOverdueVendorInvoices,
  getVendorInvoicesDueSoon,
  getVendorPurchaseOrdersAwaitingApproval,
  getOpenVendorPurchaseOrders,
} from '@/lib/dashboard/vendorFinance'
import { getExpenseUnallocatedAmount } from '@/lib/budget/reconciliation'
import { listVendorInvoicesByProduction } from '@/lib/db/repositories/vendorInvoices'
import { listVendorPurchaseOrdersByProduction } from '@/lib/db/repositories/vendorPurchaseOrders'
import { listVendors } from '@/lib/db/repositories/vendors'
import { listExpensesByProduction } from '@/lib/db/repositories/budget'
import { listBudgetItemExpenseLinksByProduction } from '@/lib/db/repositories/budgetReconciliation'

const INVOICES_DUE_SOON_DAYS = 7
const RISK_WATCH_CAP = 20

/** Threshold in stored currency units above which an unpaid invoice is "large". */
const LARGE_UNPAID_INVOICE_THRESHOLD = 10000

/** Inactivity window: no activity in this many days triggers a signal. */
const INACTIVITY_DAYS = 60

/** Open PO total above this (stored currency) surfaces an exposure signal. */
const OPEN_PO_EXPOSURE_THRESHOLD = 10000

export type RiskWatchItem = {
  id: string
  category: 'vendor_finance'
  severity: 'warning' | 'critical'
  title: string
  subtitle: string | null
  amount: number | null
  href: string | null
  /** ISO date for sorting (due_date or issue_date). */
  sortDate: string | null
}

function formatDueDate(isoDate: string): string {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Build risk items from overdue invoices. */
function overdueInvoiceItems(
  invoices: VendorInvoice[],
  vendorNameById: Map<string, string>
): RiskWatchItem[] {
  const overdue = getOverdueVendorInvoices(invoices)
  return overdue.map((inv) => ({
    id: `overdue-invoice-${inv.id}`,
    category: 'vendor_finance' as const,
    severity: 'critical' as const,
    title: `Overdue invoice ${inv.invoice_number} — ${vendorNameById.get(inv.vendor_id) ?? 'Vendor'}`,
    subtitle: inv.due_date ? `Due ${formatDueDate(inv.due_date)}` : null,
    amount: inv.amount,
    href: `/budget/vendors/${inv.vendor_id}`,
    sortDate: inv.due_date ?? inv.created_at,
  }))
}

/** Build risk items from invoices due soon. */
function dueSoonInvoiceItems(
  invoices: VendorInvoice[],
  today: string,
  vendorNameById: Map<string, string>
): RiskWatchItem[] {
  const dueSoon = getVendorInvoicesDueSoon(invoices, today, INVOICES_DUE_SOON_DAYS)
  return dueSoon.map((inv) => ({
    id: `due-soon-invoice-${inv.id}`,
    category: 'vendor_finance' as const,
    severity: 'warning' as const,
    title: `Invoice ${inv.invoice_number} due soon — ${vendorNameById.get(inv.vendor_id) ?? 'Vendor'}`,
    subtitle: inv.due_date ? `Due ${formatDueDate(inv.due_date)}` : null,
    amount: inv.amount,
    href: `/budget/vendors/${inv.vendor_id}`,
    sortDate: inv.due_date ?? inv.created_at,
  }))
}

/** Build risk items from POs awaiting approval. */
function poAwaitingApprovalItems(
  pos: VendorPurchaseOrder[],
  vendorNameById: Map<string, string>
): RiskWatchItem[] {
  const awaiting = getVendorPurchaseOrdersAwaitingApproval(pos)
  return awaiting.map((po) => ({
    id: `po-approval-${po.id}`,
    category: 'vendor_finance' as const,
    severity: 'warning' as const,
    title: `PO ${po.po_number} awaiting approval — ${vendorNameById.get(po.vendor_id) ?? 'Vendor'}`,
    subtitle: po.issue_date ? `Issued ${formatDueDate(po.issue_date)}` : null,
    amount: po.amount,
    href: `/budget/vendors/${po.vendor_id}`,
    sortDate: po.issue_date ?? po.created_at,
  }))
}

/** Unpaid invoices with amount >= threshold. Exclude ids already in date-based alerts to avoid duplicate. */
function getLargeUnpaidVendorInvoices(
  invoices: VendorInvoice[],
  threshold: number,
  excludeInvoiceIds: Set<string>
): VendorInvoice[] {
  const today = new Date().toISOString().slice(0, 10)
  return invoices.filter(
    (inv) =>
      inv.status !== 'paid' &&
      (inv.amount ?? 0) >= threshold &&
      !excludeInvoiceIds.has(inv.id)
  )
}

/** Build risk items from large unpaid invoices (amount >= LARGE_UNPAID_INVOICE_THRESHOLD). */
function largeUnpaidInvoiceItems(
  invoices: VendorInvoice[],
  vendorNameById: Map<string, string>,
  excludeInvoiceIds: Set<string>
): RiskWatchItem[] {
  const large = getLargeUnpaidVendorInvoices(
    invoices,
    LARGE_UNPAID_INVOICE_THRESHOLD,
    excludeInvoiceIds
  )
  return large.map((inv) => ({
    id: `large-unpaid-invoice-${inv.id}`,
    category: 'vendor_finance' as const,
    severity: 'warning' as const,
    title: `Large unpaid invoice ${inv.invoice_number} — ${vendorNameById.get(inv.vendor_id) ?? 'Vendor'}`,
    subtitle: inv.due_date ? `Due ${formatDueDate(inv.due_date)}` : inv.status ?? null,
    amount: inv.amount,
    href: `/budget/vendors/${inv.vendor_id}`,
    sortDate: inv.due_date ?? inv.created_at,
  }))
}

/** Vendors that have at least one expense with unallocated amount > 0. One item per vendor. */
function getVendorsWithUnmatchedSpend(
  expenses: Expense[],
  links: BudgetItemExpenseLink[]
): { vendorId: string; count: number; totalUnallocated: number }[] {
  const byVendor = new Map<string, { count: number; total: number }>()
  for (const e of expenses) {
    if (!e.vendor_id) continue
    const unallocated = getExpenseUnallocatedAmount(e, links)
    if (unallocated <= 0) continue
    const cur = byVendor.get(e.vendor_id) ?? { count: 0, total: 0 }
    cur.count += 1
    cur.total += unallocated
    byVendor.set(e.vendor_id, cur)
  }
  return [...byVendor.entries()].map(([vendorId, v]) => ({
    vendorId,
    count: v.count,
    totalUnallocated: v.total,
  }))
}

function vendorUnmatchedSpendItems(
  vendorIdsWithUnmatched: { vendorId: string; count: number; totalUnallocated: number }[],
  vendorNameById: Map<string, string>
): RiskWatchItem[] {
  return vendorIdsWithUnmatched.map((v) => ({
    id: `unmatched-spend-${v.vendorId}`,
    category: 'vendor_finance' as const,
    severity: 'warning' as const,
    title: `${vendorNameById.get(v.vendorId) ?? 'Vendor'} has unmatched spend`,
    subtitle: `${v.count} unmatched expense${v.count !== 1 ? 's' : ''}`,
    amount: v.totalUnallocated,
    href: `/budget/vendors/${v.vendorId}`,
    sortDate: null,
  }))
}

/** Last activity date per vendor (max of expense dates, invoice dates, PO dates). */
function getVendorLastActivityMap(
  invoices: VendorInvoice[],
  pos: VendorPurchaseOrder[],
  expenses: Expense[]
): Map<string, string> {
  const byVendor = new Map<string, string>()
  const add = (vendorId: string, dateStr: string) => {
    const cur = byVendor.get(vendorId)
    if (!cur || dateStr > cur) byVendor.set(vendorId, dateStr)
  }
  for (const inv of invoices) {
    const d = inv.issue_date?.trim() ? inv.issue_date : inv.created_at
    if (d) add(inv.vendor_id, d)
  }
  for (const po of pos) {
    const d = po.issue_date?.trim() ? po.issue_date : po.created_at
    if (d) add(po.vendor_id, d)
  }
  for (const e of expenses) {
    if (e.vendor_id && e.date) add(e.vendor_id, e.date)
  }
  return byVendor
}

/** Vendors with no activity within the last inactivityWindowDays. Only vendors that have some activity. */
function getVendorsWithNoRecentActivity(
  vendorLastActivity: Map<string, string>,
  today: string,
  inactivityWindowDays: number
): string[] {
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - inactivityWindowDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const result: string[] = []
  for (const [vendorId, last] of vendorLastActivity.entries()) {
    if (last < cutoffStr) result.push(vendorId)
  }
  return result
}

function vendorInactivityItems(
  vendorIds: string[],
  vendorNameById: Map<string, string>,
  lastActivityByVendor: Map<string, string>,
  inactivityDays: number
): RiskWatchItem[] {
  return vendorIds.map((vendorId) => ({
    id: `inactivity-${vendorId}`,
    category: 'vendor_finance' as const,
    severity: 'warning' as const,
    title: `No recent activity — ${vendorNameById.get(vendorId) ?? 'Vendor'}`,
    subtitle: `No vendor activity in ${inactivityDays} days`,
    amount: null,
    href: `/budget/vendors/${vendorId}`,
    sortDate: lastActivityByVendor.get(vendorId) ?? null,
  }))
}

/** Vendors with open POs whose total amount >= threshold. One item per vendor. */
function getVendorsWithOpenPOExposure(
  pos: VendorPurchaseOrder[],
  threshold: number
): { vendorId: string; count: number; total: number }[] {
  const open = getOpenVendorPurchaseOrders(pos)
  const byVendor = new Map<string, { count: number; total: number }>()
  for (const po of open) {
    const cur = byVendor.get(po.vendor_id) ?? { count: 0, total: 0 }
    cur.count += 1
    cur.total += po.amount ?? 0
    byVendor.set(po.vendor_id, cur)
  }
  return [...byVendor.entries()]
    .filter(([, v]) => v.total >= threshold)
    .map(([vendorId, v]) => ({ vendorId, count: v.count, total: v.total }))
}

function vendorOpenPOExposureItems(
  exposure: { vendorId: string; count: number; total: number }[],
  vendorNameById: Map<string, string>
): RiskWatchItem[] {
  return exposure.map((v) => ({
    id: `open-po-exposure-${v.vendorId}`,
    category: 'vendor_finance' as const,
    severity: 'warning' as const,
    title: `Open PO exposure — ${vendorNameById.get(v.vendorId) ?? 'Vendor'}`,
    subtitle: `${v.count} open PO${v.count !== 1 ? 's' : ''}`,
    amount: v.total,
    href: `/budget/vendors/${v.vendorId}`,
    sortDate: null,
  }))
}

/** Severity order for sort: critical first, then warning. */
function severityOrder(s: RiskWatchItem['severity']): number {
  return s === 'critical' ? 0 : 1
}

/**
 * Fetches production invoices, POs, vendors, expenses, and links; builds vendor-finance Risk Watch items.
 * Includes Stage 2A (overdue, due soon, PO approval) and Stage 2B (large unpaid, unmatched spend, inactivity, open PO exposure).
 * Sorted by severity (critical first) then by sortDate descending (null last). Capped at RISK_WATCH_CAP.
 */
export async function getVendorFinanceRiskItems(productionId: string): Promise<RiskWatchItem[]> {
  const [invoices, pos, vendors, expenses, links] = await Promise.all([
    listVendorInvoicesByProduction(productionId),
    listVendorPurchaseOrdersByProduction(productionId),
    listVendors(productionId),
    listExpensesByProduction(productionId),
    listBudgetItemExpenseLinksByProduction(productionId),
  ])

  const vendorNameById = new Map(vendors.map((v) => [v.id, v.company_name]))
  const today = new Date().toISOString().slice(0, 10)

  const overdue = getOverdueVendorInvoices(invoices)
  const dueSoon = getVendorInvoicesDueSoon(invoices, today, INVOICES_DUE_SOON_DAYS)
  const excludeFromLargeUnpaid = new Set([
    ...overdue.map((i) => i.id),
    ...dueSoon.map((i) => i.id),
  ])

  const lastActivityByVendor = getVendorLastActivityMap(invoices, pos, expenses)
  const inactiveVendorIds = getVendorsWithNoRecentActivity(
    lastActivityByVendor,
    today,
    INACTIVITY_DAYS
  )
  const unmatchedVendors = getVendorsWithUnmatchedSpend(expenses, links)
  const openPOExposure = getVendorsWithOpenPOExposure(pos, OPEN_PO_EXPOSURE_THRESHOLD)

  const items: RiskWatchItem[] = [
    ...overdueInvoiceItems(invoices, vendorNameById),
    ...dueSoonInvoiceItems(invoices, today, vendorNameById),
    ...poAwaitingApprovalItems(pos, vendorNameById),
    ...largeUnpaidInvoiceItems(invoices, vendorNameById, excludeFromLargeUnpaid),
    ...vendorUnmatchedSpendItems(unmatchedVendors, vendorNameById),
    ...vendorOpenPOExposureItems(openPOExposure, vendorNameById),
    ...vendorInactivityItems(
      inactiveVendorIds,
      vendorNameById,
      lastActivityByVendor,
      INACTIVITY_DAYS
    ),
  ]

  items.sort((a, b) => {
    const sev = severityOrder(a.severity) - severityOrder(b.severity)
    if (sev !== 0) return sev
    const dateA = a.sortDate ?? ''
    const dateB = b.sortDate ?? ''
    return dateB.localeCompare(dateA)
  })

  return items.slice(0, RISK_WATCH_CAP)
}

/** Query key for Risk Watch items: ['risk-watch', productionId] */
export function riskWatchQueryKey(productionId: string): readonly [string, string] {
  return ['risk-watch', productionId]
}
