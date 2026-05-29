import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  generateEquipmentListPdf,
  wrapEquipmentListPdfLinesLimited,
} from '@/lib/pdf/equipmentListPdf'
import type { Equipment, EquipmentList, EquipmentListItem } from '@/lib/db/types'

const COL_NAME_WIDTH = 100
const FONT_TABLE = 7

async function embedHelvetica(): Promise<Awaited<ReturnType<PDFDocument['embedFont']>>> {
  const doc = await PDFDocument.create()
  return doc.embedFont(StandardFonts.Helvetica)
}

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

describe('wrapEquipmentListPdfLinesLimited', () => {
  it('returns one line for a short name', async () => {
    const font = await embedHelvetica()
    const lines = wrapEquipmentListPdfLinesLimited('Wide lens', COL_NAME_WIDTH, font, FONT_TABLE, 2)
    expect(lines).toEqual(['Wide lens'])
  })

  it('wraps a long name across two lines', async () => {
    const font = await embedHelvetica()
    const longName = 'Red Komodo 6K Cinema Camera Package'
    const lines = wrapEquipmentListPdfLinesLimited(longName, COL_NAME_WIDTH, font, FONT_TABLE, 2)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Red')
    expect(lines[1]).toContain('Package')
    expect(lines[1]).not.toMatch(/…$/)
  })

  it('truncates with ellipsis when content exceeds two lines', async () => {
    const font = await embedHelvetica()
    const veryLong =
      'Super Long Equipment Name That Keeps Going And Going With Many Words To Force More Than Two Lines Of Wrapping In The Name Column'
    const lines = wrapEquipmentListPdfLinesLimited(veryLong, COL_NAME_WIDTH, font, FONT_TABLE, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/…$/)
  })
})

describe('generateEquipmentListPdf', () => {
  it('generates a non-empty PDF when equipment has a long name', async () => {
    const longName =
      'ARRI Alexa 35 Production Camera Package with Master Prime Lens Set and Wireless Video Assist Kit'
    const equipment = minimalEquipment({ name: longName })
    const bytes = await generateEquipmentListPdf({
      productionName: 'Test Production',
      list: minimalList(),
      listItems: [minimalListItem()],
      equipmentById: new Map([[equipment.id, equipment]]),
      shootDayLabel: '2025-06-01',
    })
    expect(bytes.byteLength).toBeGreaterThan(500)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
  })
})
