import type { CalendarUnitKey } from '@/lib/db/types'
import type { ShootDayUnit, Unit } from '@/lib/db/types'

/** A shoot day can run at most this many units (Main Unit to Fifth Unit). */
export const MAX_UNITS_PER_DAY = 5

/** 1 = Main Unit … 5 = Fifth Unit. */
export type UnitRank = 1 | 2 | 3 | 4 | 5

export const UNIT_RANKS: readonly UnitRank[] = [1, 2, 3, 4, 5]

const UNIT_RANK_NAMES: Record<UnitRank, string> = {
  1: 'Main Unit',
  2: 'Second Unit',
  3: 'Third Unit',
  4: 'Fourth Unit',
  5: 'Fifth Unit',
}

const UNIT_RANK_KEYS: Record<UnitRank, CalendarUnitKey> = {
  1: 'main',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
}

/** Checked in order; the first match wins. "Main" is checked last so "Second Main" style names stay non-main. */
const UNIT_RANK_NAME_PATTERNS: ReadonlyArray<[UnitRank, readonly string[]]> = [
  [2, ['second', '2nd']],
  [3, ['third', '3rd']],
  [4, ['fourth', '4th']],
  [5, ['fifth', '5th']],
  [1, ['main']],
]

/** Rank from a unit name ("Second Unit" → 2), or null when the name names no rank. */
export function unitNameToRank(name: string): UnitRank | null {
  const lower = name.toLowerCase()
  for (const [rank, needles] of UNIT_RANK_NAME_PATTERNS) {
    if (needles.some((needle) => lower.includes(needle))) return rank
  }
  return null
}

/** Unit key from a name. Names without a rank count as main, as they always have. */
export function unitNameToKey(name: string): CalendarUnitKey {
  return UNIT_RANK_KEYS[unitNameToRank(name) ?? 1]
}

export function unitRankToName(rank: UnitRank): string {
  return UNIT_RANK_NAMES[rank]
}

export function unitRankToKey(rank: UnitRank): CalendarUnitKey {
  return UNIT_RANK_KEYS[rank]
}

/** Theme colour variables for a unit chip/card (`--unit-main`, `--unit-second`, …). */
export function unitColorVars(key: CalendarUnitKey): { background: string; foreground: string } {
  return {
    background: `var(--unit-${key})`,
    foreground: `var(--unit-${key}-foreground)`,
  }
}

function rankSortValue(name: string | undefined): number {
  if (!name) return MAX_UNITS_PER_DAY + 1
  return unitNameToRank(name) ?? MAX_UNITS_PER_DAY + 1
}

/** Units in rank order (Main Unit first); names without a rank sort after, by name. */
export function sortUnitsForDisplay<T extends { name: string }>(units: T[]): T[] {
  return [...units].sort((a, b) => {
    const diff = rankSortValue(a.name) - rankSortValue(b.name)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })
}

/** Main Unit always displays first, then Second … Fifth; other units sort after by name. */
export function sortShootDayUnitsForDisplay(
  dayUnits: ShootDayUnit[],
  unitsById: Map<string, Unit>
): ShootDayUnit[] {
  return [...dayUnits].sort((a, b) => {
    const unitA = unitsById.get(a.unit_id)
    const unitB = unitsById.get(b.unit_id)
    const diff = rankSortValue(unitA?.name) - rankSortValue(unitB?.name)
    if (diff !== 0) return diff
    const nameA = unitA?.name ?? a.unit_id
    const nameB = unitB?.name ?? b.unit_id
    return nameA.localeCompare(nameB)
  })
}
