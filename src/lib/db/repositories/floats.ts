import { getDb, now, uuid } from '../client'
import type { PettyCashFloat } from '../types'
import { resolveBudgetRevisionId } from './budgetRevisions'

const TABLE = 'floats'

function rowToFloat(r: Record<string, unknown>): PettyCashFloat {
  const toEpochMs = (value: unknown): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) return parsed
      const numeric = Number(value)
      if (Number.isFinite(numeric)) return numeric
    }
    return 0
  }
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    budget_revision_id: (r.budget_revision_id as string | null) ?? null,
    budget_item_id: r.budget_item_id as string,
    person_id: r.person_id as string,
    amount: Number(r.amount),
    currency: r.currency as string,
    issued_date: r.issued_date as string,
    notes: (r.notes as string | null) ?? null,
    created_at: toEpochMs(r.created_at),
    updated_at: toEpochMs(r.updated_at),
    deleted_at: r.deleted_at != null ? toEpochMs(r.deleted_at) : null,
  }
}

export type CreateFloatInput = {
  production_id: string
  revision_id?: string | null
  budget_item_id: string
  person_id: string
  amount: number
  currency: string
  issued_date: string
  notes?: string | null
}

export async function createFloat(input: CreateFloatInput): Promise<void> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const budgetRevisionId = await resolveBudgetRevisionId({
    productionId: input.production_id,
    revisionId: input.revision_id,
  })
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, budget_revision_id, budget_item_id, person_id, amount, currency, issued_date, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      input.production_id,
      budgetRevisionId,
      input.budget_item_id,
      input.person_id,
      input.amount,
      input.currency,
      input.issued_date,
      input.notes ?? null,
      ts,
      ts,
    ]
  )
}

export async function listFloatsByProduction(
  productionId: string,
  revisionId?: string | null
): Promise<PettyCashFloat[]> {
  const db = await getDb()
  const budgetRevisionId = await resolveBudgetRevisionId({ productionId, revisionId })
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND budget_revision_id = $2 AND deleted_at IS NULL ORDER BY issued_date DESC, updated_at DESC`,
    [productionId, budgetRevisionId]
  )
  return rows.map(rowToFloat)
}

export async function listFloatsByBudgetItem(budgetItemId: string): Promise<PettyCashFloat[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE budget_item_id = $1 AND deleted_at IS NULL ORDER BY issued_date DESC, updated_at DESC`,
    [budgetItemId]
  )
  return rows.map(rowToFloat)
}

export async function listFloatsByPerson(personId: string): Promise<PettyCashFloat[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE person_id = $1 AND deleted_at IS NULL ORDER BY issued_date DESC, updated_at DESC`,
    [personId]
  )
  return rows.map(rowToFloat)
}

export async function getFloatById(id: string): Promise<PettyCashFloat | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rows.length ? rowToFloat(rows[0]!) : null
}

export type UpdateFloatInput = {
  id: string
  amount: number
  notes: string | null
}

export async function updateFloat(input: UpdateFloatInput): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET amount = $1, notes = $2, updated_at = $3 WHERE id = $4 AND deleted_at IS NULL`,
    [input.amount, input.notes, ts, input.id]
  )
}

export async function softDeleteFloat(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(`UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`, [ts, ts, id])
}
