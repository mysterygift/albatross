/**
 * Receipts attached directly to an expense (no vendor needed, every transaction type).
 * The file is a `documents` row (`entity_type = 'expense_receipt'`, `entity_id` = expense id);
 * `expense_receipts` holds the optional receipt date / amount / reference keyed to that document.
 */
import type { QueryClient } from '@tanstack/react-query'

import { getDb } from '../client'
import { outboxStatementForRow } from '../outbox'
import { coerceNumber } from '../sqlValueCoercion'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { roundMoneyOrNull } from '@/lib/money/roundMoney'
import type { ExpenseProofCounts } from '@/lib/budget/receiptStatus'
import type { Document, ExpenseReceiptRow } from '../types'
import { buildDeleteDocumentStatements } from './document'

const TABLE = 'expense_receipts'
/** Keep IN (...) lists well under SQLite's bound-variable limit. */
const ID_CHUNK_SIZE = 400

type Stmt = { sql: string; bindValues: unknown[] }

/** A receipt with its file. */
export type ExpenseReceipt = ExpenseReceiptRow & { document: Document }

/** Query key for one expense's receipts: ['expense-receipts', expenseId] */
export function expenseReceiptsQueryKey(expenseId: string): readonly [string, string] {
  return ['expense-receipts', expenseId]
}

/** Prefix for every batched status query of a production: ['expense-receipt-status', productionId] */
export function expenseReceiptStatusBaseQueryKey(productionId: string): readonly [string, string] {
  return ['expense-receipt-status', productionId]
}

/** Query key for the batched status of a set of expenses (order-insensitive). */
export function expenseReceiptStatusQueryKey(
  productionId: string,
  expenseIds: readonly string[]
): readonly [string, string, string] {
  return ['expense-receipt-status', productionId, [...expenseIds].sort().join(',')]
}

/** Invalidate everything that shows receipt state after a receipt was added / replaced / removed. */
export function invalidateExpenseReceiptQueries(
  queryClient: QueryClient,
  args: { productionId: string; expenseId?: string }
): void {
  void queryClient.invalidateQueries({
    queryKey: args.expenseId ? expenseReceiptsQueryKey(args.expenseId) : ['expense-receipts'],
  })
  void queryClient.invalidateQueries({ queryKey: expenseReceiptStatusBaseQueryKey(args.productionId) })
  void queryClient.invalidateQueries({ queryKey: ['documents', args.productionId] })
}

function rowToReceipt(r: Record<string, unknown>): ExpenseReceipt {
  return {
    id: r.id as string,
    expense_id: r.expense_id as string,
    document_id: r.document_id as string,
    receipt_date: (r.receipt_date as string | null) ?? null,
    amount: r.amount != null ? coerceNumber(r.amount, 0) : null,
    reference: (r.reference as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
    document: {
      id: r.document_id as string,
      production_id: (r.doc_production_id as string | null) ?? null,
      entity_type: (r.doc_entity_type as string | null) ?? null,
      entity_id: (r.doc_entity_id as string | null) ?? null,
      file_name: r.doc_file_name as string,
      file_path: r.doc_file_path as string,
      mime_type: (r.doc_mime_type as string | null) ?? null,
      created_at: r.doc_created_at as string,
      updated_at: r.doc_updated_at as string,
      deleted_at: (r.doc_deleted_at as string | null) ?? null,
    },
  }
}

const RECEIPT_SELECT = `SELECT r.*,
    d.production_id AS doc_production_id, d.entity_type AS doc_entity_type, d.entity_id AS doc_entity_id,
    d.file_name AS doc_file_name, d.file_path AS doc_file_path, d.mime_type AS doc_mime_type,
    d.created_at AS doc_created_at, d.updated_at AS doc_updated_at, d.deleted_at AS doc_deleted_at
  FROM ${TABLE} r
  INNER JOIN documents d ON d.id = r.document_id AND d.deleted_at IS NULL`

/** Active receipts for an expense, oldest first. */
export async function listReceiptsByExpense(expenseId: string): Promise<ExpenseReceipt[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `${RECEIPT_SELECT} WHERE r.expense_id = $1 AND r.deleted_at IS NULL ORDER BY r.created_at, r.id`,
    [expenseId]
  )
  return rows.map(rowToReceipt)
}

export async function getExpenseReceiptById(receiptId: string): Promise<ExpenseReceipt | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `${RECEIPT_SELECT} WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [receiptId]
  )
  return rows[0] ? rowToReceipt(rows[0]) : null
}

export type ExpenseReceiptMetadata = {
  receipt_date?: string | null
  amount?: number | null
  reference?: string | null
}

/** Statements (insert + outbox) for the receipt metadata row. No BEGIN/COMMIT. */
export function buildCreateExpenseReceiptStatements(
  id: string,
  ts: string,
  data: { expense_id: string; document_id: string } & ExpenseReceiptMetadata
): Stmt[] {
  const row = {
    expense_id: data.expense_id,
    document_id: data.document_id,
    receipt_date: data.receipt_date?.trim() ? data.receipt_date.trim() : null,
    amount: roundMoneyOrNull(data.amount),
    reference: data.reference?.trim() ? data.reference.trim() : null,
  }
  return [
    {
      sql: `INSERT INTO ${TABLE} (id, expense_id, document_id, receipt_date, amount, reference, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      bindValues: [id, row.expense_id, row.document_id, row.receipt_date, row.amount, row.reference, ts, ts],
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: id,
      operation: 'create',
      payloadJson: JSON.stringify({ ...row, id }),
    }),
  ]
}

/** Statements to update the metadata (date / amount / reference). Only provided keys change. */
export function buildUpdateExpenseReceiptStatements(
  id: string,
  ts: string,
  patch: ExpenseReceiptMetadata
): Stmt[] {
  const sets: string[] = []
  const binds: unknown[] = []
  const payload: Record<string, unknown> = { id }
  const add = (col: string, value: unknown) => {
    binds.push(value)
    sets.push(`${col} = $${binds.length}`)
    payload[col] = value
  }
  if (patch.receipt_date !== undefined) add('receipt_date', patch.receipt_date?.trim() ? patch.receipt_date.trim() : null)
  if (patch.amount !== undefined) add('amount', roundMoneyOrNull(patch.amount))
  if (patch.reference !== undefined) add('reference', patch.reference?.trim() ? patch.reference.trim() : null)
  binds.push(ts)
  sets.push(`updated_at = $${binds.length}`)
  binds.push(id)
  return [
    { sql: `UPDATE ${TABLE} SET ${sets.join(', ')} WHERE id = $${binds.length}`, bindValues: binds },
    outboxStatementForRow({ entity: TABLE, entityId: id, operation: 'update', payloadJson: JSON.stringify(payload) }),
  ]
}

/** Statements to point a receipt at a new document and retire the old one. */
export function buildReplaceReceiptDocumentStatements(
  id: string,
  ts: string,
  oldDocumentId: string,
  newDocumentId: string
): Stmt[] {
  return [
    {
      sql: `UPDATE ${TABLE} SET document_id = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [newDocumentId, ts, id],
    },
    outboxStatementForRow({
      entity: TABLE,
      entityId: id,
      operation: 'update',
      payloadJson: JSON.stringify({ id, document_id: newDocumentId }),
    }),
    ...buildDeleteDocumentStatements(oldDocumentId, ts),
  ]
}

/** Statements to soft-delete a receipt and its document. */
export function buildDeleteExpenseReceiptStatements(id: string, ts: string, documentId: string): Stmt[] {
  return [
    { sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`, bindValues: [ts, ts, id] },
    outboxStatementForRow({ entity: TABLE, entityId: id, operation: 'delete', payloadJson: null }),
    ...buildDeleteDocumentStatements(documentId, ts),
  ]
}

function placeholders(count: number, offset = 0): string {
  return Array.from({ length: count }, (_, i) => `$${i + 1 + offset}`).join(', ')
}

/**
 * Proof counts for many expenses in two batched queries (no N+1): receipt documents on the expenses,
 * and files on vendor invoices linked to them. Every requested id is present in the result.
 * Combine with `expenseHasProof` / `getExpenseProofKind` from `@/lib/budget/receiptStatus`.
 */
export async function listReceiptStatusByExpenseIds(
  expenseIds: readonly string[]
): Promise<Record<string, ExpenseProofCounts>> {
  const result: Record<string, ExpenseProofCounts> = {}
  const unique = [...new Set(expenseIds)]
  for (const id of unique) result[id] = { receiptCount: 0, invoiceDocumentCount: 0 }
  if (unique.length === 0) return result

  const db = await getDb()
  for (let i = 0; i < unique.length; i += ID_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + ID_CHUNK_SIZE)
    const receiptRows = await db.select<Array<{ expense_id: string; c: unknown }>>(
      `SELECT d.entity_id AS expense_id, COUNT(*) AS c
       FROM documents d
       WHERE d.entity_type = $1 AND d.deleted_at IS NULL AND d.entity_id IN (${placeholders(chunk.length, 1)})
       GROUP BY d.entity_id`,
      [DOCUMENT_ENTITY_TYPES.expenseReceipt, ...chunk]
    )
    for (const r of receiptRows) {
      const entry = result[r.expense_id]
      if (entry) entry.receiptCount = coerceNumber(r.c, 0)
    }
    const invoiceRows = await db.select<Array<{ expense_id: string; c: unknown }>>(
      `SELECT vie.expense_id AS expense_id, COUNT(d.id) AS c
       FROM vendor_invoice_expenses vie
       INNER JOIN vendor_invoices vi ON vi.id = vie.vendor_invoice_id AND vi.deleted_at IS NULL
       INNER JOIN documents d ON d.entity_type = $1 AND d.entity_id = vi.id AND d.deleted_at IS NULL
       WHERE vie.expense_id IN (${placeholders(chunk.length, 1)})
       GROUP BY vie.expense_id`,
      [DOCUMENT_ENTITY_TYPES.vendorInvoice, ...chunk]
    )
    for (const r of invoiceRows) {
      const entry = result[r.expense_id]
      if (entry) entry.invoiceDocumentCount = coerceNumber(r.c, 0)
    }
  }
  return result
}
