import type { PurchaseDetails } from '@/lib/budget/transactions/purchase'
import { ExpenseDetailMetaGrid, ExpenseDetailMetaRow, ExpenseDetailMetaGridTwoCol } from '../expense-shared'
import type { TypedExpenseReadProps } from './types'

export function PurchaseTransactionRead({ parsed, context }: TypedExpenseReadProps) {
  const d = parsed as PurchaseDetails
  const locationById = context.locationById ?? new Map()
  const loc = d.location_id ? locationById.get(d.location_id) ?? null : null
  const vendor = context.vendor
  return (
    <div className="grid gap-3">
      <ExpenseDetailMetaGrid>
        <ExpenseDetailMetaRow label="Purchase description" value={d.purchase_description} />
        <ExpenseDetailMetaGridTwoCol>
          <ExpenseDetailMetaRow label="Category" value={d.purchase_category ?? '—'} />
          <ExpenseDetailMetaRow label="Service purchase" value={d.is_service_purchase ? 'Yes' : 'No'} />
        </ExpenseDetailMetaGridTwoCol>
        {d.is_service_purchase && (
          <ExpenseDetailMetaRow
            label="Service description"
            value={<span className="whitespace-pre-wrap">{d.service_description ?? '—'}</span>}
          />
        )}
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
        <ExpenseDetailMetaRow
          label="Vendor"
          value={vendor ? vendor.company_name : d.vendor_id ? d.vendor_id : '—'}
        />
        <ExpenseDetailMetaRow label="Notes" value={<span className="whitespace-pre-wrap">{d.notes ?? '—'}</span>} />
      </ExpenseDetailMetaGrid>
    </div>
  )
}
