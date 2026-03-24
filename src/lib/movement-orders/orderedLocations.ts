import type { Location, Scene, Shot, StripboardStrip } from '@/lib/db/types'
import type { MovementOrderLocation } from '@/lib/movement-orders/types'

function toNullableCoordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function getOrderedMovementOrderLocationsForDayUnit(args: {
  strips: StripboardStrip[]
  scenes: Scene[]
  shots: Shot[]
  locations: Location[]
}): MovementOrderLocation[] {
  const shotsById = new Map(args.shots.map((shot) => [shot.id, shot]))
  const scenesById = new Map(args.scenes.map((scene) => [scene.id, scene]))
  const locationsById = new Map(args.locations.map((location) => [location.id, location]))

  const ordered = [...args.strips].sort((a, b) => a.sort_index - b.sort_index)
  const seenLocationIds = new Set<string>()
  const orderedLocations: MovementOrderLocation[] = []

  for (const strip of ordered) {
    if (strip.strip_type !== 'SHOT' && strip.strip_type !== 'SCENE') continue

    let sceneId: string | null = strip.scene_id
    if (!sceneId && strip.shot_id) {
      sceneId = shotsById.get(strip.shot_id)?.scene_id ?? null
    }
    if (!sceneId) continue

    const locationId = scenesById.get(sceneId)?.location_id ?? null
    if (!locationId || seenLocationIds.has(locationId)) continue

    const location = locationsById.get(locationId)
    if (!location) continue

    seenLocationIds.add(locationId)
    orderedLocations.push({
      id: location.id,
      name: location.name,
      address: location.address ?? null,
      what3words: location.what3words ?? null,
      parkingInfo: location.parking_info ?? null,
      lat: toNullableCoordinate((location as Record<string, unknown>).lat),
      lng: toNullableCoordinate((location as Record<string, unknown>).lng),
    })
  }

  return orderedLocations
}
