import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import type { Expense, ExpenseTransactionDetails, ExpenseTransactionType, Vendor } from '../types'

const EXP_TABLE = 'expenses'
const VENDOR_TABLE = 'vendors'
const DETAILS_TABLE = 'expense_transaction_details'
const ACCOUNT_TABLE = 'budget_accounts'

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

function rowToVendor(r: Record<string, unknown>): Vendor {
  return {
    id: r.vendor_row_id as string,
    production_id: r.vendor_production_id as string,
    company_name: r.vendor_company_name as string,
    primary_contact_full_name: (r.vendor_primary_contact_full_name as string | null) ?? null,
    primary_contact_email: (r.vendor_primary_contact_email as string | null) ?? null,
    created_at: r.vendor_created_at as string,
    updated_at: r.vendor_updated_at as string,
    deleted_at: (r.vendor_deleted_at as string | null) ?? null,
  }
}

function rowToDetails(r: Record<string, unknown>): ExpenseTransactionDetails {
  return {
    id: r.details_id as string,
    expense_id: r.details_expense_id as string,
    transaction_type: r.details_transaction_type as ExpenseTransactionType,
    details_json: r.details_json as string,
    created_at: r.details_created_at as string,
    updated_at: r.details_updated_at as string,
  }
}

export type ExpenseWithDetails = {
  expense: Expense
  vendor: Vendor | null
  transaction_details: ExpenseTransactionDetails | null
  account: { id: string; code: string; name: string } | null
}

export async function getExpenseWithDetails(expenseId: string): Promise<ExpenseWithDetails | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `
    SELECT
      e.*,
      a.id as account_id_join,
      a.code as account_code,
      a.name as account_name,
      v.id as vendor_row_id,
      v.production_id as vendor_production_id,
      v.company_name as vendor_company_name,
      v.primary_contact_full_name as vendor_primary_contact_full_name,
      v.primary_contact_email as vendor_primary_contact_email,
      v.created_at as vendor_created_at,
      v.updated_at as vendor_updated_at,
      v.deleted_at as vendor_deleted_at,
      d.id as details_id,
      d.expense_id as details_expense_id,
      d.transaction_type as details_transaction_type,
      d.details_json as details_json,
      d.created_at as details_created_at,
      d.updated_at as details_updated_at
    FROM ${EXP_TABLE} e
    LEFT JOIN ${ACCOUNT_TABLE} a ON a.id = e.account_id AND a.deleted_at IS NULL
    LEFT JOIN ${VENDOR_TABLE} v ON v.id = e.vendor_id AND v.deleted_at IS NULL
    LEFT JOIN ${DETAILS_TABLE} d ON d.expense_id = e.id
    WHERE e.id = $1 AND e.deleted_at IS NULL
    LIMIT 1
    `,
    [expenseId]
  )
  if (rows.length === 0) return null
  const r = rows[0]!
  const expense = rowToExpense(r)
  const account =
    (r.account_id_join as string | null) != null
      ? { id: r.account_id_join as string, code: r.account_code as string, name: r.account_name as string }
      : null
  const vendor = (r.vendor_company_name as string | null) != null ? rowToVendor(r) : null
  const transaction_details = (r.details_id as string | null) != null ? rowToDetails(r) : null
  return { expense, vendor, transaction_details, account }
}

export async function saveExpenseTransactionDetails(data: {
  expenseId: string
  transactionType: ExpenseTransactionType
  details: unknown
}): Promise<void> {
  const ts = now()
  const detailsJson = JSON.stringify(data.details ?? {})

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN TRANSACTION', bindValues: [] },
      {
        sql: `UPDATE ${EXP_TABLE} SET transaction_type = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
        bindValues: [data.transactionType, ts, data.expenseId],
      },
      {
        sql: `
          INSERT INTO ${DETAILS_TABLE} (id, expense_id, transaction_type, details_json, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(expense_id) DO UPDATE SET
            transaction_type = excluded.transaction_type,
            details_json = excluded.details_json,
            updated_at = excluded.updated_at
        `,
        bindValues: [uuid(), data.expenseId, data.transactionType, detailsJson, ts, ts],
      },
      { sql: 'COMMIT', bindValues: [] },
    ]
    await executeBatch(db, statements)
  })
}

export async function listAllowExpenseDetailsByProduction(
  productionId: string
): Promise<Array<{ expense_id: string; account_id: string | null; details_json: string }>> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `
    SELECT e.id as expense_id, e.account_id as account_id, d.details_json as details_json
    FROM ${DETAILS_TABLE} d
    INNER JOIN ${EXP_TABLE} e ON e.id = d.expense_id
    WHERE e.production_id = $1
      AND e.deleted_at IS NULL
      AND d.transaction_type = 'allow'
    `,
    [productionId]
  )
  return rows.map((r) => ({
    expense_id: r.expense_id as string,
    account_id: (r.account_id as string | null) ?? null,
    details_json: r.details_json as string,
  }))
}

