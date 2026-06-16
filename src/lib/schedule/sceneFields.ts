import type { Scene } from '@/lib/db/types'
import { SCENE_DAY_NIGHT_VALUES, SCENE_INT_EXT_VALUES } from '@/lib/db/types'

function isLegacyUnknown(value: string): boolean {
  return value === '' || value === 'UNK'
}

/** Maps legacy/invalid stored values to null (unset → display as "—"). */
export function normalizeSceneIntExt(value: unknown): Scene['int_ext'] {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (isLegacyUnknown(trimmed)) return null
  return (SCENE_INT_EXT_VALUES as readonly string[]).includes(trimmed)
    ? (trimmed as Scene['int_ext'])
    : null
}

/** Maps legacy/invalid stored values to null (unset → display as "—"). */
export function normalizeSceneDayNight(value: unknown): Scene['day_night'] {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (isLegacyUnknown(trimmed)) return null
  return (SCENE_DAY_NIGHT_VALUES as readonly string[]).includes(trimmed)
    ? (trimmed as Scene['day_night'])
    : null
}

/** Natural sort for screenplay scene numbers (e.g. 2 before 10, 12A before 12B). */
export function compareSceneNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

export function sortScenesByNumber<T extends { scene_number: string }>(scenes: readonly T[]): T[] {
  return [...scenes].sort((a, b) => compareSceneNumbers(a.scene_number, b.scene_number))
}
