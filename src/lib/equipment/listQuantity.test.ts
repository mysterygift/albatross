import { describe, expect, it } from 'vitest'
import type { Equipment, EquipmentListItem } from '@/lib/db/types'
import { getOverStockListItems, isListQuantityOverRegistry } from './listQuantity'

function listItem(overrides: Partial<EquipmentListItem> & { equipment_id: string }): EquipmentListItem {
  return {
    id: 'item-1',
    equipment_list_id: 'list-1',
    equipment_id: overrides.equipment_id,
    sort_order: 0,
    quantity: overrides.quantity ?? 1,
    checked_out: 0,
    checked_back_in: 0,
    notes: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function equipment(overrides: Partial<Equipment> & { id: string }): Equipment {
  return {
    id: overrides.id,
    production_id: 'prod-1',
    name: 'Test item',
    quantity: overrides.quantity ?? 1,
    source_type: 'owned',
    vendor: null,
    shoot_day_id: null,
    notes: null,
    item_uuid: 'uuid-1',
    category: 'other',
    status: 'active',
    department: null,
    vendor_id: null,
    invoice_id: null,
    rental_start_date: null,
    return_due_date: null,
    returned_at: null,
    replacement_value: null,
    serial_number: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('isListQuantityOverRegistry', () => {
  it('returns true when list qty exceeds registry qty', () => {
    expect(isListQuantityOverRegistry(5, 4)).toBe(true)
  })

  it('returns false when list qty equals registry qty', () => {
    expect(isListQuantityOverRegistry(4, 4)).toBe(false)
  })

  it('returns false when list qty is under registry qty', () => {
    expect(isListQuantityOverRegistry(3, 8)).toBe(false)
  })

  it('returns false when registry qty is missing or invalid', () => {
    expect(isListQuantityOverRegistry(5, undefined)).toBe(false)
    expect(isListQuantityOverRegistry(5, 0)).toBe(false)
  })
})

describe('getOverStockListItems', () => {
  it('returns items where list quantity exceeds registry stock', () => {
    const eqA = equipment({ id: 'eq-a', name: 'Sandbags', quantity: 4 })
    const eqB = equipment({ id: 'eq-b', name: 'Camera', quantity: 1 })
    const items = [
      listItem({ equipment_id: 'eq-a', quantity: 6 }),
      listItem({ equipment_id: 'eq-b', quantity: 1 }),
    ]
    const result = getOverStockListItems(items, new Map([['eq-a', eqA], ['eq-b', eqB]]))
    expect(result).toHaveLength(1)
    expect(result[0]!.equipment.name).toBe('Sandbags')
    expect(result[0]!.item.quantity).toBe(6)
  })

  it('skips items with no matching registry row', () => {
    const items = [listItem({ equipment_id: 'missing', quantity: 10 })]
    expect(getOverStockListItems(items, new Map())).toHaveLength(0)
  })
})
