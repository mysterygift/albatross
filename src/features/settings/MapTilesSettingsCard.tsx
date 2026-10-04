import { useState } from 'react'
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import {
  DEFAULT_MAP_STYLE_URL,
  getMapStyleConfig,
  saveMapStyleConfig,
  type MapStyleConfig,
} from '@/lib/maps/mapStyle'

const MAP_STYLE_CONFIG_QUERY_KEY = ['map-style-config']

function MapStyleForm({ config }: { config: MapStyleConfig }) {
  const queryClient = useQueryClient()
  const [styleUrl, setStyleUrl] = useState(config.styleUrl)

  const saveMutation = useMutation({
    mutationFn: (next: MapStyleConfig) => saveMapStyleConfig(next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MAP_STYLE_CONFIG_QUERY_KEY })
      toast.success('Map style saved.')
    },
  })

  return (
    <CardContent className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="map-style-url">Map style URL</Label>
        <Input
          id="map-style-url"
          spellCheck={false}
          value={styleUrl}
          onChange={(event) => setStyleUrl(event.target.value)}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          OpenFreeMap styles: liberty (detailed), bright, positron (light grey, good for print).
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => saveMutation.mutate({ styleUrl })}
          disabled={saveMutation.isPending || !styleUrl.trim()}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setStyleUrl(DEFAULT_MAP_STYLE_URL)}
          disabled={saveMutation.isPending}
        >
          Reset to default
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => shellOpen('https://openfreemap.org')}
        >
          About OpenFreeMap
        </Button>
      </div>
      {saveMutation.error instanceof Error && (
        <p className="text-sm text-destructive">{saveMutation.error.message}</p>
      )}
    </CardContent>
  )
}

/** Map source for the Movement Order route maps (interactive and printed). */
export function MapTilesSettingsCard() {
  const { data: config } = useQuery({
    queryKey: MAP_STYLE_CONFIG_QUERY_KEY,
    queryFn: getMapStyleConfig,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Map tiles</CardTitle>
        <CardDescription>
          Movement Order maps use OpenFreeMap, which is free and needs no API key. Change the style
          URL to use a different MapLibre style, such as a self-hosted OpenFreeMap.
        </CardDescription>
      </CardHeader>
      {config ? <MapStyleForm key={config.styleUrl} config={config} /> : null}
    </Card>
  )
}
