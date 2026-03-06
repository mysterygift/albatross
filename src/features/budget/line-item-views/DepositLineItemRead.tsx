import type { DepositLineItemDetails } from '@/lib/budget/line-items/deposit'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow } from '@/features/budget/expense-shared'
import type { LineItemReadProps } from './types'

const REFUNDABLE_LABELS: Record<string, string> = {
  refundable: 'Refundable',
  non_refundable: 'Non-refundable',
}

export function DepositLineItemRead({ details }: LineItemReadProps) {
  const d = details as DepositLineItemDetails
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Deposit details
      </p>
      <ExpenseDetailMetaGrid>
        <ExpenseDetailMetaRow label="Description" value={d.deposit_description ?? '—'} />
        <ExpenseDetailMetaRow
          label="Refundable status"
          value={d.refundable_status ? REFUNDABLE_LABELS[d.refundable_status] ?? d.refundable_status : '—'}
        />
        <ExpenseDetailMetaRow label="Vendor" value={d.vendor_id ?? '—'} />
        <ExpenseDetailMetaRow label="Location" value={d.location_id ?? '—'} />
        <ExpenseDetailMetaRow
          label="Notes"
          value={<span className="whitespace-pre-wrap">{d.notes ?? '—'}</span>}
        />
      </ExpenseDetailMetaGrid>
    </div>
  )
}
