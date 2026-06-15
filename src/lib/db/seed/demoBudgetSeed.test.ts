import { describe, expect, it } from 'vitest'
import {
  buildDefaultAllowLineItemDetails,
  buildMigratedAllowExpenseDetails,
} from '@/lib/budget/migrations/untypedToAllow'
import { allowDetailsToJson } from '@/lib/budget/transactions/allow'
import { allowLineItemDetailsToJson } from '@/lib/budget/line-items/allow'
import { DEMO_BUDGET_ITEMS, DEMO_EXPENSES } from '@/lib/db/seed/demoBudgetSeed'

describe('demoBudgetSeed Allow classification', () => {
  it('builds valid Allow details for representative demo line items', () => {
    const item = DEMO_BUDGET_ITEMS[0]!
    const details = buildDefaultAllowLineItemDetails({
      description: item.description,
      estimated_cost: item.estimated_cost,
    })
    expect(details.status).toBe('open')
    expect(() => allowLineItemDetailsToJson(details)).not.toThrow()
  })

  it('builds valid Allow details for representative demo expenses', () => {
    const expense = DEMO_EXPENSES[0]!
    const details = buildMigratedAllowExpenseDetails({
      notes: expense.notes ?? null,
      vendor: expense.vendor ?? null,
      amount: expense.amount,
    })
    expect(details.status).toBe('resolved')
    expect(() => allowDetailsToJson(details)).not.toThrow()
  })
})
