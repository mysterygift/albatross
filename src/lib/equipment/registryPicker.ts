import type { Equipment } from '@/lib/db/types'

export type RegistryPickerAddition = { equipment_id: string; quantity: number }

/** Coerce a typed quantity to a whole number of at least 1. */
export function normalisePickerQuantity(raw: number | string | undefined): number {
  const n = typeof raw === 'number' ? raw : parseInt(raw ?? '', 10)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/**
 * Turn the picker's ticked items into list additions, in registry order.
 * Items already on the list or no longer in the registry are skipped.
 */
export function buildRegistryPickerAdditions(
  equipment: Equipment[],
  selected: ReadonlyMap<string, number>,
  onListIds: ReadonlySet<string>
): RegistryPickerAddition[] {
  return equipment
    .filter((e) => selected.has(e.id) && !onListIds.has(e.id))
    .map((e) => ({ equipment_id: e.id, quantity: normalisePickerQuantity(selected.get(e.id)) }))
}
