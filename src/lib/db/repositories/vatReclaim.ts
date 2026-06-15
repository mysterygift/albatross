import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import { coerceNumber } from '../sqlValueCoercion'
import type { VatReclaimRate, VatReclaimTransactionType } from '../types'

const RATES_TABLE = 'vat_reclaim_rates'

function rowToVatReclaimRate(r: Record<string, unknown>): VatReclaimRate {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    transaction_type: r.transaction_type as VatReclaimTransactionType,
    reclaim_percent: coerceNumber(r.reclaim_percent, 0),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }
}

function validateReclaimPercent(percent: number): void {
  if (
    typeof percent !== 'number' ||
    Number.isNaN(percent) ||
    percent < 0 ||
    percent > 100
  ) {
    throw new Error('Reclaim percent must be between 0 and 100')
  }
}

export async function listVatReclaimRates(productionId: string): Promise<VatReclaimRate[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${RATES_TABLE} WHERE production_id = $1 ORDER BY transaction_type`,
    [productionId]
  )
  return rows.map(rowToVatReclaimRate)
}

export async function createVatReclaimRate(data: {
  production_id: string
  transaction_type: VatReclaimTransactionType
  reclaim_percent: number
}): Promise<VatReclaimRate> {
  validateReclaimPercent(data.reclaim_percent)
  const id = uuid()
  const ts = now()
  const db = await getDb()
  await db.execute(
    `INSERT INTO ${RATES_TABLE} (id, production_id, transaction_type, reclaim_percent, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, data.production_id, data.transaction_type, data.reclaim_percent, ts, ts]
  )
  await outboxPush(RATES_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const list = await listVatReclaimRates(data.production_id)
  return list.find((r) => r.id === id)!
}

export async function updateVatReclaimRate(
  rateId: string,
  reclaimPercent: number
): Promise<VatReclaimRate> {
  validateReclaimPercent(reclaimPercent)
  const db = await getDb()
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${RATES_TABLE} WHERE id = $1`,
    [rateId]
  )
  if (existing.length === 0) throw new Error('VAT reclaim rate not found')
  const prodId = existing[0]!.production_id as string
  const ts = now()
  await db.execute(
    `UPDATE ${RATES_TABLE} SET reclaim_percent = $1, updated_at = $2 WHERE id = $3`,
    [reclaimPercent, ts, rateId]
  )
  await outboxPush(RATES_TABLE, rateId, 'update', JSON.stringify({ reclaim_percent: reclaimPercent }))
  const list = await listVatReclaimRates(prodId)
  return list.find((r) => r.id === rateId)!
}

export type ExpenseVatReclaimInput = {
  vat_reclaimed_amount: number | null
  vat_reclaim_date: string | null
  vat_reclaim_reference: string | null
}

export function validateExpenseVatReclaim(
  vatReclaimable: number,
  input: ExpenseVatReclaimInput
): void {
  if (input.vat_reclaimed_amount == null) {
    if (input.vat_reclaim_date != null || (input.vat_reclaim_reference?.trim() ?? '') !== '') {
      throw new Error('Reclaim date or reference requires a reclaimed amount')
    }
    return
  }
  if (input.vat_reclaimed_amount < 0 || !Number.isFinite(input.vat_reclaimed_amount)) {
    throw new Error('Reclaimed amount must be zero or greater')
  }
  if (input.vat_reclaimed_amount > vatReclaimable + 1e-9) {
    throw new Error('Reclaimed amount cannot exceed VAT reclaimable')
  }
}

export async function updateExpenseVatReclaimFields(
  expenseId: string,
  input: ExpenseVatReclaimInput
): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE expenses SET vat_reclaimed_amount = $1, vat_reclaim_date = $2, vat_reclaim_reference = $3, updated_at = $4
     WHERE id = $5 AND deleted_at IS NULL`,
    [
      input.vat_reclaimed_amount,
      input.vat_reclaim_date,
      input.vat_reclaim_reference?.trim() ? input.vat_reclaim_reference.trim() : null,
      ts,
      expenseId,
    ]
  )
  await outboxPush('expenses', expenseId, 'update', JSON.stringify(input))
}
