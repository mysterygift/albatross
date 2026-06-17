import { formatSceneHeading } from '@/lib/script-parser/common'
import type { IntExt } from '@/lib/script-parser/types'

type SceneScheduleFields = {
  int_ext?: string | null
  day_night?: string | null
  title?: string | null
}

type SceneDisplayFields = SceneScheduleFields & {
  description?: string | null
}

function isUnknownScheduleValue(value: string | null | undefined): boolean {
  if (value == null) return true
  const trimmed = value.trim()
  return trimmed === '' || trimmed === 'UNK'
}

/** UI label: INT/EXT – location name – DAY/NIGHT (matches shot-list scene picker). */
export function sceneScheduleLabel(
  scene: SceneScheduleFields,
  locationName: string | null | undefined
): string {
  const intExt = !isUnknownScheduleValue(scene.int_ext) ? scene.int_ext : '—'
  const loc = locationName?.trim() || '—'
  const dayNight = !isUnknownScheduleValue(scene.day_night) ? scene.day_night : '—'
  return `${intExt} – ${loc} – ${dayNight}`
}

/**
 * UI label with fallback when structured fields are too sparse (e.g. INT + UNK day/night, no location).
 * Prefers `title` over a mostly-placeholder schedule string after heading removal.
 */
export function sceneDisplayLabel(
  scene: SceneDisplayFields,
  locationName?: string | null
): string {
  const title = scene.title?.trim()
  const hasLoc = !!locationName?.trim()
  const hasIntExt = !isUnknownScheduleValue(scene.int_ext)
  const hasDayNight = !isUnknownScheduleValue(scene.day_night)
  const scheduleUseful = hasLoc || (hasIntExt && hasDayNight)

  if (scheduleUseful) {
    return sceneScheduleLabel(scene, locationName ?? null)
  }
  if (title) return title
  if (hasIntExt || hasDayNight || hasLoc) {
    return sceneScheduleLabel(scene, locationName ?? null)
  }
  return scene.description?.trim() || 'No scene label'
}

/** Screenplay slugline for sides/call sheets (e.g. "INT. KITCHEN - DAY"). */
export function sceneSlugline(
  scene: SceneScheduleFields,
  locationName: string | null | undefined
): string | null {
  const loc = locationName?.trim()
  const dayNight = isUnknownScheduleValue(scene.day_night) ? null : scene.day_night?.trim()
  const slugParts = [loc, dayNight].filter(Boolean).join(' - ')
  if (slugParts) {
    return formatSceneHeading(scene.int_ext as IntExt | null | undefined, slugParts)
  }
  const title = scene.title?.trim()
  return title || null
}
