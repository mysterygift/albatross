/**
 * Resolves parsed script location names to production location rows during import.
 * Matches case-insensitively against existing locations; creates missing ones as unbooked.
 */
import { createLocation, listLocationsByProduction } from './repositories/location'
import type { Location } from './types'

/** Normalizes a location name for case-insensitive lookup. */
export function normalizeLocationKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * Resolves a batch of parsed location names to location IDs for a production.
 * Returns a map from normalized key → location id. Dedupes within the batch so
 * repeated sluglines share one row.
 */
export async function resolveImportLocations(
  productionId: string,
  locationNames: string[],
  existingLocations?: Location[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const existing = existingLocations ?? (await listLocationsByProduction(productionId))
  const byKey = new Map<string, Location>()
  for (const loc of existing) {
    byKey.set(normalizeLocationKey(loc.name), loc)
  }

  const displayNameByKey = new Map<string, string>()
  for (const raw of locationNames) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const key = normalizeLocationKey(trimmed)
    if (result.has(key)) continue

    const match = byKey.get(key)
    if (match) {
      result.set(key, match.id)
      continue
    }

    if (!displayNameByKey.has(key)) {
      displayNameByKey.set(key, trimmed)
    }
  }

  for (const [key, displayName] of displayNameByKey) {
    if (result.has(key)) continue
    const created = await createLocation({
      production_id: productionId,
      name: displayName,
      booked_status: 'unbooked',
    })
    byKey.set(key, created)
    result.set(key, created.id)
  }

  return result
}

/** Looks up a resolved location id for a parsed location name, or null when absent. */
export function locationIdForParsedName(
  locationMap: Map<string, string>,
  parsedLocation: string | null | undefined
): string | null {
  if (!parsedLocation?.trim()) return null
  return locationMap.get(normalizeLocationKey(parsedLocation)) ?? null
}
