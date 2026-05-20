import type { Location, Scene, Shot, StripboardStrip } from '@/lib/db/types'
import { getOrderedLocationStackForDayUnit } from '@/lib/schedule/orderedLocationStack'
import type { MovementOrderLocation } from '@/lib/movement-orders/types'

export function getOrderedMovementOrderLocationsForDayUnit(args: {
  strips: StripboardStrip[]
  scenes: Scene[]
  shots: Shot[]
  locations: Location[]
}): MovementOrderLocation[] {
  const { orderedLocations } = getOrderedLocationStackForDayUnit(args)
  return orderedLocations.map((entry) => ({
    id: entry.locationId,
    name: entry.name,
    address: entry.address,
    what3words: entry.what3words,
    parkingInfo: entry.parkingInfo,
    lat: entry.lat,
    lng: entry.lng,
  }))
}
