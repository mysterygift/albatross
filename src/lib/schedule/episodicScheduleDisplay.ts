/**
 * Pure helpers for episodic stripboard/calendar display. Single derivation path for bloc and episode labels.
 */
import type { Episode, Scene, Shot, ShootingBloc, StripboardStrip } from '@/lib/db/types'

export const OUTSIDE_BLOCS_LABEL = 'Outside blocs'

export type ShootingBlocViewFilter = 'all' | 'unassigned' | string

export function shootingBlocLabelFromAssociation(
  shootingBlocId: string | null,
  blocsById: Map<string, ShootingBloc>
): string {
  if (!shootingBlocId) return OUTSIDE_BLOCS_LABEL
  const bloc = blocsById.get(shootingBlocId)
  return bloc?.name?.trim() || OUTSIDE_BLOCS_LABEL
}

/** Calendar SQL already joins bloc name; use when you have event fields. */
export function calendarShootingBlocDisplay(
  shootingBlocId: string | null,
  shootingBlocName: string | null
): string {
  if (!shootingBlocId) return OUTSIDE_BLOCS_LABEL
  return shootingBlocName?.trim() || OUTSIDE_BLOCS_LABEL
}

export function shootDayMatchesBlocFilter(
  shootingBlocId: string | null,
  filter: ShootingBlocViewFilter
): boolean {
  if (filter === 'all') return true
  if (filter === 'unassigned') return shootingBlocId == null
  return shootingBlocId === filter
}

export function resolveSceneIdForStrip(
  strip: Pick<StripboardStrip, 'scene_id' | 'shot_id' | 'strip_type'>,
  shotById: Map<string, Pick<Shot, 'scene_id'>>
): string | null {
  if (strip.strip_type === 'SHOT' && strip.shot_id) {
    return shotById.get(strip.shot_id)?.scene_id ?? null
  }
  if (strip.strip_type === 'SCENE' && strip.scene_id) {
    return strip.scene_id
  }
  if (strip.shot_id) {
    return shotById.get(strip.shot_id)?.scene_id ?? strip.scene_id ?? null
  }
  return strip.scene_id
}

export function orderedDistinctEpisodeNames(args: {
  strips: StripboardStrip[]
  shotById: Map<string, Pick<Shot, 'scene_id'>>
  sceneById: Map<string, Pick<Scene, 'episode_id'>>
  episodeById: Map<string, Pick<Episode, 'name'>>
}): string[] {
  const names = new Set<string>()
  for (const strip of args.strips) {
    if (strip.strip_type !== 'SHOT' && strip.strip_type !== 'SCENE') continue
    const sceneId = resolveSceneIdForStrip(strip, args.shotById)
    if (!sceneId) continue
    const episodeId = args.sceneById.get(sceneId)?.episode_id ?? null
    if (!episodeId) continue
    const ep = args.episodeById.get(episodeId)
    if (ep?.name?.trim()) names.add(ep.name.trim())
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

export const NO_EPISODE_ASSIGNMENT_LABEL = 'No episode'

/** Short label for strip row badge (episode name or degraded state in episodic mode). */
export function episodeLabelForSceneRow(args: {
  scene: Pick<Scene, 'episode_id'> | null | undefined
  episodeById: Map<string, Pick<Episode, 'name'>>
}): string | null {
  const scene = args.scene
  if (!scene) return null
  const episodeId = scene.episode_id
  if (!episodeId) return NO_EPISODE_ASSIGNMENT_LABEL
  const ep = args.episodeById.get(episodeId)
  if (!ep) return NO_EPISODE_ASSIGNMENT_LABEL
  return ep.name?.trim() || NO_EPISODE_ASSIGNMENT_LABEL
}
