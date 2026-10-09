import type { UpdateEquipmentPatch } from '@/lib/db/repositories/equipment'
import type { Equipment, EquipmentCategory, EquipmentStatus } from '@/lib/db/types'

/**
 * Fields that can be set on several registry items at once.
 *
 * `name` and `serial_number` are deliberately absent: both identify a single item, so writing
 * one value across a selection would give several items the same name or serial.
 */
export const BULK_EDITABLE_FIELDS = [
  'quantity',
  'category',
  'source_type',
  'status',
  'department',
  'vendor',
  'rental_start_date',
  'return_due_date',
  'returned_at',
  'replacement_value',
  'notes',
] as const

export type BulkEditableField = (typeof BULK_EDITABLE_FIELDS)[number]

export type BulkEditValues = {
  quantity: number
  category: EquipmentCategory
  source_type: Equipment['source_type']
  status: EquipmentStatus
  department: string
  /** Linked vendor; when null, `vendor` holds the legacy free-text name. */
  vendor_id: string | null
  vendor: string
  rental_start_date: string
  return_due_date: string
  returned_at: string
  replacement_value: number | null
  notes: string
}

type FieldReader = (e: Equipment) => unknown

const FIELD_READERS: Record<BulkEditableField, FieldReader> = {
  quantity: (e) => e.quantity ?? 1,
  category: (e) => e.category,
  source_type: (e) => e.source_type,
  status: (e) => e.status,
  department: (e) => e.department?.trim() ?? '',
  vendor: (e) => (e.vendor_id ? `id:${e.vendor_id}` : `text:${e.vendor?.trim() ?? ''}`),
  rental_start_date: (e) => e.rental_start_date ?? '',
  return_due_date: (e) => e.return_due_date ?? '',
  returned_at: (e) => e.returned_at ?? '',
  replacement_value: (e) => e.replacement_value ?? null,
  notes: (e) => e.notes?.trim() ?? '',
}

/** Fields whose value differs across the selection (shown as "Mixed" in the bulk editor). */
export function getMixedBulkFields(items: Equipment[]): Set<BulkEditableField> {
  const mixed = new Set<BulkEditableField>()
  if (items.length < 2) return mixed
  for (const field of BULK_EDITABLE_FIELDS) {
    const read = FIELD_READERS[field]
    const first = read(items[0]!)
    if (items.some((e) => read(e) !== first)) mixed.add(field)
  }
  return mixed
}

/**
 * Starting values for the bulk editor: the shared value where every item agrees, otherwise a
 * blank/neutral default (the field is shown as "Mixed" until the user picks something).
 */
export function getInitialBulkEditValues(items: Equipment[]): BulkEditValues {
  const mixed = getMixedBulkFields(items)
  const first = items[0]
  const shared = <T>(field: BulkEditableField, value: T | undefined, fallback: T): T =>
    first && !mixed.has(field) && value !== undefined ? value : fallback
  return {
    quantity: shared('quantity', first?.quantity, 1),
    category: shared('category', first?.category, 'other'),
    source_type: shared('source_type', first?.source_type, 'rented'),
    status: shared('status', first?.status, 'planned'),
    department: shared('department', first?.department?.trim() ?? '', ''),
    vendor_id: shared('vendor', first?.vendor_id ?? null, null),
    vendor: shared('vendor', first?.vendor_id ? '' : (first?.vendor?.trim() ?? ''), ''),
    rental_start_date: shared('rental_start_date', first?.rental_start_date ?? '', ''),
    return_due_date: shared('return_due_date', first?.return_due_date ?? '', ''),
    returned_at: shared('returned_at', first?.returned_at ?? '', ''),
    replacement_value: shared('replacement_value', first?.replacement_value ?? null, null),
    notes: shared('notes', first?.notes?.trim() ?? '', ''),
  }
}

/** Build the patch applied to every selected item from the fields the user chose to change. */
export function buildBulkEquipmentPatch(
  values: BulkEditValues,
  enabled: ReadonlySet<BulkEditableField>
): UpdateEquipmentPatch {
  const patch: UpdateEquipmentPatch = {}
  if (enabled.has('quantity')) patch.quantity = values.quantity
  if (enabled.has('category')) patch.category = values.category
  if (enabled.has('source_type')) patch.source_type = values.source_type
  if (enabled.has('status')) patch.status = values.status
  if (enabled.has('department')) patch.department = values.department.trim() || null
  if (enabled.has('vendor')) {
    patch.vendor_id = values.vendor_id ?? null
    patch.vendor = values.vendor_id ? null : values.vendor.trim() || null
  }
  if (enabled.has('rental_start_date')) patch.rental_start_date = values.rental_start_date.trim() || null
  if (enabled.has('return_due_date')) patch.return_due_date = values.return_due_date.trim() || null
  if (enabled.has('returned_at')) patch.returned_at = values.returned_at.trim() || null
  if (enabled.has('replacement_value')) patch.replacement_value = values.replacement_value
  if (enabled.has('notes')) patch.notes = values.notes.trim() || null
  return patch
}
