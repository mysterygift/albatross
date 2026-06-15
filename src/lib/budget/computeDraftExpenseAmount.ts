import { labourDetailsSchema } from '@/lib/budget/transactions/labour'
import { purchaseDetailsSchema } from '@/lib/budget/transactions/purchase'
import { rentalDetailsSchema, calculateRentalExpenseAmount } from '@/lib/budget/transactions/rental'
import { allowDetailsSchema } from '@/lib/budget/transactions/allow'
import { depositDetailsSchema } from '@/lib/budget/transactions/deposit'
import type { ExpenseTransactionType } from '@/lib/db/types'

/** Preview expense amount from a typed draft (mirrors createTypedExpense logic). */
export function computeDraftExpenseAmount(
  transactionType: ExpenseTransactionType,
  draft: unknown
): number | null {
  switch (transactionType) {
    case 'labour': {
      const parsed = labourDetailsSchema.safeParse(draft)
      if (!parsed.success) return null
      return (parsed.data.rate_per_day ?? 0) * (parsed.data.booked_days_count ?? 0)
    }
    case 'purchase': {
      const parsed = purchaseDetailsSchema.safeParse(draft)
      if (!parsed.success) return null
      const amount = parsed.data.amount ?? 0
      return amount > 0 ? amount : null
    }
    case 'rental': {
      const parsed = rentalDetailsSchema.safeParse(draft)
      if (!parsed.success) return null
      return calculateRentalExpenseAmount(parsed.data)
    }
    case 'allow': {
      const parsed = allowDetailsSchema.safeParse(draft)
      if (!parsed.success) return null
      return parsed.data.provisional_amount ?? 0
    }
    case 'deposit': {
      const parsed = depositDetailsSchema.safeParse(draft)
      if (!parsed.success) return null
      const amount = parsed.data.amount
      return amount > 0 ? amount : null
    }
    default:
      return null
  }
}
