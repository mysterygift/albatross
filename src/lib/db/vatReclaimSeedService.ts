import type { VatReclaimTransactionType } from './types'
import { createVatReclaimRate, listVatReclaimRates } from './repositories/vatReclaim'

const DEFAULT_RECLAIM_RATES: Array<{
  transaction_type: VatReclaimTransactionType
  reclaim_percent: number
}> = [
  { transaction_type: 'labour', reclaim_percent: 0 },
  { transaction_type: 'purchase', reclaim_percent: 100 },
  { transaction_type: 'rental', reclaim_percent: 100 },
  { transaction_type: 'allow', reclaim_percent: 0 },
  { transaction_type: 'deposit', reclaim_percent: 100 },
  { transaction_type: 'untyped', reclaim_percent: 100 },
]

/** Seed default VAT reclaim rates when VAT tracking is first enabled (idempotent). */
export async function seedDefaultVatReclaimRates(productionId: string): Promise<void> {
  const existing = await listVatReclaimRates(productionId)
  if (existing.length > 0) return

  for (const row of DEFAULT_RECLAIM_RATES) {
    await createVatReclaimRate({
      production_id: productionId,
      transaction_type: row.transaction_type,
      reclaim_percent: row.reclaim_percent,
    })
  }
}
