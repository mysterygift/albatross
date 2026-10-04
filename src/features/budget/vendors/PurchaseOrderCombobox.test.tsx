// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import { PurchaseOrderCombobox } from '@/features/budget/vendors/PurchaseOrderCombobox'
import type { PoPickerRow } from '@/lib/budget/vendors/poPicker'

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => cleanup())

const row = (over: Partial<PoPickerRow> & Pick<PoPickerRow, 'id'>): PoPickerRow => ({
  poNumber: over.id.toUpperCase(),
  description: null,
  vendorId: 'v1',
  vendorName: 'Acme Props',
  status: 'issued',
  amount: 1000,
  poAmount: 1000,
  currency_code: null,
  exchange_rate: null,
  committed: 250,
  remaining: 750,
  ...over,
})

const ROWS: PoPickerRow[] = [
  row({ id: 'po-1', poNumber: 'PO-001', description: 'Camera hire' }),
  row({ id: 'po-2', poNumber: 'PO-002', vendorId: 'v2', vendorName: 'Fabric House', status: 'approved' }),
  row({ id: 'po-3', poNumber: 'PO-003', status: 'closed' }),
]

const format = (amount: number) => ({ formatted: `£${amount.toFixed(0)}` })

function Harness({ vendorId = null, onToggle }: { vendorId?: string | null; onToggle?: (r: PoPickerRow) => void }) {
  const [selected, setSelected] = useState<string[]>([])
  return (
    <PurchaseOrderCombobox
      rows={ROWS}
      selectedIds={selected}
      vendorId={vendorId}
      productionCurrency="GBP"
      format={format}
      onToggle={(r) => {
        onToggle?.(r)
        setSelected((prev) => (prev.includes(r.id) ? prev.filter((i) => i !== r.id) : [...prev, r.id]))
      }}
    />
  )
}

const open = () => fireEvent.click(screen.getByRole('combobox'))
const options = () => screen.queryAllByRole('option').map((o) => o.textContent ?? '')

describe('PurchaseOrderCombobox', () => {
  it('lists open POs with vendor, amount and remaining; hides closed by default', () => {
    render(<Harness />)
    open()
    const opts = options()
    expect(opts).toHaveLength(2)
    expect(opts[0]).toContain('PO-001')
    expect(opts[0]).toContain('Acme Props')
    expect(opts[0]).toContain('Issued')
    expect(opts[0]).toContain('£1000')
    expect(opts[0]).toContain('£750 left')
    expect(opts.join(' ')).not.toContain('PO-003')
  })

  it('prints a foreign-currency PO converted, with the original in brackets', () => {
    render(
      <PurchaseOrderCombobox
        rows={[
          row({
            id: 'po-9',
            poNumber: 'PO-009',
            amount: 790,
            poAmount: 1000,
            currency_code: 'USD',
            exchange_rate: 0.79,
            committed: 79,
            remaining: 711,
          }),
        ]}
        selectedIds={[]}
        vendorId={null}
        productionCurrency="GBP"
        format={format}
        onToggle={() => {}}
      />
    )
    open()
    const opt = options()[0]!
    expect(opt).toContain('£790 ($1,000.00)')
    expect(opt).toContain('£711 ($900.00) left')
  })

  it('shows draft / closed / cancelled when toggled', () => {
    render(<Harness />)
    open()
    fireEvent.click(screen.getByLabelText('Include draft, closed and cancelled'))
    expect(options().join(' ')).toContain('PO-003')
  })

  it('filters by PO number, description and vendor name', () => {
    render(<Harness />)
    open()
    const input = screen.getByPlaceholderText(/Search PO number/)
    fireEvent.change(input, { target: { value: 'camera' } })
    expect(options()).toHaveLength(1)
    fireEvent.change(input, { target: { value: 'fabric' } })
    expect(options()[0]).toContain('PO-002')
    fireEvent.change(input, { target: { value: 'nothing-matches' } })
    expect(screen.getByText('No purchase orders found.')).toBeTruthy()
  })

  it('scopes to the selected vendor with a "search all vendors" escape', () => {
    render(<Harness vendorId="v1" />)
    open()
    expect(options()).toHaveLength(1)
    expect(options()[0]).toContain('PO-001')
    fireEvent.click(screen.getByLabelText('Search all vendors'))
    expect(options()).toHaveLength(2)
    expect(options()[0]).toContain('PO-001') // the vendor's own PO first
  })

  it('does not offer the vendor scope toggle without a vendor', () => {
    render(<Harness />)
    open()
    expect(screen.queryByLabelText('Search all vendors')).toBeNull()
  })

  it('is multi-select: stays open and toggles picks', () => {
    const onToggle = vi.fn()
    render(<Harness onToggle={onToggle} />)
    open()
    fireEvent.click(screen.getByRole('option', { name: /PO-001/ }))
    fireEvent.click(screen.getByRole('option', { name: /PO-002/ }))
    expect(onToggle.mock.calls.map(([r]) => r.id)).toEqual(['po-1', 'po-2'])
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByText('Add another purchase order')).toBeTruthy()
  })
})
