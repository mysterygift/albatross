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
