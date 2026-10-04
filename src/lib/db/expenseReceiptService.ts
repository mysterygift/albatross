/**
 * Receipt storage for expenses: file + `expense_receipt` document + optional metadata row, always in
 * ONE transaction, with the written file removed again if the transaction fails (mirrors the invoice
 * document path in vendorFinanceDocumentService).
 */
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '@/lib/db/client'
import {
  removeProductionDocumentFile,
  writeProductionDocumentFile,
} from '@/lib/db/productionDocumentFiles'
import { buildCreateDocumentStatements } from '@/lib/db/repositories/document'
import {
  buildCreateExpenseReceiptStatements,
  buildReplaceReceiptDocumentStatements,
  buildUpdateExpenseReceiptStatements,
  getExpenseReceiptById,
  type ExpenseReceipt,
} from '@/lib/db/repositories/expenseReceipts'

type Stmt = { sql: string; bindValues: unknown[] }

export type ReceiptFileInput = {
  fileName: string
  bytes: Uint8Array
  mimeType?: string | null
}

/**
 * Receipt proof for an expense (works without a vendor, for every transaction type).
 * Date / amount / reference are all optional; there is no invoice number, status or reminder task.
 */
export type ExpenseReceiptDraft = {
  fileName?: string
  bytes?: Uint8Array
  mimeType?: string | null
  /** ISO date (YYYY-MM-DD) printed on the receipt. */
  receiptDate?: string | null
  receiptAmount?: number | null
  reference?: string | null
}

/** True when the receipt draft carries nothing worth storing. */
export function isExpenseReceiptDraftEmpty(receipt: ExpenseReceiptDraft | null | undefined): boolean {
  if (!receipt) return true
  if (receipt.bytes && receipt.fileName) return false
  if (receipt.receiptDate?.trim()) return false
  if (receipt.receiptAmount != null) return false
  if (receipt.reference?.trim()) return false
  return true
}

export const RECEIPT_FILE_REQUIRED_MESSAGE =
  'Attach the receipt file, or clear the receipt details (a receipt needs a file)'

/** Throws on an invalid date / amount; returns normalised metadata. */
function normaliseMetadata(draft: {
  receiptDate?: string | null
  receiptAmount?: number | null
  reference?: string | null
}) {
  const receiptDate = draft.receiptDate?.trim() ? draft.receiptDate.trim() : null
  if (receiptDate && !/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) {
    throw new Error('Receipt date must be a valid date')
  }
  const amount = draft.receiptAmount ?? null
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error('Receipt amount must be zero or more')
  }
  return { receipt_date: receiptDate, amount, reference: draft.reference ?? null }
}

export type ReceiptPlan = {
  /** Statements to run inside the caller's transaction (no BEGIN/COMMIT). */
  statements: Stmt[]
  /** Files already written to disk; the caller removes them if the transaction fails. */
  writtenFilePaths: string[]
  /** Id of the new receipt row, when one is created. */
  receiptId?: string
}

/**
 * Plan the receipt for a new / existing expense: writes the file to disk now and returns the document +
 * metadata statements for the caller's transaction. An empty draft is a no-op; a draft with details but
 * no file is rejected (nothing is written).
 */
export async function buildExpenseReceiptPlan(
  target: { expenseId: string; productionId: string },
  receipt: ExpenseReceiptDraft | null | undefined,
  ts: string
): Promise<ReceiptPlan> {
  if (isExpenseReceiptDraftEmpty(receipt) || !receipt) return { statements: [], writtenFilePaths: [] }
  if (!receipt.bytes || !receipt.fileName) throw new Error(RECEIPT_FILE_REQUIRED_MESSAGE)
  const meta = normaliseMetadata(receipt)

  const documentId = uuid()
  const receiptId = uuid()
  const relativePath = await writeProductionDocumentFile(
    target.productionId,
    documentId,
    receipt.fileName,
    receipt.bytes
  )
  try {
    return {
      receiptId,
      writtenFilePaths: [relativePath],
      statements: [
        ...buildCreateDocumentStatements(documentId, ts, {
          production_id: target.productionId,
          entity_type: DOCUMENT_ENTITY_TYPES.expenseReceipt,
          entity_id: target.expenseId,
          file_name: receipt.fileName,
          file_path: relativePath,
          mime_type: receipt.mimeType ?? null,
        }),
        ...buildCreateExpenseReceiptStatements(receiptId, ts, {
          expense_id: target.expenseId,
          document_id: documentId,
          ...meta,
        }),
      ],
    }
  } catch (error) {
    await removeProductionDocumentFile(relativePath)
    throw error
  }
}

async function runAtomically(statements: Stmt[], writtenFilePaths: string[]): Promise<void> {
  try {
    await runInSerializedTransaction(async () => {
      const db = await getDb()
      await executeBatch(db, [{ sql: 'BEGIN', bindValues: [] }, ...statements, { sql: 'COMMIT', bindValues: [] }])
    })
  } catch (error) {
    for (const p of writtenFilePaths) await removeProductionDocumentFile(p)
    throw error
  }
}

async function loadExpenseProduction(expenseId: string): Promise<string> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM expenses WHERE id = $1 AND deleted_at IS NULL`,
    [expenseId]
  )
  if (!rows[0]) throw new Error('Expense not found or deleted')
  return rows[0].production_id
}

/** Attach an additional receipt (file + optional date / amount / reference) to an existing expense. */
export async function attachReceiptToExpense(
  expenseId: string,
  receipt: ExpenseReceiptDraft
): Promise<ExpenseReceipt> {
  if (!receipt.bytes || !receipt.fileName) throw new Error(RECEIPT_FILE_REQUIRED_MESSAGE)
  const productionId = await loadExpenseProduction(expenseId)
  const plan = await buildExpenseReceiptPlan({ expenseId, productionId }, receipt, now())
  await runAtomically(plan.statements, plan.writtenFilePaths)
  const created = plan.receiptId ? await getExpenseReceiptById(plan.receiptId) : null
  if (!created) throw new Error('Receipt not found after attach')
  return created
}

/**
 * Plan swapping the file on an existing receipt (metadata kept; the old document is soft-deleted).
 * Writes the new file now; the caller removes `writtenFilePaths` if its transaction fails.
 */
export async function buildReplaceReceiptFilePlan(
  receipt: Pick<ExpenseReceipt, 'id' | 'expense_id' | 'document_id'>,
  productionId: string,
  file: ReceiptFileInput,
  ts: string
): Promise<ReceiptPlan> {
  const documentId = uuid()
  const relativePath = await writeProductionDocumentFile(productionId, documentId, file.fileName, file.bytes)
  return {
    receiptId: receipt.id,
    writtenFilePaths: [relativePath],
    statements: [
      ...buildCreateDocumentStatements(documentId, ts, {
        production_id: productionId,
        entity_type: DOCUMENT_ENTITY_TYPES.expenseReceipt,
        entity_id: receipt.expense_id,
        file_name: file.fileName,
        file_path: relativePath,
        mime_type: file.mimeType ?? null,
      }),
      ...buildReplaceReceiptDocumentStatements(receipt.id, ts, receipt.document_id, documentId),
    ],
  }
}

/** Edit the optional date / amount / reference of a receipt. */
export async function updateExpenseReceiptDetails(
  receiptId: string,
  details: { receiptDate?: string | null; receiptAmount?: number | null; reference?: string | null }
): Promise<ExpenseReceipt> {
  const meta = normaliseMetadata(details)
  const patch = {
    ...(details.receiptDate !== undefined ? { receipt_date: meta.receipt_date } : {}),
    ...(details.receiptAmount !== undefined ? { amount: meta.amount } : {}),
    ...(details.reference !== undefined ? { reference: meta.reference } : {}),
  }
  const existing = await getExpenseReceiptById(receiptId)
  if (!existing) throw new Error('Receipt not found or deleted')
  await runAtomically(buildUpdateExpenseReceiptStatements(receiptId, now(), patch), [])
  return (await getExpenseReceiptById(receiptId))!
}
