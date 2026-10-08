/**
 * Everything the shooting schedule, shot list and storyboard exports read, loaded once for a
 * production. Used by the export buttons on the Stripboard, Shot List and Storyboard pages and by
 * the day pack. With an actor, view access is checked first (as the `*ForActor` wrappers do).
 */
import type { AuthenticatedUser } from '@/lib/auth/authService'
import { requireProjectViewAccess } from '@/lib/access/projectAccessService'
import { callSheetIncludeEpisodesSettingKey } from '@/lib/call-sheets/callSheetEpisodic'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listCast } from '@/lib/db/repositories/person'
import { getProductionById } from '@/lib/db/repositories/production'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import { listScenesByProduction, listShootDaysByProduction, listShotsByProduction } from '@/lib/db/repositories/schedule'
import { getSetting } from '@/lib/db/repositories/settings'
import { listShootDayUnitsByProduction } from '@/lib/db/repositories/shoot-day-units'
import { getCastIdsByShotIds } from '@/lib/db/repositories/shot-cast'
import { listStoryboardImagesByProduction } from '@/lib/db/repositories/storyboard'
import { listStripsByProduction } from '@/lib/db/repositories/stripboard-strips'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import type {
  Episode,
  Location,
  Person,
  Scene,
  ShootDay,
  ShootDayUnit,
  Shot,
  StoryboardImage,
  StripboardStrip,
  Unit,
} from '@/lib/db/types'

export type ScheduleExportActor = { db: DatabaseAdapter; actor: AuthenticatedUser } | null

export type ScheduleExportSources = {
  productionId: string
  productionName: string
  /** Episodic production with "include episodes" switched on for call sheets: adds the EP column. */
  includeEpisodes: boolean
  episodes: Episode[]
  shootDays: ShootDay[]
  shootDayUnits: ShootDayUnit[]
  units: Unit[]
  /** Scheduled strips only. */
  strips: StripboardStrip[]
  scenes: Scene[]
  shots: Shot[]
  locations: Location[]
  cast: Person[]
  castBySceneId: Map<string, string[]>
  castByShotId: Map<string, string[]>
}

async function checkAccess(productionId: string, actor: ScheduleExportActor | undefined): Promise<void> {
  if (actor) await requireProjectViewAccess(actor.db, actor.actor, productionId)
}

export async function loadScheduleExportSources(
  productionId: string,
  actor?: ScheduleExportActor
): Promise<ScheduleExportSources> {
  await checkAccess(productionId, actor)
  const [production, shootDays, shootDayUnits, units, strips, scenes, shots, locations, cast] = await Promise.all([
    getProductionById(productionId),
    listShootDaysByProduction(productionId),
    listShootDayUnitsByProduction(productionId),
    listUnitsByProduction(productionId),
    listStripsByProduction(productionId),
    listScenesByProduction(productionId),
    listShotsByProduction(productionId),
    listLocationsByProduction(productionId),
    listCast(productionId),
  ])
  if (!production) throw new Error('Production not found')
  const isEpisodic = production.is_episodic === true
  const [castBySceneId, castByShotId, episodes, includeEpisodesRaw] = await Promise.all([
    getCastIdsBySceneIds(scenes.map((s) => s.id)),
    getCastIdsByShotIds(shots.map((s) => s.id)),
    isEpisodic ? listEpisodesByProduction(productionId) : Promise.resolve([] as Episode[]),
    isEpisodic ? getSetting(callSheetIncludeEpisodesSettingKey(productionId)) : Promise.resolve(null),
  ])
  return {
    productionId,
    productionName: production.name,
    includeEpisodes: isEpisodic && includeEpisodesRaw === 'true',
    episodes,
    shootDays,
    shootDayUnits,
    units,
    strips,
    scenes,
    shots,
    locations,
    cast,
    castBySceneId,
    castByShotId,
  }
}

export async function loadStoryboardImagesForExport(
  productionId: string,
  actor?: ScheduleExportActor
): Promise<StoryboardImage[]> {
  await checkAccess(productionId, actor)
  return listStoryboardImagesByProduction(productionId)
}
