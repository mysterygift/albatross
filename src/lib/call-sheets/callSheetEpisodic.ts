import type { Episode, Scene, Shot, ShootingBloc, StripboardStrip } from '@/lib/db/types'
import type { CallSheetStrip } from '@/lib/pdf/callSheet'
import {
  episodeLabelForSceneRow,
  resolveSceneIdForStrip,
} from '@/lib/schedule/episodicScheduleDisplay'

/** Scoped settings key; value `'true' | 'false'`. Default when missing: false. */
export function callSheetIncludeEpisodesSettingKey(productionId: string): string {
  return `call_sheet_include_episodes:${productionId}`
}

/**
 * Masthead line for episodic productions when the shoot day has an assigned bloc.
 * Returns null when non-episodic, no bloc id, or bloc name missing (no placeholders).
 */
export function shootingBlocMastheadLabelForCallSheet(args: {
  isEpisodicProduction: boolean
  shootingBlocId: string | null
  blocsById: Map<string, Pick<ShootingBloc, 'name'>>
}): string | null {
  if (!args.isEpisodicProduction) return null
  const id = args.shootingBlocId?.trim()
  if (!id) return null
  const bloc = args.blocsById.get(id)
  const name = bloc?.name?.trim()
  if (!name) return null
  return name
}

export function enrichCallSheetStripEpisodeLabel(args: {
  strip: StripboardStripLike
  shotById: Map<string, Pick<Shot, 'scene_id'>>
  sceneById: Map<string, Pick<Scene, 'episode_id'>>
  episodeById: Map<string, Pick<Episode, 'name'>>
  includeEpisodes: boolean
}): Pick<CallSheetStrip, 'episodeLabel'> {
  if (!args.includeEpisodes) return { episodeLabel: null }
  const st = args.strip.strip_type
  if (st !== 'SCENE' && st !== 'SHOT') return { episodeLabel: null }
  const sceneId = resolveSceneIdForStrip(args.strip, args.shotById) ?? args.strip.scene_id
  if (!sceneId) return { episodeLabel: null }
  const scene = args.sceneById.get(sceneId)
  const label = episodeLabelForSceneRow({ scene: scene ?? null, episodeById: args.episodeById })
  return { episodeLabel: label }
}

type StripboardStripLike = Pick<StripboardStrip, 'strip_type' | 'scene_id' | 'shot_id'>
