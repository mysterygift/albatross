import type { AllowLineItemDetails } from '@/lib/budget/line-items/allow'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow } from '@/features/budget/expense-shared'
import type { LineItemReadProps } from './types'

export function AllowLineItemRead({ details, format, productionCurrency }: LineItemReadProps) {
  const d = details as AllowLineItemDetails
  const amountDisplay =
    d.provisional_amount != null && format && productionCurrency
      ? format(d.provisional_amount, productionCurrency).formatted
      : d.provisional_amount ?? '—'
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Allow details
      </p>
      <ExpenseDetailMetaGrid>
        <ExpenseDetailMetaRow label="Description" value={d.allow_description ?? '—'} />
        <ExpenseDetailMetaRow label="Provisional amount" value={amountDisplay} />
        <ExpenseDetailMetaRow label="Status" value={d.status ?? '—'} />
        <ExpenseDetailMetaRow
          label="Notes"
          value={<span className="whitespace-pre-wrap">{d.notes ?? '—'}</span>}
        />
      </ExpenseDetailMetaGrid>
    </div>
  )
}
