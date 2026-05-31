import type { DepositDetails } from '@/lib/budget/transactions/deposit'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow, ExpenseDetailMetaGridTwoCol } from '../expense-shared'
import type { TypedExpenseReadProps } from './types'

const REFUNDABLE_LABELS: Record<string, string> = {
  refundable: 'Refundable',
  non_refundable: 'Non-refundable',
}

export function DepositTransactionRead({ parsed, context }: TypedExpenseReadProps) {
  const d = parsed as DepositDetails
  const format = context.format
  const currency = context.productionCurrency
  const locationById = context.locationById ?? new Map()
  const loc = d.location_id ? locationById.get(d.location_id) ?? null : null
  const vendor = context.vendor

  return (
    <div className="grid gap-3">
      <ExpenseDetailMetaGrid>
        <ExpenseDetailMetaRow label="Deposit description" value={d.deposit_description} />
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow
            label="Deposit amount"
            value={format(d.amount, currency).formatted}
          />
          <ExpenseDetailMetaRow
            label="Refundable status"
            value={REFUNDABLE_LABELS[d.refundable_status] ?? d.refundable_status}
          />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaRow
          label="Vendor"
          value={vendor ? vendor.company_name : d.vendor_id ? d.vendor_id : '—'}
        />
        <ExpenseDetailMetaRow
          label="Location"
          value={
            loc ? (
              <span>
                {loc.name}
                {loc.booked_status != null && (
                  <span className="text-muted-foreground"> ({loc.booked_status})</span>
                )}
              </span>
            ) : (
              '—'
            )
          }
        />
        <ExpenseDetailMetaRow label="Notes" value={<span className="whitespace-pre-wrap">{d.notes ?? '—'}</span>} />
      </ExpenseDetailMetaGrid>
    </div>
  )
}
