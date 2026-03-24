/**
 * float_expense_links: petty cash float ↔ expense reconciliation.
 * Does not touch budget_item_expense_links or budget actuals.
 *
 * Multi-row inserts: runInSerializedTransaction + executeBatch(BEGIN, INSERT…, COMMIT) per DATABASE_LAYER.md.
 */

import { executeBatch, getDb, runInSerializedTransaction, uuid } from '../client'
import type { FloatExpenseLink } from '../types'
import { resolveBudgetRevisionId } from './budgetRevisions'

const TABLE = 'float_expense_links'

function sumBudgetMatchedForExpense(expenseId: string, rows: Record<string, unknown>[]): number {
  return rows
    .filter((r) => r.expense_id === expenseId)
    .reduce((s, r) => s + (Number(r.matched_amount) || 0), 0)
}

function rowToLink(r: Record<string, unknown>): FloatExpenseLink {
  return {
    id: r.id as string,
    budget_revision_id: (r.budget_revision_id as string | null) ?? null,
    float_id: r.float_id as string,
    expense_id: r.expense_id as string,
    matched_amount: Number(r.matched_amount) || 0,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    deleted_at: r.deleted_at != null ? Number(r.deleted_at) : null,
  }
}

export async function listFloatExpenseLinksByFloat(floatId: string): Promise<FloatExpenseLink[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE float_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [floatId]
  )
  return rows.map(rowToLink)
}

export async function listFloatExpenseLinksByExpense(
  expenseId: string,
  revisionId?: string | null
): Promise<FloatExpenseLink[]> {
  const db = await getDb()
  const rows =
    revisionId != null
      ? await db.select<Record<string, unknown>[]>(
          `SELECT * FROM ${TABLE}
           WHERE expense_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL
           ORDER BY created_at`,
          [expenseId, revisionId]
        )
      : await db.select<Record<string, unknown>[]>(
          `SELECT * FROM ${TABLE} WHERE expense_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
          [expenseId]
        )
  return rows.map(rowToLink)
}

/** All active float–expense links for a production (via floats). */
export async function listFloatExpenseLinksByProduction(
  productionId: string,
  revisionId?: string | null
): Promise<FloatExpenseLink[]> {
  const db = await getDb()
  const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT l.* FROM ${TABLE} l
     INNER JOIN floats f ON f.id = l.float_id AND f.deleted_at IS NULL
     WHERE f.production_id = $1 AND l.budget_revision_id = $2 AND l.deleted_at IS NULL
     ORDER BY l.created_at`,
    [productionId, budgetRevisionId]
  )
  return rows.map(rowToLink)
}

export type CreateFloatExpenseLinksParams = {
  productionId: string
  revisionId?: string | null
  floatId: string
  allocations: Array<{ expenseId: string; matchedAmount: number }>
}

/**
 * Insert one row per allocation in a single DB transaction.
 * Validates float and expenses (same production, not deleted), no duplicate expense IDs in input,
 * each matchedAmount > 0, each expense has no other active float link, and each matched amount
 * fits the expense's remaining amount after budget + any existing float allocation.
 */
export async function createFloatExpenseLinks(
  params: CreateFloatExpenseLinksParams
): Promise<FloatExpenseLink[]> {
  const { productionId, revisionId, floatId, allocations } = params

  if (allocations.length === 0) {
    throw new Error('At least one allocation is required')
  }

  const expenseIds = allocations.map((a) => a.expenseId)
  const uniqueExpense = new Set(expenseIds)
  if (uniqueExpense.size !== expenseIds.length) {
    throw new Error('Duplicate expense in allocations; each expense may appear only once')
  }

  for (const a of allocations) {
    if (a.matchedAmount <= 0) {
      throw new Error('Each allocation matchedAmount must be greater than 0')
    }
  }

  return runInSerializedTransaction(async () => {
    const db = await getDb()

    const floatRows = await db.select<Record<string, unknown>[]>(
      `SELECT id, production_id FROM floats WHERE id = $1 AND deleted_at IS NULL`,
      [floatId]
    )
    const floatRow = floatRows[0]
    if (!floatRow) throw new Error('Float not found or deleted')
    if ((floatRow.production_id as string) !== productionId) {
      throw new Error('Float does not belong to this production')
    }

    const budgetLinksRows = await db.select<Record<string, unknown>[]>(
      `SELECT expense_id, matched_amount FROM budget_item_expense_links WHERE production_id = $1 AND deleted_at IS NULL`,
      [productionId]
    )

    for (const a of allocations) {
      const expenseRows = await db.select<Record<string, unknown>[]>(
        `SELECT id, production_id, amount FROM expenses WHERE id = $1 AND deleted_at IS NULL`,
        [a.expenseId]
      )
      const exp = expenseRows[0]
      if (!exp) throw new Error(`Expense ${a.expenseId} not found or deleted`)
      if ((exp.production_id as string) !== productionId) {
        throw new Error('Expense does not belong to this production')
      }

      const existingFloatForExpense = await db.select<{ float_id: string }[]>(
        `SELECT float_id FROM ${TABLE} WHERE expense_id = $1 AND deleted_at IS NULL`,
        [a.expenseId]
      )
      if (existingFloatForExpense.length > 0) {
        const otherFloatId = existingFloatForExpense[0]!.float_id
        if (otherFloatId !== floatId) {
          throw new Error('This expense is already matched to another float')
        }
        throw new Error('This expense is already matched to this float')
      }

      const expenseAmount = Number(exp.amount) || 0
      const budgetAllocated = sumBudgetMatchedForExpense(a.expenseId, budgetLinksRows)
      const unallocated = expenseAmount - budgetAllocated
      if (a.matchedAmount > unallocated) {
        throw new Error(
          `Amount (${a.matchedAmount}) exceeds this expense's available amount after budget allocation (${unallocated})`
        )
      }
    }

    const ts = Date.now()
    const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
    ]
    for (const a of allocations) {
      statements.push({
        sql: `INSERT INTO ${TABLE} (id, budget_revision_id, float_id, expense_id, matched_amount, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        bindValues: [uuid(), budgetRevisionId, floatId, a.expenseId, a.matchedAmount, ts, ts],
      })
    }
    statements.push({ sql: 'COMMIT', bindValues: [] })

    await executeBatch(db, statements)

    return listFloatExpenseLinksByFloat(floatId)
  })
}

/** Soft-delete a float–expense link (e.g. mistaken match). */
export async function deleteFloatExpenseLink(id: string): Promise<void> {
  const db = await getDb()
  const ts = Date.now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
    [ts, ts, id]
  )
}
