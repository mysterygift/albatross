import { describe, expect, it } from 'vitest'
import type { Equipment } from '@/lib/db/types'
import { buildRegistryPickerAdditions, normalisePickerQuantity } from './registryPicker'
import { filterEquipmentRegistry } from './registryFilter'

function eq(id: string, overrides: Partial<Equipment> = {}): Equipment {
  return {
    id,
    production_id: 'p1',
    name: id,
    quantity: 1,
    source_type: 'rented',
    vendor: null,
    shoot_day_id: null,
    notes: null,
    item_uuid: `uuid-${id}`,
    category: 'camera',
    status: 'planned',
    department: null,
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

describe('normalisePickerQuantity', () => {
  it('accepts whole numbers of at least 1 and falls back to 1 otherwise', () => {
    expect(normalisePickerQuantity('4')).toBe(4)
    expect(normalisePickerQuantity(3)).toBe(3)
    expect(normalisePickerQuantity('0')).toBe(1)
    expect(normalisePickerQuantity('-2')).toBe(1)
    expect(normalisePickerQuantity('')).toBe(1)
    expect(normalisePickerQuantity(undefined)).toBe(1)
    expect(normalisePickerQuantity(2.5)).toBe(1)
  })
})

describe('buildRegistryPickerAdditions', () => {
  it('returns ticked items in registry order with their quantities, skipping ones on the list', () => {
    const equipment = [eq('a'), eq('b'), eq('c'), eq('d')]
    const selected = new Map([
      ['c', 2],
      ['a', 5],
      ['b', 1],
      ['gone', 1],
    ])
    expect(buildRegistryPickerAdditions(equipment, selected, new Set(['b']))).toEqual([
      { equipment_id: 'a', quantity: 5 },
      { equipment_id: 'c', quantity: 2 },
    ])
  })
})

describe('filterEquipmentRegistry', () => {
  const equipment = [
    eq('a', { name: 'V-Mount Battery', department: 'Camera', category: 'power_distribution' }),
    eq('b', { name: 'Lens', serial_number: 'SN-BATT-1', department: 'Camera' }),
    eq('c', { name: 'Sandbag', department: 'Grip', category: 'grip', source_type: 'owned' }),
  ]
  it('matches search against name, UUID and serial, case-insensitively', () => {
    expect(filterEquipmentRegistry(equipment, { search: 'batt' }).map((e) => e.id)).toEqual(['a', 'b'])
    expect(filterEquipmentRegistry(equipment, { search: 'UUID-C' }).map((e) => e.id)).toEqual(['c'])
  })
  it('combines filters', () => {
    expect(
      filterEquipmentRegistry(equipment, { search: 'batt', category: 'camera', department: 'Camera' }).map(
        (e) => e.id
      )
    ).toEqual(['b'])
    expect(filterEquipmentRegistry(equipment, { source: 'owned' }).map((e) => e.id)).toEqual(['c'])
    expect(filterEquipmentRegistry(equipment, {}).length).toBe(3)
  })
})
