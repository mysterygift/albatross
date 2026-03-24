import type { Episode } from './types'
import { getProductionById } from './repositories/production'
import {
  archiveEpisodeForProduction,
  countActiveEpisodesByProduction,
  countActiveReferencesToEpisode,
  createEpisode,
  getActiveEpisodeByIdForProduction,
  getEpisodeByIdForProductionIncludeArchived,
  getMaxActiveEpisodeSortOrder,
  hardDeleteArchivedEpisodeForProduction,
  listEpisodesByProduction,
  listEpisodesForProductionManagement,
  reorderActiveEpisodes,
  updateEpisodeNameForProduction,
} from './repositories/episodes'

function requireEpisodicProduction(productionId: string) {
  return getProductionById(productionId).then((p) => {
    if (!p) throw new Error('Production not found')
    if (!p.is_episodic) throw new Error('Production is not episodic')
    return p
  })
}

function requireNonEmptyName(raw: string): string {
  const name = raw.trim()
  if (!name) throw new Error('Episode name is required')
  return name
}

export async function loadEpisodesForSettings(productionId: string): Promise<Episode[]> {
  await requireEpisodicProduction(productionId)
  return listEpisodesForProductionManagement(productionId)
}

export async function appendEpisode(productionId: string, rawName: string): Promise<Episode> {
  await requireEpisodicProduction(productionId)
  const name = requireNonEmptyName(rawName)
  const max = await getMaxActiveEpisodeSortOrder(productionId)
  return createEpisode({
    production_id: productionId,
    name,
    sort_order: max + 1,
  })
}

export async function renameEpisode(
  productionId: string,
  episodeId: string,
  rawName: string
): Promise<Episode> {
  await requireEpisodicProduction(productionId)
  const name = requireNonEmptyName(rawName)
  const ep = await getActiveEpisodeByIdForProduction(productionId, episodeId)
  if (!ep) throw new Error('Episode not found')
  return updateEpisodeNameForProduction(productionId, episodeId, name)
}

export async function reorderEpisodes(productionId: string, activeIdsInOrder: string[]): Promise<void> {
  await requireEpisodicProduction(productionId)
  const active = await listEpisodesByProduction(productionId)
  const expected = active.map((e) => e.id)
  if (expected.length !== activeIdsInOrder.length) {
    throw new Error('Episode order must include every active episode')
  }
  if (new Set(activeIdsInOrder).size !== activeIdsInOrder.length) {
    throw new Error('Duplicate episode id in order')
  }
  const expectedSet = new Set(expected)
  for (const id of activeIdsInOrder) {
    if (!expectedSet.has(id)) throw new Error('Invalid episode id in order')
  }
  await reorderActiveEpisodes(productionId, activeIdsInOrder)
}

export async function archiveEpisode(productionId: string, episodeId: string): Promise<void> {
  await requireEpisodicProduction(productionId)
  const n = await countActiveEpisodesByProduction(productionId)
  if (n <= 1) throw new Error('Cannot archive the last active episode')
  const ep = await getActiveEpisodeByIdForProduction(productionId, episodeId)
  if (!ep) throw new Error('Episode not found')
  await archiveEpisodeForProduction(productionId, episodeId)
}

export type EpisodeHardDeleteEligibility = { allowed: true } | { allowed: false; reason: string }

export async function getEpisodeHardDeleteEligibility(
  productionId: string,
  episodeId: string
): Promise<EpisodeHardDeleteEligibility> {
  await requireEpisodicProduction(productionId)
  const ep = await getEpisodeByIdForProductionIncludeArchived(productionId, episodeId)
  if (!ep) return { allowed: false, reason: 'Episode not found' }
  if (ep.deleted_at == null) {
    return { allowed: false, reason: 'Archive the episode before you can delete it permanently.' }
  }
  const refs = await countActiveReferencesToEpisode(episodeId)
  if (refs.scenes > 0 || refs.musicTracks > 0 || refs.deliverables > 0) {
    const parts: string[] = []
    if (refs.scenes > 0) parts.push(`${refs.scenes} scene(s)`)
    if (refs.musicTracks > 0) parts.push(`${refs.musicTracks} music track(s)`)
    if (refs.deliverables > 0) parts.push(`${refs.deliverables} deliverable(s)`)
    return { allowed: false, reason: `Still referenced by ${parts.join(', ')}.` }
  }
  return { allowed: true }
}

export async function hardDeleteArchivedEpisode(productionId: string, episodeId: string): Promise<void> {
  await requireEpisodicProduction(productionId)
  await hardDeleteArchivedEpisodeForProduction(productionId, episodeId)
}
