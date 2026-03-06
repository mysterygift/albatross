import type { LabourDetails } from '@/lib/budget/transactions/labour'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow, ExpenseDetailMetaGridTwoCol } from '../expense-shared'
import type { TypedExpenseReadProps } from './types'

export function LabourTransactionRead({ parsed, context }: TypedExpenseReadProps) {
  const d = parsed as LabourDetails
  const personById = context.personById ?? new Map()
  return (
    <div className="grid gap-3">
      <ExpenseDetailMetaGrid>
        <ExpenseDetailMetaRow
          label="Person"
          value={d.person_id ? (personById.get(d.person_id)?.name ?? d.person_id) : '—'}
        />
        <ExpenseDetailMetaRow label="Labour role" value={d.labour_role_label} />
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Rate type" value={d.labour_rate_type} />
          <ExpenseDetailMetaRow label="Booked days" value={d.booked_days_count ?? '—'} />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Rate per day" value={d.rate_per_day ?? '—'} />
          <ExpenseDetailMetaRow label="Currency" value={d.currency_code ?? '—'} />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Start date" value={d.start_date ?? '—'} />
          <ExpenseDetailMetaRow label="End date" value={d.end_date ?? '—'} />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Unit" value={d.unit ?? '—'} />
          <ExpenseDetailMetaRow label="Notes" value={<span className="whitespace-pre-wrap">{d.notes ?? '—'}</span>} />
        </ExpenseDetailMetaGridTwoCol>
      </ExpenseDetailMetaGrid>
    </div>
  )
}
