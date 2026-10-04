import {
  TILE_SIZE,
  planTiles,
  projectToWorldPixels,
  type PixelPoint,
} from '@/lib/maps/mapMath'
import { tileUrl, type MapTileConfig } from '@/lib/maps/tileConfig'
import {
  MARKER_COLORS,
  ROUTE_COLOR,
  viewForScene,
  type MapScene,
  type MapView,
} from '@/lib/movement-orders/movementMaps'

export interface ProjectedScene {
  routes: PixelPoint[][]
  markers: Array<{ at: PixelPoint; label: string; style: MapScene['markers'][number]['style'] }>
}

/** Pixel positions of a scene's routes and markers on a `width` x `height` canvas. */
export function projectScene(
  scene: MapScene,
  view: MapView,
  width: number,
  height: number
): ProjectedScene {
  const c = projectToWorldPixels(view.center, view.zoom)
  const toPixel = (p: { lat: number; lng: number }): PixelPoint => {
    const w = projectToWorldPixels(p, view.zoom)
    return { x: w.x - c.x + width / 2, y: w.y - c.y + height / 2 }
  }
  return {
    routes: scene.routes.map((line) => line.map(toPixel)),
    markers: scene.markers.map((m) => ({ at: toPixel(m.position), label: m.label, style: m.style })),
  }
}

function loadTile(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  at: PixelPoint,
  label: string,
  style: MapScene['markers'][number]['style'],
  scale: number
): void {
  const r = (label.length > 1 ? 13 : 11) * scale
  ctx.save()
  ctx.fillStyle = MARKER_COLORS[style]
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.5 * scale
  ctx.beginPath()
  if (style === 'base') {
    const s = r * 1.7
    ctx.rect(at.x - s / 2, at.y - s / 2, s, s)
  } else {
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${12 * scale}px Helvetica, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, at.x, at.y + 0.5 * scale)
  ctx.restore()
}

/**
 * Draw a scene on top of map tiles and return it as PNG bytes. Needs a browser canvas, so it
 * runs in the app, not in Node. Throws if no tile could be loaded (offline, bad key), so the
 * caller can leave the map out rather than print a blank one.
 */
export async function renderStaticMap(args: {
  scene: MapScene
  width: number
  height: number
  tileConfig: MapTileConfig
  attribution: string
}): Promise<Uint8Array> {
  const { scene, width, height, tileConfig, attribution } = args
  const view = viewForScene(scene, width, height)
  if (!view) throw new Error('Nothing to show on this map.')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available.')
  ctx.fillStyle = '#e5e7eb'
  ctx.fillRect(0, 0, width, height)

  // Tiles are 256px; draw them at 2x so close-ups stay sharp in print.
  const { tiles } = planTiles({ center: view.center, zoom: view.zoom, width, height })
  const loaded = await Promise.all(
    tiles.map(async (tile) => ({
      tile,
      image: await loadTile(tileUrl(tileConfig, tile.z, tile.x, tile.y)),
    }))
  )
  const drawn = loaded.filter((entry) => entry.image !== null)
  if (drawn.length === 0) throw new Error('No map tiles could be loaded. Check the map tile settings.')
  for (const { tile, image } of drawn) {
    ctx.drawImage(image!, tile.px, tile.py, TILE_SIZE, TILE_SIZE)
  }

  const scale = width / 800
  const projected = projectScene(scene, view, width, height)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const [color, lineWidth] of [
    ['#ffffff', 9 * scale],
    [ROUTE_COLOR, 5 * scale],
  ] as const) {
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    for (const line of projected.routes) {
      ctx.beginPath()
      line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
    }
  }
  for (const marker of projected.markers) {
    const margin = 20 * scale
    if (marker.at.x < -margin || marker.at.y < -margin || marker.at.x > width + margin || marker.at.y > height + margin) {
      continue
    }
    drawMarker(ctx, marker.at, marker.label, marker.style, scale)
  }

  ctx.font = `${10 * scale}px Helvetica, Arial, sans-serif`
  const textWidth = ctx.measureText(attribution).width
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillRect(width - textWidth - 12 * scale, height - 18 * scale, textWidth + 12 * scale, 18 * scale)
  ctx.fillStyle = '#333333'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(attribution, width - 6 * scale, height - 9 * scale)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not encode the map image.')
  return new Uint8Array(await blob.arrayBuffer())
}
