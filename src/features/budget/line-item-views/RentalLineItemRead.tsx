import type { RentalLineItemDetails } from '@/lib/budget/line-items/rental'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow, ExpenseDetailMetaGridTwoCol } from '@/features/budget/expense-shared'
import type { LineItemReadProps } from './types'

const RATE_TYPE_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  flat: 'Flat',
}

export function RentalLineItemRead({ details }: LineItemReadProps) {
  const d = details as RentalLineItemDetails
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Rental details
      </p>
      <ExpenseDetailMetaGrid>
        <ExpenseDetailMetaRow label="Description" value={d.rental_description ?? '—'} />
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow
            label="Rate type"
            value={d.rental_rate_type ? RATE_TYPE_LABELS[d.rental_rate_type] ?? d.rental_rate_type : '—'}
          />
          <ExpenseDetailMetaRow label="Rate amount" value={d.rental_rate_amount ?? '—'} />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Start date" value={d.rental_start_date ?? '—'} />
          <ExpenseDetailMetaRow label="End date" value={d.rental_end_date ?? '—'} />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaRow label="Override days" value={d.rental_period_override_days ?? '—'} />
        <ExpenseDetailMetaRow label="Equipment" value={d.equipment_description ?? '—'} />
        <ExpenseDetailMetaRow label="Vendor" value={d.vendor_id ?? '—'} />
        <ExpenseDetailMetaRow
          label="Notes"
          value={<span className="whitespace-pre-wrap">{d.notes ?? '—'}</span>}
        />
      </ExpenseDetailMetaGrid>
    </div>
  )
}
