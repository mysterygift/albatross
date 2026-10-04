import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Trash2 } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MAP_TILE_ATTRIBUTION_HTML,
  isMapTileConfigIncomplete,
  leafletTileUrl,
  type MapTileConfig,
} from '@/lib/maps/tileConfig'
import { boundsOf } from '@/lib/maps/mapMath'
import type { LatLngLike } from '@/lib/maps/polyline'
import {
  MARKER_COLORS,
  ROUTE_COLOR,
  buildLocationScene,
  buildOverviewScene,
  type MapMarkerStyle,
  type MapScene,
} from '@/lib/movement-orders/movementMaps'
import {
  MOVEMENT_PIN_KINDS,
  MOVEMENT_PIN_KIND_LABELS,
  getMovementPinCodes,
  newMovementPinId,
  type MovementPin,
  type MovementPinKind,
} from '@/lib/movement-orders/pins'
import type { MovementOrderData } from '@/lib/movement-orders/types'

type MapData = Pick<MovementOrderData, 'locations' | 'movementLegs' | 'pins' | 'unitBaseAddress'>

function markerIcon(label: string, style: MapMarkerStyle): L.DivIcon {
  const size = label.length > 1 ? 28 : 24
  const radius = style === 'base' ? '4px' : '50%'
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:${radius};background:${MARKER_COLORS[style]};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font:700 12px/1 Helvetica,Arial,sans-serif;">${label}</div>`,
  })
}

/** Re-fit the view when the points that should be visible change. */
function FitView({
  points,
  minZoom,
  maxZoom,
}: {
  points: LatLngLike[]
  minZoom: number
  maxZoom: number
}) {
  const map = useMap()
  const signature = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')
  useEffect(() => {
    const bounds = boundsOf(points)
    if (!bounds) return
    map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [32, 32], maxZoom }
    )
    if (map.getZoom() < minZoom) map.setZoom(minZoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands in for `points`
  }, [map, signature, minZoom, maxZoom])
  return null
}

function ClickToAddPin({ onAdd }: { onAdd: ((position: LatLngLike) => void) | null }) {
  useMapEvents({
    click(event) {
      onAdd?.({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

function SceneLayers({ scene, pins, onMovePin }: {
  scene: MapScene
  pins: MovementPin[]
  onMovePin: (id: string, position: LatLngLike) => void
}) {
  const codes = getMovementPinCodes(pins)
  return (
    <>
      {scene.routes.map((line, i) => (
        <Polyline
          key={`route-${i}`}
          positions={line.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: ROUTE_COLOR, weight: 5, opacity: 0.85 }}
        />
      ))}
      {scene.markers
        .filter((m) => m.style === 'location' || m.style === 'base')
        .map((m, i) => (
          <Marker
            key={`stop-${i}`}
            position={[m.position.lat, m.position.lng]}
            icon={markerIcon(m.label, m.style)}
            interactive={false}
          />
        ))}
      {pins.map((pin, i) => (
        <Marker
          key={pin.id}
          position={[pin.lat, pin.lng]}
          icon={markerIcon(codes[i]!, pin.kind)}
          draggable
          eventHandlers={{
            dragend: (event) => {
              const latlng = (event.target as L.Marker).getLatLng()
              onMovePin(pin.id, { lat: latlng.lat, lng: latlng.lng })
            },
          }}
        />
      ))}
    </>
  )
}

function MapFrame({
  scene,
  tileConfig,
  pins,
  height,
  onMovePin,
  onAddPin,
  fitMinZoom,
  fitMaxZoom,
}: {
  scene: MapScene
  tileConfig: MapTileConfig
  pins: MovementPin[]
  height: number
  onMovePin: (id: string, position: LatLngLike) => void
  onAddPin: ((position: LatLngLike) => void) | null
  fitMinZoom: number
  fitMaxZoom: number
}) {
  const first = scene.fitPoints[0]!
  return (
    <MapContainer
      center={[first.lat, first.lng]}
      zoom={13}
      style={{ height, width: '100%', cursor: onAddPin ? 'crosshair' : undefined }}
      className="rounded border border-border"
      scrollWheelZoom
    >
      <TileLayer url={leafletTileUrl(tileConfig)} attribution={MAP_TILE_ATTRIBUTION_HTML} maxZoom={19} />
      <FitView points={scene.fitPoints} minZoom={fitMinZoom} maxZoom={fitMaxZoom} />
      <ClickToAddPin onAdd={onAddPin} />
      <SceneLayers scene={scene} pins={pins} onMovePin={onMovePin} />
    </MapContainer>
  )
}

export interface MovementOrderMapsProps {
  data: MapData
  tileConfig: MapTileConfig
  pins: MovementPin[]
  onPinsChange: (pins: MovementPin[]) => void
  canEdit: boolean
}

/**
 * Interactive route overview and per-location close-ups. Pins are placed by clicking the map
 * after choosing a pin type, dragged to adjust, and edited in the list below.
 */
export function MovementOrderMaps({
  data,
  tileConfig,
  pins,
  onPinsChange,
  canEdit,
}: MovementOrderMapsProps) {
  const [addKind, setAddKind] = useState<MovementPinKind | null>(null)
  const [locationIndex, setLocationIndex] = useState(0)

  const mapData = useMemo<MapData>(() => ({ ...data, pins }), [data, pins])
  const overview = useMemo(() => buildOverviewScene(mapData), [mapData])
  const closeUp = useMemo(
    () => buildLocationScene(mapData, Math.min(locationIndex, Math.max(0, data.locations.length - 1))),
    [mapData, locationIndex, data.locations.length]
  )
  const codes = getMovementPinCodes(pins)

  const addPin = (position: LatLngLike) => {
    if (!addKind) return
    onPinsChange([
      ...pins,
      {
        id: newMovementPinId(),
        kind: addKind,
        label: MOVEMENT_PIN_KIND_LABELS[addKind],
        notes: null,
        lat: position.lat,
        lng: position.lng,
      },
    ])
    setAddKind(null)
  }
  const movePin = (id: string, position: LatLngLike) =>
    onPinsChange(pins.map((pin) => (pin.id === id ? { ...pin, ...position } : pin)))
  const updatePin = (id: string, patch: Partial<MovementPin>) =>
    onPinsChange(pins.map((pin) => (pin.id === id ? { ...pin, ...patch } : pin)))
  const onAddPin = canEdit && addKind ? addPin : null

  if (isMapTileConfigIncomplete(tileConfig)) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a map tile API key under Settings → Integrations to show the maps.
      </p>
    )
  }

  // Before any route or coordinates exist there is nothing to centre on.
  const fallbackScene: MapScene | null =
    overview ??
    (pins.length > 0
      ? {
          routes: [],
          markers: [],
          fitPoints: pins.map((p) => ({ lat: p.lat, lng: p.lng })),
          minZoom: 2,
          maxZoom: 17,
        }
      : null)

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Drop a pin:</span>
          {MOVEMENT_PIN_KINDS.map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant={addKind === kind ? 'default' : 'outline'}
              onClick={() => setAddKind(addKind === kind ? null : kind)}
            >
              {MOVEMENT_PIN_KIND_LABELS[kind]}
            </Button>
          ))}
          {addKind && (
            <span className="text-sm text-muted-foreground">
              Click a map to place the {MOVEMENT_PIN_KIND_LABELS[addKind].toLowerCase()} pin.
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Route overview</p>
        {fallbackScene ? (
          <MapFrame
            scene={fallbackScene}
            tileConfig={tileConfig}
            pins={pins}
            height={440}
            onMovePin={movePin}
            onAddPin={onAddPin}
            fitMinZoom={fallbackScene.minZoom}
            fitMaxZoom={fallbackScene.maxZoom}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            The overview appears once the locations have been placed on the map (they need an
            address or coordinates).
          </p>
        )}
      </div>

      {data.locations.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium">Location close-up</p>
            <Select
              value={String(Math.min(locationIndex, data.locations.length - 1))}
              onValueChange={(value) => setLocationIndex(Number(value))}
            >
              <SelectTrigger className="w-72 bg-input border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.locations.map((location, i) => (
                  <SelectItem key={`${location.id}-${i}`} value={String(i)}>
                    {i + 1}. {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {closeUp ? (
            <MapFrame
              key={locationIndex}
              scene={closeUp}
              tileConfig={tileConfig}
              pins={pins}
              height={340}
              onMovePin={movePin}
              onAddPin={onAddPin}
              fitMinZoom={closeUp.minZoom}
              fitMaxZoom={closeUp.maxZoom}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This location has no coordinates yet. Check its address on the Locations page.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Pins</p>
        {pins.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pins yet. Mark the unit base or parking on the map.
          </p>
        ) : (
          pins.map((pin, i) => (
            <div key={pin.id} className="grid items-center gap-2 md:grid-cols-[3rem_11rem_1fr_1fr_2.5rem]">
              <span
                className="inline-flex h-7 w-10 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: MARKER_COLORS[pin.kind] }}
              >
                {codes[i]}
              </span>
              <Select
                value={pin.kind}
                onValueChange={(value) => updatePin(pin.id, { kind: value as MovementPinKind })}
                disabled={!canEdit}
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_PIN_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {MOVEMENT_PIN_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label={`Label for pin ${codes[i]}`}
                placeholder="Label"
                value={pin.label}
                disabled={!canEdit}
                onChange={(event) => updatePin(pin.id, { label: event.target.value })}
                className="bg-input border-border"
              />
              <Input
                aria-label={`Notes for pin ${codes[i]}`}
                placeholder="Notes (e.g. permit number, bays)"
                value={pin.notes ?? ''}
                disabled={!canEdit}
                onChange={(event) => updatePin(pin.id, { notes: event.target.value || null })}
                className="bg-input border-border"
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete pin ${codes[i]}`}
                disabled={!canEdit}
                onClick={() => onPinsChange(pins.filter((p) => p.id !== pin.id))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
