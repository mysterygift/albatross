import type { Equipment } from '@/lib/db/types'

/** Registry filters shared by the Registry tab and the "Add from registry" picker. Empty string = no filter. */
export type EquipmentRegistryFilters = {
  search?: string
  category?: string
  source?: string
  department?: string
  status?: string
}

export function filterEquipmentRegistry(
  equipment: Equipment[],
  filters: EquipmentRegistryFilters
): Equipment[] {
  let list = equipment
  if (filters.category) list = list.filter((e) => e.category === filters.category)
  if (filters.source) list = list.filter((e) => e.source_type === filters.source)
  if (filters.department) list = list.filter((e) => (e.department ?? '') === filters.department)
  if (filters.status) list = list.filter((e) => e.status === filters.status)
  const q = filters.search?.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.item_uuid.toLowerCase().includes(q) ||
        (e.serial_number?.toLowerCase().includes(q) ?? false)
    )
  }
  return list
}
