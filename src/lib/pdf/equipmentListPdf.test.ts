import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { equipmentListRow, generateEquipmentListPdf } from '@/lib/pdf/equipmentListPdf'
import { PAPER_SIZES } from '@/lib/pdf/layoutKit'
import { extractPdfText } from '@/test/episodicIntegrationHelpers'
import type { Equipment, EquipmentList, EquipmentListItem } from '@/lib/db/types'

function minimalList(over: Partial<EquipmentList> = {}): EquipmentList {
  return {
    id: 'list-1',
    production_id: 'prod-1',
    shoot_day_id: null,
    name: 'Camera Package',
    department: 'Camera',
    notes: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    deleted_at: null,
    ...over,
  }
}

function minimalEquipment(over: Partial<Equipment> = {}): Equipment {
  return {
    id: 'eq-1',
    production_id: 'prod-1',
    name: 'Short lens',
    quantity: 1,
    source_type: 'rented',
    vendor: null,
    shoot_day_id: null,
    notes: null,
    item_uuid: '00000000-0000-0000-0000-00000001',
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
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    deleted_at: null,
    ...over,
  }
}

function minimalListItem(over: Partial<EquipmentListItem> = {}): EquipmentListItem {
  return {
    id: 'item-1',
    equipment_list_id: 'list-1',
    equipment_id: 'eq-1',
    sort_order: 0,
    quantity: 1,
    checked_out: 0,
    checked_back_in: 0,
    notes: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('equipmentListRow', () => {
  it('prefers list-item notes over registry notes and keeps the full name', () => {
    const name = 'ARRI Alexa 35 Production Camera Package with Master Prime Lens Set'
    const row = equipmentListRow(
      minimalListItem({ quantity: 3, notes: 'Hand to 2nd AC' }),
      minimalEquipment({ name, notes: 'Registry note', serial_number: 'AX-1' })
    )
    expect(row[0]).toEqual({ checkbox: true })
    expect(row[1]).toEqual({ checkbox: true })
    expect(row[2]).toEqual({ text: '3', bold: true })
    expect(row[3]).toEqual({ text: name, bold: true })
    expect(row[4]).toBe('Camera')
    expect(row[5]).toBe('AX-1')
    expect(row[7]).toBe('Hand to 2nd AC')
  })

  it('falls back to registry notes when the list-item note is blank', () => {
    const row = equipmentListRow(
      minimalListItem({ notes: '  ' }),
      minimalEquipment({ notes: 'Principal camera' })
    )
    expect(row[7]).toBe('Principal camera')
  })

  it('marks an item missing from the registry instead of dropping it', () => {
    const row = equipmentListRow(minimalListItem({ quantity: 2 }), undefined)
    expect(row[2]).toEqual({ text: '2', bold: true })
    expect(row[3]).toMatchObject({ text: 'Item no longer in the registry' })
  })
})

describe('generateEquipmentListPdf', () => {
  const longName =
    'ARRI Alexa 35 Production Camera Package with Master Prime Lens Set and Wireless Video Assist Kit'

  it('renders header, shoot day, wrapped rows, sign-off and page footers', async () => {
    const equipment = minimalEquipment({ name: longName, serial_number: 'AX35-0042' })
    const bytes = await generateEquipmentListPdf({
      productionName: 'Test Production',
      list: minimalList({ notes: 'Prep at the rental house Tuesday 08:00' }),
      listItems: [minimalListItem({ quantity: 2 })],
      equipmentById: new Map([[equipment.id, equipment]]),
      shootDay: { shootDate: '2026-10-14', dayNumber: 3, totalShootDays: 24 },
      issuedAt: new Date(2026, 9, 13, 18, 40),
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    const text = await extractPdfText(bytes)
    expect(text).toContain('EQUIPMENT LIST')
    expect(text).toContain('Issued 13 Oct 2026 18:40')
    expect(text).toContain('Wednesday, 14 October 2026')
    expect(text).toContain('Day 3 of 24')
    expect(text).toContain('Department: Camera')
    expect(text).toContain('Prep at the rental house Tuesday 08:00')
    expect(text).toContain('2 units in total')
    expect(text).toContain('Video Assist Kit')
    expect(text).toContain('AX35-0042')
    expect(text).toContain('CHECKED OUT BY')
    expect(text).toContain('Page 1 of 1')
  })

  it('uses the chosen paper size and repeats footers on every page', async () => {
    const equipment = Array.from({ length: 80 }, (_, i) =>
      minimalEquipment({ id: `eq-${i}`, name: `Item ${i}`, item_uuid: `uuid-${String(i).padStart(8, '0')}` })
    )
    const bytes = await generateEquipmentListPdf({
      productionName: 'Test Production',
      list: minimalList(),
      listItems: equipment.map((e, i) => minimalListItem({ id: `item-${i}`, equipment_id: e.id, sort_order: i })),
      equipmentById: new Map(equipment.map((e) => [e.id, e])),
      paperSize: 'letter',
    })
    const doc = await PDFDocument.load(bytes)
    const pages = doc.getPages()
    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0]!.getSize()).toEqual({ width: PAPER_SIZES.letter.width, height: PAPER_SIZES.letter.height })
    const text = await extractPdfText(bytes)
    expect(text).toContain(`Page ${pages.length} of ${pages.length}`)
    expect(text).toContain('Item 79')
  })

  it('defaults to A4 and handles an empty list', async () => {
    const bytes = await generateEquipmentListPdf({
      productionName: 'Test Production',
      list: minimalList(),
      listItems: [],
      equipmentById: new Map(),
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPages()[0]!.getSize().width).toBeCloseTo(PAPER_SIZES.a4.width)
    expect(await extractPdfText(bytes)).toContain('No equipment on this list.')
  })
})
