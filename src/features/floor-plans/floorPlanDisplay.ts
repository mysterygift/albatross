import { loadColorConfig, resolvePersonColor } from '@/features/people/lib/bookingCalendarColors'
import type { Shot } from '@/lib/db/types'
import type { ScheduleExportSources } from '@/lib/schedule/scheduleExportSources'
import type { CastOption } from './SelectionPopover'

/** `Day 3 | Wed 4 Nov`, or just the date for a day without a number. */
export function formatShootDay(day: { day_number: number | null; shoot_date: string }): string {
  const date = new Date(day.shoot_date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return day.day_number != null ? `Day ${day.day_number} | ${date}` : date
}

/** `WS | 24mm | Dolly | Track`: the camera details shown with the shot. */
export function shotCameraDetails(shot: Shot): string {
  return [shot.shot_size, shot.lens, shot.support, shot.camera_movement]
    .map((v) => v?.toString().trim())
    .filter(Boolean)
    .join(' | ')
}

/** URL value for "the whole scene" in the shot picker. */
export const WHOLE_SCENE = 'scene'

/** Size for display: `0.47 x 0.54 m`. */
export function formatItemSize(width: number, depth: number): string {
  const n = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/0$/, ''))
  return `${n(width)} x ${n(depth)} m`
}

/** Cast to offer for a scene or shot, coloured with their booking colours; the scene's cast first. */
export function castOptionsFor(
  sources: Pick<ScheduleExportSources, 'cast' | 'castByShotId' | 'castBySceneId'>,
  sceneId: string,
  shotId: string | null,
  colorOf: (personId: string) => string
): CastOption[] {
  const inScene = new Set((shotId ? sources.castByShotId.get(shotId) : undefined) ?? sources.castBySceneId.get(sceneId) ?? [])
  return sources.cast
    .map((p) => ({ personId: p.id, name: p.role_name?.trim() || p.name, color: colorOf(p.id), inScene: inScene.has(p.id) }))
    .sort((a, b) => Number(b.inScene) - Number(a.inScene) || a.name.localeCompare(b.name))
}

/**
 * The day the sun path opens on: the next shoot day with shots at this location, else the next
 * shoot day, else today.
 */
export function defaultSunDate(
  sources: Pick<ScheduleExportSources, 'shootDays' | 'strips' | 'shots' | 'scenes'>,
  locationId: string,
  today: string
): string {
  const sceneAt = new Map(sources.scenes.map((s) => [s.id, s.location_id]))
  const shotScene = new Map(sources.shots.map((s) => [s.id, s.scene_id]))
  const dayIds = new Set(
    sources.strips
      .filter((s) => s.strip_status === 'SCHEDULED' && !s.deleted_at && s.shot_id && sceneAt.get(shotScene.get(s.shot_id) ?? '') === locationId)
      .map((s) => s.shoot_day_id)
  )
  const dates = (filter: (id: string) => boolean) =>
    sources.shootDays.filter((d) => !d.deleted_at && filter(d.id)).map((d) => d.shoot_date).sort()
  const pick = (list: string[]) => list.find((d) => d >= today) ?? list[list.length - 1]
  return pick(dates((id) => dayIds.has(id))) ?? pick(dates(() => true)) ?? today
}

/** Each cast member's booking calendar colour, by person id (for floor plans and their PDFs). */
export function castColorMap(productionId: string, cast: ScheduleExportSources['cast']): Map<string, string> {
  const config = loadColorConfig(productionId, cast)
  return new Map(cast.map((p) => [p.id, resolvePersonColor(p, config)]))
}
