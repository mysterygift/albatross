import { getDb } from '@/lib/db/client'
import {
  ApfImportConflictError,
  ApfImportPreflightError,
} from '@/lib/importExport/errors'
import type { ApfManifestV1 } from '@/lib/importExport/manifest'
import type { ApfV1DataFile } from '@/lib/importExport/payload'
import { assertManifestMatchesProductionPayload } from '@/lib/importExport/readApfArchive'

/**
 * DB + payload checks before file extraction or any import write.
 */
export async function preflightApfImportDb(params: {
  manifest: ApfManifestV1
  data: ApfV1DataFile
}): Promise<void> {
  const { manifest, data } = params
  const prows = data.tables.productions
  if (prows.length !== 1) {
    throw new ApfImportPreflightError(
      `Expected exactly one row in tables.productions, got ${prows.length}`
    )
  }
  const prod = prows[0]!
  assertManifestMatchesProductionPayload(manifest, prod)

  const productionId = String(prod.id)

  const slug =
    prod.slug != null && String(prod.slug).length > 0
      ? String(prod.slug)
      : manifest.production.slug != null
        ? String(manifest.production.slug)
        : null

  const db = await getDb()

  const rawClientId = prod.client_id
  const clientIdStr =
    rawClientId == null
      ? ''
      : typeof rawClientId === 'string'
        ? rawClientId.trim()
        : String(rawClientId).trim()
  if (clientIdStr) {
    const clientRows = await db.select<{ id: string }[]>(
      `SELECT id FROM clients WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [clientIdStr]
    )
    if (clientRows.length === 0) {
      prod.client_id = null
    }
  } else if ('client_id' in prod) {
    prod.client_id = null
  }
  if (!('delivery_date' in prod)) {
    prod.delivery_date = null
  }

  const existingById = await db.select<{ id: string }[]>(
    `SELECT id FROM productions WHERE id = $1 LIMIT 1`,
    [productionId]
  )
  if (existingById.length > 0) {
    throw new ApfImportConflictError(
      'production_id',
      `A production with id ${productionId} already exists. Remove it or use a different package (import does not merge or overwrite).`
    )
  }

  if (slug) {
    const slugRow = await db.select<{ id: string }[]>(
      `SELECT id FROM productions WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
      [slug]
    )
    if (slugRow.length > 0) {
      throw new ApfImportConflictError(
        'slug',
        `Another active production already uses slug "${slug}". Resolve the slug conflict before importing.`
      )
    }
  }

  const isEpisodic =
    prod.is_episodic !== undefined && prod.is_episodic !== null && Number(prod.is_episodic) === 1
  const scenesRows = data.tables.scenes
  const episodeRows = data.tables.episodes

  const episodeIdsForProduction = new Set<string>()
  for (let i = 0; i < episodeRows.length; i++) {
    const er = episodeRows[i]!
    if (String(er.production_id) !== productionId) {
      throw new ApfImportPreflightError(
        `episodes[${i}] production_id must match imported production (${productionId}).`
      )
    }
    episodeIdsForProduction.add(String(er.id))
  }

  const shootingBlocRows = data.tables.shooting_blocs
  const shootingBlocIdsForProduction = new Set<string>()
  for (let i = 0; i < shootingBlocRows.length; i++) {
    const br = shootingBlocRows[i]!
    if (String(br.production_id) !== productionId) {
      throw new ApfImportPreflightError(
        `shooting_blocs[${i}] production_id must match imported production (${productionId}).`
      )
    }
    shootingBlocIdsForProduction.add(String(br.id))
  }

  const shootDayRows = data.tables.shoot_days
  for (let i = 0; i < shootDayRows.length; i++) {
    const sd = shootDayRows[i]!
    const rawBloc = sd.shooting_bloc_id
    const blocId =
      rawBloc == null
        ? ''
        : typeof rawBloc === 'string'
          ? rawBloc.trim()
          : String(rawBloc).trim()
    if (!blocId) continue
    if (!shootingBlocIdsForProduction.has(blocId)) {
      throw new ApfImportPreflightError(
        `shoot_days[${i}] shooting_bloc_id "${blocId}" is not in tables.shooting_blocs for this production.`
      )
    }
  }

  if (isEpisodic) {
    for (let i = 0; i < scenesRows.length; i++) {
      const sc = scenesRows[i]!
      const raw = sc.episode_id
      const eid =
        typeof raw === 'string'
          ? raw.trim()
          : raw != null
            ? String(raw).trim()
            : ''
      if (!eid) {
        throw new ApfImportPreflightError(
          `Episodic import requires episode_id on every scene (missing on scenes[${i}]). Export from a current Albatross build or fix the package.`
        )
      }
      if (!episodeIdsForProduction.has(eid)) {
        throw new ApfImportPreflightError(
          `scenes[${i}] episode_id "${eid}" is not in tables.episodes for this production.`
        )
      }
    }
  } else {
    for (let i = 0; i < scenesRows.length; i++) {
      const sc = scenesRows[i]!
      const raw = sc.episode_id
      const hasEpisode =
        raw != null &&
        (typeof raw === 'string' ? raw.trim() !== '' : String(raw).trim() !== '')
      if (hasEpisode) {
        throw new ApfImportPreflightError(
          `Non-episodic import cannot set episode_id on scenes (scenes[${i}]). Remove episode_id or use an episodic production export.`
        )
      }
    }
  }

  const musicTrackRows = data.tables.music_tracks
  if (isEpisodic) {
    for (let i = 0; i < musicTrackRows.length; i++) {
      const tr = musicTrackRows[i]!
      const raw = tr.episode_id
      const eid =
        typeof raw === 'string'
          ? raw.trim()
          : raw != null
            ? String(raw).trim()
            : ''
      if (!eid) continue
      if (!episodeIdsForProduction.has(eid)) {
        throw new ApfImportPreflightError(
          `music_tracks[${i}] episode_id "${eid}" is not in tables.episodes for this production.`
        )
      }
    }
  } else {
    for (let i = 0; i < musicTrackRows.length; i++) {
      const tr = musicTrackRows[i]!
      const raw = tr.episode_id
      const hasEpisode =
        raw != null &&
        (typeof raw === 'string' ? raw.trim() !== '' : String(raw).trim() !== '')
      if (hasEpisode) {
        throw new ApfImportPreflightError(
          `Non-episodic import cannot set episode_id on music tracks (music_tracks[${i}]). Remove episode_id or use an episodic production export.`
        )
      }
    }
  }

  const deliverablesRows = data.tables.deliverables
  if (isEpisodic) {
    for (let i = 0; i < deliverablesRows.length; i++) {
      const row = deliverablesRows[i]!
      const raw = row.episode_id
      const eid =
        typeof raw === 'string'
          ? raw.trim()
          : raw != null
            ? String(raw).trim()
            : ''
      if (!eid) continue
      if (!episodeIdsForProduction.has(eid)) {
        throw new ApfImportPreflightError(
          `deliverables[${i}] episode_id "${eid}" is not in tables.episodes for this production.`
        )
      }
    }
  } else {
    for (let i = 0; i < deliverablesRows.length; i++) {
      const row = deliverablesRows[i]!
      const raw = row.episode_id
      const hasEpisode =
        raw != null &&
        (typeof raw === 'string' ? raw.trim() !== '' : String(raw).trim() !== '')
      if (hasEpisode) {
        throw new ApfImportPreflightError(
          `Non-episodic import cannot set episode_id on deliverables (deliverables[${i}]). Remove episode_id or use an episodic production export.`
        )
      }
    }
  }
}
