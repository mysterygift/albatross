export type LatLngLike = { lat: number; lng: number }

/**
 * Decode a Google-style encoded polyline (OpenRouteService returns precision 5, without
 * elevation). Returns an empty array for malformed input rather than throwing.
 */
export function decodePolyline(encoded: string | null | undefined, precision = 5): LatLngLike[] {
  if (!encoded) return []
  const factor = 10 ** precision
  const points: LatLngLike[] = []
  let index = 0
  let lat = 0
  let lng = 0

  const readValue = (): number | null => {
    let result = 0
    let shift = 0
    let byte: number
    do {
      if (index >= encoded.length) return null
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }

  while (index < encoded.length) {
    const dLat = readValue()
    const dLng = readValue()
    if (dLat === null || dLng === null) break
    lat += dLat
    lng += dLng
    points.push({ lat: lat / factor, lng: lng / factor })
  }
  return points
}
