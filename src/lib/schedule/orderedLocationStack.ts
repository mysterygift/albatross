import type { Location, Scene, Shot, StripboardStrip } from '@/lib/db/types'

export type OrderedLocationStackEntry = {
  locationId: string
  name: string
  address: string | null
  what3words: string | null
  parkingInfo: string | null
  lat: number | null
  lng: number | null
}

export type OrderedLocationStackResult = {
  orderedLocations: OrderedLocationStackEntry[]
  missingLocationSceneCount: number
}

function toNullableCoordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function locationToStackEntry(location: Location): OrderedLocationStackEntry {
  return {
    locationId: location.id,
    name: location.name,
    address: location.address ?? null,
    what3words: location.what3words ?? null,
    parkingInfo: location.parking_info ?? null,
    lat: toNullableCoordinate((location as Record<string, unknown>).lat),
    lng: toNullableCoordinate((location as Record<string, unknown>).lng),
  }
}

/**
 * Build ordered, deduplicated location stack for a day/unit from stripboard order.
 * SHOT/SCENE contribute scene locations; MOVE strips contribute origin then destination.
 */
export function getOrderedLocationStackForDayUnit(args: {
  strips: Pick<
    StripboardStrip,
    | 'sort_index'
    | 'strip_type'
    | 'scene_id'
    | 'shot_id'
    | 'origin_location_id'
    | 'destination_location_id'
  >[]
  scenes: Scene[]
  shots: Shot[]
  locations: Location[]
}): OrderedLocationStackResult {
  const shotsById = new Map(args.shots.map((shot) => [shot.id, shot]))
  const scenesById = new Map(args.scenes.map((scene) => [scene.id, scene]))
  const locationsById = new Map(args.locations.map((location) => [location.id, location]))

  const ordered = [...args.strips].sort((a, b) => a.sort_index - b.sort_index)
  const orderedLocations: OrderedLocationStackEntry[] = []
  const missingLocationSceneIds = new Set<string>()

  const pushLocationIfNew = (locationId: string | null | undefined) => {
    if (!locationId) return
    const lastId = orderedLocations.at(-1)?.locationId
    if (lastId === locationId) return
    const location = locationsById.get(locationId)
    if (!location) return
    orderedLocations.push(locationToStackEntry(location))
  }

  for (const strip of ordered) {
    if (strip.strip_type === 'SHOT' || strip.strip_type === 'SCENE') {
      let sceneId: string | null = strip.scene_id
      if (!sceneId && strip.shot_id) {
        sceneId = shotsById.get(strip.shot_id)?.scene_id ?? null
      }
      if (!sceneId) continue

      const locationId = scenesById.get(sceneId)?.location_id ?? null
      if (!locationId) {
        missingLocationSceneIds.add(sceneId)
        continue
      }

      pushLocationIfNew(locationId)
      continue
    }

    if (strip.strip_type === 'MOVE') {
      pushLocationIfNew(strip.origin_location_id)
      pushLocationIfNew(strip.destination_location_id)
    }
  }

  return {
    orderedLocations,
    missingLocationSceneCount: missingLocationSceneIds.size,
  }
}
