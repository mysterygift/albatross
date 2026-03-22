import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import type { Expense, ExpenseTransactionType } from '../types'
import { getAccountById } from './budgetAccounts'
import { labourDetailsSchema, labourDetailsToJson, type LabourDetails } from '@/lib/budget/transactions/labour'
import { purchaseDetailsSchema, purchaseDetailsToJson, type PurchaseDetails } from '@/lib/budget/transactions/purchase'
import {
  rentalDetailsSchema,
  rentalDetailsToJson,
  calculateRentalExpenseAmount,
  type RentalDetails,
} from '@/lib/budget/transactions/rental'
import { allowDetailsSchema, allowDetailsToJson, type AllowDetails } from '@/lib/budget/transactions/allow'

const EXP_TABLE = 'expenses'
const DETAILS_TABLE = 'expense_transaction_details'
const LOC_TABLE = 'locations'

export type CreateTypedExpenseParams = {
  productionId: string
  accountId: string
  transactionType: ExpenseTransactionType
  draft: unknown
  date?: string
}

function rowToExpense(r: Record<string, unknown>): Expense {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    category_id: (r.category_id as string | null) ?? null,
    account_id: (r.account_id as string | null) ?? null,
    transaction_type: (r.transaction_type as Expense['transaction_type']) ?? null,
    vendor_id: (r.vendor_id as string | null) ?? null,
    amount: (r.amount as number) ?? 0,
    date: r.date as string,
    vendor: (r.vendor as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    expense_type: (r.expense_type as Expense['expense_type']) ?? 'other',
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/**
 * Create a new expense with typed transaction details in one atomic transaction.
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md.
 * Validates that accountId is a postable account.
 */
export async function createTypedExpense(params: CreateTypedExpenseParams): Promise<Expense> {
  const {
    productionId,
    accountId,
    transactionType,
    draft,
    date = new Date().toISOString().slice(0, 10),
  } = params

  const account = await getAccountById(accountId)
  if (!account) {
    throw new Error('Account not found')
  }
  if (!account.is_postable) {
    throw new Error('Expenses can only be posted to leaf (postable) accounts')
  }
  if (account.production_id !== productionId) {
    throw new Error('Account does not belong to this production')
  }

  const id = uuid()
  const ts = now()

  let amount: number
  let vendorId: string | null = null
  let notes: string | null = null
  let detailsJson: string
  let locationId: string | null = null

  switch (transactionType) {
    case 'labour': {
      const parsed = labourDetailsSchema.safeParse(draft)
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join('; '))
      }
      const d = parsed.data as LabourDetails
      amount =
        (d.rate_per_day ?? 0) * (d.booked_days_count ?? 0)
      notes = d.notes?.trim() ? d.notes.trim() : null
      detailsJson = labourDetailsToJson(d)
      break
    }
    case 'purchase': {
      const parsed = purchaseDetailsSchema.safeParse(draft)
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join('; '))
      }
      const d = parsed.data as PurchaseDetails
      const rawAmount = d.amount ?? 0
      if (typeof rawAmount !== 'number' || rawAmount <= 0 || !Number.isFinite(rawAmount)) {
        throw new Error('Purchase amount is required and must be greater than 0.')
      }
      amount = rawAmount
      vendorId = d.vendor_id?.trim() ? d.vendor_id.trim() : null
      locationId = d.location_id?.trim() ? d.location_id.trim() : null
      notes = d.notes?.trim() ? d.notes.trim() : null
      detailsJson = purchaseDetailsToJson(d)
      break
    }
    case 'rental': {
      const parsed = rentalDetailsSchema.safeParse(draft)
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join('; '))
      }
      const d = parsed.data as RentalDetails
      const calculated = calculateRentalExpenseAmount(d)
      if (calculated == null) {
        throw new Error(
          'Cannot calculate rental amount. Please enter a rate and rental period (either start/end dates or override days).'
        )
      }
      amount = calculated
      vendorId = d.vendor_id?.trim() ? d.vendor_id.trim() : null
      notes = d.notes?.trim() ? d.notes.trim() : null
      detailsJson = rentalDetailsToJson(d)
      break
    }
    case 'allow': {
      const parsed = allowDetailsSchema.safeParse(draft)
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join('; '))
      }
      const d = parsed.data as AllowDetails
      amount = d.provisional_amount ?? 0
      notes = d.notes?.trim() ? d.notes.trim() : null
      detailsJson = allowDetailsToJson(d)
      break
    }
    case 'deposit': {
      amount = 0
      detailsJson = JSON.stringify({})
      break
    }
    default: {
      return ((t: never) => {
        throw new Error(`Unsupported transaction type: ${String(t)}`)
      })(transactionType)
    }
  }

  const expensePayload = {
    id,
    production_id: productionId,
    category_id: null,
    account_id: accountId,
    transaction_type: transactionType,
    vendor_id: vendorId,
    amount,
    date,
    vendor: null,
    notes,
    expense_type: 'other' as const,
    created_at: ts,
    updated_at: ts,
  }

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
      {
        sql: `INSERT INTO ${EXP_TABLE} (id, production_id, category_id, account_id, transaction_type, vendor_id, amount, date, vendor, notes, expense_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        bindValues: [
          id,
          productionId,
          null,
          accountId,
          transactionType,
          vendorId,
          amount,
          date,
          null,
          notes,
          'other',
          ts,
          ts,
        ],
      },
      // expense_transaction_details: no outbox row. Sync is driven by expenses; details are subsidiary.
      {
        sql: `
          INSERT INTO ${DETAILS_TABLE} (id, expense_id, transaction_type, details_json, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(expense_id) DO UPDATE SET
            transaction_type = excluded.transaction_type,
            details_json = excluded.details_json,
            updated_at = excluded.updated_at
        `,
        bindValues: [uuid(), id, transactionType, detailsJson, ts, ts],
      },
    ]

    if (transactionType === 'purchase' && locationId != null) {
      statements.push({
        sql: `UPDATE ${LOC_TABLE} SET booked_status = 'booked', updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
        bindValues: [ts, locationId],
      })
      // locations table participates in sync (see location.ts outboxPush on update); include outbox row.
      statements.push(
        outboxStatementForRow({
          entity: LOC_TABLE,
          entityId: locationId,
          operation: 'update',
          payloadJson: JSON.stringify({ booked_status: 'booked' }),
        })
      )
    }

    statements.push(
      outboxStatementForRow({
        entity: EXP_TABLE,
        entityId: id,
        operation: 'create',
        payloadJson: JSON.stringify(expensePayload),
      })
    )
    statements.push({ sql: 'COMMIT', bindValues: [] })

    await executeBatch(db, statements)
  })

  return rowToExpense(expensePayload)
}
