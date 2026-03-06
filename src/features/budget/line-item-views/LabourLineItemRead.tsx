import type { LabourLineItemDetails } from '@/lib/budget/line-items/labour'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow, ExpenseDetailMetaGridTwoCol } from '@/features/budget/expense-shared'
import type { LineItemReadProps } from './types'

const RATE_TYPE_LABELS: Record<string, string> = {
  prep_day: 'Prep day',
  shoot_day: 'Shoot day',
  overtime: 'Overtime',
}

export function LabourLineItemRead({ details }: LineItemReadProps) {
  const d = details as LabourLineItemDetails
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Labour details
      </p>
      <ExpenseDetailMetaGrid>
        <ExpenseDetailMetaRow
          label="Person"
          value={d.person_id ?? '—'}
        />
        <ExpenseDetailMetaRow label="Role" value={d.labour_role_label ?? '—'} />
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow
            label="Rate type"
            value={d.labour_rate_type ? RATE_TYPE_LABELS[d.labour_rate_type] ?? d.labour_rate_type : '—'}
          />
          <ExpenseDetailMetaRow label="Planned days" value={d.planned_days_count ?? '—'} />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Rate" value={d.rate_per_day ?? '—'} />
          <ExpenseDetailMetaRow label="Currency" value={d.currency_code ?? '—'} />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Start date" value={d.start_date ?? '—'} />
          <ExpenseDetailMetaRow label="End date" value={d.end_date ?? '—'} />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Unit" value={d.unit ?? '—'} />
          <ExpenseDetailMetaRow
            label="Notes"
            value={<span className="whitespace-pre-wrap">{d.notes ?? '—'}</span>}
          />
        </ExpenseDetailMetaGridTwoCol>
      </ExpenseDetailMetaGrid>
    </div>
  )
}
