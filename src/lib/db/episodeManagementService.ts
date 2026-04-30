import type { Episode } from './types'
import type { AuthenticatedUser } from '@/lib/auth/authService'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import {
  requireProjectEditAccess,
  requireProjectViewAccess,
} from '@/lib/access/projectAccessService'
import { getProductionById } from './repositories/production'
import {
  archiveEpisodeForProduction,
  countActiveEpisodesByProduction,
  createEpisode,
  getActiveEpisodeByIdForProduction,
  getEpisodeByIdForProductionIncludeArchived,
  getMaxActiveEpisodeSortOrder,
  deleteEpisodeAndClearReferencesForProduction,
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
    const n = await countActiveEpisodesByProduction(productionId)
    if (n <= 1) return { allowed: false, reason: 'Cannot delete the last active episode.' }
    return { allowed: true }
  }
  return { allowed: true }
}

/** Permanently delete an episode; clears scene / music / deliverable `episode_id` pointers first. */
export async function deleteEpisodeClearingReferences(productionId: string, episodeId: string): Promise<void> {
  await requireEpisodicProduction(productionId)
  await deleteEpisodeAndClearReferencesForProduction(productionId, episodeId)
}

export async function hardDeleteArchivedEpisode(productionId: string, episodeId: string): Promise<void> {
  await deleteEpisodeClearingReferences(productionId, episodeId)
}

export async function loadEpisodesForSettingsForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}): Promise<Episode[]> {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return loadEpisodesForSettings(args.productionId)
}

export async function appendEpisodeForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  rawName: string
}): Promise<Episode> {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return appendEpisode(args.productionId, args.rawName)
}

export async function renameEpisodeForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  episodeId: string
  rawName: string
}): Promise<Episode> {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return renameEpisode(args.productionId, args.episodeId, args.rawName)
}

export async function reorderEpisodesForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  activeIdsInOrder: string[]
}): Promise<void> {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return reorderEpisodes(args.productionId, args.activeIdsInOrder)
}

export async function archiveEpisodeForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  episodeId: string
}): Promise<void> {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return archiveEpisode(args.productionId, args.episodeId)
}

export async function deleteEpisodeClearingReferencesForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  episodeId: string
}): Promise<void> {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return deleteEpisodeClearingReferences(args.productionId, args.episodeId)
}
