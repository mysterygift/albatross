import { describe, expect, it } from 'vitest'

import { emptyExpenseVendorFinanceDraft } from '@/features/budget/vendors/ExpenseVendorFinanceSection'
import { isExpenseVendorFinanceDraftEmpty } from '@/lib/db/vendorFinanceDocumentService'

describe('isExpenseVendorFinanceDraftEmpty', () => {
  it('returns true for empty draft', () => {
    expect(isExpenseVendorFinanceDraftEmpty(emptyExpenseVendorFinanceDraft())).toBe(true)
  })

  it('returns false when PO is selected', () => {
    expect(
      isExpenseVendorFinanceDraftEmpty({
        ...emptyExpenseVendorFinanceDraft(),
        poId: 'po-1',
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
