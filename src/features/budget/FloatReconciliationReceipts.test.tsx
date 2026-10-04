// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { FloatReconciliationDialog } from '@/features/budget/FloatReconciliationDialog'
import { FloatReconciliationOverview } from '@/features/budget/FloatReconciliationOverview'
import { summarizeFloatReceiptCoverage } from '@/lib/budget/receiptStatus'
import type { FloatSummaryForProduction } from '@/lib/budget/floatSummary'
import type { PettyCashFloat } from '@/lib/db/types'

const mocks = vi.hoisted(() => ({
  expenses: [] as unknown[],
  floatLinks: [] as unknown[],
  proof: {} as Record<string, { receiptCount: number; invoiceDocumentCount: number }>,
}))

vi.mock('@/lib/db/repositories/budget', () => ({ listExpensesByProduction: async () => mocks.expenses }))
vi.mock('@/lib/db/repositories/budgetAccounts', () => ({ listAccounts: async () => [] }))
vi.mock('@/lib/db/repositories/budgetReconciliation', () => ({
  listBudgetItemExpenseLinksByProduction: async () => [],
}))
vi.mock('@/lib/db/repositories/floatReconciliation', () => ({
  createFloatExpenseLinks: vi.fn(),
  deleteFloatExpenseLink: vi.fn(),
  listFloatExpenseLinksByProduction: async () => mocks.floatLinks,
}))
vi.mock('@/lib/db/repositories/expenseReceipts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/repositories/expenseReceipts')>()
  return {
    ...actual,
    listReceiptStatusByExpenseIds: async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, mocks.proof[id] ?? { receiptCount: 0, invoiceDocumentCount: 0 }])),
  }
})
vi.mock('@/lib/db/expenseReceiptService', () => ({ attachReceiptToExpense: vi.fn() }))
vi.mock('@/lib/documents/pickAndPersistProductionDocument', () => ({ pickFileBytes: vi.fn() }))

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO
})

afterEach(() => {
  cleanup()
  mocks.expenses = []
  mocks.floatLinks = []
  mocks.proof = {}
})

const format = (amount: number) => ({ formatted: `£${amount.toFixed(0)}` })

const expense = (id: string, vendor: string) => ({
  id,
  production_id: 'prod',
  account_id: null,
  vendor,
  notes: null,
  date: '2026-06-10',
  amount: 40,
  transaction_type: 'purchase',
})

const FLOAT: PettyCashFloat = {
  id: 'f1',
  production_id: 'prod',
  budget_revision_id: null,
  budget_item_id: 'bi1',
  person_id: 'p1',
  amount: 200,
  currency: 'GBP',
  issued_date: '2026-06-01',
  notes: null,
  created_at: 0,
  updated_at: 0,
  deleted_at: null,
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('FloatReconciliationOverview receipt summary', () => {
  const summary: FloatSummaryForProduction = {
    totalAllocated: 200,
    totalMatched: 80,
    totalRemaining: 120,
    floatCount: 1,
    hasMixedCurrencies: false,
    statusCounts: { unmatched: 0, partial: 1, matched: 0, overspent: 0 },
    floats: [
      {
        floatId: 'f1',
        budgetItemId: 'bi1',
        personName: 'Sam Crew',
        department: 'Art',
        role: 'Buyer',
        allocated: 200,
        matched: 80,
        remaining: 120,
        status: 'partial',
        currency: 'GBP',
        issuedDate: '2026-06-01',
      },
    ],
  }
  const props = {
    summary,
    productionCurrency: 'GBP',
    format,
    budgetLineLabel: () => 'Props',
    onReconcile: () => {},
  }

  it('shows "N of M expenses missing receipts" and the per-float figure', () => {
    const receiptCoverage = summarizeFloatReceiptCoverage(
      [
        { float_id: 'f1', expense_id: 'a' },
        { float_id: 'f1', expense_id: 'b' },
        { float_id: 'f1', expense_id: 'c' },
      ],
      { a: { receiptCount: 1, invoiceDocumentCount: 0 } }
    )
    render(<FloatReconciliationOverview {...props} receiptCoverage={receiptCoverage} />)
    expect(screen.getByTestId('float-receipt-summary').textContent).toContain('2 of 3 expenses missing receipts')
    expect(screen.getAllByText('2 of 3 missing').length).toBeGreaterThan(0)
  })

  it('shows an all-clear when every expense has proof, and nothing without coverage data', () => {
    const ok = summarizeFloatReceiptCoverage([{ float_id: 'f1', expense_id: 'a' }], {
      a: { receiptCount: 0, invoiceDocumentCount: 1 },
    })
    const { rerender } = render(<FloatReconciliationOverview {...props} receiptCoverage={ok} />)
    expect(screen.getByTestId('float-receipt-summary').textContent).toContain('Expense has a receipt')
    rerender(<FloatReconciliationOverview {...props} receiptCoverage={null} />)
    expect(screen.queryByTestId('float-receipt-summary')).toBeNull()
    expect(screen.queryByText('Receipts')).toBeNull()
  })
})

describe('FloatReconciliationDialog receipt status', () => {
  const link = (id: string, expenseId: string) => ({
    id,
    float_id: 'f1',
    expense_id: expenseId,
    budget_revision_id: null,
    matched_amount: 40,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
  })

  function renderDialog() {
    return renderWithClient(
      <FloatReconciliationDialog
        open
        onOpenChange={() => {}}
        productionId="prod"
        pettyCashFloat={FLOAT}
        crewMemberName="Sam Crew"
        format={format}
        productionCurrency="GBP"
      />
    )
  }

  it('flags matched expenses with no proof, offers inline attach, and warns without blocking save', async () => {
    mocks.expenses = [expense('e1', 'Hardware store'), expense('e2', 'Fabric shop'), expense('e3', 'Cafe')]
    mocks.floatLinks = [link('l1', 'e1'), link('l2', 'e2'), link('l3', 'e3')]
    mocks.proof = {
      e1: { receiptCount: 1, invoiceDocumentCount: 0 },
      e2: { receiptCount: 0, invoiceDocumentCount: 1 },
    }
    renderDialog()

    const warning = await screen.findByTestId('float-missing-receipts-warning')
    expect(warning.textContent).toContain('1 of 3 expenses missing receipts')
    expect(warning.textContent).toContain('You can still reconcile')

    const rows = await screen.findAllByRole('listitem')
    const row = (name: string) => rows.find((r) => within(r).queryByText(name))!
    expect(within(row('Hardware store')).getByText('Receipt')).toBeTruthy()
    expect(within(row('Fabric shop')).getByText('Invoice on file')).toBeTruthy()
    expect(within(row('Cafe')).getByText('Missing receipt')).toBeTruthy()
    expect(within(row('Cafe')).getByRole('button', { name: /attach receipt/i })).toBeTruthy()
    expect(within(row('Hardware store')).queryByRole('button', { name: /attach receipt/i })).toBeNull()
    // never a hard block: Save is governed only by the match validation
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('shows no warning when every matched expense has proof', async () => {
    mocks.expenses = [expense('e1', 'Hardware store')]
    mocks.floatLinks = [link('l1', 'e1')]
    mocks.proof = { e1: { receiptCount: 1, invoiceDocumentCount: 0 } }
    renderDialog()
    await waitFor(() => expect(screen.getAllByText('Receipt').length).toBeGreaterThan(0))
    expect(screen.queryByTestId('float-missing-receipts-warning')).toBeNull()
  })
})
