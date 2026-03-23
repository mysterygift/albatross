import { getDrivingTravelTimeMinutes, geocodeLocationWithOpenRouteService } from '@/lib/logistics/openRouteService'

export type DayTravelLocation = {
  id: string
  name: string
  address?: string | null
  lat: number | null
  lng: number | null
}

export type DayTravelSegment = {
  fromLocationId: string
  toLocationId: string
  fromName: string
  toName: string
  travelMinutes: number | null
}

function hasCoordinates(location: DayTravelLocation): location is DayTravelLocation & { lat: number; lng: number } {
  return (
    typeof location.lat === 'number' &&
    Number.isFinite(location.lat) &&
    typeof location.lng === 'number' &&
    Number.isFinite(location.lng)
  )
}

/**
 * Builds ordered travel segments for a day/unit location stack.
 * Segments with missing/unavailable travel data return `travelMinutes: null`.
 */
export async function getTravelSegmentsForDayUnit(
  locations: DayTravelLocation[],
  options?: { orsApiKey?: string | null }
): Promise<DayTravelSegment[]> {
  if (locations.length < 2) return []

  const segments: DayTravelSegment[] = []
  const coordinateCache = new Map<string, { lat: number; lng: number } | null>()

  const resolveLocationCoordinates = async (
    location: DayTravelLocation
  ): Promise<{ lat: number; lng: number } | null> => {
    if (hasCoordinates(location)) {
      return { lat: location.lat, lng: location.lng }
    }
    const cached = coordinateCache.get(location.id)
    if (cached !== undefined) return cached

    const geocodeQuery = (location.address?.trim() || location.name.trim())
    if (!geocodeQuery) {
      coordinateCache.set(location.id, null)
      return null
    }
    const resolved = await geocodeLocationWithOpenRouteService(geocodeQuery, options?.orsApiKey)
    coordinateCache.set(location.id, resolved)
    return resolved
  }

  for (let i = 0; i < locations.length - 1; i += 1) {
    const from = locations[i]!
    const to = locations[i + 1]!
    let travelMinutes: number | null = null

    const fromCoords = await resolveLocationCoordinates(from)
    const toCoords = await resolveLocationCoordinates(to)
    if (fromCoords && toCoords) {
      travelMinutes = await getDrivingTravelTimeMinutes(
        fromCoords,
        toCoords,
        options?.orsApiKey
      )
    }

    segments.push({
      fromLocationId: from.id,
      toLocationId: to.id,
      fromName: from.name,
      toName: to.name,
      travelMinutes,
    })
  }

  return segments
}
