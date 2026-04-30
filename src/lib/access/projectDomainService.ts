import type { AuthenticatedUser } from '@/lib/auth/authService'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { requireProjectEditAccess, requireProjectViewAccess } from '@/lib/access/projectAccessService'
import {
  createShootDayWithDefaultMainUnit,
  createScene,
  createShot,
  deleteShot,
  ensureCallWrapStripsForProduction,
  getEstimatedShootMinutesByShotIds,
  getSceneById,
  getShootDayById,
  listScenesByProduction,
  listShootDaysByProduction,
  listShotsByScene,
  listShotsByProduction,
  moveShootDayToDate,
  swapShootDays,
  updateShootDay,
  updateScene,
  updateShot,
  type CreateShotInput,
} from '@/lib/db/repositories/schedule'
import {
  getEpisodeByIdForProductionIncludeArchived,
  listEpisodesByProduction,
} from '@/lib/db/repositories/episodes'
import {
  createBooking,
  deleteBooking,
  listBookingsByProduction,
  listBookingsByShootDay,
  updateBooking,
} from '@/lib/db/repositories/booking'
import { createDocument, listDocumentsByProduction } from '@/lib/db/repositories/document'
import {
  createPerson,
  deletePerson,
  getPersonById,
  listCast,
  listCrew,
  listPeopleByProduction,
  updatePerson,
} from '@/lib/db/repositories/person'
import { listTasksByProduction } from '@/lib/db/repositories/tasks'
import { listBookingsByPerson } from '@/lib/db/repositories/booking'
import { listAvailabilityByPerson, listAvailabilityByProduction } from '@/lib/db/repositories/cast-availability'
import {
  addSceneCast,
  getCastIdsBySceneIds,
  listSceneCastByPerson,
  listSceneCastByScene,
  removeSceneCast,
} from '@/lib/db/repositories/scene-cast'
import {
  addShotCast,
  getCastIdsByShotIds,
  listShotCastByPersonInProduction,
  listShotCastByShotIds,
  removeShotCast,
} from '@/lib/db/repositories/shot-cast'
import {
  getOrCreateShootDayUnit,
  listShootDayUnitsByProduction,
  listShootDayUnitsByShootDay,
  setShootDayUnitLocked,
} from '@/lib/db/repositories/shoot-day-units'
import { ensureMainUnit, listUnitsByProduction } from '@/lib/db/repositories/units'
import { listRecentPersonActivity } from '@/lib/db/repositories/personActivity'
import {
  bulkAssignShotsToDay,
  createShotStrip,
  createStrip,
  deleteStrip,
  getScheduledSceneIdsByShootDay,
  listBoneyardStrips,
  listStripsByProduction,
  listStripsByShootDay,
  listUnscheduledShots,
  moveStrip,
  moveStripToBoneyard,
  moveStripToUnscheduled,
  reorderStrip,
  updateCallWrapStripTime,
  updateStripEstimatedMinutes,
  type CreateStripData,
  type UnscheduledShotsFilters,
} from '@/lib/db/repositories/stripboard-strips'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { listCalendarShootDayEvents } from '@/lib/db/repositories/calendar'
import { listShootingBlocsByProduction } from '@/lib/db/repositories/shootingBlocs'
import { listKeyContactsByProduction } from '@/lib/db/repositories/key-contacts'
import { getProductionById } from '@/lib/db/repositories/production'
import {
  applyAthenaImportToStoryboard,
  createStoryboardImage,
  deleteStoryboardImage,
  listStoryboardImagesByProduction,
  updateStoryboardImage,
  updateStoryboardImport,
} from '@/lib/db/repositories/storyboard'
import { getBookingCoverageByShootDay, getPersonBookingNeedSummary } from '@/lib/people/bookingIntelligence'
import {
  listEquipmentTermsByProductionAndType,
  upsertEquipmentTerm,
} from '@/lib/db/repositories/equipment-terms'

async function resolveProductionIdForPerson(db: DatabaseAdapter, personId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM people WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [personId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Person not found')
  return productionId
}

async function resolveProductionIdForScene(db: DatabaseAdapter, sceneId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM scenes WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [sceneId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Scene not found')
  return productionId
}

async function resolveProductionIdForShot(db: DatabaseAdapter, shotId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT sc.production_id
       FROM shots sh
       INNER JOIN scenes sc ON sc.id = sh.scene_id
      WHERE sh.id = $1
        AND sh.deleted_at IS NULL
        AND sc.deleted_at IS NULL
      LIMIT 1`,
    [shotId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Shot not found')
  return productionId
}

async function resolveProductionIdForSceneCast(db: DatabaseAdapter, sceneCastId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM scene_cast WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [sceneCastId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Scene cast not found')
  return productionId
}

async function resolveProductionIdForShotCast(db: DatabaseAdapter, shotCastId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM shot_cast WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [shotCastId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Shot cast not found')
  return productionId
}

async function resolveProductionIdForBooking(db: DatabaseAdapter, bookingId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM bookings WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [bookingId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Booking not found')
  return productionId
}

async function resolveProductionIdForShootDay(db: DatabaseAdapter, shootDayId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM shoot_days WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [shootDayId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Shoot day not found')
  return productionId
}

async function resolveProductionIdForShootDayUnit(db: DatabaseAdapter, shootDayUnitId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT sd.production_id
       FROM shoot_day_units sdu
       INNER JOIN shoot_days sd ON sd.id = sdu.shoot_day_id
      WHERE sdu.id = $1
        AND sdu.deleted_at IS NULL
        AND sd.deleted_at IS NULL
      LIMIT 1`,
    [shootDayUnitId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Shoot day unit not found')
  return productionId
}

async function resolveProductionIdForStrip(db: DatabaseAdapter, stripId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM stripboard_strips WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [stripId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Strip not found')
  return productionId
}

async function resolveProductionIdForStoryboardImage(db: DatabaseAdapter, imageId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM storyboard_images WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [imageId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Storyboard image not found')
  return productionId
}

async function resolveProductionIdForStoryboardImport(db: DatabaseAdapter, importId: string): Promise<string> {
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM storyboard_imports WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [importId]
  )
  const productionId = rows[0]?.production_id
  if (!productionId) throw new Error('Storyboard import not found')
  return productionId
}

export async function listDocumentsByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listDocumentsByProduction(args.productionId)
}

export async function createDocumentForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  fileName: string
  filePath: string
  mimeType?: string | null
}) {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return createDocument({
    production_id: args.productionId,
    entity_type: null,
    entity_id: null,
    file_name: args.fileName,
    file_path: args.filePath,
    mime_type: args.mimeType ?? null,
  })
}

export async function listBookingsByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listBookingsByProduction(args.productionId)
}

export async function createBookingForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  personId: string
  shootDayId?: string | null
  role?: string | null
  notes?: string | null
}) {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return createBooking({
    production_id: args.productionId,
    person_id: args.personId,
    shoot_day_id: args.shootDayId ?? null,
    role: args.role ?? null,
    notes: args.notes ?? null,
  })
}

export async function deleteBookingForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  bookingId: string
}) {
  const productionId = await resolveProductionIdForBooking(args.db, args.bookingId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  await deleteBooking(args.bookingId)
}

export async function listPeopleByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listPeopleByProduction(args.productionId)
}

export async function listShootDaysByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listShootDaysByProduction(args.productionId)
}

export async function listCastForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listCast(args.productionId)
}

export async function listCrewForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listCrew(args.productionId)
}

export async function createPersonForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  data: Parameters<typeof createPerson>[0]
}) {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return createPerson(args.data)
}

export async function getPersonByIdForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  personId: string
}) {
  const productionId = await resolveProductionIdForPerson(args.db, args.personId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return getPersonById(args.personId)
}

export async function updatePersonForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  personId: string
  data: Parameters<typeof updatePerson>[1]
}) {
  const productionId = await resolveProductionIdForPerson(args.db, args.personId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return updatePerson(args.personId, args.data)
}

export async function listTasksByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listTasksByProduction(args.productionId)
}

export async function listBookingsByPersonForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  personId: string
}) {
  const productionId = await resolveProductionIdForPerson(args.db, args.personId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return listBookingsByPerson(args.personId)
}

export async function listAvailabilityByPersonForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  personId: string
}) {
  const productionId = await resolveProductionIdForPerson(args.db, args.personId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return listAvailabilityByPerson(args.personId)
}

export async function listSceneCastByPersonForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  personId: string
}) {
  const productionId = await resolveProductionIdForPerson(args.db, args.personId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return listSceneCastByPerson(args.personId)
}

export async function listSceneCastBySceneForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  sceneId: string
}) {
  const productionId = await resolveProductionIdForScene(args.db, args.sceneId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return listSceneCastByScene(args.sceneId)
}

export async function addSceneCastForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  data: Parameters<typeof addSceneCast>[0]
}) {
  await requireProjectEditAccess(args.db, args.actor, args.data.production_id)
  return addSceneCast(args.data)
}

export async function removeSceneCastForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  sceneCastId: string
}) {
  const productionId = await resolveProductionIdForSceneCast(args.db, args.sceneCastId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return removeSceneCast(args.sceneCastId)
}

export async function getCastIdsBySceneIdsForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  sceneIds: string[]
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return getCastIdsBySceneIds(args.sceneIds)
}

export async function listShotCastByPersonInProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  personId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listShotCastByPersonInProduction(args.productionId, args.personId)
}

export async function listShotCastByShotIdsForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  shotIds: string[]
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listShotCastByShotIds(args.shotIds)
}

export async function addShotCastForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  data: Parameters<typeof addShotCast>[0]
}) {
  await requireProjectEditAccess(args.db, args.actor, args.data.production_id)
  return addShotCast(args.data)
}

export async function removeShotCastForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shotCastId: string
}) {
  const productionId = await resolveProductionIdForShotCast(args.db, args.shotCastId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return removeShotCast(args.shotCastId)
}

export async function getCastIdsByShotIdsForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  shotIds: string[]
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return getCastIdsByShotIds(args.shotIds)
}

export async function listShootDayUnitsByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listShootDayUnitsByProduction(args.productionId)
}

export async function listUnitsByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listUnitsByProduction(args.productionId)
}

export async function listRecentPersonActivityForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  personId: string
  limit?: number
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listRecentPersonActivity(args.productionId, args.personId, args.limit)
}

export async function getScheduledSceneIdsByShootDayForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return getScheduledSceneIdsByShootDay(args.productionId)
}

export async function listScenesByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listScenesByProduction(args.productionId)
}

export async function getSceneByIdForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  sceneId: string
}) {
  const productionId = await resolveProductionIdForScene(args.db, args.sceneId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return getSceneById(args.sceneId)
}

export async function listShotsBySceneForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  sceneId: string
}) {
  const productionId = await resolveProductionIdForScene(args.db, args.sceneId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return listShotsByScene(args.sceneId)
}

export async function listShotsByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listShotsByProduction(args.productionId)
}

export async function createSceneForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  data: Parameters<typeof createScene>[0]
}) {
  await requireProjectEditAccess(args.db, args.actor, args.data.production_id)
  return createScene(args.data)
}

export async function updateSceneForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  sceneId: string
  data: Parameters<typeof updateScene>[1]
}) {
  const productionId = await resolveProductionIdForScene(args.db, args.sceneId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return updateScene(args.sceneId, args.data)
}

export async function createShotForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  data: CreateShotInput
}) {
  const productionId = await resolveProductionIdForScene(args.db, args.data.scene_id)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return createShot(args.data)
}

export async function updateShotForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shotId: string
  data: Parameters<typeof updateShot>[1]
}) {
  const productionId = await resolveProductionIdForShot(args.db, args.shotId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return updateShot(args.shotId, args.data)
}

export async function deleteShotForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shotId: string
}) {
  const productionId = await resolveProductionIdForShot(args.db, args.shotId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return deleteShot(args.shotId)
}

export async function listLocationsByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listLocationsByProduction(args.productionId)
}

export async function listEpisodesByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listEpisodesByProduction(args.productionId)
}

export async function getEpisodeByIdForProductionIncludeArchivedForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  episodeId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return getEpisodeByIdForProductionIncludeArchived(args.productionId, args.episodeId)
}

export async function listEquipmentTermsByProductionAndTypeForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  type: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listEquipmentTermsByProductionAndType(args.productionId, args.type)
}

export async function upsertEquipmentTermForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  type: string
  value: string
}) {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return upsertEquipmentTerm(args.productionId, args.type, args.value)
}

export async function deletePersonForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  personId: string
}) {
  const productionId = await resolveProductionIdForPerson(args.db, args.personId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return deletePerson(args.personId)
}

export async function updateBookingForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  bookingId: string
  data: Parameters<typeof updateBooking>[1]
}) {
  const productionId = await resolveProductionIdForBooking(args.db, args.bookingId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return updateBooking(args.bookingId, args.data)
}

export async function listBookingsByShootDayForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shootDayId: string
}) {
  const productionId = await resolveProductionIdForShootDay(args.db, args.shootDayId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return listBookingsByShootDay(args.shootDayId)
}

export async function listAvailabilityByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listAvailabilityByProduction(args.productionId)
}

export async function getBookingCoverageByShootDayForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return getBookingCoverageByShootDay(args.productionId)
}

export async function getPersonBookingNeedSummaryForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  personId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return getPersonBookingNeedSummary(args.productionId, args.personId)
}

export async function listCalendarShootDayEventsForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  dateRange: Parameters<typeof listCalendarShootDayEvents>[1]
  filters?: Parameters<typeof listCalendarShootDayEvents>[2]
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listCalendarShootDayEvents(args.productionId, args.dateRange, args.filters)
}

export async function moveShootDayToDateForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shootDayId: string
  newDate: string
}) {
  const productionId = await resolveProductionIdForShootDay(args.db, args.shootDayId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return moveShootDayToDate(args.shootDayId, args.newDate)
}

export async function swapShootDaysForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  sourceShootDayId: string
  targetShootDayId: string
}) {
  const sourceProductionId = await resolveProductionIdForShootDay(args.db, args.sourceShootDayId)
  const targetProductionId = await resolveProductionIdForShootDay(args.db, args.targetShootDayId)
  if (sourceProductionId !== targetProductionId) throw new Error('Shoot days must belong to the same production')
  await requireProjectEditAccess(args.db, args.actor, sourceProductionId)
  return swapShootDays(args.sourceShootDayId, args.targetShootDayId)
}

export async function updateShootDayForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shootDayId: string
  data: Parameters<typeof updateShootDay>[1]
}) {
  const productionId = await resolveProductionIdForShootDay(args.db, args.shootDayId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return updateShootDay(args.shootDayId, args.data)
}

export async function ensureCallWrapStripsForProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return ensureCallWrapStripsForProduction(args.productionId)
}

export async function getShootDayByIdForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shootDayId: string
}) {
  const productionId = await resolveProductionIdForShootDay(args.db, args.shootDayId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return getShootDayById(args.shootDayId)
}

export async function createShootDayWithDefaultMainUnitForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  data: Parameters<typeof createShootDayWithDefaultMainUnit>[0]
}) {
  await requireProjectEditAccess(args.db, args.actor, args.data.productionId)
  return createShootDayWithDefaultMainUnit(args.data)
}

export async function ensureMainUnitForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return ensureMainUnit(args.productionId)
}

export async function getOrCreateShootDayUnitForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shootDayId: string
  unitId: string
}) {
  const productionId = await resolveProductionIdForShootDay(args.db, args.shootDayId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return getOrCreateShootDayUnit(args.shootDayId, args.unitId)
}

export async function setShootDayUnitLockedForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shootDayUnitId: string
  isLocked: boolean
}) {
  const productionId = await resolveProductionIdForShootDayUnit(args.db, args.shootDayUnitId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return setShootDayUnitLocked(args.shootDayUnitId, args.isLocked)
}

export async function listShootDayUnitsByShootDayForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shootDayId: string
}) {
  const productionId = await resolveProductionIdForShootDay(args.db, args.shootDayId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return listShootDayUnitsByShootDay(args.shootDayId)
}

export async function listStripsByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listStripsByProduction(args.productionId)
}

export async function listStripsByShootDayForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  shootDayId: string
}) {
  const productionId = await resolveProductionIdForShootDay(args.db, args.shootDayId)
  await requireProjectViewAccess(args.db, args.actor, productionId)
  return listStripsByShootDay(args.shootDayId)
}

export async function listUnscheduledShotsForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  filters?: UnscheduledShotsFilters
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listUnscheduledShots(args.productionId, args.filters)
}

export async function bulkAssignShotsToDayForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  shotIds: string[]
  shootDayId: string
  shootDayUnitId: string
}) {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return bulkAssignShotsToDay(args.productionId, args.shotIds, args.shootDayId, args.shootDayUnitId)
}

export async function createStripForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  data: CreateStripData
}) {
  await requireProjectEditAccess(args.db, args.actor, args.data.production_id)
  return createStrip(args.data)
}

export async function createShotStripForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  shotId: string
  shootDayId: string
  shootDayUnitId: string
  toSortIndex?: number
}) {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return createShotStrip(args.productionId, args.shotId, args.shootDayId, args.shootDayUnitId, args.toSortIndex)
}

export async function moveStripForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  stripId: string
  toShootDayId: string
  toShootDayUnitId: string
  toSortIndex: number
}) {
  const productionId = await resolveProductionIdForStrip(args.db, args.stripId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return moveStrip(args.stripId, args.toShootDayId, args.toShootDayUnitId, args.toSortIndex)
}

export async function moveStripToUnscheduledForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  stripId: string
}) {
  const productionId = await resolveProductionIdForStrip(args.db, args.stripId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return moveStripToUnscheduled(args.stripId)
}

export async function moveStripToBoneyardForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  stripId: string
}) {
  const productionId = await resolveProductionIdForStrip(args.db, args.stripId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return moveStripToBoneyard(args.stripId)
}

export async function listBoneyardStripsForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listBoneyardStrips(args.productionId)
}

export async function deleteStripForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  stripId: string
}) {
  const productionId = await resolveProductionIdForStrip(args.db, args.stripId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return deleteStrip(args.stripId)
}

export async function reorderStripForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  stripId: string
  toSortIndex: number
}) {
  const productionId = await resolveProductionIdForStrip(args.db, args.stripId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return reorderStrip(args.stripId, args.toSortIndex)
}

export async function updateStripEstimatedMinutesForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  stripId: string
  estimatedMinutes: number | null
}) {
  const productionId = await resolveProductionIdForStrip(args.db, args.stripId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return updateStripEstimatedMinutes(args.stripId, args.estimatedMinutes)
}

export async function updateCallWrapStripTimeForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  stripId: string
  time: string
}) {
  const productionId = await resolveProductionIdForStrip(args.db, args.stripId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return updateCallWrapStripTime(args.stripId, args.time)
}

export async function getEstimatedShootMinutesByShotIdsForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  shotIds: string[]
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return getEstimatedShootMinutesByShotIds(args.shotIds)
}

export async function listShootingBlocsByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listShootingBlocsByProduction(args.productionId)
}

export async function listKeyContactsByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listKeyContactsByProduction(args.productionId)
}

export async function getProductionByIdForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return getProductionById(args.productionId)
}

export async function listStoryboardImagesByProductionForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectViewAccess(args.db, args.actor, args.productionId)
  return listStoryboardImagesByProduction(args.productionId)
}

export async function createStoryboardImageForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  data: Parameters<typeof createStoryboardImage>[0]
}) {
  await requireProjectEditAccess(args.db, args.actor, args.data.production_id)
  return createStoryboardImage(args.data)
}

export async function updateStoryboardImageForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  imageId: string
  data: Parameters<typeof updateStoryboardImage>[1]
}) {
  const productionId = await resolveProductionIdForStoryboardImage(args.db, args.imageId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return updateStoryboardImage(args.imageId, args.data)
}

export async function deleteStoryboardImageForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  imageId: string
}) {
  const productionId = await resolveProductionIdForStoryboardImage(args.db, args.imageId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return deleteStoryboardImage(args.imageId)
}

export async function updateStoryboardImportForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  importId: string
  data: Parameters<typeof updateStoryboardImport>[1]
}) {
  const productionId = await resolveProductionIdForStoryboardImport(args.db, args.importId)
  await requireProjectEditAccess(args.db, args.actor, productionId)
  return updateStoryboardImport(args.importId, args.data)
}

export async function applyAthenaImportToStoryboardForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  data: Parameters<typeof applyAthenaImportToStoryboard>[0]
}) {
  await requireProjectEditAccess(args.db, args.actor, args.data.production_id)
  return applyAthenaImportToStoryboard(args.data)
}
