import { Map as MapLibreMap } from 'maplibre-gl'
import { recordApiCall } from '@/lib/dev/apiCallTracker'
import { boundsOf, routesToGeoJson } from '@/lib/maps/mapMath'
import type { MapStyleConfig } from '@/lib/maps/mapStyle'
import { MARKER_COLORS, ROUTE_COLOR, type MapMarkerStyle, type MapScene } from '@/lib/movement-orders/movementMaps'

/** Output is drawn at 2x so close-ups stay sharp in print. */
const PIXEL_RATIO = 2
const LOAD_TIMEOUT_MS = 25000
/** Padding around the fitted points, in CSS px. */
const FIT_PADDING = 28

/** Counts tile requests for the dev API call tracker. */
export function transformMapRequest(_url: string, resourceType?: string): { url: string } {
  if (resourceType === 'Tile') recordApiCall('map_tiles')
  return { url: _url }
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  label: string,
  style: MapMarkerStyle,
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

function waitForEvent(map: MapLibreMap, event: 'load' | 'idle', failure: () => string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      map.off(event, onEvent)
      reject(new Error(failure()))
    }, LOAD_TIMEOUT_MS)
    const onEvent = () => {
      window.clearTimeout(timer)
      resolve()
    }
    map.once(event, onEvent)
  })
}

/**
 * Draw a scene with MapLibre on an off-screen canvas, put the markers and attribution on top,
 * and return PNG bytes. Needs a browser with WebGL, so it runs in the app, not in Node. Throws
 * if the style or tiles cannot be loaded (offline, bad style URL) so the caller can leave the
 * map out rather than print a blank one.
 */
export async function renderStaticMap(args: {
  scene: MapScene
  width: number
  height: number
  styleConfig: MapStyleConfig
  attribution: string
}): Promise<Uint8Array> {
  const { scene, width, height, styleConfig, attribution } = args
  const bounds = boundsOf(scene.fitPoints)
  if (!bounds) throw new Error('Nothing to show on this map.')

  const container = document.createElement('div')
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width / PIXEL_RATIO}px;height:${height / PIXEL_RATIO}px;`
  document.body.appendChild(container)

  let lastError = ''
  const map = new MapLibreMap({
    container,
    style: styleConfig.styleUrl,
    center: [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2],
    zoom: 2,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    pixelRatio: PIXEL_RATIO,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    transformRequest: transformMapRequest,
  })
  map.on('error', (event) => {
    lastError = event.error?.message ?? 'unknown error'
  })

  try {
    await waitForEvent(map, 'load', () =>
      `The map style could not be loaded${lastError ? ` (${lastError})` : ''}. Check the map style in Settings → Integrations.`
    )
    map.addSource('route', { type: 'geojson', data: routesToGeoJson(scene.routes) })
    for (const [id, color, lineWidth] of [
      ['route-casing', '#ffffff', 9],
      ['route-line', ROUTE_COLOR, 5],
    ] as const) {
      map.addLayer({
        id,
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': color, 'line-width': lineWidth },
      })
    }
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding: FIT_PADDING, maxZoom: scene.maxZoom, animate: false }
    )
    await waitForEvent(map, 'idle', () =>
      `The map tiles did not finish loading${lastError ? ` (${lastError})` : ''}.`
    )

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available.')
    ctx.drawImage(map.getCanvas(), 0, 0, width, height)

    const scale = width / 800
    for (const marker of scene.markers) {
      const point = map.project([marker.position.lng, marker.position.lat])
      const at = { x: point.x * PIXEL_RATIO, y: point.y * PIXEL_RATIO }
      const margin = 20 * scale
      if (at.x < -margin || at.y < -margin || at.x > width + margin || at.y > height + margin) continue
      drawMarker(ctx, at, marker.label, marker.style, scale)
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
  } finally {
    map.remove()
    container.remove()
  }
}
