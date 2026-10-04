import { listLocationsByProduction } from '@/lib/db/repositories/location'
import {
  getShootDayById,
  listScenesByProduction,
  listShotsByProduction,
} from '@/lib/db/repositories/schedule'
import { listStripsByShootDay } from '@/lib/db/repositories/stripboard-strips'
import type { Location, Scene, Shot, StripboardStrip } from '@/lib/db/types'

/** First location used by the day's scheduled strips (stripboard order), or null. */
export function firstLocationForStrips(
  strips: Pick<StripboardStrip, 'scene_id' | 'shot_id'>[],
  scenes: Pick<Scene, 'id' | 'location_id'>[],
  shots: Pick<Shot, 'id' | 'scene_id'>[],
  locations: Pick<Location, 'id' | 'name'>[]
): { id: string; name: string } | null {
  const sceneById = new Map(scenes.map((s) => [s.id, s]))
  const shotById = new Map(shots.map((s) => [s.id, s]))
  const locById = new Map(locations.map((l) => [l.id, l]))
  for (const strip of strips) {
    const sceneId = strip.scene_id ?? (strip.shot_id ? (shotById.get(strip.shot_id)?.scene_id ?? null) : null)
    const locationId = sceneId ? (sceneById.get(sceneId)?.location_id ?? null) : null
    const loc = locationId ? locById.get(locationId) : undefined
    if (loc) return { id: loc.id, name: loc.name }
  }
  return null
}

export type RamsDayDefaults = {
  location_id: string | null
  location_name: string
  hospital_name: string
  hospital_address: string
  police_name: string
  police_address: string
}

/** Prefill for a new RAMS: the day's main location and its existing hospital / police fields. */
export async function getRamsDayDefaults(productionId: string, shootDayId: string): Promise<RamsDayDefaults> {
  const [day, strips, scenes, shots, locations] = await Promise.all([
    getShootDayById(shootDayId),
    listStripsByShootDay(shootDayId),
    listScenesByProduction(productionId),
    listShotsByProduction(productionId),
    listLocationsByProduction(productionId),
  ])
  const location = firstLocationForStrips(strips, scenes, shots, locations)
  return {
    location_id: location?.id ?? null,
    location_name: location?.name ?? '',
    hospital_name: day?.hospital_name ?? '',
    hospital_address: day?.hospital_address ?? '',
    police_name: day?.police_station_name ?? '',
    police_address: day?.police_station_address ?? '',
  }
}
