import { getSetting, setSetting } from '@/lib/db/repositories/settings'

/**
 * Map tile source. Tiles come from an OpenMapTiles-based raster endpoint (MapTiler Cloud by
 * default, or a self-hosted server such as TileServer GL), configured with a URL template.
 * The same template feeds the interactive Leaflet maps and the maps drawn into the PDF.
 */
export const MAP_TILE_URL_SETTING = 'map_tile_url_template'
export const MAP_TILE_API_KEY_SETTING = 'map_tile_api_key'

/** `{z}`, `{x}`, `{y}` are tile coordinates; `{key}` is replaced with the API key. */
export const DEFAULT_MAP_TILE_URL_TEMPLATE =
  'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key={key}'

/** Attribution required by the OpenMapTiles and OpenStreetMap licences. */
export const MAP_TILE_ATTRIBUTION = '(c) OpenMapTiles (c) OpenStreetMap contributors'
export const MAP_TILE_ATTRIBUTION_HTML =
  '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export type MapTileConfig = {
  urlTemplate: string
  apiKey: string
}

export async function getMapTileConfig(): Promise<MapTileConfig> {
  const [template, key] = await Promise.all([
    getSetting(MAP_TILE_URL_SETTING).catch(() => null),
    getSetting(MAP_TILE_API_KEY_SETTING).catch(() => null),
  ])
  return {
    urlTemplate: template?.trim() || DEFAULT_MAP_TILE_URL_TEMPLATE,
    apiKey: key?.trim() ?? '',
  }
}

export async function saveMapTileConfig(config: MapTileConfig): Promise<void> {
  await setSetting(MAP_TILE_URL_SETTING, config.urlTemplate.trim())
  await setSetting(MAP_TILE_API_KEY_SETTING, config.apiKey.trim())
}

/** True when the template needs a key and none is set, so no tile request could succeed. */
export function isMapTileConfigIncomplete(config: MapTileConfig): boolean {
  return config.urlTemplate.includes('{key}') && !config.apiKey
}

/** Leaflet `TileLayer` URL: the key is filled in, `{z}/{x}/{y}` are left for Leaflet. */
export function leafletTileUrl(config: MapTileConfig): string {
  return config.urlTemplate.replaceAll('{key}', encodeURIComponent(config.apiKey))
}

export function tileUrl(config: MapTileConfig, z: number, x: number, y: number): string {
  return leafletTileUrl(config)
    .replaceAll('{z}', String(z))
    .replaceAll('{x}', String(x))
    .replaceAll('{y}', String(y))
}
