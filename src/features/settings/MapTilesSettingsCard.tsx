import { useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import {
  DEFAULT_MAP_TILE_URL_TEMPLATE,
  getMapTileConfig,
  saveMapTileConfig,
  type MapTileConfig,
} from '@/lib/maps/tileConfig'

const MAP_TILE_CONFIG_QUERY_KEY = ['map-tile-config']

function MapTilesForm({ config }: { config: MapTileConfig }) {
  const queryClient = useQueryClient()
  const [urlTemplate, setUrlTemplate] = useState(config.urlTemplate)
  const [apiKey, setApiKey] = useState(config.apiKey)

  const saveMutation = useMutation({
    mutationFn: (next: MapTileConfig) => saveMapTileConfig(next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MAP_TILE_CONFIG_QUERY_KEY })
      toast.success('Map tile settings saved.')
    },
  })

  return (
    <CardContent className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="map-tile-url">Tile URL template</Label>
        <Input
          id="map-tile-url"
          spellCheck={false}
          value={urlTemplate}
          onChange={(event) => setUrlTemplate(event.target.value)}
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="map-tile-key">API key</Label>
        <Input
          id="map-tile-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Paste your map tile API key"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => saveMutation.mutate({ urlTemplate, apiKey })}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setUrlTemplate(DEFAULT_MAP_TILE_URL_TEMPLATE)}
          disabled={saveMutation.isPending}
        >
          Reset URL to default
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => openUrl('https://www.maptiler.com/cloud/')}
        >
          Get free key
        </Button>
      </div>
      {saveMutation.error instanceof Error && (
        <p className="text-sm text-destructive">{saveMutation.error.message}</p>
      )}
    </CardContent>
  )
}

/** Tile source for the Movement Order route maps (interactive and printed). */
export function MapTilesSettingsCard() {
  const { data: config } = useQuery({
    queryKey: MAP_TILE_CONFIG_QUERY_KEY,
    queryFn: getMapTileConfig,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Map tiles</CardTitle>
        <CardDescription>
          Movement Order maps use an OpenMapTiles-based raster tile service (MapTiler Cloud by
          default, or your own tile server). Use {'{z}'}, {'{x}'}, {'{y}'} and {'{key}'} in the URL.
        </CardDescription>
      </CardHeader>
      {config ? (
        <MapTilesForm key={`${config.urlTemplate}|${config.apiKey}`} config={config} />
      ) : null}
    </Card>
  )
}
