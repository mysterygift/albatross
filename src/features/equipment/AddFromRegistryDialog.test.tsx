// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Equipment } from '@/lib/db/types'
import { AddFromRegistryDialog } from './AddFromRegistryDialog'

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
    item_uuid: `uuid-0000-${id}`,
    category: 'camera',
    status: 'planned',
    department: 'Camera',
    vendor_id: null,
    invoice_id: null,
    rental_start_date: null,
    return_due_date: null,
    returned_at: null,
    replacement_value: null,
    serial_number: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  }
}

const equipment = [
  eq('a', 'V-Mount Battery', { quantity: 8 }),
  eq('b', 'Battery Charger', { quantity: 2 }),
  eq('c', 'Monitor Plate'),
  eq('d', 'Sandbag', { category: 'grip', department: 'Grip', quantity: 20 }),
]

afterEach(cleanup)

function renderPicker(onAdd = vi.fn()) {
  render(
    <AddFromRegistryDialog
      open
      onOpenChange={() => {}}
      listName="Day 1"
      equipment={equipment}
      onListIds={new Set(['c'])}
      departmentOptions={['Camera', 'Grip']}
      onAdd={onAdd}
      isAdding={false}
    />
  )
  return onAdd
}

describe('AddFromRegistryDialog', () => {
  it('filters by search and keeps ticks across searches', async () => {
    const user = userEvent.setup()
    const onAdd = renderPicker()
    const search = screen.getByRole('textbox', { name: 'Search registry' })

    await user.type(search, 'batt')
    expect(screen.queryByText('Sandbag')).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'Select V-Mount Battery' }))

    await user.clear(search)
    await user.type(search, 'sand')
    expect(screen.queryByText('V-Mount Battery')).toBeNull()
    await user.click(screen.getByText('Sandbag'))

    expect(screen.getByText(/2 selected · 2 units \(1 hidden by filters\)/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add 2 items' }))
    expect(onAdd).toHaveBeenCalledWith([
      { equipment_id: 'a', quantity: 1 },
      { equipment_id: 'd', quantity: 1 },
    ])
  })

  it('typing a quantity ticks the item and warns when it exceeds registry stock', async () => {
    const user = userEvent.setup()
    const onAdd = renderPicker()
    const qty = screen.getByRole('spinbutton', { name: 'Quantity of Battery Charger' })
    await user.clear(qty)
    await user.type(qty, '3')

    expect(screen.getByText('Only 2 in registry')).toBeTruthy()
    expect(screen.getByText(/1 over registry stock/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add 1 item' }))
    expect(onAdd).toHaveBeenCalledWith([{ equipment_id: 'b', quantity: 3 }])
  })

  it('shows items already on the list as disabled, and select-all skips them', async () => {
    const user = userEvent.setup()
    const onAdd = renderPicker()
    const row = screen.getByText('Monitor Plate').closest('tr')!
    expect(within(row).getByText('On list')).toBeTruthy()
    expect(
      (within(row).getByRole('checkbox', { name: 'Select Monitor Plate' }) as HTMLButtonElement).disabled
    ).toBe(true)

    await user.click(screen.getByRole('checkbox', { name: 'Select all shown items' }))
    await user.click(screen.getByRole('button', { name: 'Add 3 items' }))
    expect(onAdd.mock.calls[0]![0].map((a: { equipment_id: string }) => a.equipment_id)).toEqual(['a', 'b', 'd'])
  })
})
