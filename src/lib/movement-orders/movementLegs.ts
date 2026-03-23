import type { MovementOrderLocation, MovementOrderMovementLeg } from '@/lib/movement-orders/types'

export function buildMovementOrderLegSkeleton(
  orderedLocations: MovementOrderLocation[]
): MovementOrderMovementLeg[] {
  if (orderedLocations.length < 2) return []

  const legs: MovementOrderMovementLeg[] = []
  for (let i = 0; i < orderedLocations.length - 1; i += 1) {
    const from = orderedLocations[i]!
    const to = orderedLocations[i + 1]!
    legs.push({
      fromLocationName: from.name,
      toLocationName: to.name,
      drivingTimeMinutes: null,
      drivingDistanceText: null,
      walkingTimeMinutes: null,
      walkingDistanceText: null,
      writtenDirections: null,
    })
  }
  return legs
}
