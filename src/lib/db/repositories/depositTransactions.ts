import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { depositDetailsToJson, type DepositDetails } from '@/lib/budget/transactions/deposit'

const EXP_TABLE = 'expenses'
const DETAILS_TABLE = 'expense_transaction_details'

export async function saveDepositTransaction(data: {
  expenseId: string
  details: DepositDetails
}): Promise<void> {
  const ts = now()
  const detailsJson = depositDetailsToJson(data.details)
  const vendorId = data.details.vendor_id?.trim() ? data.details.vendor_id.trim() : null
  const notes = data.details.notes?.trim() ? data.details.notes.trim() : null
  const amount = data.details.amount

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
      {
        sql: `UPDATE ${EXP_TABLE} SET transaction_type = 'deposit', vendor_id = $1, amount = $2, notes = $3, updated_at = $4 WHERE id = $5 AND deleted_at IS NULL`,
        bindValues: [vendorId, amount, notes, ts, data.expenseId],
      },
      {
        sql: `
          INSERT INTO ${DETAILS_TABLE} (id, expense_id, transaction_type, details_json, created_at, updated_at)
          VALUES ($1, $2, 'deposit', $3, $4, $5)
          ON CONFLICT(expense_id) DO UPDATE SET
            transaction_type = excluded.transaction_type,
            details_json = excluded.details_json,
            updated_at = excluded.updated_at
        `,
        bindValues: [uuid(), data.expenseId, detailsJson, ts, ts],
      },
      { sql: 'COMMIT', bindValues: [] },
    ]
    await executeBatch(db, statements)
  })
}
