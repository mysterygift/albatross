import type { ReactNode } from 'react'

import type { Expense } from '@/lib/db/types'

type ExpenseDetailHeaderProps = {
  expense: Expense
  accountLabel: string
  formatAmount: (amount: number, currency: string) => { formatted: string }
  productionCurrency: string
  transactionTypeLabel?: string
  /** Status badges (e.g. "No PO" / "No proof") shown under the date. */
  badges?: ReactNode
}

export function ExpenseDetailHeader({
  expense,
  accountLabel,
  formatAmount,
  productionCurrency,
  transactionTypeLabel,
  badges,
}: ExpenseDetailHeaderProps) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{accountLabel}</p>
          <p className="text-xs text-muted-foreground">{expense.date}</p>
          {badges != null && <div className="mt-1.5 empty:hidden">{badges}</div>}
          {transactionTypeLabel != null && transactionTypeLabel !== '' && (
            <p className="text-xs text-muted-foreground mt-1">Transaction type: {transactionTypeLabel}</p>
          )}
        </div>
        <p className="text-sm font-semibold">{formatAmount(expense.amount, productionCurrency).formatted}</p>
      </div>
    </div>
  )
}
