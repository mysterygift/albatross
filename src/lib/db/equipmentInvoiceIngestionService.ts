/**
 * Invoice-driven equipment ingestion.
 * User-driven workflow: from a vendor invoice, create new equipment or link existing
 * equipment to that invoice. No OCR or automatic parsing; candidates are entered or
 * reviewed by the user.
 *
 * - createEquipmentFromInvoiceContext: create a new equipment record with vendor_id and invoice_id.
 * - linkExistingEquipmentToInvoice: set vendor_id and invoice_id on an existing equipment item.
 *
 * Uses the normal equipment repository and E3 return-reminder orchestration so rented
 * items with return_due_date get reminder tasks.
 */

import { createEquipmentWithReminderTask } from './equipmentReturnReminderService'
import { updateEquipment } from './repositories/equipment'
import type { CreateEquipmentData } from './repositories/equipment'
import type { Equipment, EquipmentCategory, EquipmentStatus } from './types'

export type InvoiceEquipmentRowData = {
  name: string
  category: EquipmentCategory
  source_type: Equipment['source_type']
  status?: EquipmentStatus
  department: string | null
  rental_start_date: string | null
  return_due_date: string | null
  serial_number: string | null
  notes: string | null
  replacement_value: number | null
}

/**
 * Create a new equipment item from invoice context. Sets vendor_id and invoice_id.
 * Uses createEquipmentWithReminderTask so rented items with return_due_date get E3 reminder tasks.
 */
export async function createEquipmentFromInvoiceContext(
  productionId: string,
  vendorId: string,
  invoiceId: string,
  row: InvoiceEquipmentRowData
): Promise<Equipment> {
  const data: CreateEquipmentData = {
    production_id: productionId,
    name: row.name.trim() || 'Unnamed item',
    category: row.category,
    source_type: row.source_type,
    status: row.status ?? 'planned',
    department: row.department?.trim() || null,
    vendor_id: vendorId,
    invoice_id: invoiceId,
    rental_start_date: row.rental_start_date?.trim() || null,
    return_due_date: row.return_due_date?.trim() || null,
    serial_number: row.serial_number?.trim() || null,
    notes: row.notes?.trim() || null,
    replacement_value: row.replacement_value,
  }
  return createEquipmentWithReminderTask(data)
}

/**
 * Link an existing equipment item to a vendor and invoice. Updates vendor_id and invoice_id only.
 * Does not create a duplicate; use for equipment that already exists in the registry.
 */
export async function linkExistingEquipmentToInvoice(
  equipmentId: string,
  vendorId: string,
  invoiceId: string
): Promise<Equipment> {
  const updated = await updateEquipment(equipmentId, {
    vendor_id: vendorId,
    invoice_id: invoiceId,
  })
  return updated
}
