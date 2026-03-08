/**
 * Booking intelligence: read-only derived state from scheduled scenes/shots, scene_cast,
 * shot_cast, and bookings. Used to show who is needed vs booked, missing bookings, and
 * unnecessary bookings. DooD is unchanged and separate; this layer is advisory only.
 *
 * Rules (deterministic, documented):
 * A) Needed on day: person is attached via scene_cast to at least one scheduled scene for that day,
 *    OR (when shot-level scheduling is available) attached via shot_cast to at least one scheduled
 *    shot for that day. We prefer shot_cast as the more specific source when scheduled shots exist
 *    for the day; otherwise we use scene_cast (scene-level source of truth).
 * B) Booked on day: a booking record exists for that person and shoot day.
 * C) Needed but not booked: needed === true, booked === false.
 * D) Booked but not needed: booked === true, needed === false.
 * E) Properly booked: needed === true, booked === true.
 */

import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import {
  getScheduledSceneIdsByShootDay,
  getScheduledShotIdsByShootDay,
} from '@/lib/db/repositories/stripboard-strips'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import { getCastIdsByShotIds } from '@/lib/db/repositories/shot-cast'
import { listBookingsByProduction } from '@/lib/db/repositories/booking'
import type { Booking, ShootDay } from '@/lib/db/types'

export type ShootDayCoverage = {
  shootDayId: string
  shootDate: string
  neededPersonIds: Set<string>
  bookedPersonIds: Set<string>
  neededButNotBooked: Set<string>
  bookedButNotNeeded: Set<string>
  properlyBooked: Set<string>
  missingCount: number
  unnecessaryCount: number
}

export type BookingIntelligenceSummary = {
  byShootDay: Map<string, ShootDayCoverage>
  shootDays: ShootDay[]
  totalMissingThisProduction: number
  totalUnnecessaryThisProduction: number
}

export type PersonBookingNeedSummary = {
  personId: string
  daysNeeded: number
  daysBooked: number
  daysMissingBooking: number
  daysBookedButNotNeeded: number
  neededShootDayIds: string[]
  bookedShootDayIds: string[]
  missingShootDayIds: string[]
  unnecessaryShootDayIds: string[]
}

/**
 * Get the set of person IDs needed on a shoot day.
 * Precedence: when scheduled shot IDs exist for this day, use shot_cast for those shots;
 * otherwise use scene_cast for scheduled scenes. Do not replace scene_cast with shot_cast
 * globally—only use shot_cast as refinement when we have shot-level schedule data.
 */
function getNeededPersonIdsForDay(
  shootDayId: string,
  scheduledSceneIds: string[],
  scheduledShotIds: string[],
  castBySceneId: Map<string, string[]>,
  castByShotId: Map<string, string[]>
): Set<string> {
  const out = new Set<string>()
  if (scheduledShotIds.length > 0) {
    for (const shotId of scheduledShotIds) {
      for (const pid of castByShotId.get(shotId) ?? []) out.add(pid)
    }
  } else {
    for (const sceneId of scheduledSceneIds) {
      for (const pid of castBySceneId.get(sceneId) ?? []) out.add(pid)
    }
  }
  return out
}

/**
 * Get the set of person IDs booked on a shoot day (from booking records).
 */
function getBookedPersonIdsForDay(bookings: Booking[], shootDayId: string): Set<string> {
  const out = new Set<string>()
  for (const b of bookings) {
    if (b.shoot_day_id === shootDayId) out.add(b.person_id)
  }
  return out
}

/**
 * Compute per-shoot-day booking coverage. Read-only; no DB writes.
 * Uses shot_cast when scheduled shots exist for the day; otherwise scene_cast.
 */
export async function getBookingCoverageByShootDay(
  productionId: string
): Promise<BookingIntelligenceSummary> {
  const [shootDays, scheduledSceneIdsByDay, scheduledShotIdsByDay, bookings] = await Promise.all([
    listShootDaysByProduction(productionId),
    getScheduledSceneIdsByShootDay(productionId),
    getScheduledShotIdsByShootDay(productionId),
    listBookingsByProduction(productionId),
  ])

  const allSceneIds = new Set<string>()
  const allShotIds = new Set<string>()
  for (const day of shootDays) {
    for (const id of scheduledSceneIdsByDay.get(day.id) ?? []) allSceneIds.add(id)
    for (const id of scheduledShotIdsByDay.get(day.id) ?? []) allShotIds.add(id)
  }

  const [castBySceneId, castByShotId] = await Promise.all([
    getCastIdsBySceneIds(Array.from(allSceneIds)),
    getCastIdsByShotIds(Array.from(allShotIds)),
  ])

  const byShootDay = new Map<string, ShootDayCoverage>()
  let totalMissing = 0
  let totalUnnecessary = 0

  for (const day of shootDays) {
    const sceneIds = scheduledSceneIdsByDay.get(day.id) ?? []
    const shotIds = scheduledShotIdsByDay.get(day.id) ?? []
    const needed = getNeededPersonIdsForDay(
      day.id,
      sceneIds,
      shotIds,
      castBySceneId,
      castByShotId
    )
    const booked = getBookedPersonIdsForDay(bookings, day.id)
    const neededButNotBooked = new Set<string>()
    const bookedButNotNeeded = new Set<string>()
    const properlyBooked = new Set<string>()
    for (const pid of needed) {
      if (booked.has(pid)) properlyBooked.add(pid)
      else neededButNotBooked.add(pid)
    }
    for (const pid of booked) {
      if (!needed.has(pid)) bookedButNotNeeded.add(pid)
    }
    totalMissing += neededButNotBooked.size
    totalUnnecessary += bookedButNotNeeded.size
    byShootDay.set(day.id, {
      shootDayId: day.id,
      shootDate: day.shoot_date,
      neededPersonIds: needed,
      bookedPersonIds: booked,
      neededButNotBooked,
      bookedButNotNeeded,
      properlyBooked,
      missingCount: neededButNotBooked.size,
      unnecessaryCount: bookedButNotNeeded.size,
    })
  }

  return {
    byShootDay,
    shootDays,
    totalMissingThisProduction: totalMissing,
    totalUnnecessaryThisProduction: totalUnnecessary,
  }
}

/**
 * Get person IDs needed on a given shoot day (convenience; uses same rules as getBookingCoverageByShootDay).
 */
export async function getNeededPersonIdsByShootDay(
  productionId: string,
  shootDayId: string
): Promise<Set<string>> {
  const summary = await getBookingCoverageByShootDay(productionId)
  const day = summary.byShootDay.get(shootDayId)
  return day?.neededPersonIds ?? new Set()
}

/**
 * Get person IDs booked on a shoot day (from bookings).
 */
export function getBookedPersonIdsByShootDay(
  bookings: Booking[],
  shootDayId: string
): Set<string> {
  return getBookedPersonIdsForDay(bookings, shootDayId)
}

/**
 * Person-level booking need summary: days needed, days booked, missing, unnecessary.
 * Read-only; for use on Person detail and optionally in Bookings list.
 */
export async function getPersonBookingNeedSummary(
  productionId: string,
  personId: string
): Promise<PersonBookingNeedSummary> {
  const summary = await getBookingCoverageByShootDay(productionId)
  const neededShootDayIds: string[] = []
  const bookedShootDayIds: string[] = []
  const missingShootDayIds: string[] = []
  const unnecessaryShootDayIds: string[] = []

  for (const day of summary.shootDays) {
    const cov = summary.byShootDay.get(day.id)
    if (!cov) continue
    const needed = cov.neededPersonIds.has(personId)
    const booked = cov.bookedPersonIds.has(personId)
    if (needed) neededShootDayIds.push(day.id)
    if (booked) bookedShootDayIds.push(day.id)
    if (needed && !booked) missingShootDayIds.push(day.id)
    if (booked && !needed) unnecessaryShootDayIds.push(day.id)
  }

  return {
    personId,
    daysNeeded: neededShootDayIds.length,
    daysBooked: bookedShootDayIds.length,
    daysMissingBooking: missingShootDayIds.length,
    daysBookedButNotNeeded: unnecessaryShootDayIds.length,
    neededShootDayIds,
    bookedShootDayIds,
    missingShootDayIds,
    unnecessaryShootDayIds,
  }
}
