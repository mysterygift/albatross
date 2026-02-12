import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { BudgetCategory, BudgetItem, Expense } from '../types'

const CAT_TABLE = 'budget_categories'
const ITEM_TABLE = 'budget_items'
const EXP_TABLE = 'expenses'

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
    category_id: r.category_id as string,
    description: r.description as string,
    estimated_cost: (r.estimated_cost as number) ?? 0,
    actual_cost: (r.actual_cost as number) ?? 0,
    vendor: r.vendor as string | null,
    status: (r.status as string) ?? 'draft',
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToExpense(r: Record<string, unknown>): Expense {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    category_id: r.category_id as string | null,
    amount: r.amount as number,
    date: r.date as string,
    vendor: r.vendor as string | null,
    notes: r.notes as string | null,
    expense_type: (r.expense_type as Expense['expense_type']) ?? 'other',
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
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
  categoryId?: string
): Promise<BudgetItem[]> {
  const db = await getDb()
  const sql =
    categoryId == null
      ? `SELECT * FROM ${ITEM_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY description`
      : `SELECT * FROM ${ITEM_TABLE} WHERE production_id = $1 AND category_id = $2 AND deleted_at IS NULL ORDER BY description`
  const rows = await db.select<Record<string, unknown>[]>(
    sql,
    categoryId == null ? [productionId] : [productionId, categoryId]
  )
  return rows.map(rowToItem)
}

export async function createBudgetItem(data: {
  production_id: string
  category_id: string
  description: string
  estimated_cost?: number
  actual_cost?: number
  vendor?: string | null
  status?: string
}): Promise<BudgetItem> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${ITEM_TABLE} (id, production_id, category_id, description, estimated_cost, actual_cost, vendor, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      data.production_id,
      data.category_id,
      data.description,
      data.estimated_cost ?? 0,
      data.actual_cost ?? 0,
      data.vendor ?? null,
      data.status ?? 'draft',
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
  data: Partial<Pick<BudgetItem, 'description' | 'estimated_cost' | 'actual_cost' | 'vendor' | 'status'>>
): Promise<BudgetItem> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['description', 'estimated_cost', 'actual_cost', 'vendor', 'status'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${ITEM_TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToItem(rows[0]!) : (await listBudgetItemsByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${ITEM_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
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

export async function createExpense(data: {
  production_id: string
  amount: number
  date: string
  category_id?: string | null
  vendor?: string | null
  notes?: string | null
  expense_type?: Expense['expense_type']
}): Promise<Expense> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${EXP_TABLE} (id, production_id, category_id, amount, date, vendor, notes, expense_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      data.production_id,
      data.category_id ?? null,
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

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${EXP_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(EXP_TABLE, id, 'delete', null)
}
