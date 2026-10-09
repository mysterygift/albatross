/**
 * Floor plan backgrounds: placing a picture on the plan, shrinking an uploaded picture to a
 * sensible size, and drawing a to-scale, north-up map of the location from the map tiles set in
 * Settings. The pure helpers are tested; the canvas ones need a browser.
 */
import { recordApiCall } from '@/lib/dev/apiCallTracker'
import { MAX_ZOOM, TILE_SIZE, planTiles } from '@/lib/maps/mapMath'
import { MAP_TILE_ATTRIBUTION, tileUrl, type MapTileConfig } from '@/lib/maps/tileConfig'
import { PLAN_HEIGHT, PLAN_WIDTH, type FloorPlanBackground } from './model'

/** Longest side, in pixels, a background is kept at. */
export const BACKGROUND_MAX_PIXELS = 2400
/** Map backgrounds are drawn at this size: twice the plan, so they stay sharp. */
const MAP_PIXELS = { width: PLAN_WIDTH * 2, height: PLAN_HEIGHT * 2 }

export type BackgroundFit = 'fit' | 'fill'

/** Where a `width` x `height` picture goes on the plan: whole and centred (fit), or covering it (fill). */
export function fitBackground(width: number, height: number, fit: BackgroundFit): Pick<FloorPlanBackground, 'x' | 'y' | 'width' | 'height'> {
  const scaleX = PLAN_WIDTH / width
  const scaleY = PLAN_HEIGHT / height
  const scale = fit === 'fit' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY)
  const w = width * scale
  const h = height * scale
  return { x: (PLAN_WIDTH - w) / 2, y: (PLAN_HEIGHT - h) / 2, width: w, height: h }
}

/** Metres per pixel of a 256 px tile at `zoom` and latitude. */
export function groundResolution(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

/**
 * The tile zoom to draw a map `metresAcross` wide into `pixels`, and how much to stretch the
 * tiles to fit: the closest zoom with enough detail, capped at the tiles' highest zoom.
 */
export function mapZoomFor(lat: number, metresAcross: number, pixels: number): { zoom: number; stretch: number } {
  const wanted = metresAcross / pixels
  let zoom = Math.ceil(Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / wanted))
  zoom = Math.max(1, Math.min(MAX_ZOOM, zoom))
  return { zoom, stretch: groundResolution(lat, zoom) / wanted }
}

function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    if (crossOrigin) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

/**
 * An uploaded picture, shrunk so its longest side is at most `BACKGROUND_MAX_PIXELS` and saved as
 * JPEG (a white ground under any transparency). Returns the data URL and its size in pixels.
 */
export async function prepareBackgroundImage(file: Blob): Promise<{ dataUrl: string; width: number; height: number }> {
  const original = await loadImage(await readFileAsDataUrl(file))
  if (!original || !original.naturalWidth) throw new Error('That file is not a picture this app can open.')
  const scale = Math.min(1, BACKGROUND_MAX_PIXELS / Math.max(original.naturalWidth, original.naturalHeight))
  const width = Math.round(original.naturalWidth * scale)
  const height = Math.round(original.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(original, 0, 0, width, height)
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width, height }
}

/**
 * A north-up map `metresAcross` wide centred on the location, as a JPEG data URL sized to cover
 * the whole plan. Throws when no tile loads (offline, or no map key), so the caller can say so.
 */
export async function renderLocationMap(args: {
  lat: number
  lon: number
  metresAcross: number
  tileConfig: MapTileConfig
}): Promise<string> {
  const { width, height } = MAP_PIXELS
  const { zoom, stretch } = mapZoomFor(args.lat, args.metresAcross, width)
  const { tiles } = planTiles({ center: { lat: args.lat, lng: args.lon }, zoom, width: width / stretch, height: height / stretch })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available.')
  ctx.fillStyle = '#e5e7eb'
  ctx.fillRect(0, 0, width, height)
  const loaded = await Promise.all(
    tiles.map(async (tile) => {
      recordApiCall('map_tiles')
      return { tile, image: await loadImage(tileUrl(args.tileConfig, tile.z, tile.x, tile.y), true) }
    })
  )
  const drawn = loaded.filter((entry) => entry.image)
  if (drawn.length === 0) throw new Error('No map tiles could be loaded. Check the map settings, or upload a picture instead.')
  ctx.imageSmoothingQuality = 'high'
  for (const { tile, image } of drawn) {
    ctx.drawImage(image!, tile.px * stretch, tile.py * stretch, TILE_SIZE * stretch, TILE_SIZE * stretch)
  }
  ctx.font = '20px Helvetica, Arial, sans-serif'
  const textWidth = ctx.measureText(MAP_TILE_ATTRIBUTION).width
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillRect(width - textWidth - 20, height - 34, textWidth + 20, 34)
  ctx.fillStyle = '#333333'
  ctx.fillText(MAP_TILE_ATTRIBUTION, width - textWidth - 10, height - 10)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** A map background covering the plan; its scale is the plan's new scale. */
export function mapBackground(lat: number, lon: number, metresAcross: number, opacity = 0.8): { background: FloorPlanBackground; unitsPerMetre: number } {
  return {
    background: { source: 'map', x: 0, y: 0, width: PLAN_WIDTH, height: PLAN_HEIGHT, opacity, map: { lat, lon, metresAcross } },
    unitsPerMetre: PLAN_WIDTH / metresAcross,
  }
}
