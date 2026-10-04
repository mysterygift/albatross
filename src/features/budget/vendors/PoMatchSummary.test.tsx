// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { PoMatchSummary, type PoMatchSummaryProps } from '@/features/budget/vendors/PoMatchSummary'
import type { PoMatchSummaryRow } from '@/lib/budget/vendors/poPicker'

afterEach(() => cleanup())

const format = (amount: number) => ({ formatted: `£${amount.toFixed(0)}` })

const summaryRow = (over: Partial<PoMatchSummaryRow> = {}): PoMatchSummaryRow => ({
  poId: 'po-1',
  poNumber: 'PO-001',
  vendorName: 'Acme Props',
  status: 'issued',
  thisSpend: 500,
  poAmount: 1000,
  currency_code: null,
  exchange_rate: null,
  remainingBefore: 300,
  remainingAfter: -200,
  increaseBy: 200,
  ...over,
})

function setup(props: Partial<PoMatchSummaryProps> = {}) {
  const handlers = {
    onAllocationChange: vi.fn(),
    onRemove: vi.fn(),
    onIncreasePo: vi.fn(),
  }
  render(
    <PoMatchSummary
      rows={[summaryRow()]}
      allocationByPoId={{ 'po-1': null }}
      warnings={[]}
      productionCurrency="GBP"
      format={format}
      multi={false}
      {...handlers}
      {...props}
    />
  )
  return handlers
}

describe('PoMatchSummary', () => {
  it('renders nothing without POs', () => {
    setup({ rows: [] })
    expect(screen.queryByTestId('po-match-summary')).toBeNull()
  })

  it('shows this spend, PO amount and remaining after, flagging an overrun', () => {
    setup()
    const row = screen.getByTestId('po-summary-po-1')
    expect(row.textContent).toContain('PO-001')
    expect(row.textContent).toContain('£500')
    expect(row.textContent).toContain('£1000')
    const after = screen.getByTestId('po-remaining-after-po-1')
    expect(after.textContent).toBe('£-200')
    expect(after.className).toContain('text-destructive')
  })

  it('offers "Increase PO to cover" on an over-remaining warning and never blocks', () => {
    const { onIncreasePo } = setup({
      warnings: [
        { code: 'over_po_remaining', poId: 'po-1', overBy: 200, message: '500.00 exceeds the 300.00 remaining on PO-001 by 200.00.' },
      ],
    })
    expect(screen.getByTestId('po-match-warnings').textContent).toContain('exceeds the 300.00 remaining')
    fireEvent.click(screen.getByRole('button', { name: 'Increase PO to cover' }))
    expect(onIncreasePo).toHaveBeenCalledWith('po-1')
  })

  it('shows other warnings without an increase action', () => {
    setup({
      warnings: [{ code: 'invoice_amount_mismatch', message: 'Invoice INV-1 is 400.00 but the spend is 500.00.' }],
    })
    expect(screen.getByTestId('po-match-warnings').textContent).toContain('Invoice INV-1')
    expect(screen.queryByRole('button', { name: 'Increase PO to cover' })).toBeNull()
  })

  it('shows allocation inputs only when several POs are matched', () => {
    const rows = [summaryRow(), summaryRow({ poId: 'po-2', poNumber: 'PO-002' })]
    setup({ rows, multi: true, allocationByPoId: { 'po-1': 300, 'po-2': null } })
    const input = screen.getByLabelText('Amount allocated to PO-002') as HTMLInputElement
    fireEvent.change(input, { target: { value: '200' } })
    expect(screen.getByLabelText('Amount allocated to PO-001')).toBeTruthy()
  })

  it('reports allocation edits and removal', () => {
    const rows = [summaryRow(), summaryRow({ poId: 'po-2', poNumber: 'PO-002' })]
    const { onAllocationChange, onRemove } = setup({ rows, multi: true, allocationByPoId: { 'po-1': 300, 'po-2': null } })
    fireEvent.change(screen.getByLabelText('Amount allocated to PO-002'), { target: { value: '200' } })
    expect(onAllocationChange).toHaveBeenCalledWith('po-2', 200)
    fireEvent.click(screen.getByRole('button', { name: 'Remove PO-001' }))
    expect(onRemove).toHaveBeenCalledWith('po-1')
  })

  it('shows the PO amount converted with the original in brackets for a foreign-currency PO', () => {
    setup({
      rows: [summaryRow({ poAmount: 1000, currency_code: 'USD', exchange_rate: 0.79, remainingAfter: 290 })],
    })
    const row = screen.getByTestId('po-summary-po-1')
    expect(row.textContent).toContain('£790 ($1,000.00)')
    // remaining is derived from production-currency spend; its PO-currency equivalent is shown too
    expect(screen.getByTestId('po-remaining-after-po-1').textContent).toBe('£290 ($367.09)')
  })

  it('has no allocation input for a single PO', () => {
    setup()
    expect(screen.queryByLabelText('Amount allocated to PO-001')).toBeNull()
  })
})
