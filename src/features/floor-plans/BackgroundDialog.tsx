import { useRef, useState } from 'react'
import { Map as MapIcon, Move, Ruler, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { fitBackground, mapBackground, prepareBackgroundImage, renderLocationMap } from '@/lib/floor-plans/background'
import { resolvePlanGeo } from '@/lib/floor-plans/geo'
import { PLAN_WIDTH, normalizeAngle, type FloorPlanGeo, type FloorPlanLayout } from '@/lib/floor-plans/model'
import { getMapTileConfig, isMapTileConfigIncomplete } from '@/lib/maps/tileConfig'

const MAP_WIDTHS = [100, 200, 500]

/** Address or typed coordinates → the plan's location and time zone. */
export function LocationFields({
  geo,
  defaultQuery,
  onGeo,
}: {
  geo: FloorPlanGeo | null
  defaultQuery: string
  onGeo: (geo: FloorPlanGeo) => void
}) {
  const [query, setQuery] = useState(defaultQuery)
  const [busy, setBusy] = useState(false)
  const find = async () => {
    setBusy(true)
    try {
      const found = await resolvePlanGeo(query)
      if (!found) toast.error('Location not found. Try a fuller address, or type coordinates such as 51.5072, -0.1276.')
      else onGeo(found)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor="fp-geo-query">Location</Label>
      <div className="flex gap-2">
        <Input
          id="fp-geo-query"
          value={query}
          placeholder="Address or coordinates"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void find()
            }
          }}
        />
        <Button type="button" variant="outline" disabled={busy || !query.trim()} onClick={() => void find()}>
          {busy ? 'Finding…' : 'Find'}
        </Button>
      </div>
      {geo ? (
        <p className="text-xs text-muted-foreground">
          {geo.lat.toFixed(5)}, {geo.lon.toFixed(5)}
          {geo.timezone ? ` | ${geo.timezone}` : ''}
        </p>
      ) : null}
    </div>
  )
}

/** Just the location, for the sun path when Layout mode is not open. */
export function LocationDialog({
  open,
  onOpenChange,
  geo,
  defaultQuery,
  onGeo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  geo: FloorPlanGeo | null
  defaultQuery: string
  onGeo: (geo: FloorPlanGeo) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-touch-targets>
        <DialogHeader>
          <DialogTitle>Location</DialogTitle>
        </DialogHeader>
        <LocationFields
          geo={geo}
          defaultQuery={defaultQuery}
          onGeo={(next) => {
            onGeo(next)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Background, scale, north and location for a plan. Changes apply straight to the layout (one
 * undo step each); the picture itself is saved apart.
 */
export function BackgroundDialog({
  open,
  onOpenChange,
  layout,
  onLayoutChange,
  hasImage,
  onImage,
  locationQuery,
  onArmTool,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  layout: FloorPlanLayout
  onLayoutChange: (next: FloorPlanLayout) => void
  hasImage: boolean
  onImage: (dataUrl: string | null) => Promise<void>
  locationQuery: string
  /** Close and pick a tool on the plan: measure a known length, or drag the picture. */
  onArmTool: (tool: 'measure' | 'background') => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [mapWidth, setMapWidth] = useState(layout.background?.map?.metresAcross ?? 200)
  const bg = hasImage ? layout.background : null
  const imageSize = useRef<{ width: number; height: number } | null>(null)

  const applyImage = async (file: File) => {
    setBusy('image')
    try {
      const prepared = await prepareBackgroundImage(file)
      imageSize.current = { width: prepared.width, height: prepared.height }
      await onImage(prepared.dataUrl)
      onLayoutChange({
        ...layout,
        background: { source: 'image', opacity: 0.6, map: null, ...fitBackground(prepared.width, prepared.height, 'fit') },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const applyMap = async () => {
    setBusy('map')
    try {
      let geo = layout.geo
      if (!geo) {
        geo = await resolvePlanGeo(locationQuery)
        if (!geo) throw new Error('Set the location first, then add the map.')
      }
      const tileConfig = await getMapTileConfig()
      if (isMapTileConfigIncomplete(tileConfig)) throw new Error('Add a map tile key in Settings to use maps.')
      const dataUrl = await renderLocationMap({ lat: geo.lat, lon: geo.lon, metresAcross: mapWidth, tileConfig })
      await onImage(dataUrl)
      const placed = mapBackground(geo.lat, geo.lon, mapWidth, layout.background?.opacity ?? 0.8)
      onLayoutChange({ ...layout, geo, north: 0, ...placed })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const refit = (fit: 'fit' | 'fill') => {
    if (!bg) return
    const ratio = bg.width / bg.height
    const placed = fitBackground(ratio * 1000, 1000, fit)
    // The scale was set on the picture, so it follows the picture's new size.
    onLayoutChange({ ...layout, background: { ...bg, ...placed }, unitsPerMetre: layout.unitsPerMetre * (placed.width / bg.width) })
  }

  const planWidthMetres = PLAN_WIDTH / layout.unitsPerMetre

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-touch-targets>
        <DialogHeader>
          <DialogTitle>Background</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={bg?.source === 'map'}
              disabled={busy != null}
              onClick={() => void applyMap()}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted disabled:opacity-60',
                bg?.source === 'map' && 'border-primary bg-primary/10'
              )}
            >
              <MapIcon className="size-5 shrink-0" aria-hidden />
              <span className="flex flex-col">
                <span className="font-medium">{busy === 'map' ? 'Loading map…' : 'Map of location'}</span>
                <span className="text-xs text-muted-foreground">To scale, north up</span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={bg?.source === 'image'}
              disabled={busy != null}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted disabled:opacity-60',
                bg?.source === 'image' && 'border-primary bg-primary/10'
              )}
            >
              <Upload className="size-5 shrink-0" aria-hidden />
              <span className="flex flex-col">
                <span className="font-medium">{busy === 'image' ? 'Loading…' : 'Image'}</span>
                <span className="text-xs text-muted-foreground">PNG or JPEG</span>
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label="Background image"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void applyImage(file)
              }}
            />
          </div>

          <div role="group" aria-label="Map width" className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Map width</span>
            {MAP_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={mapWidth === w}
                onClick={() => setMapWidth(w)}
                className={cn('h-7 rounded-full border px-3 text-xs', mapWidth === w ? 'border-primary bg-primary/15 font-medium' : 'hover:bg-muted')}
              >
                {w} m
              </button>
            ))}
          </div>

          {bg ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Fit" className="inline-flex overflow-hidden rounded-md border">
                  <button type="button" className="h-8 px-3 text-sm hover:bg-muted" onClick={() => refit('fit')}>
                    Fit
                  </button>
                  <button type="button" className="h-8 border-l px-3 text-sm hover:bg-muted" onClick={() => refit('fill')}>
                    Fill
                  </button>
                  <button
                    type="button"
                    className="flex h-8 items-center gap-1.5 border-l px-3 text-sm hover:bg-muted"
                    onClick={() => onArmTool('background')}
                  >
                    <Move className="size-3.5" aria-hidden />
                    Move
                  </button>
                </div>
                <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => void onImage(null).then(() => onLayoutChange({ ...layout, background: null }))}>
                  Remove
                </Button>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <span className="w-16 text-muted-foreground">Opacity</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(bg.opacity * 100)}
                  onChange={(e) => onLayoutChange({ ...layout, background: { ...bg, opacity: Number(e.target.value) / 100 } })}
                  className="flex-1 accent-primary"
                />
              </label>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fp-plan-width">Plan width (m)</Label>
              <div className="flex gap-2">
                <Input
                  id="fp-plan-width"
                  type="number"
                  min={1}
                  step={1}
                  value={Number(planWidthMetres.toFixed(1))}
                  onChange={(e) => {
                    const m = Number(e.target.value)
                    if (Number.isFinite(m) && m >= 1 && m <= 5000) onLayoutChange({ ...layout, unitsPerMetre: PLAN_WIDTH / m })
                  }}
                />
                <Button type="button" variant="outline" size="icon" aria-label="Measure a known length" onClick={() => onArmTool('measure')}>
                  <Ruler />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fp-north">North (°)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="fp-north"
                  type="number"
                  step={1}
                  value={Math.round(layout.north)}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) onLayoutChange({ ...layout, north: normalizeAngle(n) })
                  }}
                />
                <svg width="36" height="36" viewBox="-18 -18 36 36" role="img" aria-label={`North ${Math.round(layout.north)} degrees`} className="shrink-0">
                  <circle r="16" className="fill-background stroke-border" strokeWidth="2" />
                  <path d="M0 -12L5 5L0 1L-5 5Z" className="fill-foreground" transform={`rotate(${layout.north})`} />
                </svg>
              </div>
            </div>
          </div>

          <LocationFields geo={layout.geo} defaultQuery={locationQuery} onGeo={(geo) => onLayoutChange({ ...layout, geo })} />
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
