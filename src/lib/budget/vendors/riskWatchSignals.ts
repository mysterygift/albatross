/**
 * Risk Watch signals about PO matching and proof of spend (pure; no DB). Consumed by
 * `getVendorFinanceRiskItems`; kept separate so they can be unit tested without the database.
 */
import { expenseHasProof, type ExpenseProofCounts } from '@/lib/budget/receiptStatus'
import { isPoMatchableExpense } from '@/lib/budget/expenseFinanceFlags'
import { PO_MATCH_TOLERANCE, type PoCommitment } from '@/lib/budget/vendors/poMatching'
import type { RiskWatchItem } from '@/lib/budget/vendors/riskWatch'
import type { Expense, VendorPurchaseOrder } from '@/lib/db/types'

type SpendExpense = Pick<Expense, 'id' | 'vendor_id' | 'amount' | 'date' | 'transaction_type'>

/** A PO over-committed by more than this share of its value is critical; smaller overruns warn. */
const OVER_COMMITTED_CRITICAL_RATIO = 0.1

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

type Group = { count: number; total: number; latest: string | null }

function addToGroup(groups: Map<string | null, Group>, key: string | null, e: SpendExpense): void {
  const g = groups.get(key) ?? { count: 0, total: 0, latest: null }
  g.count += 1
  g.total += e.amount
  if (e.date && (g.latest == null || e.date > g.latest)) g.latest = e.date
  groups.set(key, g)
}

/**
 * Vendor spend that is not matched to any PO. One item per vendor, and only for vendors that have at
 * least one live (non-cancelled) PO in the production: a vendor that never uses POs is not an
 * exception. Vendorless / non vendor-type spend is ignored.
 */
export function noPoSpendItems(input: {
  expenses: readonly SpendExpense[]
  /** Live PO links per expense id (missing = 0). */
  poLinkCountByExpenseId: Readonly<Record<string, number>>
  /** Vendors that have a live, non-cancelled PO. */
  vendorIdsWithPos: ReadonlySet<string>
  vendorNameById: ReadonlyMap<string, string>
}): RiskWatchItem[] {
  const groups = new Map<string | null, Group>()
  for (const e of input.expenses) {
    if (!isPoMatchableExpense(e) || !e.vendor_id) continue
    if (!input.vendorIdsWithPos.has(e.vendor_id)) continue
    if ((input.poLinkCountByExpenseId[e.id] ?? 0) > 0) continue
    addToGroup(groups, e.vendor_id, e)
  }
  return [...groups.entries()].map(([vendorId, g]) => ({
    id: `no-po-spend-${vendorId}`,
    category: 'vendor_finance' as const,
    severity: 'warning' as const,
    title: `${input.vendorNameById.get(vendorId!) ?? 'Vendor'} has spend with no PO matched`,
    subtitle: `${plural(g.count, 'expense')} not matched to a PO`,
    amount: g.total,
    href: `/budget/vendors/${vendorId}`,
    sortDate: g.latest,
  }))
}

/**
 * Spend with no proof (receipt, or a linked invoice with a file). One item per vendor, plus one for
 * vendorless spend (petty cash).
 */
export function noProofSpendItems(input: {
  expenses: readonly SpendExpense[]
  proofByExpenseId: Readonly<Record<string, ExpenseProofCounts | undefined>>
  vendorNameById: ReadonlyMap<string, string>
}): RiskWatchItem[] {
  const groups = new Map<string | null, Group>()
  for (const e of input.expenses) {
    if (expenseHasProof(input.proofByExpenseId[e.id])) continue
    addToGroup(groups, e.vendor_id ?? null, e)
  }
  return [...groups.entries()].map(([vendorId, g]) => ({
    id: `no-proof-spend-${vendorId ?? 'no-vendor'}`,
    category: 'vendor_finance' as const,
    severity: 'warning' as const,
    title: vendorId
      ? `${input.vendorNameById.get(vendorId) ?? 'Vendor'} has spend with no proof`
      : 'Spend with no vendor and no proof',
    subtitle: `${plural(g.count, 'expense')} without a receipt or invoice file`,
    amount: g.total,
    href: vendorId ? `/budget/vendors/${vendorId}` : '/budget',
    sortDate: g.latest,
  }))
}

/** POs whose committed spend exceeds their value (cancelled POs excluded). */
export function overCommittedPoItems(input: {
  pos: readonly Pick<VendorPurchaseOrder, 'id' | 'po_number' | 'vendor_id' | 'status' | 'issue_date' | 'created_at'>[]
  commitments: Readonly<Record<string, PoCommitment>>
  vendorNameById: ReadonlyMap<string, string>
}): RiskWatchItem[] {
  const items: RiskWatchItem[] = []
  for (const po of input.pos) {
    if (po.status === 'cancelled') continue
    const c = input.commitments[po.id]
    if (!c || c.amount == null || c.remaining == null) continue
    const overBy = -c.remaining
    if (overBy <= PO_MATCH_TOLERANCE) continue
    items.push({
      id: `po-over-committed-${po.id}`,
      category: 'vendor_finance',
      severity: c.amount > 0 && overBy / c.amount > OVER_COMMITTED_CRITICAL_RATIO ? 'critical' : 'warning',
      title: `PO ${po.po_number} over-committed — ${input.vendorNameById.get(po.vendor_id) ?? 'Vendor'}`,
      subtitle: 'Matched spend exceeds the PO value',
      amount: overBy,
      href: `/budget/vendors/${po.vendor_id}?highlight=${po.id}`,
      sortDate: po.issue_date ?? po.created_at,
    })
  }
  return items
}
