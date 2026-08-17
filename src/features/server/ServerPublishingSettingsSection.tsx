import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  LEGACY_SERVER_PUBLISH_ENABLED_KEY,
  LOCAL_COLLABORATION_ENABLED_KEY,
  serverSessionTokenSettingKey,
} from '@/lib/server/constants'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import { listServerConnections, deleteServerConnection } from '@/lib/server/serverConnectionRepository'
import { ConnectServerDialog } from '@/features/server/ConnectServerDialog'
import { OpenServerProjectDialog } from '@/features/server/OpenServerProjectDialog'
import { useLocalCollaborationEnabled } from '@/hooks/useServerPublishEnabled'

export function ServerPublishingSettingsSection() {
  const qc = useQueryClient()
  const [connectOpen, setConnectOpen] = useState(false)
  const [openRemote, setOpenRemote] = useState(false)
  const [remoteConn, setRemoteConn] = useState<string | null>(null)

  const featureQuery = useLocalCollaborationEnabled()
  const legacyBetaQuery = useQuery({
    queryKey: ['settings', LEGACY_SERVER_PUBLISH_ENABLED_KEY],
    queryFn: async () => (await getSetting(LEGACY_SERVER_PUBLISH_ENABLED_KEY)) === 'true',
  })

  const connsQuery = useQuery({
    queryKey: ['server-connections'],
    queryFn: listServerConnections,
    enabled: !!featureQuery.data,
  })

  const toggleFeature = useMutation({
    mutationFn: async (on: boolean) => {
      await setSetting(LOCAL_COLLABORATION_ENABLED_KEY, on ? 'true' : 'false')
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['settings', LOCAL_COLLABORATION_ENABLED_KEY] }),
        qc.invalidateQueries({ queryKey: ['settings', 'legacy-server-runtime-enabled'] }),
        qc.invalidateQueries({ queryKey: ['effective-data-source'] }),
        qc.invalidateQueries({ queryKey: ['ds'] }),
      ])
    },
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
        <CardTitle>Local collaboration (Pilot)</CardTitle>
        <CardDescription>
          Sync with an Albatross collaboration server on this network. Enabling collaboration does not start a local server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="local-collaboration-enabled"
            checked={!!featureQuery.data}
            onChange={(e) => toggleFeature.mutate(e.target.checked)}
            disabled={toggleFeature.isPending}
            className="rounded border-border"
          />
          <Label htmlFor="local-collaboration-enabled">Enable local collaboration on this device</Label>
        </div>
        {featureQuery.data && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setConnectOpen(true)}>
                Add server connection…
              </Button>
              {legacyBetaQuery.data && (
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
                  Open legacy server project…
                </Button>
              )}
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
