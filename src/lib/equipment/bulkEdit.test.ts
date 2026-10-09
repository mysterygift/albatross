import { describe, expect, it } from 'vitest'
import type { Equipment } from '@/lib/db/types'
import {
  BULK_EDITABLE_FIELDS,
  buildBulkEquipmentPatch,
  getInitialBulkEditValues,
  getMixedBulkFields,
  type BulkEditableField,
} from './bulkEdit'

function eq(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: overrides.id ?? 'e1',
    production_id: 'p1',
    name: 'Item',
    quantity: 1,
    source_type: 'rented',
    vendor: null,
    shoot_day_id: null,
    notes: null,
    item_uuid: 'uuid-1',
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

describe('bulk equipment edit', () => {
  it('never exposes name or serial number as bulk-editable', () => {
    expect(BULK_EDITABLE_FIELDS).not.toContain('name')
    expect(BULK_EDITABLE_FIELDS).not.toContain('serial_number')
  })

  it('reports fields that differ across the selection as mixed', () => {
    const items = [
      eq({ id: 'a', name: 'A', vendor_id: 'v1', notes: 'x' }),
      eq({ id: 'b', name: 'B', vendor_id: 'v2', notes: 'x' }),
    ]
    const mixed = getMixedBulkFields(items)
    expect(mixed.has('vendor')).toBe(true)
    expect(mixed.has('notes')).toBe(false)
    expect(mixed.has('category')).toBe(false)
  })

  it('treats a linked vendor and a legacy vendor name as different', () => {
    const mixed = getMixedBulkFields([eq({ id: 'a', vendor_id: 'v1' }), eq({ id: 'b', vendor: 'v1' })])
    expect(mixed.has('vendor')).toBe(true)
  })

  it('pre-fills shared values and leaves mixed ones blank', () => {
    const values = getInitialBulkEditValues([
      eq({ id: 'a', status: 'active', vendor_id: 'v1', return_due_date: '2026-11-01' }),
      eq({ id: 'b', status: 'active', vendor_id: 'v1', return_due_date: '2026-11-05' }),
    ])
    expect(values.status).toBe('active')
    expect(values.vendor_id).toBe('v1')
    expect(values.return_due_date).toBe('')
  })

  it('only includes ticked fields in the patch', () => {
    const values = getInitialBulkEditValues([eq({ id: 'a' }), eq({ id: 'b' })])
    const patch = buildBulkEquipmentPatch(
      { ...values, status: 'active', category: 'lenses' },
      new Set<BulkEditableField>(['status'])
    )
    expect(patch).toEqual({ status: 'active' })
  })

  it('setting a linked vendor clears the legacy vendor name, and vice versa', () => {
    const values = getInitialBulkEditValues([eq()])
    const enabled = new Set<BulkEditableField>(['vendor'])
    expect(buildBulkEquipmentPatch({ ...values, vendor_id: 'v9', vendor: 'Old' }, enabled)).toEqual({
      vendor_id: 'v9',
      vendor: null,
    })
    expect(buildBulkEquipmentPatch({ ...values, vendor_id: null, vendor: ' Hire Co ' }, enabled)).toEqual({
      vendor_id: null,
      vendor: 'Hire Co',
    })
  })

  it('a ticked blank field clears the value', () => {
    const values = getInitialBulkEditValues([eq({ notes: 'a' }), eq({ id: 'b', notes: 'b' })])
    const patch = buildBulkEquipmentPatch(
      { ...values, notes: '  ', department: '', return_due_date: '' },
      new Set<BulkEditableField>(['notes', 'department', 'return_due_date'])
    )
    expect(patch).toEqual({ notes: null, department: null, return_due_date: null })
  })
})
