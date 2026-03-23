import {
  geocodeLocationWithOpenRouteService,
  getDrivingRouteSummary,
  getWalkingRouteSummary,
  type LatLng,
} from '@/lib/logistics/openRouteService'
import type {
  MovementOrderLocation,
  MovementOrderMovementLeg,
} from '@/lib/movement-orders/types'

type EnrichLegsInput = {
  locations: MovementOrderLocation[]
  orsApiKey?: string | null
  /** When true, bypass cache for ORS reads; on API failure, fall back to cached values where present. */
  forceRefresh?: boolean
}

function hasCoordinates(location: MovementOrderLocation): location is MovementOrderLocation & LatLng {
  return (
    typeof location.lat === 'number' &&
    Number.isFinite(location.lat) &&
    typeof location.lng === 'number' &&
    Number.isFinite(location.lng)
  )
}

export async function enrichMovementLegsWithRouteData(
  input: EnrichLegsInput
): Promise<MovementOrderMovementLeg[]> {
  const locations = input.locations
  if (locations.length < 2) return []

  const cacheOpts = { forceRefresh: input.forceRefresh === true }

  const coordinateCache = new Map<string, LatLng | null>()

  const resolveLocationCoordinates = async (
    location: MovementOrderLocation
  ): Promise<LatLng | null> => {
    if (hasCoordinates(location)) {
      return { lat: location.lat, lng: location.lng }
    }
    const cached = coordinateCache.get(location.id)
    if (cached !== undefined) return cached

    const fromAddress = location.address?.trim() ?? ''
    if (fromAddress) {
      const geocoded = await geocodeLocationWithOpenRouteService(
        fromAddress,
        input.orsApiKey,
        cacheOpts
      )
      if (geocoded) {
        coordinateCache.set(location.id, geocoded)
        return geocoded
      }
    }

    const fromName = location.name.trim()
    if (fromName) {
      const geocoded = await geocodeLocationWithOpenRouteService(
        fromName,
        input.orsApiKey,
        cacheOpts
      )
      coordinateCache.set(location.id, geocoded)
      return geocoded
    }

    coordinateCache.set(location.id, null)
    return null
  }

  const legs: MovementOrderMovementLeg[] = []
  for (let i = 0; i < locations.length - 1; i += 1) {
    const from = locations[i]!
    const to = locations[i + 1]!
    const fromCoords = await resolveLocationCoordinates(from)
    const toCoords = await resolveLocationCoordinates(to)

    let drivingTimeMinutes: number | null = null
    let drivingDistanceText: string | null = null
    let walkingTimeMinutes: number | null = null
    let walkingDistanceText: string | null = null
    let writtenDirections: string | null = null

    if (fromCoords && toCoords) {
      const drivingSummary = await getDrivingRouteSummary(
        fromCoords,
        toCoords,
        input.orsApiKey,
        cacheOpts
      )
      drivingTimeMinutes = drivingSummary?.durationMinutes ?? null
      drivingDistanceText = drivingSummary?.distanceText ?? null
      writtenDirections = drivingSummary?.writtenDirections ?? null

      const walkingSummary = await getWalkingRouteSummary(
        fromCoords,
        toCoords,
        input.orsApiKey,
        cacheOpts
      )
      walkingTimeMinutes = walkingSummary?.durationMinutes ?? null
      walkingDistanceText = walkingSummary?.distanceText ?? null
    }

    legs.push({
      fromLocationName: from.name,
      toLocationName: to.name,
      drivingTimeMinutes,
      drivingDistanceText,
      walkingTimeMinutes,
      walkingDistanceText,
      writtenDirections,
    })
  }

  return legs
}
