import type { AllowDetails } from '@/lib/budget/transactions/allow'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow, ExpenseDetailMetaGridTwoCol } from '../expense-shared'
import type { TypedExpenseReadProps } from './types'

export function AllowTransactionRead({ parsed, context }: TypedExpenseReadProps) {
  const d = parsed as AllowDetails
  const format = context.format
  const currency = context.productionCurrency
  return (
    <div className="grid gap-3">
      <ExpenseDetailMetaGrid>
        <ExpenseDetailMetaRow label="Allow description" value={d.allow_description} />
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow
            label="Provisional amount"
            value={d.provisional_amount != null ? format(d.provisional_amount, currency).formatted : '—'}
          />
          <ExpenseDetailMetaRow label="Status" value={d.status === 'open' ? 'Open' : 'Resolved'} />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaRow label="Notes" value={<span className="whitespace-pre-wrap">{d.notes ?? '—'}</span>} />
      </ExpenseDetailMetaGrid>
    </div>
  )
}
