// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Equipment } from '@/lib/db/types'

vi.mock('@/components/vendors/VendorPicker', () => ({
  VendorPicker: ({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) => (
    <button type="button" onClick={() => onChange('vendor-1')}>
      {value ? `Vendor ${value}` : 'Pick vendor'}
    </button>
  ),
}))

import { BulkEditEquipmentDialog } from './BulkEditEquipmentDialog'

// Radix Checkbox measures itself inside a <form>; jsdom has no ResizeObserver.
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function eq(id: string, name: string, overrides: Partial<Equipment> = {}): Equipment {
  return {
    id,
    production_id: 'p1',
    name,
    quantity: 1,
    source_type: 'rented',
    vendor: null,
    shoot_day_id: null,
    notes: null,
    item_uuid: `uuid-${id}`,
    category: 'camera',
    status: 'planned',
    department: 'Camera',
    vendor_id: null,
    invoice_id: null,
    rental_start_date: null,
    return_due_date: null,
    returned_at: null,
    replacement_value: null,
    serial_number: `SN-${id}`,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  }
}

afterEach(cleanup)

function renderDialog(onApply = vi.fn()) {
  render(
    <BulkEditEquipmentDialog
      open
      onOpenChange={() => {}}
      items={[eq('a', 'Camera body', { notes: 'one' }), eq('b', 'Lens', { notes: 'two' })]}
      productionId="p1"
      departmentOptions={['Camera', 'Grip']}
      onApply={onApply}
      isSaving={false}
    />
  )
  return onApply
}

describe('BulkEditEquipmentDialog', () => {
  it('locks name and serial number', () => {
    renderDialog()
    const name = screen.getByRole('textbox', { name: 'Name (locked)' }) as HTMLInputElement
    expect(name.disabled).toBe(true)
    expect(name.value).toBe('2 different names')
    expect((screen.getByRole('textbox', { name: 'Serial number (locked)' }) as HTMLInputElement).disabled).toBe(true)
  })

  it('is disabled until a field is ticked, and only sends changed fields', async () => {
    const user = userEvent.setup()
    const onApply = renderDialog()
    const apply = screen.getByRole('button', { name: 'Apply to 2 items' }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Pick vendor' }))
    expect(apply.disabled).toBe(false)
    await user.click(apply)

    expect(onApply).toHaveBeenCalledWith({ vendor_id: 'vendor-1', vendor: null })
  })

  it('shows differing values as mixed, and a ticked blank field clears the value', async () => {
    const user = userEvent.setup()
    const onApply = renderDialog()
    const notes = screen.getByPlaceholderText('Mixed') as HTMLInputElement
    expect(notes.value).toBe('')

    await user.click(screen.getByRole('checkbox', { name: 'Change Notes' }))
    await user.click(screen.getByRole('button', { name: 'Apply to 2 items' }))
    expect(onApply).toHaveBeenCalledWith({ notes: null })
  })

  it('rejects a quantity below 1', async () => {
    const user = userEvent.setup()
    renderDialog()
    const qty = screen.getByRole('spinbutton', { name: /^Quantity/ }) as HTMLInputElement
    await user.clear(qty)
    await user.type(qty, '0')
    expect(screen.getByText('Quantity must be at least 1')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Apply to 2 items' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
