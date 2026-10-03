import type { Scene, Shot, StripboardStrip } from '@/lib/db/types'
import { resolveStripShotAndScene } from './stripboardRows'

/** Soft and hard runtime thresholds in minutes (10h, and 10.5h including the lunch allowance). */
export const RUNTIME_WARN_MINUTES = 600
export const RUNTIME_OVER_MINUTES = 630

export type StripboardTotals = {
  shotCount: number
  totalEighths: number
  runtimeMinutes: number
  intCount: number
  extCount: number
  dayCount: number
  nightCount: number
  noLocation: boolean
}

export type RuntimeWarningLevel = 'none' | 'over10' | 'over10_5'

/**
 * Totals for the SHOT strips in a set of strips. Runtime uses the strip's own
 * estimated_minutes override, falling back to the shot's estimated_shoot_minutes.
 */
export function computeStripboardTotals(
  strips: StripboardStrip[],
  shots: Shot[],
  scenes: Scene[],
  estimatedShootMinutesByShotId: Map<string, number>
): StripboardTotals {
  const shotStrips = strips.filter((s) => s.strip_type === 'SHOT')
  const totals: StripboardTotals = {
    shotCount: shotStrips.length,
    totalEighths: 0,
    runtimeMinutes: 0,
    intCount: 0,
    extCount: 0,
    dayCount: 0,
    nightCount: 0,
    noLocation: false,
  }

  for (const strip of shotStrips) {
    const { scene } = resolveStripShotAndScene(strip, shots, scenes)
    const fromShot = strip.shot_id ? estimatedShootMinutesByShotId.get(strip.shot_id) ?? 0 : 0
    totals.runtimeMinutes += strip.estimated_minutes ?? fromShot
    totals.totalEighths += scene?.page_eighths ?? 0
    if (scene && !scene.location_id) totals.noLocation = true
    if (scene?.int_ext === 'INT') totals.intCount += 1
    if (scene?.int_ext === 'EXT') totals.extCount += 1
    if (scene?.day_night === 'DAY') totals.dayCount += 1
    if (scene?.day_night === 'NIGHT') totals.nightCount += 1
  }

  return totals
}

export function runtimeWarningLevel(minutes: number): RuntimeWarningLevel {
  if (minutes > RUNTIME_OVER_MINUTES) return 'over10_5'
  if (minutes > RUNTIME_WARN_MINUTES) return 'over10'
  return 'none'
}

export function formatRuntime(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
