import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import {
  calculateRentalExpenseAmount,
  rentalDetailsSchema,
  rentalDetailsToJson,
  type RentalDetails,
} from '@/lib/budget/transactions/rental'

const EXP_TABLE = 'expenses'
const DETAILS_TABLE = 'expense_transaction_details'

export async function saveRentalTransaction(data: { expenseId: string; details: RentalDetails }): Promise<void> {
  const parsed = rentalDetailsSchema.safeParse(data.details)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join('; '))
  }
  const details = parsed.data

  const calculatedExpenseAmount = calculateRentalExpenseAmount(details)

  if (calculatedExpenseAmount == null) {
    throw new Error(
      'Cannot calculate rental amount yet. Please enter a rate and rental period (either start/end dates or override days).'
    )
  }

  const ts = now()
  const detailsJson = rentalDetailsToJson(details)
  const vendorId = details.vendor_id ?? null

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
      {
        sql: `UPDATE ${EXP_TABLE} SET transaction_type = 'rental', vendor_id = $1, amount = $2, updated_at = $3 WHERE id = $4 AND deleted_at IS NULL`,
        bindValues: [vendorId, calculatedExpenseAmount, ts, data.expenseId],
      },
      {
        sql: `
          INSERT INTO ${DETAILS_TABLE} (id, expense_id, transaction_type, details_json, created_at, updated_at)
          VALUES ($1, $2, 'rental', $3, $4, $5)
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

