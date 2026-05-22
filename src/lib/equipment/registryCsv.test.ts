import { describe, expect, it } from 'vitest'
import type { Equipment } from '@/lib/db/types'
import {
  applyColumnMapping,
  matchRegistryImportRows,
  parseCsvRaw,
  suggestColumnMapping,
} from '@/lib/equipment/csv'

describe('parseCsvRaw', () => {
  it('parses headers and data rows', () => {
    const csv = `Name,Serial Number,Qty
Camera A,SN-001,2
Lens B,SN-002,1`
    const { headers, rows, errors } = parseCsvRaw(csv)
    expect(errors).toEqual([])
    expect(headers).toEqual(['Name', 'Serial Number', 'Qty'])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(['Camera A', 'SN-001', '2'])
    expect(rows[1]).toEqual(['Lens B', 'SN-002', '1'])
  })

  it('returns error for empty file', () => {
    const { errors } = parseCsvRaw('')
    expect(errors).toContain('CSV is empty.')
  })

  it('returns error when no data rows', () => {
    const { errors } = parseCsvRaw('Name,Serial')
    expect(errors).toContain('No data rows found.')
  })
})

describe('suggestColumnMapping', () => {
  it('suggests common header names', () => {
    const mapping = suggestColumnMapping(['Item Name', 'Serial No', 'Quantity', 'Replacement Value'])
    expect(mapping.name).toBe(0)
    expect(mapping.serial_number).toBe(1)
    expect(mapping.quantity).toBe(2)
    expect(mapping.replacement_value).toBe(3)
  })
})

describe('applyColumnMapping', () => {
  const rows = [
    ['Widget', '3', 'ABC', '100'],
    ['', '1', 'DEF', ''],
    ['Gadget', '', '', '250.5'],
  ]

  it('requires name column in mapping', () => {
    const result = applyColumnMapping(rows, {})
    expect(result.errors).toContain('Name column is required.')
  })

  it('maps fields and skips blank names', () => {
    const result = applyColumnMapping(rows, {
      name: 0,
      quantity: 1,
      serial_number: 2,
      replacement_value: 3,
    })
    expect(result.errors).toEqual([])
    expect(result.skipped).toBe(1)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({
      name: 'Widget',
      quantity: 3,
      serial_number: 'ABC',
      replacement_value: 100,
    })
    expect(result.rows[1]).toEqual({
      name: 'Gadget',
      quantity: 1,
      serial_number: null,
      replacement_value: 250.5,
    })
  })

  it('defaults quantity to 1 when column unmapped', () => {
    const result = applyColumnMapping([['Only Item', '', '', '']], { name: 0 })
    expect(result.rows[0]?.quantity).toBe(1)
    expect(result.rows[0]?.replacement_value).toBeNull()
  })
})

describe('matchRegistryImportRows', () => {
  const existing: Equipment[] = [
    {
      id: 'eq-1',
      production_id: 'prod-1',
      name: 'Camera A',
      quantity: 1,
      source_type: 'owned',
      vendor: null,
      shoot_day_id: null,
      notes: null,
      item_uuid: 'uuid-1',
      category: 'other',
      status: 'planned',
      department: null,
      vendor_id: null,
      invoice_id: null,
      rental_start_date: null,
      return_due_date: null,
      returned_at: null,
      replacement_value: 500,
      serial_number: 'SN-001',
      created_at: '',
      updated_at: '',
      deleted_at: null,
    },
  ]

  it('creates all rows when serial is not mapped', () => {
    const rows = [
      { name: 'Camera A', quantity: 1, serial_number: 'SN-001', replacement_value: null },
      { name: 'New Item', quantity: 2, serial_number: null, replacement_value: null },
    ]
    const result = matchRegistryImportRows(rows, existing, false)
    expect(result.toCreate).toHaveLength(2)
    expect(result.toUpdate).toHaveLength(0)
  })

  it('updates when name and serial both match', () => {
    const rows = [
      { name: 'Camera A', quantity: 2, serial_number: 'SN-001', replacement_value: 600 },
      { name: 'Camera A', quantity: 1, serial_number: 'SN-999', replacement_value: null },
      { name: 'Other', quantity: 1, serial_number: null, replacement_value: null },
    ]
    const result = matchRegistryImportRows(rows, existing, true)
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0]?.equipment.id).toBe('eq-1')
    expect(result.toCreate).toHaveLength(2)
  })
})
