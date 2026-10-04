import { describe, expect, it } from 'vitest'

import {
  emptyExpenseVendorFinanceDraft,
  hasPendingFinanceChanges,
  isExpenseVendorFinanceDraftEmpty,
  validateExpenseVendorFinanceDraft,
} from '@/lib/db/vendorFinanceDocumentService'

describe('isExpenseVendorFinanceDraftEmpty', () => {
  it('returns true for empty draft', () => {
    expect(isExpenseVendorFinanceDraftEmpty(emptyExpenseVendorFinanceDraft())).toBe(true)
  })

  it('returns false when PO is selected', () => {
    expect(
      isExpenseVendorFinanceDraftEmpty({
        ...emptyExpenseVendorFinanceDraft(),
        poAllocations: [{ poId: 'po-1', allocatedAmount: null }],
      })
    ).toBe(false)
  })

  it('returns false when uploading an invoice with a number', () => {
    expect(
      isExpenseVendorFinanceDraftEmpty({
        ...emptyExpenseVendorFinanceDraft(),
        invoiceMode: 'upload',
        uploadInvoice: { invoice_number: 'INV-1' },
      })
    ).toBe(false)
  })
})

describe('validateExpenseVendorFinanceDraft', () => {
  it('accepts an empty draft and a complete one', () => {
    expect(validateExpenseVendorFinanceDraft(emptyExpenseVendorFinanceDraft())).toBeNull()
    expect(
      validateExpenseVendorFinanceDraft({
        ...emptyExpenseVendorFinanceDraft(),
        poAllocations: [
          { poId: 'a', allocatedAmount: 10 },
          { poId: 'b', allocatedAmount: 20 },
        ],
      })
    ).toBeNull()
  })

  it('reports the first blocking problem', () => {
    const base = emptyExpenseVendorFinanceDraft()
    expect(validateExpenseVendorFinanceDraft({ ...base, receipt: { reference: 'x' } })).toMatch(/receipt file/i)
    expect(
      validateExpenseVendorFinanceDraft({ ...base, invoiceMode: 'upload', uploadInvoice: { invoice_number: ' ' } })
    ).toMatch(/invoice number/i)
    expect(validateExpenseVendorFinanceDraft({ ...base, invoiceMode: 'existing' })).toMatch(/select an existing invoice/i)
    expect(
      validateExpenseVendorFinanceDraft({
        ...base,
        poAllocations: [
          { poId: 'a', allocatedAmount: 10 },
          { poId: 'b', allocatedAmount: null },
        ],
      })
    ).toMatch(/each purchase order/i)
  })
})

describe('hasPendingFinanceChanges', () => {
  const stored = [{ poId: 'a', allocatedAmount: null }]
  const base = { ...emptyExpenseVendorFinanceDraft(), poAllocations: stored }

  it('is false for an untouched draft and for an equivalent whole-expense allocation', () => {
    expect(hasPendingFinanceChanges(base, stored, 100)).toBe(false)
    expect(hasPendingFinanceChanges({ ...base, poAllocations: [{ poId: 'a', allocatedAmount: 100 }] }, stored, 100)).toBe(false)
  })

  it('detects PO adds, removals and allocation changes', () => {
    expect(hasPendingFinanceChanges({ ...base, poAllocations: [] }, stored, 100)).toBe(true)
    expect(
      hasPendingFinanceChanges(
        { ...base, poAllocations: [...stored, { poId: 'b', allocatedAmount: 10 }] },
        stored,
        100
      )
    ).toBe(true)
    expect(hasPendingFinanceChanges({ ...base, poAllocations: [{ poId: 'a', allocatedAmount: 60 }] }, stored, 100)).toBe(true)
    expect(hasPendingFinanceChanges({ ...base, poAllocations: [{ poId: 'z', allocatedAmount: null }] }, stored, 100)).toBe(true)
  })

  it('detects proof changes', () => {
    expect(hasPendingFinanceChanges({ ...base, unlinkInvoiceIds: ['i'] }, stored, 100)).toBe(true)
    expect(hasPendingFinanceChanges({ ...base, removeReceiptIds: ['r'] }, stored, 100)).toBe(true)
    expect(
      hasPendingFinanceChanges(
        { ...base, replaceReceiptFiles: { r: { fileName: 'a.pdf', bytes: new Uint8Array([1]) } } },
        stored,
        100
      )
    ).toBe(true)
    expect(hasPendingFinanceChanges({ ...base, receipt: {} }, stored, 100)).toBe(true)
    expect(hasPendingFinanceChanges({ ...base, invoiceMode: 'upload', uploadInvoice: { invoice_number: '' } }, stored, 100)).toBe(true)
  })
})
