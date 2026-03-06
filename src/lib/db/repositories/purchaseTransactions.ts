import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { purchaseDetailsToJson, type PurchaseDetails } from '@/lib/budget/transactions/purchase'

const EXP_TABLE = 'expenses'
const DETAILS_TABLE = 'expense_transaction_details'
const LOC_TABLE = 'locations'

export async function savePurchaseTransaction(data: { expenseId: string; details: PurchaseDetails }): Promise<void> {
  const ts = now()
  const detailsJson = purchaseDetailsToJson(data.details)
  const vendorId = data.details.vendor_id ?? null
  const locationId = data.details.location_id ?? null

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
      {
        sql: `UPDATE ${EXP_TABLE} SET transaction_type = 'purchase', vendor_id = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
        bindValues: [vendorId, ts, data.expenseId],
      },
      {
        sql: `
          INSERT INTO ${DETAILS_TABLE} (id, expense_id, transaction_type, details_json, created_at, updated_at)
          VALUES ($1, $2, 'purchase', $3, $4, $5)
          ON CONFLICT(expense_id) DO UPDATE SET
            transaction_type = excluded.transaction_type,
            details_json = excluded.details_json,
            updated_at = excluded.updated_at
        `,
        bindValues: [uuid(), data.expenseId, detailsJson, ts, ts],
      },
    ]

    if (locationId != null) {
      statements.push({
        sql: `UPDATE ${LOC_TABLE} SET booked_status = 'booked', updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
        bindValues: [ts, locationId],
      })
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}

