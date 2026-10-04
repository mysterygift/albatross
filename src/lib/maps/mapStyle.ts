import { getSetting, setSetting } from '@/lib/db/repositories/settings'

/**
 * Map source: OpenFreeMap (https://openfreemap.org), free vector tiles with no API key, drawn
 * with MapLibre GL. The style URL is a setting so another MapLibre style (for example a
 * self-hosted OpenFreeMap) can be used. The same style feeds the interactive maps and the maps
 * drawn into the PDF.
 */
export const MAP_STYLE_URL_SETTING = 'map_style_url'

export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/** Attribution required by OpenFreeMap, OpenMapTiles and OpenStreetMap. */
export const MAP_ATTRIBUTION = 'OpenFreeMap (c) OpenMapTiles Data from OpenStreetMap'

export type MapStyleConfig = {
  styleUrl: string
}

export const DEFAULT_MAP_STYLE_CONFIG: MapStyleConfig = { styleUrl: DEFAULT_MAP_STYLE_URL }

export async function getMapStyleConfig(): Promise<MapStyleConfig> {
  const styleUrl = await getSetting(MAP_STYLE_URL_SETTING).catch(() => null)
  return { styleUrl: styleUrl?.trim() || DEFAULT_MAP_STYLE_URL }
}

export async function saveMapStyleConfig(config: MapStyleConfig): Promise<void> {
  await setSetting(MAP_STYLE_URL_SETTING, config.styleUrl.trim())
}
