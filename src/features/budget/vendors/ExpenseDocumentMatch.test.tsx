// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

import { ExpenseDocumentMatch } from '@/features/budget/vendors/ExpenseDocumentMatch'
import type { ExpenseReceipt } from '@/lib/db/repositories/expenseReceipts'
import type { ExpenseVendorFinanceDraft } from '@/lib/db/vendorFinanceDocumentService'

const PO = (id: string, vendor_id: string, over: Record<string, unknown> = {}) => ({
  id,
  production_id: 'prod',
  vendor_id,
  po_number: id.toUpperCase(),
  description: null,
  issue_date: null,
  due_date: null,
  amount: 1000,
  status: 'issued',
  approval: 1,
  notes: null,
  ...over,
})

const mocks = vi.hoisted(() => ({
  pos: [] as unknown[],
  links: [] as unknown[],
  invoices: [] as unknown[],
}))

vi.mock('@/lib/db/repositories/vendorPurchaseOrders', () => ({
  listVendorPurchaseOrdersByProduction: async () => mocks.pos,
  vendorPurchaseOrdersByProductionQueryKey: (p: string) => ['vendor-purchase-orders-production', p],
}))
vi.mock('@/lib/db/repositories/vendors', () => ({
  listVendors: async () => [
    { id: 'v1', company_name: 'Acme Props' },
    { id: 'v2', company_name: 'Fabric House' },
  ],
}))
vi.mock('@/lib/db/repositories/vendorFinanceLinks', () => ({
  listPoCommitmentLinksByProduction: async () => mocks.links,
  vendorPoCommitmentLinksQueryKey: (p: string) => ['vendor-po-commitment-links', p],
}))
vi.mock('@/lib/db/repositories/vendorInvoices', () => ({
  listVendorInvoicesByVendorId: async () => mocks.invoices,
  vendorInvoicesQueryKey: (p: string, v: string) => ['vendor-invoices', p, v],
}))
vi.mock('@/features/budget/vendors/VendorFinanceDocumentField', () => ({
  VendorFinanceDocumentField: ({ label = 'Attachment' }: { label?: string }) => <div>{label} field</div>,
}))
vi.mock('@/features/budget/vendors/IncreasePoDialog', () => ({
  IncreasePoDialog: ({ target }: { target: { poNumber: string; suggestedAmount: number } | null }) =>
    target ? <div data-testid="increase-dialog">{`${target.poNumber}:${target.suggestedAmount}`}</div> : null,
}))

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  cleanup()
  mocks.pos = []
  mocks.links = []
  mocks.invoices = []
})

const format = (amount: number) => ({ formatted: `£${amount.toFixed(0)}` })
const emptyDraft = (): ExpenseVendorFinanceDraft => ({
  poAllocations: [],
  invoiceMode: 'none',
  existingInvoiceId: null,
  uploadInvoice: null,
  receipt: null,
})

function Host({
  initialVendorId = null,
  expenseAmount = 400,
  allowPoMatching = true,
  onDraft,
}: {
  initialVendorId?: string | null
  expenseAmount?: number | null
  allowPoMatching?: boolean
  onDraft?: (d: ExpenseVendorFinanceDraft) => void
}) {
  const [vendorId, setVendorId] = useState<string | null>(initialVendorId)
  const [draft, setDraft] = useState(emptyDraft)
  return (
    <>
      <span data-testid="vendor">{vendorId ?? 'none'}</span>
      <ExpenseDocumentMatch
        productionId="prod"
        vendorId={vendorId}
        onVendorChange={setVendorId}
        expenseAmount={expenseAmount}
        productionCurrency="GBP"
        format={format}
        draft={draft}
        onDraftChange={(d) => {
          onDraft?.(d)
          setDraft(d)
        }}
        mode="create"
        allowPoMatching={allowPoMatching}
      />
    </>
  )
}

function renderHost(props: Parameters<typeof Host>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Host {...props} />
    </QueryClientProvider>
  )
}

const openCombobox = async () => {
  const trigger = await screen.findByRole('combobox', { name: 'Purchase orders' })
  fireEvent.click(trigger)
}

describe('ExpenseDocumentMatch', () => {
  it('picking a PO fills the empty vendor and shows the live summary', async () => {
    mocks.pos = [PO('po-1', 'v1'), PO('po-2', 'v2')]
    const drafts: ExpenseVendorFinanceDraft[] = []
    renderHost({ onDraft: (d) => drafts.push(d) })

    await openCombobox()
    fireEvent.click(await screen.findByRole('option', { name: /PO-2/ }))

    expect(screen.getByTestId('vendor').textContent).toBe('v2')
    expect(drafts.at(-1)?.poAllocations).toEqual([{ poId: 'po-2', allocatedAmount: null }])
    const row = await screen.findByTestId('po-summary-po-2')
    expect(row.textContent).toContain('£400') // whole expense by default
    expect(screen.getByTestId('po-remaining-after-po-2').textContent).toBe('£600')
  })

  it('suggests the vendor\'s only open PO as a one-tap chip', async () => {
    mocks.pos = [PO('po-1', 'v1'), PO('po-2', 'v2'), PO('po-3', 'v1', { status: 'closed' })]
    const drafts: ExpenseVendorFinanceDraft[] = []
    renderHost({ initialVendorId: 'v1', onDraft: (d) => drafts.push(d) })

    const chip = await screen.findByRole('button', { name: /Use PO-1/ })
    expect(chip.textContent).toContain('£1000 left')
    fireEvent.click(chip)
    expect(drafts.at(-1)?.poAllocations).toEqual([{ poId: 'po-1', allocatedAmount: null }])
    await waitFor(() => expect(screen.queryByRole('button', { name: /Use PO-1/ })).toBeNull())
  })

  it('does not suggest when the vendor has several open POs', async () => {
    mocks.pos = [PO('po-1', 'v1'), PO('po-4', 'v1', { status: 'approved' })]
    renderHost({ initialVendorId: 'v1' })
    await openCombobox() // wait for load
    await screen.findAllByRole('option')
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
  })

  it('warns when the spend exceeds the PO remaining and offers "Increase PO to cover"', async () => {
    mocks.pos = [PO('po-1', 'v1', { amount: 500 })]
    mocks.links = [{ poId: 'po-1', expenseId: 'other', allocatedAmount: 300, expenseAmount: 300, expenseLinkCount: 1 }]
    renderHost({ initialVendorId: 'v1', expenseAmount: 400 })

    fireEvent.click(await screen.findByRole('button', { name: /Use PO-1/ }))
    const warnings = await screen.findByTestId('po-match-warnings')
    expect(warnings.textContent).toContain('exceeds the 200.00 remaining')

    fireEvent.click(screen.getByRole('button', { name: 'Increase PO to cover' }))
    // 500 + 200 shortfall
    expect((await screen.findByTestId('increase-dialog')).textContent).toBe('PO-1:700')
  })

  it('requires explicit allocations once several POs are picked', async () => {
    mocks.pos = [PO('po-1', 'v1'), PO('po-2', 'v1', { status: 'approved' })]
    const drafts: ExpenseVendorFinanceDraft[] = []
    renderHost({ initialVendorId: 'v1', onDraft: (d) => drafts.push(d) })

    await openCombobox()
    fireEvent.click(await screen.findByRole('option', { name: /PO-1/ }))
    fireEvent.click(await screen.findByRole('option', { name: /PO-2/ }))

    expect(drafts.at(-1)?.poAllocations).toEqual([
      { poId: 'po-1', allocatedAmount: 400 },
      { poId: 'po-2', allocatedAmount: null },
    ])
    expect(await screen.findByLabelText('Amount allocated to PO-2')).toBeTruthy()
    expect((await screen.findByTestId('po-match-warnings')).textContent).toContain('Enter how much of this spend goes to PO-2')
  })

  it('switches proof between receipt, invoice and none; receipts need no vendor', async () => {
    mocks.pos = [PO('po-1', 'v1')]
    const drafts: ExpenseVendorFinanceDraft[] = []
    renderHost({ onDraft: (d) => drafts.push(d) })

    const invoiceTab = screen.getByRole('tab', { name: 'Invoice' }) as HTMLButtonElement
    expect(invoiceTab.disabled).toBe(true)
    expect(screen.getByText(/Choose a vendor \(or a PO\) to attach an invoice/)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Receipt' }))
    expect(screen.getByTestId('receipt-fields')).toBeTruthy()
    expect(drafts.at(-1)?.receipt).toEqual({})

    fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'TILL-9' } })
    expect(drafts.at(-1)?.receipt?.reference).toBe('TILL-9')

    fireEvent.click(screen.getByRole('tab', { name: 'None' }))
    expect(drafts.at(-1)).toMatchObject({ receipt: null, invoiceMode: 'none' })
  })

  it('upload invoice requires a number field and defaults to upload when the vendor has none', async () => {
    renderHost({ initialVendorId: 'v1' })
    fireEvent.click(screen.getByRole('tab', { name: 'Invoice' }))
    expect(await screen.findByLabelText('Invoice number *')).toBeTruthy()
    expect(screen.getByTestId('invoice-fields')).toBeTruthy()
  })

  it('new invoice offers the same fields as the vendor view and defaults currency/status', async () => {
    const drafts: ExpenseVendorFinanceDraft[] = []
    renderHost({ initialVendorId: 'v1', onDraft: (d) => drafts.push(d) })
    fireEvent.click(screen.getByRole('tab', { name: 'Invoice' }))

    for (const label of ['Invoice number *', 'Issue date', 'Due date', 'Amount', 'Tax (manual)', 'Currency', 'Status', 'Notes']) {
      expect(await screen.findByLabelText(label)).toBeTruthy()
    }
    expect(drafts.at(-1)?.uploadInvoice).toMatchObject({ currency_code: 'GBP', status: 'received' })

    fireEvent.change(screen.getByLabelText('Tax (manual)'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Rush job' } })
    expect(drafts.at(-1)?.uploadInvoice).toMatchObject({
      tax: 20,
      notes: 'Rush job',
      currency_code: 'GBP',
      status: 'received',
    })
  })

  it('only offers Receipt | None (no POs) when PO matching is not allowed', async () => {
    renderHost({ allowPoMatching: false })
    expect(screen.queryByText('Purchase orders')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Invoice' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Receipt' })).toBeTruthy()
  })
})

const receipt = (id: string): ExpenseReceipt =>
  ({
    id,
    expense_id: 'e1',
    document_id: `doc-${id}`,
    receipt_date: '2026-06-15',
    amount: 24.5,
    reference: 'T-1',
    document: { id: `doc-${id}`, file_name: `${id}.pdf`, file_path: `${id}.pdf` },
  }) as unknown as ExpenseReceipt

function EditHost({
  initialDraft,
  onDraft,
}: {
  initialDraft?: Partial<ExpenseVendorFinanceDraft>
  onDraft?: (d: ExpenseVendorFinanceDraft) => void
}) {
  const [draft, setDraft] = useState<ExpenseVendorFinanceDraft>({ ...emptyDraft(), ...initialDraft })
  return (
    <ExpenseDocumentMatch
      productionId="prod"
      vendorId="v1"
      expenseAmount={100}
      productionCurrency="GBP"
      format={format}
      draft={draft}
      onDraftChange={(d) => {
        onDraft?.(d)
        setDraft(d)
      }}
      mode="edit"
      expenseId="e1"
      existingProof={{
        invoices: [{ id: 'inv-1', invoiceNumber: 'INV-1', amount: 80, currencyCode: null }],
        receipts: [receipt('r1')],
      }}
    />
  )
}

function renderEdit(props: Parameters<typeof EditHost>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <EditHost {...props} />
    </QueryClientProvider>
  )
}

describe('ExpenseDocumentMatch (edit mode)', () => {
  it('stages invoice unlink and receipt removal in the draft, and undoes them', async () => {
    const drafts: ExpenseVendorFinanceDraft[] = []
    renderEdit({ onDraft: (d) => drafts.push(d) })

    expect(screen.getByTestId('linked-invoice-inv-1').textContent).toContain('INV-1')
    expect(screen.getByTestId('existing-receipt-r1').textContent).toContain('T-1')

    fireEvent.click(screen.getByRole('button', { name: 'Unlink invoice INV-1' }))
    expect(drafts.at(-1)?.unlinkInvoiceIds).toEqual(['inv-1'])
    expect(screen.getByText('Will be unlinked')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep invoice INV-1' }))
    expect(drafts.at(-1)?.unlinkInvoiceIds).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Remove receipt' }))
    expect(drafts.at(-1)?.removeReceiptIds).toEqual(['r1'])
    expect(screen.getByText('Will be removed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep receipt' }))
    expect(drafts.at(-1)?.removeReceiptIds).toEqual([])
  })

  it('labels the proof control as adding proof and keeps already-linked invoices out of the picker', async () => {
    mocks.pos = [PO('po-1', 'v1')]
    mocks.invoices = [
      { id: 'inv-1', invoice_number: 'INV-1', amount: 80, currency_code: null, po_id: null },
      { id: 'inv-2', invoice_number: 'INV-2', amount: 20, currency_code: null, po_id: null },
    ]
    renderEdit()
    expect(screen.getByText('Add proof')).toBeTruthy()
    // Let the vendor's invoice list load so the source defaults to "Existing invoice".
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Invoice' }))
    // The existing-invoice source is available because INV-2 is not linked yet.
    const existingTab = (await screen.findByRole('tab', { name: 'Existing invoice' })) as HTMLButtonElement
    expect(existingTab.disabled).toBe(false)
    fireEvent.click(screen.getByRole('combobox', { name: 'Existing invoice' }))
    expect(await screen.findByRole('option', { name: /INV-2/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /INV-1/ })).toBeNull()
  })

  it('excludes the expense\'s own links from committed and never offers other vendors', async () => {
    mocks.pos = [PO('po-1', 'v1', { amount: 500 }), PO('po-2', 'v2')]
    mocks.links = [
      { poId: 'po-1', expenseId: 'e1', allocatedAmount: 100, expenseAmount: 100, expenseLinkCount: 1 },
      { poId: 'po-1', expenseId: 'other', allocatedAmount: 100, expenseAmount: 100, expenseLinkCount: 1 },
    ]
    renderEdit({ initialDraft: { poAllocations: [{ poId: 'po-1', allocatedAmount: null }] } })

    // Before this spend: 500 - 100 (other) = 400; after this £100 spend: 300.
    expect((await screen.findByTestId('po-remaining-after-po-1')).textContent).toBe('£300')

    fireEvent.click(screen.getByRole('combobox', { name: 'Purchase orders' }))
    expect(screen.queryByLabelText('Search all vendors')).toBeNull()
    await screen.findByRole('listbox')
    expect(screen.queryByRole('option', { name: /PO-2/ })).toBeNull()
  })
})
