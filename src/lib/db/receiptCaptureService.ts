/**
 * Receipt capture (experimental): saves a photographed receipt as a purchase expense with the photo
 * as its receipt, and optionally matches it to a petty cash float.
 *
 * The expense and its receipt are written in one transaction (createExpenseWithFinance). The float
 * match is a second write: if it fails, the expense is kept and the caller is told, so the spend is
 * never lost because of a float problem. A retry with the same `expenseId` creates nothing twice.
 */

import type { Expense } from './types'
import {
  createExpenseWithFinance,
  emptyExpenseVendorFinanceDraft,
} from './vendorFinanceDocumentService'
import { createFloatExpenseLinks, listFloatExpenseLinksByExpense } from './repositories/floatReconciliation'

export type SaveCapturedReceiptInput = {
  /** Generate once per capture and reuse on retry. */
  expenseId: string
  productionId: string
  productionCurrency: string
  revisionId?: string | null
  accountId: string
  amount: number
  date: string
  description: string
  vendorId: string | null
  vendorName: string | null
  notes: string | null
  reference: string | null
  vatRatePercent: number | null
  floatId: string | null
  receipt: { fileName: string; bytes: Uint8Array; mimeType: string | null }
}

export type SaveCapturedReceiptResult = {
  expense: Expense
  /** True when this call found the expense already saved (a retry) and wrote no new expense. */
  alreadyCreated: boolean
  floatMatched: boolean
  /** Why the float match failed; the expense and receipt are saved regardless. */
  floatError: string | null
}

export async function saveCapturedReceipt(input: SaveCapturedReceiptInput): Promise<SaveCapturedReceiptResult> {
  const finance = emptyExpenseVendorFinanceDraft()
  finance.receipt = {
    fileName: input.receipt.fileName,
    bytes: input.receipt.bytes,
    mimeType: input.receipt.mimeType,
    receiptDate: input.date,
    receiptAmount: input.amount,
    reference: input.reference?.trim() || null,
  }

  const created = await createExpenseWithFinance({
    expenseId: input.expenseId,
    productionId: input.productionId,
    accountId: input.accountId,
    transactionType: 'purchase',
    date: input.date,
    vatRatePercent: input.vatRatePercent,
    draft: {
      purchase_description: input.description.trim(),
      vendor_id: input.vendorId,
      notes: input.notes?.trim() || null,
      amount: input.amount,
    },
    vendorCompanyName: input.vendorName ?? '',
    productionCurrency: input.productionCurrency,
    finance,
  })

  if (!input.floatId) {
    return { expense: created.expense, alreadyCreated: created.alreadyCreated, floatMatched: false, floatError: null }
  }

  try {
    const existing = await listFloatExpenseLinksByExpense(created.expense.id, input.revisionId)
    if (!existing.some((l) => l.float_id === input.floatId)) {
      await createFloatExpenseLinks({
        productionId: input.productionId,
        revisionId: input.revisionId,
        floatId: input.floatId,
        allocations: [{ expenseId: created.expense.id, matchedAmount: created.expense.amount }],
      })
    }
    return { expense: created.expense, alreadyCreated: created.alreadyCreated, floatMatched: true, floatError: null }
  } catch (error) {
    return {
      expense: created.expense,
      alreadyCreated: created.alreadyCreated,
      floatMatched: false,
      floatError: error instanceof Error ? error.message : String(error),
    }
  }
}
