import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { OptimisticConcurrencyConflictError } from '../concurrency'
import { outboxPush, outboxStatementForRow } from '../outbox'
import { coerceIsoString, coerceNumber } from '../sqlValueCoercion'
import type { BudgetCategory, BudgetItem, Expense } from '../types'
import { ensureLegacyFallbackAccounts, getAccountById } from './budgetAccounts'
import { resolveBudgetRevisionId } from './budgetRevisions'

const CAT_TABLE = 'budget_categories'
const ITEM_TABLE = 'budget_items'
const EXP_TABLE = 'expenses'
const LINKS_TABLE = 'budget_item_expense_links'

function rowToCategory(r: Record<string, unknown>): BudgetCategory {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    code: r.code as string,
    name: r.name as string,
    phase: (r.phase as BudgetCategory['phase']) ?? 'pre',
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
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
    estimated_cost: coerceNumber(r.estimated_cost, 0),
    actual_cost: coerceNumber(r.actual_cost, 0),
    vendor: r.vendor as string | null,
    status: (r.status as string) ?? 'draft',
    line_item_type: (r.line_item_type as BudgetItem['line_item_type']) ?? null,
    created_at: coerceIsoString(r.created_at),
    updated_at: coerceIsoString(r.updated_at),
    deleted_at: r.deleted_at == null ? null : coerceIsoString(r.deleted_at),
  }
}

function rowToExpense(r: Record<string, unknown>): Expense {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    category_id: r.category_id as string | null,
    account_id: r.account_id as string | null,
    transaction_type: (r.transaction_type as Expense['transaction_type']) ?? null,
    vendor_id: (r.vendor_id as string | null) ?? null,
    amount: coerceNumber(r.amount, 0),
    date: coerceIsoString(r.date),
    vendor: r.vendor as string | null,
    notes: r.notes as string | null,
    expense_type: (r.expense_type as Expense['expense_type']) ?? 'other',
    created_at: coerceIsoString(r.created_at),
    updated_at: coerceIsoString(r.updated_at),
    deleted_at: r.deleted_at == null ? null : coerceIsoString(r.deleted_at),
  }
}

// Categories
export async function listBudgetCategoriesByProduction(
  productionId: string,
  phase?: string
): Promise<BudgetCategory[]> {
  const db = await getDb()
  const sql =
    phase == null
      ? `SELECT * FROM ${CAT_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY code`
      : `SELECT * FROM ${CAT_TABLE} WHERE production_id = $1 AND phase = $2 AND deleted_at IS NULL ORDER BY code`
  const rows = await db.select<Record<string, unknown>[]>(
    sql,
    phase == null ? [productionId] : [productionId, phase]
  )
  return rows.map(rowToCategory)
}

export async function createBudgetCategory(data: {
  production_id: string
  code: string
  name: string
  phase?: BudgetCategory['phase']
}): Promise<BudgetCategory> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${CAT_TABLE} (id, production_id, code, name, phase, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, data.production_id, data.code, data.name, data.phase ?? 'pre', ts, ts]
  )
  await outboxPush(CAT_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${CAT_TABLE} WHERE id = $1`, [id])
  return rowToCategory(rows[0]!)
}

/** Create default budget categories for a new production. */
export async function seedDefaultBudgetCategories(productionId: string): Promise<void> {
  const defaults: { code: string; name: string; phase: BudgetCategory['phase'] }[] = [
    { code: 'ATL', name: 'Above the line', phase: 'pre' },
    { code: 'BTL', name: 'Below the line', phase: 'production' },
    { code: 'POST', name: 'Post-production', phase: 'post' },
    { code: 'OTHER', name: 'Other', phase: 'production' },
  ]
  for (const d of defaults) {
    await createBudgetCategory({ production_id: productionId, code: d.code, name: d.name, phase: d.phase })
  }
}

export async function updateBudgetCategory(
  id: string,
  data: Partial<Pick<BudgetCategory, 'code' | 'name' | 'phase'>>
): Promise<BudgetCategory> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['code', 'name', 'phase'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${CAT_TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToCategory(rows[0]!) : (await listBudgetCategoriesByProduction(''))[0]! // unreachable
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${CAT_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(CAT_TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${CAT_TABLE} WHERE id = $1`, [id])
  return rowToCategory(rows[0]!)
}

export async function deleteBudgetCategory(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${CAT_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(CAT_TABLE, id, 'delete', null)
}

// Budget items
export async function listBudgetItemsByProduction(
  productionId: string,
  options?: { revisionId?: string | null; categoryId?: string }
): Promise<BudgetItem[]> {
  const db = await getDb()
  const budgetRevisionId = await resolveBudgetRevisionId({
    productionId,
    revisionId: options?.revisionId,
  })
  const categoryId = options?.categoryId
  const sql =
    categoryId == null
      ? `SELECT * FROM ${ITEM_TABLE} WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL ORDER BY description`
      : `SELECT * FROM ${ITEM_TABLE} WHERE production_id = $1 AND budget_revision_id = $2 AND category_id = $3 AND deleted_at IS NULL ORDER BY description`
  const rows = await db.select<Record<string, unknown>[]>(
    sql,
    categoryId == null ? [productionId, budgetRevisionId] : [productionId, budgetRevisionId, categoryId]
  )
  return rows.map(rowToItem)
}

export async function createBudgetItem(data: {
  production_id: string
  revision_id?: string | null
  category_id?: string | null
  account_id?: string | null
  description: string
  estimated_cost?: number
  actual_cost?: number
  vendor?: string | null
  status?: string
}): Promise<BudgetItem> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const budgetRevisionId = await resolveBudgetRevisionId({ productionId: data.production_id, revisionId: data.revision_id })
  const categoryId = data.category_id ?? null
  const accountId = data.account_id ?? null
  await db.execute(
    `INSERT INTO ${ITEM_TABLE} (id, production_id, budget_revision_id, category_id, account_id, description, estimated_cost, actual_cost, vendor, status, line_item_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      data.production_id,
      budgetRevisionId,
      categoryId,
      accountId,
      data.description,
      data.estimated_cost ?? 0,
      data.actual_cost ?? 0,
      data.vendor ?? null,
      data.status ?? 'draft',
      null,
      ts,
      ts,
    ]
  )
  await outboxPush(ITEM_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${ITEM_TABLE} WHERE id = $1`, [id])
  return rowToItem(rows[0]!)
}

export async function updateBudgetItem(
  id: string,
  data: Partial<Pick<BudgetItem, 'description' | 'estimated_cost' | 'actual_cost' | 'vendor' | 'status' | 'line_item_type'>>,
  options?: { expectedUpdatedAt?: string }
): Promise<BudgetItem> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['description', 'estimated_cost', 'actual_cost', 'vendor', 'status', 'line_item_type'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${ITEM_TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToItem(rows[0]!) : (await listBudgetItemsByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i++}`)
  vals.push(ts)
  let whereSql = `id = $${i++}`
  vals.push(id)
  if (options?.expectedUpdatedAt) {
    whereSql += ` AND updated_at = $${i++}`
    vals.push(options.expectedUpdatedAt)
  }
  const result = await db.execute(`UPDATE ${ITEM_TABLE} SET ${cols.join(', ')} WHERE ${whereSql}`, vals)
  if ((result.rowsAffected ?? 0) === 0 && options?.expectedUpdatedAt) {
    throw new OptimisticConcurrencyConflictError({
      entity: ITEM_TABLE,
      entityId: id,
      expectedUpdatedAt: options.expectedUpdatedAt,
    })
  }
  await outboxPush(ITEM_TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${ITEM_TABLE} WHERE id = $1`, [id])
  return rowToItem(rows[0]!)
}

export async function deleteBudgetItem(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${ITEM_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(ITEM_TABLE, id, 'delete', null)
}

// Expenses (quick-add spend)
export async function listExpensesByProduction(
  productionId: string,
  categoryId?: string
): Promise<Expense[]> {
  const db = await getDb()
  const sql =
    categoryId == null
      ? `SELECT * FROM ${EXP_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY date DESC`
      : `SELECT * FROM ${EXP_TABLE} WHERE production_id = $1 AND category_id = $2 AND deleted_at IS NULL ORDER BY date DESC`
  const rows = await db.select<Record<string, unknown>[]>(
    sql,
    categoryId == null ? [productionId] : [productionId, categoryId]
  )
  return rows.map(rowToExpense)
}

/** List expenses linked to a vendor (vendor_id). Order: date DESC. */
export async function listExpensesByVendorId(
  productionId: string,
  vendorId: string
): Promise<Expense[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${EXP_TABLE} WHERE production_id = $1 AND vendor_id = $2 AND deleted_at IS NULL ORDER BY date DESC`,
    [productionId, vendorId]
  )
  return rows.map(rowToExpense)
}

export async function createExpense(data: {
  production_id: string
  amount: number
  date: string
  category_id?: string | null
  account_id?: string | null
  transaction_type?: Expense['transaction_type']
  vendor_id?: string | null
  vendor?: string | null
  notes?: string | null
  expense_type?: Expense['expense_type']
}): Promise<Expense> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${EXP_TABLE} (id, production_id, category_id, account_id, transaction_type, vendor_id, amount, date, vendor, notes, expense_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      data.production_id,
      data.category_id ?? null,
      data.account_id ?? null,
      data.transaction_type ?? null,
      data.vendor_id ?? null,
      data.amount,
      data.date,
      data.vendor ?? null,
      data.notes ?? null,
      data.expense_type ?? 'other',
      ts,
      ts,
    ]
  )
  await outboxPush(EXP_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${EXP_TABLE} WHERE id = $1`, [id])
  return rowToExpense(rows[0]!)
}

/**
 * Soft-delete an expense and any active reconciliation links in one transaction.
 * Does not modify expense_transaction_details, budget_items, or any roll-up totals.
 * Per DATABASE_LAYER.md: runInSerializedTransaction + executeBatch(BEGIN, ..., COMMIT).
 */
export async function deleteExpense(expenseId: string): Promise<void> {
  const db = await getDb()
  const expenseRows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${EXP_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [expenseId]
  )
  if (expenseRows.length === 0) {
    throw new Error('Expense not found or already deleted')
  }

  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN TRANSACTION', bindValues: [] },
    {
      sql: `UPDATE ${EXP_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, expenseId],
    },
    {
      sql: `UPDATE ${LINKS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE expense_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, expenseId],
    },
    outboxStatementForRow({
      entity: EXP_TABLE,
      entityId: expenseId,
      operation: 'delete',
      payloadJson: null,
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]

  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, statements)
  })
}

/**
 * Recode an expense to a different (postable) account. Leaf-only posting enforced.
 * Pushes outbox with account_id for sync; backfill (backfillAccountIdsFromLegacyCategories) does not push outbox.
 */
export async function updateExpenseAccount(expenseId: string, newAccountId: string): Promise<void> {
  const account = await getAccountById(newAccountId)
  if (!account) throw new Error('Account not found')
  if (!account.is_postable) throw new Error('Only leaf (postable) accounts may receive expenses')
  const db = await getDb()
  await db.execute(
    `UPDATE ${EXP_TABLE} SET account_id = $1 WHERE id = $2 AND deleted_at IS NULL`,
    [newAccountId, expenseId]
  )
  await outboxPush(EXP_TABLE, expenseId, 'update', JSON.stringify({ account_id: newAccountId }))
}

/**
 * Update basic expense row fields (amount, date, vendor, notes). Used for untyped/legacy expenses.
 * Does not change account_id (use updateExpenseAccount), transaction_type, or expense_transaction_details.
 */
export async function updateExpense(
  expenseId: string,
  data: { amount?: number; date?: string; vendor?: string | null; notes?: string | null }
): Promise<void> {
  const db = await getDb()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (data.amount !== undefined) {
    cols.push(`amount = $${i++}`)
    vals.push(data.amount)
  }
  if (data.date !== undefined) {
    cols.push(`date = $${i++}`)
    vals.push(data.date)
  }
  if (data.vendor !== undefined) {
    cols.push(`vendor = $${i++}`)
    vals.push(data.vendor)
  }
  if (data.notes !== undefined) {
    cols.push(`notes = $${i++}`)
    vals.push(data.notes)
  }
  if (cols.length === 0) return
  const ts = now()
  cols.push(`updated_at = $${i++}`)
  vals.push(ts, expenseId)
  await db.execute(
    `UPDATE ${EXP_TABLE} SET ${cols.join(', ')} WHERE id = $${i} AND deleted_at IS NULL`,
    vals
  )
  await outboxPush(EXP_TABLE, expenseId, 'update', JSON.stringify(data))
}

/** Category code to legacy fallback account key (ATL -> atl, etc.). */
const CATEGORY_CODE_TO_FALLBACK = {
  ATL: 'atl' as const,
  BTL: 'btl' as const,
  POST: 'post' as const,
  OTHER: 'other' as const,
}

const backfillAccountIdsInflight = new Map<
  string,
  Promise<{ updatedItems: number; updatedExpenses: number }>
>()

/**
 * Backfill account_id on budget_items and expenses from legacy category_id.
 * Maps ATL->1001, BTL->2001, POST->9001, OTHER->9701 (ensureLegacyFallbackAccounts).
 * Idempotent: only updates rows where account_id IS NULL; never overwrites existing account_id.
 * Uses a single executeBatch(BEGIN, ...UPDATEs..., COMMIT) so the whole transaction runs on one
 * connection and does not hold the DB lock across separate execute() calls (avoids "database is locked").
 */
export async function backfillAccountIdsFromLegacyCategories(productionId: string): Promise<{
  updatedItems: number
  updatedExpenses: number
}> {
  const existing = backfillAccountIdsInflight.get(productionId)
  if (existing) return existing

  const run = (async () => {
    const categories = await listBudgetCategoriesByProduction(productionId)
    const categoryIdToFallbackKey = new Map<string, 'atl' | 'btl' | 'post' | 'other'>()
    for (const c of categories) {
      const key = CATEGORY_CODE_TO_FALLBACK[c.code as keyof typeof CATEGORY_CODE_TO_FALLBACK]
      if (key) categoryIdToFallbackKey.set(c.id, key)
    }
    if (categoryIdToFallbackKey.size === 0) return { updatedItems: 0, updatedExpenses: 0 }

    const fallbacks = await ensureLegacyFallbackAccounts(productionId)
    const categoryIdToAccountId = new Map<string, string>()
    for (const [catId, fk] of categoryIdToFallbackKey) {
      categoryIdToAccountId.set(catId, fallbacks[fk])
    }

    const ts = now()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN TRANSACTION', bindValues: [] }]
    for (const [categoryId, accountId] of categoryIdToAccountId) {
      statements.push(
        {
          sql: `UPDATE ${ITEM_TABLE} SET account_id = $1, updated_at = $2 WHERE production_id = $3 AND account_id IS NULL AND category_id = $4 AND deleted_at IS NULL`,
          bindValues: [accountId, ts, productionId, categoryId],
        },
        {
          sql: `UPDATE ${EXP_TABLE} SET account_id = $1, updated_at = $2 WHERE production_id = $3 AND account_id IS NULL AND category_id = $4 AND deleted_at IS NULL`,
          bindValues: [accountId, ts, productionId, categoryId],
        }
      )
    }
    statements.push({ sql: 'COMMIT', bindValues: [] })

    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, statements)
    })

    return { updatedItems: 0, updatedExpenses: 0 }
  })()

  backfillAccountIdsInflight.set(productionId, run)
  run.finally(() => {
    backfillAccountIdsInflight.delete(productionId)
  })
  return run
}
