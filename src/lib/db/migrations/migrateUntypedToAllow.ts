import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import type { BudgetItem, Expense } from '../types'
import {
  migratedAllowExpenseDetailsJson,
  defaultAllowLineItemDetailsJson,
} from '@/lib/budget/migrations/untypedToAllow'

const EXP_TABLE = 'expenses'
const EXP_DETAILS_TABLE = 'expense_transaction_details'
const ITEM_TABLE = 'budget_items'
const ITEM_DETAILS_TABLE = 'budget_item_details'

export type UntypedBudgetClassificationCounts = {
  untypedExpenses: number
  untypedLineItems: number
}

const migrateUntypedToAllowInflight = new Map<
  string,
  Promise<{ migratedExpenses: number; migratedLineItems: number }>
>()

function rowToExpense(r: Record<string, unknown>): Expense {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    category_id: (r.category_id as string | null) ?? null,
    account_id: (r.account_id as string | null) ?? null,
    transaction_type: (r.transaction_type as Expense['transaction_type']) ?? null,
    vendor_id: (r.vendor_id as string | null) ?? null,
    amount: (r.amount as number) ?? 0,
    date: r.date as string,
    vendor: (r.vendor as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    expense_type: (r.expense_type as Expense['expense_type']) ?? 'other',
    vat_rate_percent: (r.vat_rate_percent as number | null) ?? null,
    vat_reclaimed_amount: (r.vat_reclaimed_amount as number | null) ?? null,
    vat_reclaim_date: (r.vat_reclaim_date as string | null) ?? null,
    vat_reclaim_reference: (r.vat_reclaim_reference as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToItem(r: Record<string, unknown>): BudgetItem {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    budget_revision_id: (r.budget_revision_id as string | null) ?? null,
    category_id: r.category_id as string | null,
    account_id: r.account_id as string | null,
    description: r.description as string,
    estimated_cost: (r.estimated_cost as number) ?? 0,
    actual_cost: (r.actual_cost as number) ?? 0,
    vendor: r.vendor as string | null,
    status: (r.status as string) ?? 'draft',
    line_item_type: (r.line_item_type as BudgetItem['line_item_type']) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function countUntypedBudgetClassifications(
  productionId: string
): Promise<UntypedBudgetClassificationCounts> {
  const db = await getDb()
  const [expenseRows, itemRows] = await Promise.all([
    db.select<Array<{ cnt: number | string }>>(
      `SELECT COUNT(*) AS cnt FROM ${EXP_TABLE}
       WHERE production_id = $1 AND deleted_at IS NULL AND transaction_type IS NULL`,
      [productionId]
    ),
    db.select<Array<{ cnt: number | string }>>(
      `SELECT COUNT(*) AS cnt FROM ${ITEM_TABLE}
       WHERE production_id = $1 AND deleted_at IS NULL AND line_item_type IS NULL`,
      [productionId]
    ),
  ])

  return {
    untypedExpenses: Number(expenseRows[0]?.cnt ?? 0),
    untypedLineItems: Number(itemRows[0]?.cnt ?? 0),
  }
}

export async function migrateUntypedToAllow(productionId: string): Promise<{
  migratedExpenses: number
  migratedLineItems: number
}> {
  const existing = migrateUntypedToAllowInflight.get(productionId)
  if (existing) return existing

  const run = (async () => {
    const db = await getDb()
    const [expenseRows, itemRows] = await Promise.all([
      db.select<Record<string, unknown>[]>(
        `SELECT * FROM ${EXP_TABLE}
         WHERE production_id = $1 AND deleted_at IS NULL AND transaction_type IS NULL`,
        [productionId]
      ),
      db.select<Record<string, unknown>[]>(
        `SELECT * FROM ${ITEM_TABLE}
         WHERE production_id = $1 AND deleted_at IS NULL AND line_item_type IS NULL`,
        [productionId]
      ),
    ])

    if (expenseRows.length === 0 && itemRows.length === 0) {
      return { migratedExpenses: 0, migratedLineItems: 0 }
    }

    const ts = now()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
    ]

    for (const row of expenseRows) {
      const expense = rowToExpense(row)
      const detailsJson = migratedAllowExpenseDetailsJson(expense)
      statements.push(
        {
          sql: `UPDATE ${EXP_TABLE} SET transaction_type = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
          bindValues: ['allow', ts, expense.id],
        },
        {
          sql: `
            INSERT INTO ${EXP_DETAILS_TABLE} (id, expense_id, transaction_type, details_json, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT(expense_id) DO UPDATE SET
              transaction_type = excluded.transaction_type,
              details_json = excluded.details_json,
              updated_at = excluded.updated_at
          `,
          bindValues: [uuid(), expense.id, 'allow', detailsJson, ts, ts],
        },
        outboxStatementForRow({
          entity: EXP_TABLE,
          entityId: expense.id,
          operation: 'update',
          payloadJson: JSON.stringify({ transaction_type: 'allow' }),
        })
      )
    }

    for (const row of itemRows) {
      const item = rowToItem(row)
      const detailsJson = defaultAllowLineItemDetailsJson(item)
      statements.push(
        {
          sql: `UPDATE ${ITEM_TABLE} SET line_item_type = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
          bindValues: ['allow', ts, item.id],
        },
        {
          sql: `
            INSERT INTO ${ITEM_DETAILS_TABLE} (id, budget_item_id, line_item_type, details_json, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT(budget_item_id) DO UPDATE SET
              line_item_type = excluded.line_item_type,
              details_json = excluded.details_json,
              updated_at = excluded.updated_at
          `,
          bindValues: [uuid(), item.id, 'allow', detailsJson, ts, ts],
        },
        outboxStatementForRow({
          entity: ITEM_TABLE,
          entityId: item.id,
          operation: 'update',
          payloadJson: JSON.stringify({
            description: item.description,
            estimated_cost: item.estimated_cost,
            vendor: item.vendor,
            line_item_type: 'allow',
          }),
        })
      )
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })

    await runInSerializedTransaction(async () => {
      const batchDb = await getDb()
      await executeBatch(batchDb, statements)
    })

    return {
      migratedExpenses: expenseRows.length,
      migratedLineItems: itemRows.length,
    }
  })()

  migrateUntypedToAllowInflight.set(productionId, run)
  try {
    return await run
  } finally {
    migrateUntypedToAllowInflight.delete(productionId)
  }
}
