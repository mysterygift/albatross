/**
 * PO matching — pure helpers for committed / remaining amounts and mismatch warnings.
 * No DB or UI dependencies. Warnings never block: the user makes the call.
 *
 * Allocation rules (see docs/vendors.md):
 * - A PO <-> expense link carries an optional `allocatedAmount`.
 * - NULL allocation + the expense linked to exactly one PO => the whole expense amount.
 * - NULL allocation + the expense linked to several POs => unallocated (counts as 0, flagged).
 *
 * Currency: expenses and allocations are in PRODUCTION currency. A PO's `amount` is in the PO's own
 * currency, so it is converted with the rate locked on the PO (`poCurrency.ts`) before any committed /
 * remaining / over-PO maths. Every amount produced here is rounded to 2dp (no float artifacts).
 */
import {
  getPoExchangeRate,
  poAmountInProductionCurrencyOrNull,
  productionAmountToPoCurrencyCeil,
  type PoCurrencyFields,
} from '@/lib/budget/vendors/poCurrency'
import { moneyEquals, roundMoney, sumMoney } from '@/lib/money/roundMoney'

/** Amounts closer than half a minor unit are treated as equal. */
export const PO_MATCH_TOLERANCE = 0.005

/** One PO the user has picked for an expense, with its (optional) allocated amount. */
export type PoAllocationInput = {
  poId: string
  allocatedAmount: number | null
}

/** Persisted PO <-> expense link plus the facts needed to resolve its effective amount. */
export type PoCommitmentLink = {
  poId: string
  expenseId: string
  allocatedAmount: number | null
  expenseAmount: number
  /**
   * Total number of PO links the expense has across ALL POs. When omitted it is derived by
   * counting this expense's rows in the list passed to the compute function, so pass either
   * this field or every link for the expense.
   */
  expenseLinkCount?: number
}

export type PoCommitment = PoCurrencyFields & {
  poId: string
  poNumber?: string
  /** Current PO value in PRODUCTION currency (converted via the locked rate); null when no value set. */
  amount: number | null
  /** The PO value as entered, in the PO's own currency; null when no value set. Defaults to `amount`. */
  poAmount?: number | null
  /** Matched spend, production currency. */
  committed: number
  /** `amount - committed` in production currency (may be negative when over); null when no value set. */
  remaining: number | null
}

export type PoMatchWarningCode =
  | 'over_po_remaining'
  | 'invoice_amount_mismatch'
  | 'invoice_on_different_po'
  | 'allocation_sum_mismatch'
  | 'allocation_missing'

export type PoMatchWarning = {
  code: PoMatchWarningCode
  message: string
  poId?: string
  invoiceId?: string
  /** Shortfall for `over_po_remaining` (how far over the remaining balance). */
  overBy?: number
  expected?: number
  actual?: number
}

const round2 = roundMoney

function fmt(n: number): string {
  return round2(n).toFixed(2)
}

/** Rounding-safe inequality of two money amounts. */
function differs(a: number, b: number): boolean {
  return !moneyEquals(a, b)
}

/** Effective amount a link charges to its PO. */
export function resolveLinkAmount(
  link: Pick<PoCommitmentLink, 'allocatedAmount' | 'expenseAmount'>,
  expenseLinkCount: number
): number {
  if (link.allocatedAmount != null) return roundMoney(link.allocatedAmount)
  return expenseLinkCount === 1 ? roundMoney(link.expenseAmount) : 0
}

/**
 * Committed amount per PO id (sum of effective link amounts).
 * `excludeExpenseId` drops one expense's links, e.g. while editing it so its own spend
 * is not double counted against the PO.
 */
export function computePoCommitted(
  links: PoCommitmentLink[],
  options: { excludeExpenseId?: string } = {}
): Record<string, number> {
  const derivedCounts = new Map<string, number>()
  for (const l of links) derivedCounts.set(l.expenseId, (derivedCounts.get(l.expenseId) ?? 0) + 1)

  const out: Record<string, number> = {}
  for (const l of links) {
    if (options.excludeExpenseId != null && l.expenseId === options.excludeExpenseId) continue
    const count = l.expenseLinkCount ?? derivedCounts.get(l.expenseId) ?? 1
    out[l.poId] = roundMoney((out[l.poId] ?? 0) + resolveLinkAmount(l, count))
  }
  return out
}

/** Remaining balance for a PO (both in the same currency); null when the PO has no value set. */
export function computePoRemaining(poAmount: number | null, committed: number): number | null {
  if (poAmount == null) return null
  return round2(poAmount - committed)
}

/** The PO fields `computePoCommitments` needs (amount + currency pair) from a PO row. */
export function toPoCommitmentInput(
  po: { id: string; po_number: string; amount: number | null } & PoCurrencyFields
): { id: string; amount: number | null; poNumber: string } & PoCurrencyFields {
  return {
    id: po.id,
    amount: po.amount,
    poNumber: po.po_number,
    currency_code: po.currency_code ?? null,
    exchange_rate: po.exchange_rate ?? null,
  }
}

/**
 * Committed / remaining for each PO (POs without links get committed 0). `pos[].amount` is in the PO's own
 * currency; pass `currency_code` / `exchange_rate` for foreign-currency POs. The result is in PRODUCTION currency.
 */
export function computePoCommitments(
  pos: Array<{ id: string; amount: number | null; poNumber?: string } & PoCurrencyFields>,
  links: PoCommitmentLink[],
  options: { excludeExpenseId?: string } = {}
): Record<string, PoCommitment> {
  const committed = computePoCommitted(links, options)
  const out: Record<string, PoCommitment> = {}
  for (const po of pos) {
    const c = round2(committed[po.id] ?? 0)
    const amount = poAmountInProductionCurrencyOrNull(po, po.amount)
    out[po.id] = {
      poId: po.id,
      poNumber: po.poNumber,
      amount,
      poAmount: po.amount == null ? null : roundMoney(po.amount),
      currency_code: po.currency_code ?? null,
      exchange_rate: po.currency_code ? getPoExchangeRate(po) : null,
      committed: c,
      remaining: computePoRemaining(amount, c),
    }
  }
  return out
}

/**
 * Resolve a draft's allocations to concrete amounts: a null allocation on a single-PO draft
 * is the whole expense; on a multi-PO draft it is unallocated (0) until the user fills it in.
 */
export function resolveDraftAllocations(
  expenseAmount: number,
  allocations: PoAllocationInput[]
): Array<{ poId: string; amount: number }> {
  return allocations.map((a) => ({
    poId: a.poId,
    amount: roundMoney(a.allocatedAmount ?? (allocations.length === 1 ? expenseAmount : 0)),
  }))
}

export type PoMatchWarningInput = {
  expenseAmount: number
  allocations: PoAllocationInput[]
  /**
   * Commitments per PO id, computed EXCLUDING the expense being matched
   * (pass `excludeExpenseId` to `computePoCommitments` when editing).
   */
  commitments: Record<string, PoCommitment>
  /** Invoice being matched, if any (existing or about to be created). */
  invoice?: {
    id?: string | null
    invoiceNumber?: string | null
    amount: number | null
    poId: string | null
  } | null
}

/** Mismatch warnings for matching an expense to POs / an invoice. Empty when everything lines up. */
export function getPoMatchWarnings(input: PoMatchWarningInput): PoMatchWarning[] {
  const { expenseAmount, allocations, commitments, invoice } = input
  const warnings: PoMatchWarning[] = []
  const resolved = resolveDraftAllocations(expenseAmount, allocations)

  // Over PO remaining.
  for (const r of resolved) {
    const c = commitments[r.poId]
    if (!c || c.remaining == null) continue
    const overBy = round2(r.amount - c.remaining)
    if (overBy > PO_MATCH_TOLERANCE) {
      const label = c.poNumber ?? 'PO'
      warnings.push({
        code: 'over_po_remaining',
        poId: r.poId,
        overBy,
        expected: c.remaining,
        actual: r.amount,
        message: `${fmt(r.amount)} exceeds the ${fmt(Math.max(c.remaining, 0))} remaining on ${label} by ${fmt(overBy)}.`,
      })
    }
  }

  // Multi-PO drafts need an explicit allocation per PO.
  if (allocations.length > 1) {
    for (const a of allocations) {
      if (a.allocatedAmount == null) {
        const label = commitments[a.poId]?.poNumber ?? 'PO'
        warnings.push({
          code: 'allocation_missing',
          poId: a.poId,
          message: `Enter how much of this spend goes to ${label}.`,
        })
      }
    }
  }

  // Allocation sum vs expense amount.
  if (resolved.length > 0) {
    const total = sumMoney(resolved.map((r) => r.amount))
    if (differs(total, expenseAmount)) {
      warnings.push({
        code: 'allocation_sum_mismatch',
        expected: expenseAmount,
        actual: total,
        message: `PO allocations total ${fmt(total)} but the spend is ${fmt(expenseAmount)}.`,
      })
    }
  }

  if (invoice) {
    // Invoice amount vs expense amount.
    if (invoice.amount != null && differs(invoice.amount, expenseAmount)) {
      const label = invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : 'The invoice'
      warnings.push({
        code: 'invoice_amount_mismatch',
        invoiceId: invoice.id ?? undefined,
        expected: expenseAmount,
        actual: invoice.amount,
        message: `${label} is ${fmt(invoice.amount)} but the spend is ${fmt(expenseAmount)}.`,
      })
    }

    // Invoice already belongs to a PO that is not among the selected POs.
    if (
      invoice.poId != null &&
      allocations.length > 0 &&
      !allocations.some((a) => a.poId === invoice.poId)
    ) {
      const label = invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : 'The invoice'
      warnings.push({
        code: 'invoice_on_different_po',
        invoiceId: invoice.id ?? undefined,
        poId: invoice.poId,
        message: `${label} is already on a different PO.`,
      })
    }
  }

  return warnings
}

/**
 * How much a PO must be raised to cover a draft allocation (0 when it already fits or has no value).
 * Drives the "Increase PO to cover" action. The allocation is in production currency; the returned
 * increase is in the PO's own currency (the shortfall converted back via the locked rate, rounded UP
 * to 2dp so the raised PO always covers the spend).
 */
export function suggestPoIncrease(commitment: PoCommitment, allocationAmount: number): number {
  if (commitment.amount == null || commitment.remaining == null) return 0
  const shortfall = round2(allocationAmount - commitment.remaining)
  if (shortfall <= 0) return 0
  return productionAmountToPoCurrencyCeil(commitment, shortfall)
}
