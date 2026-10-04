// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ExpenseFinanceEditor } from '@/features/budget/vendors/ExpenseFinanceEditor'
import type { ExpenseVendorFinanceDraft } from '@/lib/db/vendorFinanceDocumentService'

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  poLinks: [] as unknown[],
  invoiceLinks: [] as unknown[],
  receipts: [] as unknown[],
  toastWarning: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/lib/db/applyFinanceDraftToExpense', () => ({ applyFinanceDraftToExpense: mocks.apply }))
vi.mock('@/components/ui/sonner', () => ({ toast: { warning: mocks.toastWarning, success: mocks.toastSuccess } }))
vi.mock('@/lib/db/repositories/vendorFinanceLinks', () => ({
  listPurchaseOrderLinksByExpenseId: async () => mocks.poLinks,
  listInvoiceLinksByExpenseId: async () => mocks.invoiceLinks,
  vendorPurchaseOrderLinksByExpenseQueryKey: (id: string) => ['po-links', id],
  vendorInvoiceLinksByExpenseQueryKey: (id: string) => ['invoice-links', id],
  vendorPoCommitmentLinksQueryKey: (p: string) => ['vendor-po-commitment-links', p],
  expensePoLinkCountsBaseQueryKey: (p: string) => ['expense-po-link-counts', p],
  vendorInvoiceExpenseLinksQueryKey: (id: string) => ['inv-exp', id],
  vendorPurchaseOrderExpenseLinksQueryKey: (id: string) => ['po-exp', id],
}))
vi.mock('@/lib/db/repositories/expenseReceipts', () => ({
  listReceiptsByExpense: async () => mocks.receipts,
  expenseReceiptsQueryKey: (id: string) => ['expense-receipts', id],
  invalidateExpenseReceiptQueries: () => undefined,
}))
vi.mock('@/lib/db/repositories/vendorInvoices', () => ({
  getVendorInvoiceById: async (id: string) => ({
    id,
    invoice_number: `N-${id}`,
    amount: 10,
    currency_code: null,
  }),
  vendorInvoicesQueryKey: (p: string, v: string) => ['vendor-invoices', p, v],
}))
vi.mock('@/lib/budget/vendors/invalidateVendorFinanceQueries', () => ({
  invalidateExpenseFinanceQueries: vi.fn(),
}))
// Drive the draft directly; the real section is covered by ExpenseDocumentMatch.test.tsx.
vi.mock('@/features/budget/vendors/ExpenseDocumentMatch', () => ({
  ExpenseDocumentMatch: ({
    draft,
    onDraftChange,
    allowPoMatching,
    existingProof,
  }: {
    draft: ExpenseVendorFinanceDraft
    onDraftChange: (d: ExpenseVendorFinanceDraft) => void
    allowPoMatching: boolean
    existingProof: { invoices: Array<{ id: string }> }
  }) => (
    <div>
      <span data-testid="po-ids">{draft.poAllocations.map((a) => a.poId).join(',')}</span>
      <span data-testid="allow-po">{String(allowPoMatching)}</span>
      <span data-testid="invoice-ids">{existingProof.invoices.map((i) => i.id).join(',')}</span>
      <button onClick={() => onDraftChange({ ...draft, poAllocations: [] })}>drop-pos</button>
      <button onClick={() => onDraftChange({ ...draft, unlinkInvoiceIds: ['inv-1'] })}>unlink</button>
      <button onClick={() => onDraftChange({ ...draft, invoiceMode: 'upload', uploadInvoice: { invoice_number: ' ' } })}>
        bad-upload
      </button>
    </div>
  ),
}))

beforeEach(() => {
  mocks.apply.mockReset()
  mocks.toastWarning.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.poLinks = [{ id: 'l1', vendor_purchase_order_id: 'po-1', expense_id: 'e1', allocated_amount: null }]
  mocks.invoiceLinks = [{ id: 'il1', vendor_invoice_id: 'inv-1', expense_id: 'e1' }]
  mocks.receipts = []
})
afterEach(cleanup)

const format = (n: number) => ({ formatted: `£${n}` })

function renderEditor(expense = { id: 'e1', vendor_id: 'v1', transaction_type: 'purchase' as const, amount: 100 }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ExpenseFinanceEditor productionId="prod" expense={expense} productionCurrency="GBP" format={format} />
    </QueryClientProvider>
  )
}

describe('ExpenseFinanceEditor', () => {
  it('starts from the stored links, with no save bar until something changes', async () => {
    renderEditor()
    await waitFor(() => expect(screen.getByTestId('po-ids').textContent).toBe('po-1'))
    await waitFor(() => expect(screen.getByTestId('invoice-ids').textContent).toBe('inv-1'))
    expect(screen.queryByRole('button', { name: 'Save PO & documents' })).toBeNull()
  })

  it('only offers PO matching for vendor-type spend with a vendor', async () => {
    renderEditor({ id: 'e1', vendor_id: null as unknown as string, transaction_type: 'purchase', amount: 100 })
    expect(screen.getByTestId('allow-po').textContent).toBe('false')
  })

  it('applies the whole draft in one call, then returns to the stored state', async () => {
    mocks.apply.mockResolvedValue({
      changed: true,
      warnings: [],
      affectedPoIds: ['po-1'],
      affectedInvoiceIds: [],
      receiptsChanged: false,
    })
    renderEditor()
    await waitFor(() => expect(screen.getByTestId('po-ids').textContent).toBe('po-1'))

    fireEvent.click(screen.getByText('drop-pos'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save PO & documents' }))

    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1))
    expect(mocks.apply.mock.calls[0]![0]).toMatchObject({
      expenseId: 'e1',
      productionCurrency: 'GBP',
      draft: { poAllocations: [] },
    })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save PO & documents' })).toBeNull())
  })

  it('shows PO warnings after saving instead of blocking', async () => {
    mocks.apply.mockResolvedValue({
      changed: true,
      warnings: [{ code: 'over_po_remaining', message: 'This spend exceeds the 10.00 remaining on PO-1.' }],
      affectedPoIds: [],
      affectedInvoiceIds: [],
      receiptsChanged: false,
    })
    renderEditor()
    await waitFor(() => expect(screen.getByTestId('po-ids').textContent).toBe('po-1'))
    fireEvent.click(screen.getByText('unlink'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save PO & documents' }))
    await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalled())
    expect(mocks.toastWarning.mock.calls[0]![1].description).toContain('exceeds the 10.00 remaining')
  })

  it('validates before calling the service and discards cleanly', async () => {
    renderEditor()
    await waitFor(() => expect(screen.getByTestId('po-ids').textContent).toBe('po-1'))

    fireEvent.click(screen.getByText('bad-upload'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save PO & documents' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/invoice number/i)
    expect(mocks.apply).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save PO & documents' })).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
