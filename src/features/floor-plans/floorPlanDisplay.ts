import type { Shot } from '@/lib/db/types'

/** `Day 3 · Wed 4 Nov`, or just the date for a day without a number. */
export function formatShootDay(day: { day_number: number | null; shoot_date: string }): string {
  const date = new Date(day.shoot_date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return day.day_number != null ? `Day ${day.day_number} · ${date}` : date
}

/** `WS · 24mm · Dolly · Track`: the camera details shown under the plan. */
export function shotCameraDetails(shot: Shot): string {
  return [shot.shot_size, shot.lens, shot.support, shot.camera_movement]
    .map((v) => v?.toString().trim())
    .filter(Boolean)
    .join(' · ')
}

/** URL value for "the whole scene" in the shot picker. */
export const WHOLE_SCENE = 'scene'
