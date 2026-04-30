import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { FEATURE_SERVER_PUBLISH_ENABLED_KEY, serverSessionTokenSettingKey } from '@/lib/server/constants'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import { listServerConnections, deleteServerConnection } from '@/lib/server/serverConnectionRepository'
import { ConnectServerDialog } from '@/features/server/ConnectServerDialog'
import { OpenServerProjectDialog } from '@/features/server/OpenServerProjectDialog'

export function ServerPublishingSettingsSection() {
  const qc = useQueryClient()
  const [connectOpen, setConnectOpen] = useState(false)
  const [openRemote, setOpenRemote] = useState(false)
  const [remoteConn, setRemoteConn] = useState<string | null>(null)

  const featureQuery = useQuery({
    queryKey: ['settings', FEATURE_SERVER_PUBLISH_ENABLED_KEY],
    queryFn: async () => (await getSetting(FEATURE_SERVER_PUBLISH_ENABLED_KEY)) === 'true',
  })

  const connsQuery = useQuery({
    queryKey: ['server-connections'],
    queryFn: listServerConnections,
    enabled: !!featureQuery.data,
  })

  const toggleFeature = useMutation({
    mutationFn: async (on: boolean) => {
      await setSetting(FEATURE_SERVER_PUBLISH_ENABLED_KEY, on ? 'true' : 'false')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', FEATURE_SERVER_PUBLISH_ENABLED_KEY] }),
  })

  const removeConn = useMutation({
    mutationFn: async (id: string) => {
      await setSetting(serverSessionTokenSettingKey(id), '')
      await deleteServerConnection(id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['server-connections'] }),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server publishing (Beta)</CardTitle>
        <CardDescription>
          Connect to an Albatross collaboration server to publish projects and work with linked data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="feature-server-publish"
            checked={!!featureQuery.data}
            onChange={(e) => toggleFeature.mutate(e.target.checked)}
            disabled={toggleFeature.isPending}
            className="rounded border-border"
          />
          <Label htmlFor="feature-server-publish">Enable server collaboration UI</Label>
        </div>
        {featureQuery.data && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setConnectOpen(true)}>
                Add server connection…
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!connsQuery.data?.length}
                onClick={() => {
                  const first = connsQuery.data?.[0]
                  if (first) {
                    setRemoteConn(first.id)
                    setOpenRemote(true)
                  }
                }}
              >
                Open project from server…
              </Button>
            </div>
            <ul className="space-y-2 text-sm">
              {(connsQuery.data ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{c.display_name}</span>{' '}
                    <span className="text-muted-foreground">({c.base_url})</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeConn.mutate(c.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
      <ConnectServerDialog open={connectOpen} onOpenChange={setConnectOpen} />
      {remoteConn && (
        <OpenServerProjectDialog
          open={openRemote}
          onOpenChange={(v) => {
            setOpenRemote(v)
            if (!v) setRemoteConn(null)
          }}
          connectionId={remoteConn}
        />
      )}
    </Card>
  )
}
