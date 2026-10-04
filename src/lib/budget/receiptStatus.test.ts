import { describe, expect, it } from 'vitest'

import {
  expenseHasProof,
  formatMissingReceiptsSummary,
  getExpenseProofKind,
  summarizeFloatReceiptCoverage,
  summarizeReceiptCoverage,
} from '@/lib/budget/receiptStatus'

const none = { receiptCount: 0, invoiceDocumentCount: 0 }
const receipt = { receiptCount: 1, invoiceDocumentCount: 0 }
const invoice = { receiptCount: 0, invoiceDocumentCount: 2 }

describe('getExpenseProofKind / expenseHasProof', () => {
  it('treats a receipt document as proof', () => {
    expect(getExpenseProofKind(receipt)).toBe('receipt')
    expect(expenseHasProof(receipt)).toBe(true)
  })

  it('treats a linked invoice WITH a file as proof', () => {
    expect(getExpenseProofKind(invoice)).toBe('invoice')
    expect(expenseHasProof(invoice)).toBe(true)
  })

  it('prefers the receipt when both exist', () => {
    expect(getExpenseProofKind({ receiptCount: 1, invoiceDocumentCount: 1 })).toBe('receipt')
  })

  it('has no proof with neither, or with no data', () => {
    expect(getExpenseProofKind(none)).toBe('none')
    expect(expenseHasProof(none)).toBe(false)
    expect(expenseHasProof(undefined)).toBe(false)
    expect(expenseHasProof(null)).toBe(false)
  })
})

describe('summarizeReceiptCoverage', () => {
  it('counts missing expenses, de-duplicates ids and treats unknown ids as missing', () => {
    const cov = summarizeReceiptCoverage(['a', 'b', 'c', 'a', 'd'], { a: receipt, b: none, c: invoice })
    expect(cov).toEqual({ total: 4, withProof: 2, missing: 2, missingExpenseIds: ['b', 'd'] })
  })

  it('handles an empty list', () => {
    expect(summarizeReceiptCoverage([], {})).toEqual({ total: 0, withProof: 0, missing: 0, missingExpenseIds: [] })
  })
})

describe('summarizeFloatReceiptCoverage', () => {
  it('groups by float and totals overall', () => {
    const out = summarizeFloatReceiptCoverage(
      [
        { float_id: 'f1', expense_id: 'a' },
        { float_id: 'f1', expense_id: 'b' },
        { float_id: 'f2', expense_id: 'c' },
      ],
      { a: receipt, b: none, c: invoice }
    )
    expect(out.byFloatId.f1).toMatchObject({ total: 2, missing: 1, missingExpenseIds: ['b'] })
    expect(out.byFloatId.f2).toMatchObject({ total: 1, missing: 0 })
    expect(out.overall).toMatchObject({ total: 3, withProof: 2, missing: 1 })
  })
})

describe('formatMissingReceiptsSummary', () => {
  it('words the missing count', () => {
    expect(formatMissingReceiptsSummary({ total: 12, withProof: 9, missing: 3, missingExpenseIds: [] })).toBe(
      '3 of 12 expenses missing receipts'
    )
    expect(formatMissingReceiptsSummary({ total: 1, withProof: 0, missing: 1, missingExpenseIds: [] })).toBe(
      '1 of 1 expense missing receipts'
    )
  })

  it('says all good, or nothing when there are no expenses', () => {
    expect(formatMissingReceiptsSummary({ total: 4, withProof: 4, missing: 0, missingExpenseIds: [] })).toBe(
      'All 4 expenses have receipts'
    )
    expect(formatMissingReceiptsSummary({ total: 0, withProof: 0, missing: 0, missingExpenseIds: [] })).toBeNull()
  })
})
