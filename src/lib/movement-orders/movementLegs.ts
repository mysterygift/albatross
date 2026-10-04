import { getMovementLegKeys } from '@/lib/movement-orders/movementOrderInputs'
import type { MovementOrderLocation, MovementOrderMovementLeg } from '@/lib/movement-orders/types'

export const UNIT_BASE_WAYPOINT_ID = 'unit-base'

/**
 * Journey waypoints: the unit base (when it has an address) before the first location and after
 * the last, so the order shows when the unit leaves base and gets back to it.
 */
export function buildMovementOrderWaypoints(
  orderedLocations: MovementOrderLocation[],
  unitBaseAddress: string | null
): MovementOrderLocation[] {
  const address = unitBaseAddress?.trim()
  if (!address || orderedLocations.length === 0) return orderedLocations
  const base: MovementOrderLocation = {
    id: UNIT_BASE_WAYPOINT_ID,
    name: 'Unit base',
    address,
    what3words: null,
    parkingInfo: null,
    lat: null,
    lng: null,
    scenes: [],
  }
  return [base, ...orderedLocations, base]
}

export function buildMovementOrderLegSkeleton(
  orderedLocations: MovementOrderLocation[]
): MovementOrderMovementLeg[] {
  if (orderedLocations.length < 2) return []

  const keys = getMovementLegKeys(orderedLocations)
  const legs: MovementOrderMovementLeg[] = []
  for (let i = 0; i < orderedLocations.length - 1; i += 1) {
    const from = orderedLocations[i]!
    const to = orderedLocations[i + 1]!
    legs.push({
      key: keys[i]!,
      fromLocationName: from.name,
      toLocationName: to.name,
      drivingTimeMinutes: null,
      drivingDistanceText: null,
      drivingDistanceMeters: null,
      walkingTimeMinutes: null,
      walkingDistanceText: null,
      writtenDirections: null,
      departTime: null,
      arriveTime: null,
    })
  }
  return legs
}
