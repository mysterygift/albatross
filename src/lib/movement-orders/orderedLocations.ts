import type { Location, Scene, Shot, StripboardStrip } from '@/lib/db/types'
import { getOrderedLocationStackForDayUnit } from '@/lib/schedule/orderedLocationStack'
import type { MovementOrderLocation } from '@/lib/movement-orders/types'

function cleanSceneField(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.toUpperCase() === 'UNK') return null
  return trimmed.toUpperCase()
}

export function getOrderedMovementOrderLocationsForDayUnit(args: {
  strips: StripboardStrip[]
  scenes: Scene[]
  shots: Shot[]
  locations: Location[]
}): MovementOrderLocation[] {
  const { orderedLocations } = getOrderedLocationStackForDayUnit(args)
  const scenesById = new Map(args.scenes.map((scene) => [scene.id, scene]))
  return orderedLocations.map((entry) => ({
    id: entry.locationId,
    name: entry.name,
    address: entry.address,
    what3words: entry.what3words,
    parkingInfo: entry.parkingInfo,
    lat: entry.lat,
    lng: entry.lng,
    scenes: entry.sceneIds.flatMap((sceneId) => {
      const scene = scenesById.get(sceneId)
      if (!scene) return []
      return [
        {
          sceneNumber: scene.scene_number,
          intExt: cleanSceneField(scene.int_ext),
          dayNight: cleanSceneField(scene.day_night),
        },
      ]
    }),
  }))
}
