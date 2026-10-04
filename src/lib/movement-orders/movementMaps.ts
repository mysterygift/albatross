import { distanceMeters } from '@/lib/maps/mapMath'
import { decodePolyline, type LatLngLike } from '@/lib/maps/polyline'
import { getMovementPinCodes, type MovementPinKind } from '@/lib/movement-orders/pins'
import type { MovementOrderData } from '@/lib/movement-orders/types'

export type MapMarkerStyle = 'location' | 'base' | MovementPinKind

export interface MapMarker {
  position: LatLngLike
  /** Text inside the marker: stop number or pin code. */
  label: string
  style: MapMarkerStyle
}

/** Everything drawn on one map, independent of how it is rendered (interactive map or PDF image). */
export interface MapScene {
  routes: LatLngLike[][]
  markers: MapMarker[]
  /** Points the view must contain. */
  fitPoints: LatLngLike[]
  /** Highest zoom the view may fit to (a single point zooms to this). */
  maxZoom: number
}

export const MARKER_COLORS: Record<MapMarkerStyle, string> = {
  location: '#111111',
  base: '#111111',
  unit_base: '#15803d',
  parking: '#c2410c',
  other: '#7e22ce',
}

export const ROUTE_COLOR = '#1d4ed8'

/** Overview map size in the PDF (px); the page is 2:1. */
export const OVERVIEW_MAP_SIZE = { width: 1600, height: 800 }
/** Close-up map size in the PDF (px); 4:3. */
export const LOCATION_MAP_SIZE = { width: 800, height: 600 }
/** Pins and neighbours further than this from a location are left off its close-up. */
const CLOSE_UP_RADIUS_METERS = 600

function hasPosition(p: { lat: number | null; lng: number | null }): p is LatLngLike {
  return (
    typeof p.lat === 'number' &&
    Number.isFinite(p.lat) &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lng)
  )
}

type SceneInput = Pick<
  MovementOrderData,
  'locations' | 'movementLegs' | 'pins' | 'unitBaseAddress'
>

function routePolylines(data: SceneInput): LatLngLike[][] {
  return data.movementLegs
    .map((leg) => decodePolyline(leg.routeGeometry))
    .filter((line) => line.length >= 2)
}

function pinMarkers(data: SceneInput): MapMarker[] {
  const codes = getMovementPinCodes(data.pins)
  return data.pins.map((pin, i) => ({
    position: { lat: pin.lat, lng: pin.lng },
    label: codes[i]!,
    style: pin.kind,
  }))
}

function locationMarkers(data: SceneInput): MapMarker[] {
  const markers: MapMarker[] = []
  data.locations.forEach((location, i) => {
    if (hasPosition(location)) {
      markers.push({ position: location, label: String(i + 1), style: 'location' })
    }
  })
  return markers
}

/** The unit base the journey starts from, unless a unit base pin already marks it. */
function baseMarker(data: SceneInput): MapMarker[] {
  if (!data.unitBaseAddress?.trim()) return []
  if (data.pins.some((pin) => pin.kind === 'unit_base')) return []
  const from = data.movementLegs[0]?.fromCoords
  return from ? [{ position: from, label: 'B', style: 'base' }] : []
}

/** Whole-day route: every leg, every stop, every pin. Null when there is nothing to draw. */
export function buildOverviewScene(data: SceneInput): MapScene | null {
  const routes = routePolylines(data)
  const markers = [...locationMarkers(data), ...baseMarker(data), ...pinMarkers(data)]
  const fitPoints = [...routes.flat(), ...markers.map((m) => m.position)]
  if (fitPoints.length === 0) return null
  return { routes, markers, fitPoints, maxZoom: 17 }
}

/** Close-up on one location with the pins and neighbouring stops near it. */
export function buildLocationScene(data: SceneInput, locationIndex: number): MapScene | null {
  const location = data.locations[locationIndex]
  if (!location || !hasPosition(location)) return null
  const centre: LatLngLike = { lat: location.lat, lng: location.lng }
  const near = (p: LatLngLike) => distanceMeters(centre, p) <= CLOSE_UP_RADIUS_METERS
  const markers = [
    ...locationMarkers(data),
    ...baseMarker(data),
    ...pinMarkers(data),
  ]
  const fitPoints = [centre, ...markers.map((m) => m.position).filter(near)]
  return { routes: routePolylines(data), markers, fitPoints, maxZoom: 17 }
}
