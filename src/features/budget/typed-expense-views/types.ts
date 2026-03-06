import type { Expense, Vendor } from '@/lib/db/types'

export type FormatAmount = (amount: number, currency: string) => { formatted: string }

export type ExpenseViewContext = {
  productionId: string
  productionCurrency: string
  format: FormatAmount
  /** For labour: resolve person_id to name */
  personById?: Map<string, { id: string; name: string; department: string | null }>
  people?: Array<{ id: string; name: string; department: string | null }>
  /** For purchase/rental: resolve location_id */
  locationById?: Map<string, { id: string; name: string; booked_status?: string }>
  locations?: Array<{ id: string; name: string }>
  vendor?: Vendor | null
  expense?: Expense
  account?: { id: string; code: string; name: string } | null
  defaultCurrencyCode?: string | null
}

export type TypedExpenseReadProps<T = unknown> = {
  parsed: T
  context: ExpenseViewContext
}

/** Use for registry: ReadComponent accepts unknown parsed and casts internally. */
export type TypedExpenseReadPropsUnknown = TypedExpenseReadProps<unknown>

export type TypedExpenseEditProps<T = unknown> = {
  expenseId: string
  detailsJson: string | null
  onSave: (details: T) => void
  onCancel: () => void
  isSaving: boolean
  context: ExpenseViewContext
}
