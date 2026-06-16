import {
  locationIdForParsedName,
  normalizeLocationKey,
  resolveImportLocations,
} from '@/lib/db/scriptImportLocationService'
import type { Location } from '@/lib/db/types'
import type { SceneDayNight, SceneIntExt } from '@/lib/db/types'

export const DEFAULT_NEW_SCENE_INT_EXT: SceneIntExt = 'INT'
export const DEFAULT_NEW_SCENE_DAY_NIGHT: SceneDayNight = 'DAY'
export const DEFAULT_NEW_SCENE_LOCATION_NAME = 'Default City'

export function findDefaultSceneLocationId(locations: Location[]): string | null {
  const key = normalizeLocationKey(DEFAULT_NEW_SCENE_LOCATION_NAME)
  return locations.find((loc) => normalizeLocationKey(loc.name) === key)?.id ?? null
}

/** Ensures the default location row exists and returns its id. */
export async function resolveDefaultNewSceneLocationId(
  productionId: string,
  existingLocations?: Location[]
): Promise<string> {
  const map = await resolveImportLocations(
    productionId,
    [DEFAULT_NEW_SCENE_LOCATION_NAME],
    existingLocations
  )
  const id = locationIdForParsedName(map, DEFAULT_NEW_SCENE_LOCATION_NAME)
  if (!id) {
    throw new Error(`Could not resolve default location "${DEFAULT_NEW_SCENE_LOCATION_NAME}"`)
  }
  return id
}
