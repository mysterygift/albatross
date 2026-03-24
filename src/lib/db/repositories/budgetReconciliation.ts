/**
 * Repository for budget_item_expense_links (line item ↔ expense reconciliation).
 * Supports partial matching; estimated_cost and expenses.amount remain source of truth.
 *
 * Sync/outbox: Reconciliation links are not synced to external systems; no outbox rows
 * are written for this table. Sync is driven by budget_items and expenses if needed.
 *
 * Writes follow docs/DATABASE_LAYER.md: runInSerializedTransaction + one executeBatch per
 * logical persist (multi-row INSERT = single round-trip, atomic without nested BEGIN/COMMIT).
 */

import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import type { BudgetItemExpenseLink } from '../types'
import { resolveBudgetRevisionId } from './budgetRevisions'

const TABLE = 'budget_item_expense_links'

function rowToLink(r: Record<string, unknown>): BudgetItemExpenseLink {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    budget_revision_id: (r.budget_revision_id as string | null) ?? null,
    budget_item_id: r.budget_item_id as string,
    expense_id: r.expense_id as string,
    matched_amount: (r.matched_amount as number) ?? 0,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** Returns all non-deleted links for the production. */
export async function listBudgetItemExpenseLinksByProduction(
  productionId: string,
  revisionId?: string | null
): Promise<BudgetItemExpenseLink[]> {
  const db = await getDb()
  const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL ORDER BY created_at`,
    [productionId, budgetRevisionId]
  )
  return rows.map(rowToLink)
}

/** Returns all non-deleted links for that line item. */
export async function listBudgetItemExpenseLinksForBudgetItem(
  budgetItemId: string,
  revisionId?: string | null
): Promise<BudgetItemExpenseLink[]> {
  const db = await getDb()
  const revisionClause = revisionId ? ' AND budget_revision_id = $2' : ''
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE budget_item_id = $1${revisionClause} AND deleted_at IS NULL ORDER BY created_at`,
    revisionId ? [budgetItemId, revisionId] : [budgetItemId]
  )
  return rows.map(rowToLink)
}

/** Returns all non-deleted links for that expense. */
export async function listBudgetItemExpenseLinksForExpense(
  expenseId: string,
  revisionId?: string | null
): Promise<BudgetItemExpenseLink[]> {
  const db = await getDb()
  const revisionClause = revisionId ? ' AND budget_revision_id = $2' : ''
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE expense_id = $1${revisionClause} AND deleted_at IS NULL ORDER BY created_at`,
    revisionId ? [expenseId, revisionId] : [expenseId]
  )
  return rows.map(rowToLink)
}

/**
 * Create a new link. Validates: budget item and expense exist, not deleted, same production, matchedAmount > 0.
 * Enforces one active link per (budget_item_id, expense_id) via unique index.
 */
export async function createBudgetItemExpenseLink(data: {
  productionId: string
  revisionId?: string | null
  budgetItemId: string
  expenseId: string
  matchedAmount: number
}): Promise<BudgetItemExpenseLink> {
  if (data.matchedAmount <= 0) {
    throw new Error('matchedAmount must be greater than 0')
  }
  const db = await getDb()

  const [itemRows, expenseRows] = await Promise.all([
    db.select<Record<string, unknown>[]>(
      `SELECT id, production_id FROM budget_items WHERE id = $1 AND deleted_at IS NULL`,
      [data.budgetItemId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT id, production_id FROM expenses WHERE id = $1 AND deleted_at IS NULL`,
      [data.expenseId]
    ),
  ])

  const item = itemRows[0]
  const expense = expenseRows[0]
  if (!item) throw new Error('Budget item not found or deleted')
  if (!expense) throw new Error('Expense not found or deleted')
  if ((item.production_id as string) !== data.productionId) {
    throw new Error('Budget item does not belong to this production')
  }
  if ((expense.production_id as string) !== data.productionId) {
    throw new Error('Expense does not belong to this production')
  }

  const id = uuid()
  const ts = now()
  const budgetRevisionId = await resolveBudgetRevisionId({
    productionId: data.productionId,
    revisionId: data.revisionId,
  })
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, budget_revision_id, budget_item_id, expense_id, matched_amount, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      data.productionId,
      budgetRevisionId,
      data.budgetItemId,
      data.expenseId,
      data.matchedAmount,
      ts,
      ts,
    ]
  )
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToLink(rows[0]!)
}

export type CreateBudgetItemExpenseLinksParams = {
  productionId: string
  revisionId?: string | null
  expenseId: string
  allocations: Array<{ budgetItemId: string; matchedAmount: number }>
}

/**
 * Create one link per allocation in a single atomic transaction.
 * Validation: expense and each budget item exist, not deleted, belong to productionId;
 * matchedAmount > 0; no duplicate budgetItemId; sum(matchedAmount) <= expense's current unallocated amount.
 * Overspend of a line item (matched > estimated_cost) is allowed and not validated here.
 */
export async function createBudgetItemExpenseLinks(
  params: CreateBudgetItemExpenseLinksParams
): Promise<BudgetItemExpenseLink[]> {
  const { productionId, revisionId, expenseId, allocations } = params

  if (allocations.length === 0) {
    throw new Error('At least one allocation is required')
  }

  const budgetItemIds = allocations.map((a) => a.budgetItemId)
  const uniqueIds = new Set(budgetItemIds)
  if (uniqueIds.size !== budgetItemIds.length) {
    throw new Error('Duplicate budget item in allocations; each line item may appear only once')
  }

  for (const a of allocations) {
    if (a.matchedAmount <= 0) {
      throw new Error('Each allocation matchedAmount must be greater than 0')
    }
  }

  return runInSerializedTransaction(async () => {
    const db = await getDb()

    const [expenseRows, existingLinksRows] = await Promise.all([
      db.select<Record<string, unknown>[]>(
        `SELECT id, production_id, amount FROM expenses WHERE id = $1 AND deleted_at IS NULL`,
        [expenseId]
      ),
      db.select<Record<string, unknown>[]>(
        `SELECT matched_amount FROM ${TABLE} WHERE expense_id = $1 AND deleted_at IS NULL`,
        [expenseId]
      ),
    ])

    const expense = expenseRows[0]
    if (!expense) throw new Error('Expense not found or deleted')
    if ((expense.production_id as string) !== productionId) {
      throw new Error('Expense does not belong to this production')
    }

    const expenseAmount = (expense.amount as number) ?? 0
    const currentAllocated = existingLinksRows.reduce(
      (sum, r) => sum + (Number((r as { matched_amount: unknown }).matched_amount) || 0),
      0
    )
    const unallocated = expenseAmount - currentAllocated
    const sumNew = allocations.reduce((s, a) => s + a.matchedAmount, 0)
    if (sumNew > unallocated) {
      throw new Error(
        `Total allocation (${sumNew}) exceeds the expense's current unallocated amount (${unallocated})`
      )
    }

    for (const a of allocations) {
      const itemRows = await db.select<Record<string, unknown>[]>(
        `SELECT id, production_id FROM budget_items WHERE id = $1 AND deleted_at IS NULL`,
        [a.budgetItemId]
      )
      const item = itemRows[0]
      if (!item) throw new Error(`Budget item ${a.budgetItemId} not found or deleted`)
      if ((item.production_id as string) !== productionId) {
        throw new Error('Budget item does not belong to this production')
      }
    }

    const ts = now()
    const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
    // One multi-row INSERT = one combined db.execute (DATABASE_LAYER.md §3); avoids explicit
    // BEGIN/COMMIT inside the batch, which can interact badly with the pooled driver (see
    // demoProductionSeed verifyCascades note and §8 demo booking seed pattern).
    const valueGroups: string[] = []
    const insertBind: unknown[] = []
    let param = 1
    for (const a of allocations) {
      valueGroups.push(
        `($${param}, $${param + 1}, $${param + 2}, $${param + 3}, $${param + 4}, $${param + 5}, $${param + 6}, $${param + 7})`
      )
      param += 8
      insertBind.push(uuid(), productionId, budgetRevisionId, a.budgetItemId, expenseId, a.matchedAmount, ts, ts)
    }
    const insertSql = `INSERT INTO ${TABLE} (id, production_id, budget_revision_id, budget_item_id, expense_id, matched_amount, created_at, updated_at) VALUES ${valueGroups.join(', ')}`
    await executeBatch(db, [{ sql: insertSql, bindValues: insertBind }])

    const links = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TABLE} WHERE expense_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
      [expenseId]
    )
    return links.map(rowToLink)
  })
}

/**
 * Update matched_amount. Validates matchedAmount > 0 and that the expense's total
 * allocated amount (from current DB state) does not exceed expense.amount.
 * Overspend of a line item (matched > estimated_cost) is allowed and not validated.
 */
export async function updateBudgetItemExpenseLink(data: {
  id: string
  matchedAmount: number
}): Promise<BudgetItemExpenseLink> {
  if (data.matchedAmount <= 0) {
    throw new Error('matchedAmount must be greater than 0')
  }
  const db = await getDb()

  const linkRows = await db.select<Record<string, unknown>[]>(
    `SELECT id, expense_id, budget_item_id, matched_amount FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [data.id]
  )
  const linkRow = linkRows[0]
  if (!linkRow) throw new Error('Link not found or deleted')
  const expenseId = linkRow.expense_id as string

  const [expenseRows, allLinksRows] = await Promise.all([
    db.select<Record<string, unknown>[]>(
      `SELECT amount FROM expenses WHERE id = $1 AND deleted_at IS NULL`,
      [expenseId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT id, matched_amount FROM ${TABLE} WHERE expense_id = $1 AND deleted_at IS NULL`,
      [expenseId]
    ),
  ])
  const expense = expenseRows[0]
  if (!expense) throw new Error('Expense not found or deleted')
  const expenseAmount = (expense.amount as number) ?? 0
  const otherLinksSum = (allLinksRows as Array<{ id: string; matched_amount: number }>).reduce(
    (sum, r) => (r.id === data.id ? sum : sum + (r.matched_amount ?? 0)),
    0
  )
  const maxAllowed = expenseAmount - otherLinksSum
  if (data.matchedAmount > maxAllowed) {
    throw new Error(
      `Updated amount (${data.matchedAmount}) would exceed the expense's available unallocated amount (max ${maxAllowed} for this link)`
    )
  }

  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET matched_amount = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
    [data.matchedAmount, ts, data.id]
  )
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [data.id])
  if (!rows.length) throw new Error('Link not found or deleted')
  return rowToLink(rows[0]!)
}

/** Soft delete by setting deleted_at. */
export async function deleteBudgetItemExpenseLink(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
}
