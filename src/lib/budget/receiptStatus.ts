/**
 * Receipt / proof status for expenses (pure; no DB).
 *
 * RULE: an expense has proof of purchase when it has at least one receipt document, OR it is linked to
 * a vendor invoice that has a file attached (an invoice record with no file is just a record, not
 * proof). A receipt wins when both exist. Float reconciliation, list badges and Risk Watch should all
 * use `expenseHasProof` rather than re-deriving this.
 */

export type ExpenseProofCounts = {
  /** Active `expense_receipt` documents attached to the expense. */
  receiptCount: number
  /** Active documents on vendor invoices linked to the expense. */
  invoiceDocumentCount: number
}

export type ExpenseProofKind = 'receipt' | 'invoice' | 'none'

export const NO_EXPENSE_PROOF: ExpenseProofCounts = { receiptCount: 0, invoiceDocumentCount: 0 }

export function getExpenseProofKind(counts: ExpenseProofCounts | null | undefined): ExpenseProofKind {
  if (!counts) return 'none'
  if (counts.receiptCount > 0) return 'receipt'
  if (counts.invoiceDocumentCount > 0) return 'invoice'
  return 'none'
}

export function expenseHasProof(counts: ExpenseProofCounts | null | undefined): boolean {
  return getExpenseProofKind(counts) !== 'none'
}

export type ReceiptCoverage = {
  /** Expenses considered. */
  total: number
  withProof: number
  missing: number
  missingExpenseIds: string[]
}

/** Count proof coverage over `expenseIds` (duplicates counted once; ids absent from the map count as missing). */
export function summarizeReceiptCoverage(
  expenseIds: readonly string[],
  proofByExpenseId: Readonly<Record<string, ExpenseProofCounts | undefined>>
): ReceiptCoverage {
  const seen = new Set<string>()
  const missingExpenseIds: string[] = []
  let withProof = 0
  for (const id of expenseIds) {
    if (seen.has(id)) continue
    seen.add(id)
    if (expenseHasProof(proofByExpenseId[id])) withProof += 1
    else missingExpenseIds.push(id)
  }
  return { total: seen.size, withProof, missing: missingExpenseIds.length, missingExpenseIds }
}

export type FloatReceiptCoverage = {
  byFloatId: Record<string, ReceiptCoverage>
  overall: ReceiptCoverage
}

/** Per-float and overall coverage for the expenses linked to floats. */
export function summarizeFloatReceiptCoverage(
  links: ReadonlyArray<{ float_id: string; expense_id: string }>,
  proofByExpenseId: Readonly<Record<string, ExpenseProofCounts | undefined>>
): FloatReceiptCoverage {
  const idsByFloat = new Map<string, string[]>()
  for (const l of links) {
    const list = idsByFloat.get(l.float_id) ?? []
    list.push(l.expense_id)
    idsByFloat.set(l.float_id, list)
  }
  const byFloatId: Record<string, ReceiptCoverage> = {}
  for (const [floatId, ids] of idsByFloat) {
    byFloatId[floatId] = summarizeReceiptCoverage(ids, proofByExpenseId)
  }
  return {
    byFloatId,
    overall: summarizeReceiptCoverage(
      links.map((l) => l.expense_id),
      proofByExpenseId
    ),
  }
}

/** "3 of 12 expenses missing receipts"; null when there is nothing to report. */
export function formatMissingReceiptsSummary(coverage: ReceiptCoverage): string | null {
  if (coverage.total === 0) return null
  if (coverage.missing === 0) {
    return coverage.total === 1 ? 'Expense has a receipt' : `All ${coverage.total} expenses have receipts`
  }
  return `${coverage.missing} of ${coverage.total} expense${coverage.total === 1 ? '' : 's'} missing receipts`
}
