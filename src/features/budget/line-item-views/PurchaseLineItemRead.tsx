import type { PurchaseLineItemDetails } from '@/lib/budget/line-items/purchase'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow } from '@/features/budget/expense-shared'
import type { LineItemReadProps } from './types'

export function PurchaseLineItemRead({ details, format, productionCurrency }: LineItemReadProps) {
  const d = details as PurchaseLineItemDetails
  const amountDisplay =
    d.amount != null && format && productionCurrency
      ? format(d.amount, productionCurrency).formatted
      : d.amount ?? '—'
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Purchase details
      </p>
      <ExpenseDetailMetaGrid>
        <ExpenseDetailMetaRow label="Description" value={d.purchase_description ?? '—'} />
        <ExpenseDetailMetaRow label="Category" value={d.purchase_category ?? '—'} />
        <ExpenseDetailMetaRow
          label="Purchase type"
          value={d.is_service_purchase ? 'Service' : 'Physical goods'}
        />
        {d.is_service_purchase && (
          <ExpenseDetailMetaRow
            label="Service description"
            value={d.service_description ?? '—'}
          />
        )}
        <ExpenseDetailMetaRow label="Location" value={d.location_id ?? '—'} />
        <ExpenseDetailMetaRow label="Vendor" value={d.vendor_id ?? '—'} />
        <ExpenseDetailMetaRow label="Amount" value={amountDisplay} />
        <ExpenseDetailMetaRow
          label="Notes"
          value={<span className="whitespace-pre-wrap">{d.notes ?? '—'}</span>}
        />
      </ExpenseDetailMetaGrid>
    </div>
  )
}
