import type { Expense, VatReclaimRate, VatReclaimTransactionType } from '@/lib/db/types'

export type ExpenseVatReclaimBreakdown = {
  expenseId: string
  vatPaid: number
  vatReclaimable: number
  vatReclaimed: number
  vatOutstanding: number
}

export type VatReclaimTotalsResult = {
  perExpense: ExpenseVatReclaimBreakdown[]
  totalVatPaid: number
  totalVatReclaimable: number
  totalVatReclaimed: number
  totalVatOutstanding: number
}

export function vatReclaimTypeKey(
  transactionType: Expense['transaction_type']
): VatReclaimTransactionType {
  return transactionType ?? 'untyped'
}

export function buildVatReclaimRateMap(
  rates: VatReclaimRate[]
): Map<VatReclaimTransactionType, number> {
  const map = new Map<VatReclaimTransactionType, number>()
  for (const r of rates) {
    map.set(r.transaction_type, r.reclaim_percent)
  }
  return map
}

export function computeVatPaid(expense: Pick<Expense, 'amount' | 'vat_rate_percent'>): number {
  if (expense.vat_rate_percent == null || expense.vat_rate_percent <= 0) return 0
  return expense.amount * (expense.vat_rate_percent / 100)
}

export function computeExpenseVatReclaim(
  expense: Pick<
    Expense,
    | 'id'
    | 'amount'
    | 'vat_rate_percent'
    | 'transaction_type'
    | 'vat_reclaimed_amount'
  >,
  reclaimRateMap: Map<VatReclaimTransactionType, number>
): ExpenseVatReclaimBreakdown {
  const vatPaid = computeVatPaid(expense)
  const typeKey = vatReclaimTypeKey(expense.transaction_type)
  const reclaimPercent = reclaimRateMap.get(typeKey) ?? 0
  const vatReclaimable = vatPaid * (reclaimPercent / 100)
  const vatReclaimed = expense.vat_reclaimed_amount ?? 0
  const vatOutstanding = Math.max(0, vatReclaimable - vatReclaimed)

  return {
    expenseId: expense.id,
    vatPaid,
    vatReclaimable,
    vatReclaimed,
    vatOutstanding,
  }
}

export function computeVatReclaimTotals(
  expenses: Expense[],
  rates: VatReclaimRate[]
): VatReclaimTotalsResult {
  const reclaimRateMap = buildVatReclaimRateMap(rates)
  const perExpense = expenses.map((e) => computeExpenseVatReclaim(e, reclaimRateMap))
  let totalVatPaid = 0
  let totalVatReclaimable = 0
  let totalVatReclaimed = 0
  let totalVatOutstanding = 0
  for (const row of perExpense) {
    totalVatPaid += row.vatPaid
    totalVatReclaimable += row.vatReclaimable
    totalVatReclaimed += row.vatReclaimed
    totalVatOutstanding += row.vatOutstanding
  }
  return {
    perExpense,
    totalVatPaid,
    totalVatReclaimable,
    totalVatReclaimed,
    totalVatOutstanding,
  }
}
