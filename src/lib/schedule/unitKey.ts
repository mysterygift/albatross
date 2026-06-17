import type { CalendarUnitKey } from '@/lib/db/types'
import type { ShootDayUnit, Unit } from '@/lib/db/types'

export function unitNameToKey(name: string): CalendarUnitKey {
  const lower = name.toLowerCase()
  if (lower.includes('second') || lower.includes('2nd')) return 'second'
  return 'main'
}

const UNIT_KEY_SORT_ORDER: Record<CalendarUnitKey, number> = {
  main: 0,
  second: 1,
}

/** Main Unit always displays above Second Unit; other units sort after by name. */
export function sortShootDayUnitsForDisplay(
  dayUnits: ShootDayUnit[],
  unitsById: Map<string, Unit>
): ShootDayUnit[] {
  return [...dayUnits].sort((a, b) => {
    const unitA = unitsById.get(a.unit_id)
    const unitB = unitsById.get(b.unit_id)
    const orderA = unitA ? UNIT_KEY_SORT_ORDER[unitNameToKey(unitA.name)] ?? 2 : 2
    const orderB = unitB ? UNIT_KEY_SORT_ORDER[unitNameToKey(unitB.name)] ?? 2 : 2
    if (orderA !== orderB) return orderA - orderB
    const nameA = unitA?.name ?? a.unit_id
    const nameB = unitB?.name ?? b.unit_id
    return nameA.localeCompare(nameB)
  })
}
