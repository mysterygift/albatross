import { useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Map, Marker, Source, type MapRef } from '@vis.gl/react-maplibre'
import { Trash2 } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { MapStyleConfig } from '@/lib/maps/mapStyle'
import { boundsOf, routesToGeoJson } from '@/lib/maps/mapMath'
import { transformMapRequest } from '@/lib/maps/staticMapRenderer'
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

function MarkerBadge({ label, style }: { label: string; style: MapMarkerStyle }) {
  const size = label.length > 1 ? 28 : 24
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: style === 'base' ? 4 : '50%',
        background: MARKER_COLORS[style],
        color: '#fff',
        border: '2px solid #fff',
        boxShadow: '0 1px 4px rgba(0,0,0,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        font: '700 12px/1 Helvetica, Arial, sans-serif',
      }}
    >
      {label}
    </div>
  )
}

function MapFrame({
  scene,
  styleConfig,
  pins,
  height,
  onMovePin,
  onAddPin,
}: {
  scene: MapScene
  styleConfig: MapStyleConfig
  pins: MovementPin[]
  height: number
  onMovePin: (id: string, position: LatLngLike) => void
  onAddPin: ((position: LatLngLike) => void) | null
}) {
  const mapRef = useRef<MapRef>(null)
  const codes = getMovementPinCodes(pins)
  const bounds = boundsOf(scene.fitPoints)!
  const fitBounds: [[number, number], [number, number]] = [
    [bounds.west, bounds.south],
    [bounds.east, bounds.north],
  ]
  const signature = scene.fitPoints.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')
  const route = useMemo(() => routesToGeoJson(scene.routes), [scene.routes])

  // Re-fit when the points that should be visible change (not when a pin is dragged inside).
  useEffect(() => {
    mapRef.current?.fitBounds(fitBounds, { padding: 40, maxZoom: scene.maxZoom, duration: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands in for the points
  }, [signature, scene.maxZoom])

  return (
    <div className="overflow-hidden rounded border border-border" style={{ height }}>
      <Map
        ref={mapRef}
        mapStyle={styleConfig.styleUrl}
        initialViewState={{ bounds: fitBounds, fitBoundsOptions: { padding: 40, maxZoom: scene.maxZoom } }}
        style={{ width: '100%', height: '100%' }}
        cursor={onAddPin ? 'crosshair' : undefined}
        transformRequest={transformMapRequest}
        onClick={(event) => onAddPin?.({ lat: event.lngLat.lat, lng: event.lngLat.lng })}
      >
        {scene.routes.length > 0 && (
          <Source id="route" type="geojson" data={route}>
            <Layer
              id="route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#ffffff', 'line-width': 9 }}
            />
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': ROUTE_COLOR, 'line-width': 5 }}
            />
          </Source>
        )}
        {scene.markers
          .filter((m) => m.style === 'location' || m.style === 'base')
          .map((m, i) => (
            <Marker key={`stop-${i}`} longitude={m.position.lng} latitude={m.position.lat} anchor="center">
              <MarkerBadge label={m.label} style={m.style} />
            </Marker>
          ))}
        {pins.map((pin, i) => (
          <Marker
            key={pin.id}
            longitude={pin.lng}
            latitude={pin.lat}
            anchor="center"
            draggable
            onDragEnd={(event) => onMovePin(pin.id, { lat: event.lngLat.lat, lng: event.lngLat.lng })}
          >
            <MarkerBadge label={codes[i]!} style={pin.kind} />
          </Marker>
        ))}
      </Map>
    </div>
  )
}

export interface MovementOrderMapsProps {
  data: MapData
  styleConfig: MapStyleConfig
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
  styleConfig,
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

  // Before any route or coordinates exist there is nothing to centre on.
  const fallbackScene: MapScene | null =
    overview ??
    (pins.length > 0
      ? {
          routes: [],
          markers: [],
          fitPoints: pins.map((p) => ({ lat: p.lat, lng: p.lng })),
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
            styleConfig={styleConfig}
            pins={pins}
            height={440}
            onMovePin={movePin}
            onAddPin={onAddPin}
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
              styleConfig={styleConfig}
              pins={pins}
              height={340}
              onMovePin={movePin}
              onAddPin={onAddPin}
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
