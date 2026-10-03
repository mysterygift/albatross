import type { Scene, Shot, StripboardStrip } from '@/lib/db/types'

/** INT/EXT and DAY/NIGHT toggles applied per unit column or unit table. */
export type ColumnFilter = { int: boolean; ext: boolean; day: boolean; night: boolean }

export const DEFAULT_COLUMN_FILTER: ColumnFilter = { int: false, ext: false, day: false, night: false }

/** Resolves a strip's shot and scene. SHOT strips go through the shot; others fall back to strip.scene_id. */
export function resolveStripShotAndScene(
  strip: Pick<StripboardStrip, 'shot_id' | 'scene_id'>,
  shots: Shot[],
  scenes: Scene[]
): { shot: Shot | null; scene: Scene | null } {
  const shot = strip.shot_id ? shots.find((sh) => sh.id === strip.shot_id) ?? null : null
  const scene = shot
    ? scenes.find((s) => s.id === shot.scene_id) ?? null
    : strip.scene_id
      ? scenes.find((s) => s.id === strip.scene_id) ?? null
      : null
  return { shot, scene }
}

export function isColumnFilterActive(filter: ColumnFilter): boolean {
  return filter.int || filter.ext || filter.day || filter.night
}

export function sceneMatchesColumnFilter(scene: Scene, filter: ColumnFilter): boolean {
  const intExtMatch =
    !filter.int && !filter.ext
      ? true
      : (filter.int && scene.int_ext === 'INT') || (filter.ext && scene.int_ext === 'EXT')
  const dayNightMatch =
    !filter.day && !filter.night
      ? true
      : (filter.day && scene.day_night === 'DAY') || (filter.night && scene.day_night === 'NIGHT')
  return intExtMatch && dayNightMatch
}

/**
 * Strips visible under a column filter. Non-SHOT strips and SHOT strips without a
 * resolvable scene are always kept, matching the original column behaviour.
 */
export function filterStripsByColumnFilter(
  strips: StripboardStrip[],
  shots: Shot[],
  scenes: Scene[],
  filter: ColumnFilter
): StripboardStrip[] {
  return strips.filter((strip) => {
    if (strip.strip_type !== 'SHOT') return true
    const { scene } = resolveStripShotAndScene(strip, shots, scenes)
    if (!scene) return true
    return sceneMatchesColumnFilter(scene, filter)
  })
}

/** Non-mutating sort by sort_index (the stripboard's manual order). */
export function sortStripsBySortIndex(strips: StripboardStrip[]): StripboardStrip[] {
  return [...strips].sort((a, b) => a.sort_index - b.sort_index)
}
