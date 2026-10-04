import { describe, expect, it } from 'vitest'

import {
  buildExpenseFinanceFlags,
  getExpenseFinanceFlags,
  isPoMatchableExpense,
} from '@/lib/budget/expenseFinanceFlags'

const NO_PROOF = { receiptCount: 0, invoiceDocumentCount: 0 }
const RECEIPT = { receiptCount: 1, invoiceDocumentCount: 0 }
const INVOICE_FILE = { receiptCount: 0, invoiceDocumentCount: 1 }

describe('isPoMatchableExpense', () => {
  it('needs a vendor and a vendor-type transaction', () => {
    expect(isPoMatchableExpense({ vendor_id: 'v', transaction_type: 'purchase' })).toBe(true)
    expect(isPoMatchableExpense({ vendor_id: 'v', transaction_type: 'rental' })).toBe(true)
    expect(isPoMatchableExpense({ vendor_id: 'v', transaction_type: 'deposit' })).toBe(true)
    expect(isPoMatchableExpense({ vendor_id: null, transaction_type: 'purchase' })).toBe(false)
    expect(isPoMatchableExpense({ vendor_id: 'v', transaction_type: 'labour' })).toBe(false)
    expect(isPoMatchableExpense({ vendor_id: 'v', transaction_type: 'allow' })).toBe(false)
    expect(isPoMatchableExpense({ vendor_id: 'v', transaction_type: null })).toBe(false)
  })
})

describe('getExpenseFinanceFlags', () => {
  const vendorSpend = { vendor_id: 'v', transaction_type: 'purchase' as const }

  it('flags vendor spend with no PO link and no proof', () => {
    expect(getExpenseFinanceFlags(vendorSpend, { poLinkCount: 0, proof: NO_PROOF })).toEqual({
      noPo: true,
      noProof: true,
    })
  })

  it('clears each flag independently', () => {
    expect(getExpenseFinanceFlags(vendorSpend, { poLinkCount: 2, proof: RECEIPT })).toEqual({
      noPo: false,
      noProof: false,
    })
    expect(getExpenseFinanceFlags(vendorSpend, { poLinkCount: 0, proof: INVOICE_FILE })).toEqual({
      noPo: true,
      noProof: false,
    })
  })

  it('stays quiet for vendorless / petty-cash spend about PO but still flags missing proof', () => {
    const petty = { vendor_id: null, transaction_type: 'purchase' as const }
    expect(getExpenseFinanceFlags(petty, { poLinkCount: 0, proof: NO_PROOF })).toEqual({
      noPo: false,
      noProof: true,
    })
  })

  it('does not flag anything while data is still loading', () => {
    expect(getExpenseFinanceFlags(vendorSpend, { poLinkCount: undefined, proof: undefined })).toEqual({
      noPo: false,
      noProof: false,
    })
  })
})

describe('buildExpenseFinanceFlags', () => {
  it('keys flags by expense id', () => {
    const flags = buildExpenseFinanceFlags(
      [
        { id: 'a', vendor_id: 'v', transaction_type: 'purchase' },
        { id: 'b', vendor_id: null, transaction_type: 'purchase' },
      ],
      { a: 0, b: 0 },
      { a: RECEIPT, b: NO_PROOF }
    )
    expect(flags).toEqual({
      a: { noPo: true, noProof: false },
      b: { noPo: false, noProof: true },
    })
  })
})
