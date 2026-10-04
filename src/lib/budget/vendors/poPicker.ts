/**
 * PO picker + match-summary logic for the "PO & documents" section (Log Spend / expense edit).
 * Pure functions, no DB or UI dependencies, so the combobox and summary strip stay thin.
 */
import type { PurchaseOrderStatus, VendorPurchaseOrder } from '@/lib/db/types'
import { poAmountInProductionCurrencyOrNull } from '@/lib/budget/vendors/poCurrency'
import {
  computePoRemaining,
  resolveDraftAllocations,
  suggestPoIncrease,
  type PoAllocationInput,
  type PoCommitment,
} from '@/lib/budget/vendors/poMatching'

/** Statuses a PO can still be matched against by default. */
export const OPEN_PO_STATUSES: readonly PurchaseOrderStatus[] = ['issued', 'approved']

export function isOpenPoStatus(status: PurchaseOrderStatus): boolean {
  return OPEN_PO_STATUSES.includes(status)
}

/** One selectable PO with its committed / remaining balance. */
export type PoPickerRow = {
  id: string
  poNumber: string
  description: string | null
  vendorId: string
  vendorName: string
  status: PurchaseOrderStatus
  /** Current PO value in PRODUCTION currency (converted via the locked rate); null when not set. */
  amount: number | null
  /** Current PO value in the PO's own currency (as entered); null when not set. */
  poAmount: number | null
  /** NULL = production currency. */
  currency_code: string | null
  /** Locked rate (1 PO currency in production currency); null for production-currency POs. */
  exchange_rate: number | null
  /** Matched spend, production currency. */
  committed: number
  /** `amount - committed`, production currency; null when the PO has no value. */
  remaining: number | null
}

/**
 * Join POs with vendor names and commitments. `commitments` comes from `computePoCommitments`
 * (pass `excludeExpenseId` there when editing so the expense's own spend is not double counted).
 */
export function buildPoPickerRows(
  pos: Array<
    Pick<VendorPurchaseOrder, 'id' | 'po_number' | 'description' | 'vendor_id' | 'status' | 'amount'> &
      Partial<Pick<VendorPurchaseOrder, 'currency_code' | 'exchange_rate'>>
  >,
  vendorNameById: ReadonlyMap<string, string>,
  commitments: Record<string, PoCommitment>
): PoPickerRow[] {
  return pos.map((po) => {
    const c = commitments[po.id]
    const committed = c?.committed ?? 0
    return {
      id: po.id,
      poNumber: po.po_number,
      description: po.description,
      vendorId: po.vendor_id,
      vendorName: vendorNameById.get(po.vendor_id) ?? 'Unknown vendor',
      status: po.status,
      amount: c ? c.amount : poAmountInProductionCurrencyOrNull(po, po.amount),
      poAmount: po.amount,
      currency_code: po.currency_code ?? null,
      exchange_rate: po.exchange_rate ?? null,
      committed,
      remaining: c
        ? c.remaining
        : computePoRemaining(poAmountInProductionCurrencyOrNull(po, po.amount), committed),
    }
  })
}

export type PoPickerFilter = {
  /** Free text; every whitespace-separated token must appear in PO number, description or vendor name. */
  query: string
  /** Vendor currently selected on the expense (null = none). */
  vendorId: string | null
  /** Ignore the vendor scope ("search all vendors"). */
  searchAllVendors: boolean
  /** Include draft / closed / cancelled POs (default view is issued + approved only). */
  includeInactive: boolean
  /** Already-picked POs stay visible so they can be un-picked, whatever their status. */
  selectedIds?: readonly string[]
}

function matchesQuery(row: PoPickerRow, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = `${row.poNumber} ${row.description ?? ''} ${row.vendorName}`.toLowerCase()
  return tokens.every((t) => haystack.includes(t))
}

/**
 * Rows to show in the combobox: scoped to the vendor (unless "search all vendors"), open statuses
 * only (unless `includeInactive`), narrowed by the query. When the scope is wider than the vendor,
 * the vendor's own POs sort first. Input order is otherwise preserved.
 */
export function filterPoPickerRows(rows: PoPickerRow[], filter: PoPickerFilter): PoPickerRow[] {
  const selected = new Set(filter.selectedIds ?? [])
  const scoped = filter.vendorId != null && !filter.searchAllVendors
  const out = rows.filter((row) => {
    if (scoped && row.vendorId !== filter.vendorId) return false
    if (!filter.includeInactive && !isOpenPoStatus(row.status) && !selected.has(row.id)) return false
    return matchesQuery(row, filter.query)
  })
  if (filter.vendorId != null && !scoped) {
    const own = out.filter((r) => r.vendorId === filter.vendorId)
    const others = out.filter((r) => r.vendorId !== filter.vendorId)
    return [...own, ...others]
  }
  return out
}

/**
 * One-tap suggestion: the vendor's only open (issued / approved) PO, when nothing is picked yet.
 * Null when the vendor has none or several open POs.
 */
export function suggestSingleOpenPo(
  rows: PoPickerRow[],
  vendorId: string | null,
  selectedIds: readonly string[]
): PoPickerRow | null {
  if (!vendorId || selectedIds.length > 0) return null
  const open = rows.filter((r) => r.vendorId === vendorId && isOpenPoStatus(r.status))
  return open.length === 1 ? open[0]! : null
}

/** Commitments keyed by PO id, rebuilt from picker rows (feeds `getPoMatchWarnings`). */
export function commitmentsFromRows(rows: PoPickerRow[]): Record<string, PoCommitment> {
  const out: Record<string, PoCommitment> = {}
  for (const r of rows) {
    out[r.id] = {
      poId: r.id,
      poNumber: r.poNumber,
      amount: r.amount,
      poAmount: r.poAmount,
      currency_code: r.currency_code,
      exchange_rate: r.exchange_rate,
      committed: r.committed,
      remaining: r.remaining,
    }
  }
  return out
}

export type PoMatchSummaryRow = {
  poId: string
  poNumber: string
  vendorName: string
  status: PurchaseOrderStatus
  /** What this spend charges to the PO (a null allocation resolves per poMatching rules). */
  thisSpend: number
  /** PO value in the PO's own currency (print with `formatPoAmount`). */
  poAmount: number | null
  currency_code: string | null
  exchange_rate: number | null
  /** Remaining before this spend (production currency); null when the PO has no value. */
  remainingBefore: number | null
  /** Remaining after this spend (negative = over); null when the PO has no value. */
  remainingAfter: number | null
  /** Shortfall to cover with "Increase PO to cover", in the PO's own currency (rounded up); 0 when it fits. */
  increaseBy: number
}

/** Per-PO "this spend / PO amount / remaining after" rows for the live summary strip. */
export function buildPoMatchSummary(input: {
  allocations: PoAllocationInput[]
  rows: PoPickerRow[]
  expenseAmount: number
}): PoMatchSummaryRow[] {
  const byId = new Map(input.rows.map((r) => [r.id, r]))
  const commitments = commitmentsFromRows(input.rows)
  const out: PoMatchSummaryRow[] = []
  for (const r of resolveDraftAllocations(input.expenseAmount, input.allocations)) {
    const row = byId.get(r.poId)
    if (!row) continue
    const remainingAfter = row.remaining == null ? null : computePoRemaining(row.remaining, r.amount)
    out.push({
      poId: row.id,
      poNumber: row.poNumber,
      vendorName: row.vendorName,
      status: row.status,
      thisSpend: r.amount,
      poAmount: row.poAmount,
      currency_code: row.currency_code,
      exchange_rate: row.exchange_rate,
      remainingBefore: row.remaining,
      remainingAfter,
      increaseBy: suggestPoIncrease(commitments[row.id]!, r.amount),
    })
  }
  return out
}
