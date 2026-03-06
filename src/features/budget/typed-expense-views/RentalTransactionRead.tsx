import {
  type RentalDetails,
  computeRentalDays,
  getEffectiveRentalDays,
  calculateRentalExpenseAmount,
} from '@/lib/budget/transactions/rental'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow, ExpenseDetailMetaGridTwoCol } from '../expense-shared'
import type { TypedExpenseReadProps } from './types'

export function RentalTransactionRead({ parsed, context }: TypedExpenseReadProps) {
  const d = parsed as RentalDetails
  const format = context.format
  const currency = context.productionCurrency
  const expense = context.expense
  const vendor = context.vendor
  const computedDays = computeRentalDays(d.rental_start_date, d.rental_end_date)
  const effectiveDays = getEffectiveRentalDays(d)
  const calculatedTotal = calculateRentalExpenseAmount(d)
  const primaryContact =
    d.primary_contact_override?.trim().length
      ? d.primary_contact_override.trim()
      : vendor
        ? [vendor.primary_contact_full_name, vendor.primary_contact_email].filter(Boolean).join(' · ')
        : null

  return (
    <div className="grid gap-3">
      <ExpenseDetailMetaGrid>
        <ExpenseDetailMetaRow label="Rental description" value={d.rental_description} />
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Rate type" value={d.rental_rate_type} />
          <ExpenseDetailMetaRow
            label="Rate amount"
            value={d.rental_rate_amount != null ? format(d.rental_rate_amount, currency).formatted : '—'}
          />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Start date" value={d.rental_start_date ?? '—'} />
          <ExpenseDetailMetaRow label="End date" value={d.rental_end_date ?? '—'} />
        </ExpenseDetailMetaGridTwoCol>
        <div className="grid grid-cols-3 gap-3">
          <ExpenseDetailMetaRow label="Computed rental days" value={computedDays ?? '—'} />
          <ExpenseDetailMetaRow label="Override days" value={d.rental_period_override_days ?? '—'} />
          <ExpenseDetailMetaRow label="Effective rental days" value={effectiveDays ?? '—'} />
        </div>
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow
            label="Calculated total"
            value={calculatedTotal != null ? format(calculatedTotal, currency).formatted : '—'}
          />
          <ExpenseDetailMetaRow
            label="Expense amount"
            value={expense ? format(expense.amount, currency).formatted : '—'}
          />
        </ExpenseDetailMetaGridTwoCol>
        <ExpenseDetailMetaRow label="Equipment" value={d.equipment_description ?? '—'} />
        <ExpenseDetailMetaRow
          label="Vendor"
          value={
            vendor ? (
              <div className="space-y-1">
                <p className="font-medium">{vendor.company_name}</p>
                {vendor.primary_contact_full_name && (
                  <p className="text-muted-foreground">{vendor.primary_contact_full_name}</p>
                )}
                {vendor.primary_contact_email && (
                  <p className="text-muted-foreground">{vendor.primary_contact_email}</p>
                )}
              </div>
            ) : d.vendor_id ? (
              d.vendor_id
            ) : (
              '—'
            )
          }
        />
        <ExpenseDetailMetaRow label="Primary contact" value={primaryContact ?? '—'} />
        <ExpenseDetailMetaRow label="Notes" value={<span className="whitespace-pre-wrap">{d.notes ?? '—'}</span>} />
      </ExpenseDetailMetaGrid>
    </div>
  )
}
