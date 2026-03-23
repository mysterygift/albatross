const MS_PER_DAY = 24 * 60 * 60 * 1000

const DIRECTIONS_TTL_MS = 2 * MS_PER_DAY
const GEOCODE_TTL_MS = 30 * MS_PER_DAY

export function isCacheExpired(params: { endpoint: string; updatedAt: number }): boolean {
  const now = Date.now()
  const age = now - params.updatedAt
  if (params.endpoint === 'directions') {
    return age > DIRECTIONS_TTL_MS
  }
  if (params.endpoint === 'geocode') {
    return age > GEOCODE_TTL_MS
  }
  return false
}
