/**
 * Unified person recent activity feed (bookings, availability, scene participation).
 * No new DB table; builds a combined list from existing repositories.
 */

import type { Booking, CastAvailability, CrewAvailability, SceneCast } from '../types'
import { listBookingsByPerson } from './booking'
import { listAvailabilityByPerson } from './cast-availability'
import { listCrewAvailabilityByPerson } from './crew-availability'
import { listSceneCastByPerson } from './scene-cast'

/** Internal shape for the Recent activity UI only. */
export type PersonActivityItem = {
  id: string
  entity_type: 'booking' | 'availability' | 'scene_cast'
  entity_id: string
  activity_at: string
  title: string
  subtitle: string | null
}

const DEFAULT_LIMIT = 8

/** Query key for person recent activity: ['person-recent-activity', productionId, personId] */
export function personRecentActivityQueryKey(
  productionId: string,
  personId: string
): readonly [string, string, string] {
  return ['person-recent-activity', productionId, personId]
}

function bookingToActivity(b: Booking): PersonActivityItem {
  const subtitle = [b.start_date, b.role].filter(Boolean).join(' · ') || (b.notes?.trim().slice(0, 50) ?? null)
  return {
    id: `booking:${b.id}`,
    entity_type: 'booking',
    entity_id: b.id,
    activity_at: b.updated_at,
    title: 'Booking',
    subtitle,
  }
}

function availabilityToActivity(
  a: Pick<CastAvailability | CrewAvailability, 'id' | 'start_date' | 'end_date' | 'availability' | 'notes' | 'updated_at'>
): PersonActivityItem {
  const range = `${a.start_date} – ${a.end_date}`
  return {
    id: `availability:${a.id}`,
    entity_type: 'availability',
    entity_id: a.id,
    activity_at: a.updated_at,
    title: `${a.availability} · ${range}`,
    subtitle: a.notes?.trim().slice(0, 50) ?? null,
  }
}

function sceneCastToActivity(sc: SceneCast): PersonActivityItem {
  return {
    id: `scene_cast:${sc.id}`,
    entity_type: 'scene_cast',
    entity_id: sc.id,
    activity_at: sc.created_at,
    title: 'Scene participation',
    subtitle: `Scene ${sc.scene_id.slice(0, 8)}…`,
  }
}

/**
 * Build the person's recent activity feed from bookings, availability, and scene_cast.
 * Sorted by activity_at desc; limited to limit.
 */
export async function listRecentPersonActivity(
  _productionId: string,
  personId: string,
  limit: number = DEFAULT_LIMIT
): Promise<PersonActivityItem[]> {
  const [bookings, castAvailability, crewAvailability, sceneCasts] = await Promise.all([
    listBookingsByPerson(personId),
    listAvailabilityByPerson(personId),
    listCrewAvailabilityByPerson(personId),
    listSceneCastByPerson(personId),
  ])

  const items: PersonActivityItem[] = []
  for (const b of bookings) {
    items.push(bookingToActivity(b))
  }
  for (const a of castAvailability) {
    items.push(availabilityToActivity(a))
  }
  for (const a of crewAvailability) {
    items.push(availabilityToActivity(a))
  }
  for (const sc of sceneCasts) {
    items.push(sceneCastToActivity(sc))
  }

  items.sort((a, b) => new Date(b.activity_at).getTime() - new Date(a.activity_at).getTime())
  return items.slice(0, limit)
}
