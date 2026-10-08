import { renderStaticMap } from '@/lib/maps/staticMapRenderer'
import {
  MAP_TILE_ATTRIBUTION,
  isMapTileConfigIncomplete,
  type MapTileConfig,
} from '@/lib/maps/tileConfig'
import {
  LOCATION_MAP_SIZE,
  OVERVIEW_MAP_SIZE,
  buildLocationScene,
  buildOverviewScene,
} from '@/lib/movement-orders/movementMaps'
import type {
  MovementOrderData,
  MovementOrderMapImage,
  MovementOrderMaps,
} from '@/lib/movement-orders/types'

export interface RenderedMovementOrderMaps {
  maps: MovementOrderMaps | null
  /** Why maps are missing or partial; null when everything drew. */
  warning: string | null
}

/**
 * Draw the route overview and one close-up per location. Never throws: if the overview cannot
 * be drawn (no key, offline, bad tile URL) the order is produced without maps and `warning`
 * says why; a single failed close-up only leaves that location's map out.
 */
export async function renderMovementOrderMaps(
  data: MovementOrderData,
  tileConfig: MapTileConfig
): Promise<RenderedMovementOrderMaps> {
  if (isMapTileConfigIncomplete(tileConfig)) {
    return { maps: null, warning: 'Maps were left out: add a map tile API key under Settings → APIs & publishing.' }
  }
  const overviewScene = buildOverviewScene(data)
  const locationScenes = data.locations.map((_, i) => buildLocationScene(data, i))
  if (!overviewScene && locationScenes.every((scene) => scene === null)) {
    return {
      maps: null,
      warning: 'Maps were left out: no route or location coordinates are available yet.',
    }
  }

  const draw = async (
    scene: NonNullable<typeof overviewScene>,
    size: { width: number; height: number }
  ): Promise<MovementOrderMapImage> => ({
    png: await renderStaticMap({ scene, ...size, tileConfig, attribution: MAP_TILE_ATTRIBUTION }),
    ...size,
  })

  let overview: MovementOrderMapImage | null = null
  if (overviewScene) {
    try {
      overview = await draw(overviewScene, OVERVIEW_MAP_SIZE)
    } catch (error) {
      return {
        maps: null,
        warning: `Maps were left out: ${(error as Error)?.message ?? 'the map could not be drawn.'}`,
      }
    }
  }

  let failedCloseUps = 0
  const locations: Array<MovementOrderMapImage | null> = []
  for (const scene of locationScenes) {
    if (!scene) {
      locations.push(null)
      continue
    }
    try {
      locations.push(await draw(scene, LOCATION_MAP_SIZE))
    } catch {
      failedCloseUps += 1
      locations.push(null)
    }
  }
  return {
    maps: { overview, locations, attribution: MAP_TILE_ATTRIBUTION },
    warning:
      failedCloseUps > 0
        ? `${failedCloseUps} location map${failedCloseUps === 1 ? '' : 's'} could not be drawn and ${failedCloseUps === 1 ? 'was' : 'were'} left out.`
        : null,
  }
}
