/**
 * Demo production expense-to-budget-item reconciliation seed.
 * Used when initialising a new demo project (ensureDemoData / resetDemoData → runFullSeed).
 * Seeds: budget_item_expense_links for a subset of demo expenses. Call after seedDemoBudget.
 * Deterministic and demo-only. Does not mutate expenses.amount or budget_items.estimated_cost.
 */
import { DEMO_BUDGET_ITEMS, DEMO_EXPENSES } from './demoBudgetSeed'
import { executeBatch, getDb, runInSerializedTransaction } from '../client'
import { IDS } from './constants'

const TABLE_LINKS = 'budget_item_expense_links'

/**
 * Deterministic demo links: expense_idx (0-based), budget_item_index (1-based), matched_amount.
 * Some use full amount, some partial (to show expense "partially allocated" state).
 */
export const DEMO_LINKS: { expenseIdx: number; budgetItemIndex: number; matchedAmount: number }[] = [
  { expenseIdx: 0, budgetItemIndex: 19, matchedAmount: 5000 }, // 2304 legal: full
  { expenseIdx: 3, budgetItemIndex: 22, matchedAmount: 12500 }, // 2406 camera: full
  { expenseIdx: 5, budgetItemIndex: 14, matchedAmount: 5500 }, // 1502 cast accommodation: partial line
  { expenseIdx: 7, budgetItemIndex: 44, matchedAmount: 5400 }, // 3409 catering: partial line
  { expenseIdx: 8, budgetItemIndex: 26, matchedAmount: 600 }, // 2507 fuel: partial line
  { expenseIdx: 9, budgetItemIndex: 39, matchedAmount: 850 }, // 3105 permit: full
  { expenseIdx: 10, budgetItemIndex: 32, matchedAmount: 3000 }, // 2905 costume: partial expense (4000 total, 3000 linked)
  { expenseIdx: 15, budgetItemIndex: 42, matchedAmount: 3200 }, // 4103 edit suite: partial line
  { expenseIdx: 16, budgetItemIndex: 47, matchedAmount: 3500 }, // 4302 DCP: full
]

/**
 * Seed demo budget_item_expense_links. Creates a realistic mix of:
 * - fully matched (expense fully allocated to one line item)
 * - partially matched (line item or expense partially allocated)
 * - unallocated expenses left intentionally (indices 1,2,4,6,11,12,13,14,17,18,19)
 *
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md.
 */
export async function seedDemoReconciliation(
  pid: string,
  ts: string,
  budgetItemId: (n: number) => string,
  expenseId: (n: number) => string,
  linkId: (n: number) => string = (n) => IDS.reconciliationLink(n)
): Promise<void> {
  // Validate: budget item indices exist and matched_amount <= expense.amount
  for (const link of DEMO_LINKS) {
    const exp = DEMO_EXPENSES[link.expenseIdx]
    if (!exp || link.matchedAmount > exp.amount) {
      throw new Error(
        `Demo reconciliation: invalid link expenseIdx=${link.expenseIdx} matchedAmount=${link.matchedAmount}`
      )
    }
    const item = DEMO_BUDGET_ITEMS[link.budgetItemIndex - 1]
    if (!item) {
      throw new Error(
        `Demo reconciliation: invalid budgetItemIndex=${link.budgetItemIndex}`
      )
    }
  }

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    for (let i = 0; i < DEMO_LINKS.length; i++) {
      const link = DEMO_LINKS[i]!
      const expenseIdVal = expenseId(link.expenseIdx + 1)
      const budgetItemIdVal = budgetItemId(link.budgetItemIndex)
      const linkIdVal = linkId(i + 1)

      statements.push({
        sql: `INSERT INTO ${TABLE_LINKS} (id, production_id, budget_item_id, expense_id, matched_amount, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        bindValues: [
          linkIdVal,
          pid,
          budgetItemIdVal,
          expenseIdVal,
          link.matchedAmount,
          ts,
          ts,
        ],
      })
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}
