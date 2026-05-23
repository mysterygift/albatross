import type { Equipment, EquipmentListItem } from '@/lib/db/types'

export function isListQuantityOverRegistry(
  listQty: number,
  registryQty: number | undefined
): boolean {
  if (typeof registryQty !== 'number' || !Number.isInteger(registryQty) || registryQty < 1) {
    return false
  }
  const qty = typeof listQty === 'number' && Number.isInteger(listQty) && listQty >= 1 ? listQty : 1
  return qty > registryQty
}

export function getOverStockListItems(
  items: EquipmentListItem[],
  equipmentById: Map<string, Equipment>
): Array<{ item: EquipmentListItem; equipment: Equipment }> {
  const out: Array<{ item: EquipmentListItem; equipment: Equipment }> = []
  for (const item of items) {
    const equipment = equipmentById.get(item.equipment_id)
    if (!equipment) continue
    if (isListQuantityOverRegistry(item.quantity, equipment.quantity)) {
      out.push({ item, equipment })
    }
  }
  return out
}
