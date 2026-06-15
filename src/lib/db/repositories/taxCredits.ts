import { getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush } from '../outbox'
import { coerceBoolean, coerceNumber } from '../sqlValueCoercion'
import type {
  ExpenseTaxCreditAllocation,
  ProductionBudgetFeatures,
  TaxCreditScheme,
} from '../types'

const FEATURES_TABLE = 'production_budget_features'
const SCHEMES_TABLE = 'tax_credit_schemes'
const ALLOCATIONS_TABLE = 'expense_tax_credit_allocations'

const MIN_RATE = 0
const MAX_RATE = 1

function rowToFeatures(r: Record<string, unknown>): ProductionBudgetFeatures {
  return {
    production_id: r.production_id as string,
    tax_credits_enabled: coerceBoolean(r.tax_credits_enabled, false),
    vat_tracking_enabled: coerceBoolean(r.vat_tracking_enabled, false),
    default_vat_rate_percent:
      r.default_vat_rate_percent == null ? null : coerceNumber(r.default_vat_rate_percent, 0),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }
}

function rowToScheme(r: Record<string, unknown>): TaxCreditScheme {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    net_rate: coerceNumber(r.net_rate, 0),
    cap_percent: r.cap_percent == null ? null : coerceNumber(r.cap_percent, 0),
    min_qualifying_percent:
      r.min_qualifying_percent == null ? null : coerceNumber(r.min_qualifying_percent, 0),
    max_qualifying_amount:
      r.max_qualifying_amount == null ? null : coerceNumber(r.max_qualifying_amount, 0),
    max_core_budget: r.max_core_budget == null ? null : coerceNumber(r.max_core_budget, 0),
    is_vfx: coerceBoolean(r.is_vfx, false),
    is_enabled: coerceBoolean(r.is_enabled, true),
    sort_order: coerceNumber(r.sort_order, 0),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToAllocation(r: Record<string, unknown>): ExpenseTaxCreditAllocation {
  return {
    id: r.id as string,
    expense_id: r.expense_id as string,
    tax_credit_scheme_id: r.tax_credit_scheme_id as string,
    qualifying_amount: coerceNumber(r.qualifying_amount, 0),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function validateNetRate(rate: number): void {
  if (typeof rate !== 'number' || Number.isNaN(rate) || rate <= MIN_RATE || rate > MAX_RATE) {
    throw new Error(
      'Net rate must be a number greater than 0 and at most 1 (100%). Stored as decimal (e.g. 0.255 = 25.5%).'
    )
  }
}

// ─── Production budget features ─────────────────────────────────────────────

export async function getProductionBudgetFeatures(
  productionId: string
): Promise<ProductionBudgetFeatures> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${FEATURES_TABLE} WHERE production_id = $1`,
    [productionId]
  )
  if (rows.length > 0) return rowToFeatures(rows[0]!)
  const ts = now()
  return {
    production_id: productionId,
    tax_credits_enabled: false,
    vat_tracking_enabled: false,
    default_vat_rate_percent: null,
    created_at: ts,
    updated_at: ts,
  }
}

export async function setTaxCreditsEnabled(
  productionId: string,
  enabled: boolean
): Promise<ProductionBudgetFeatures> {
  const db = await getDb()
  const ts = now()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${FEATURES_TABLE} WHERE production_id = $1`,
    [productionId]
  )
  if (existing.length === 0) {
    await db.execute(
      `INSERT INTO ${FEATURES_TABLE} (production_id, tax_credits_enabled, vat_tracking_enabled, default_vat_rate_percent, created_at, updated_at)
       VALUES ($1, $2, 0, NULL, $3, $4)`,
      [productionId, enabled, ts, ts]
    )
    await outboxPush(
      FEATURES_TABLE,
      productionId,
      'create',
      JSON.stringify({ production_id: productionId, tax_credits_enabled: enabled })
    )
  } else {
    await db.execute(
      `UPDATE ${FEATURES_TABLE} SET tax_credits_enabled = $1, updated_at = $2 WHERE production_id = $3`,
      [enabled, ts, productionId]
    )
    await outboxPush(
      FEATURES_TABLE,
      productionId,
      'update',
      JSON.stringify({ tax_credits_enabled: enabled })
    )
  }
  return getProductionBudgetFeatures(productionId)
}

export async function setVatTrackingEnabled(
  productionId: string,
  enabled: boolean
): Promise<ProductionBudgetFeatures> {
  const db = await getDb()
  const ts = now()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${FEATURES_TABLE} WHERE production_id = $1`,
    [productionId]
  )
  if (existing.length === 0) {
    await db.execute(
      `INSERT INTO ${FEATURES_TABLE} (production_id, tax_credits_enabled, vat_tracking_enabled, default_vat_rate_percent, created_at, updated_at)
       VALUES ($1, 0, $2, NULL, $3, $4)`,
      [productionId, enabled, ts, ts]
    )
    await outboxPush(
      FEATURES_TABLE,
      productionId,
      'create',
      JSON.stringify({ production_id: productionId, vat_tracking_enabled: enabled })
    )
  } else {
    await db.execute(
      `UPDATE ${FEATURES_TABLE} SET vat_tracking_enabled = $1, updated_at = $2 WHERE production_id = $3`,
      [enabled, ts, productionId]
    )
    await outboxPush(
      FEATURES_TABLE,
      productionId,
      'update',
      JSON.stringify({ vat_tracking_enabled: enabled })
    )
  }
  return getProductionBudgetFeatures(productionId)
}

export async function setDefaultVatRatePercent(
  productionId: string,
  ratePercent: number | null
): Promise<ProductionBudgetFeatures> {
  const db = await getDb()
  const ts = now()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${FEATURES_TABLE} WHERE production_id = $1`,
    [productionId]
  )
  if (existing.length === 0) {
    await db.execute(
      `INSERT INTO ${FEATURES_TABLE} (production_id, tax_credits_enabled, vat_tracking_enabled, default_vat_rate_percent, created_at, updated_at)
       VALUES ($1, 0, 0, $2, $3, $4)`,
      [productionId, ratePercent, ts, ts]
    )
    await outboxPush(
      FEATURES_TABLE,
      productionId,
      'create',
      JSON.stringify({ production_id: productionId, default_vat_rate_percent: ratePercent })
    )
  } else {
    await db.execute(
      `UPDATE ${FEATURES_TABLE} SET default_vat_rate_percent = $1, updated_at = $2 WHERE production_id = $3`,
      [ratePercent, ts, productionId]
    )
    await outboxPush(
      FEATURES_TABLE,
      productionId,
      'update',
      JSON.stringify({ default_vat_rate_percent: ratePercent })
    )
  }
  return getProductionBudgetFeatures(productionId)
}

// ─── Tax credit schemes ─────────────────────────────────────────────────────

export async function listTaxCreditSchemes(productionId: string): Promise<TaxCreditScheme[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SCHEMES_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY sort_order, name`,
    [productionId]
  )
  return rows.map(rowToScheme)
}

export type CreateTaxCreditSchemeInput = Pick<
  TaxCreditScheme,
  | 'production_id'
  | 'name'
  | 'net_rate'
  | 'cap_percent'
  | 'min_qualifying_percent'
  | 'max_qualifying_amount'
  | 'max_core_budget'
  | 'is_vfx'
> & { sort_order?: number }

export async function createTaxCreditScheme(data: CreateTaxCreditSchemeInput): Promise<TaxCreditScheme> {
  validateNetRate(data.net_rate)
  const id = uuid()
  const ts = now()
  const db = await getDb()
  const sortOrder = data.sort_order ?? 0
  await db.execute(
    `INSERT INTO ${SCHEMES_TABLE}
     (id, production_id, name, net_rate, cap_percent, min_qualifying_percent, max_qualifying_amount, max_core_budget, is_vfx, is_enabled, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, $12)`,
    [
      id,
      data.production_id,
      data.name,
      data.net_rate,
      data.cap_percent,
      data.min_qualifying_percent,
      data.max_qualifying_amount,
      data.max_core_budget,
      data.is_vfx,
      sortOrder,
      ts,
      ts,
    ]
  )
  await outboxPush(SCHEMES_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const list = await listTaxCreditSchemes(data.production_id)
  return list.find((s) => s.id === id)!
}

export async function updateTaxCreditScheme(
  schemeId: string,
  data: Partial<
    Pick<
      TaxCreditScheme,
      | 'name'
      | 'net_rate'
      | 'cap_percent'
      | 'min_qualifying_percent'
      | 'max_qualifying_amount'
      | 'max_core_budget'
      | 'is_vfx'
      | 'sort_order'
    >
  >
): Promise<TaxCreditScheme> {
  if (data.net_rate != null) validateNetRate(data.net_rate)
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SCHEMES_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [schemeId]
  )
  if (existing.length === 0) throw new Error('Tax credit scheme not found')
  const prodId = existing[0]!.production_id as string
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of [
    'name',
    'net_rate',
    'cap_percent',
    'min_qualifying_percent',
    'max_qualifying_amount',
    'max_core_budget',
    'is_vfx',
    'sort_order',
  ] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length > 0) {
    const ts = now()
    cols.push(`updated_at = $${i++}`)
    vals.push(ts, schemeId)
    await db.execute(`UPDATE ${SCHEMES_TABLE} SET ${cols.join(', ')} WHERE id = $${i}`, vals)
    await outboxPush(SCHEMES_TABLE, schemeId, 'update', JSON.stringify(data))
  }
  const list = await listTaxCreditSchemes(prodId)
  return list.find((s) => s.id === schemeId)!
}

export async function deleteTaxCreditScheme(schemeId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${SCHEMES_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, schemeId]
  )
  await outboxPush(SCHEMES_TABLE, schemeId, 'delete', null)
}

export async function setTaxCreditSchemeEnabled(schemeId: string, enabled: boolean): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${SCHEMES_TABLE} SET is_enabled = $1, updated_at = $2 WHERE id = $3`,
    [enabled, ts, schemeId]
  )
  await outboxPush(SCHEMES_TABLE, schemeId, 'update', JSON.stringify({ is_enabled: enabled }))
}

// ─── Expense tax credit allocations ─────────────────────────────────────────

export async function listAllocationsByProduction(
  productionId: string
): Promise<ExpenseTaxCreditAllocation[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT a.* FROM ${ALLOCATIONS_TABLE} a
     INNER JOIN expenses e ON e.id = a.expense_id AND e.production_id = $1 AND e.deleted_at IS NULL
     WHERE a.deleted_at IS NULL`,
    [productionId]
  )
  return rows.map(rowToAllocation)
}

export async function listAllocationsByExpense(
  expenseId: string
): Promise<ExpenseTaxCreditAllocation[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${ALLOCATIONS_TABLE} WHERE expense_id = $1 AND deleted_at IS NULL`,
    [expenseId]
  )
  return rows.map(rowToAllocation)
}

export type TaxCreditAllocationInput = {
  tax_credit_scheme_id: string
  qualifying_amount: number
}

function validateAllocations(
  expenseAmount: number,
  allocations: TaxCreditAllocationInput[]
): void {
  if (allocations.length === 0) return
  let total = 0
  const schemeIds = new Set<string>()
  for (const a of allocations) {
    if (a.qualifying_amount <= 0 || !Number.isFinite(a.qualifying_amount)) {
      throw new Error('Qualifying amount must be greater than 0')
    }
    if (schemeIds.has(a.tax_credit_scheme_id)) {
      throw new Error('Duplicate tax credit scheme in allocations')
    }
    schemeIds.add(a.tax_credit_scheme_id)
    total += a.qualifying_amount
  }
  if (total > expenseAmount + 1e-9) {
    throw new Error('Total qualifying amounts cannot exceed the expense amount')
  }
}

export async function replaceExpenseTaxCreditAllocations(
  expenseId: string,
  expenseAmount: number,
  allocations: TaxCreditAllocationInput[]
): Promise<ExpenseTaxCreditAllocation[]> {
  validateAllocations(expenseAmount, allocations)
  const ts = now()
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await db.execute(
      `UPDATE ${ALLOCATIONS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE expense_id = $3 AND deleted_at IS NULL`,
      [ts, ts, expenseId]
    )
    for (const a of allocations) {
      const id = uuid()
      await db.execute(
        `INSERT INTO ${ALLOCATIONS_TABLE} (id, expense_id, tax_credit_scheme_id, qualifying_amount, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, expenseId, a.tax_credit_scheme_id, a.qualifying_amount, ts, ts]
      )
      await outboxPush(
        ALLOCATIONS_TABLE,
        id,
        'create',
        JSON.stringify({ expense_id: expenseId, ...a })
      )
    }
  })
  return listAllocationsByExpense(expenseId)
}

export async function updateExpenseVatRate(
  expenseId: string,
  vatRatePercent: number | null
): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE expenses SET vat_rate_percent = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
    [vatRatePercent, ts, expenseId]
  )
  await outboxPush('expenses', expenseId, 'update', JSON.stringify({ vat_rate_percent: vatRatePercent }))
}

export async function updateExpenseTaxAndAllocations(
  expenseId: string,
  expenseAmount: number,
  vatRatePercent: number | null,
  allocations: TaxCreditAllocationInput[]
): Promise<void> {
  await updateExpenseVatRate(expenseId, vatRatePercent)
  await replaceExpenseTaxCreditAllocations(expenseId, expenseAmount, allocations)
}
