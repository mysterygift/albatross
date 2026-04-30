import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setSetting } from '@/lib/db/repositories/settings'
import { serverSessionTokenSettingKey } from '@/lib/server/constants'
import { serverGetMe, serverListProjects, serverLogin } from '@/lib/server/serverClient'
import { userMessageForServerError } from '@/lib/server/serverErrors'
import { insertServerConnection, touchServerConnectionValidated } from '@/lib/server/serverConnectionRepository'

type WorkspaceOption = { id: string; name: string }

export function ConnectServerDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onConnected?: (connectionId: string) => void
}) {
  const qc = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [tokenOverride, setTokenOverride] = useState('')
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [step, setStep] = useState<'form' | 'workspace'>('form')
  const [session, setSession] = useState<{ token: string; baseUrl: string } | null>(null)

  const probeMutation = useMutation({
    mutationFn: async () => {
      const trimmedUrl = baseUrl.trim()
      let token: string
      if (tokenOverride.trim()) {
        token = tokenOverride.trim()
      } else {
        const login = await serverLogin(trimmedUrl, username.trim(), password)
        token = login.token
      }
      const me = await serverGetMe(trimmedUrl, token)
      await serverListProjects(trimmedUrl, token)
      const wsFromMe = me.workspaces?.map((w) => ({ id: w.id, name: w.name })) ?? []
      const ws: WorkspaceOption[] =
        wsFromMe.length > 0 ? wsFromMe : [{ id: 'default', name: 'Default workspace' }]
      return { token, trimmedUrl, me, ws }
    },
    onSuccess: (data) => {
      setSession({ token: data.token, baseUrl: data.trimmedUrl })
      setWorkspaces(data.ws)
      setWorkspaceId(data.ws[0]?.id ?? 'default')
      setStep('workspace')
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('No session')
      const wid = workspaceId === 'default' ? null : workspaceId || null
      const connectionId = await insertServerConnection({
        display_name: displayName.trim() || 'Server',
        base_url: session.baseUrl,
        workspace_id: wid,
        account_username: tokenOverride.trim() ? 'token' : username.trim(),
      })
      await setSetting(serverSessionTokenSettingKey(connectionId), session.token)
      await touchServerConnectionValidated(connectionId)
      return connectionId
    },
    onSuccess: (connectionId) => {
      qc.invalidateQueries({ queryKey: ['server-connections'] })
      qc.invalidateQueries({ queryKey: ['server-session'] })
      onOpenChange(false)
      reset()
      onConnected?.(connectionId)
    },
  })

  function reset() {
    setStep('form')
    setDisplayName('')
    setBaseUrl('')
    setUsername('')
    setPassword('')
    setTokenOverride('')
    setWorkspaces([])
    setWorkspaceId('')
    setSession(null)
    probeMutation.reset()
    saveMutation.reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect to server</DialogTitle>
          <p className="text-muted-foreground text-sm">
            Sign in to your Albatross collaboration server. Session token is stored only on this device.
          </p>
        </DialogHeader>
        {step === 'form' ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="srv-name">Display name</Label>
              <Input
                id="srv-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Company production server"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="srv-url">Server URL</Label>
              <Input
                id="srv-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://albatross.example.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="srv-user">Username</Label>
              <Input id="srv-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="srv-pass">Password</Label>
              <Input
                id="srv-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="srv-token">Or paste access token (optional)</Label>
              <Input
                id="srv-token"
                value={tokenOverride}
                onChange={(e) => setTokenOverride(e.target.value)}
                placeholder="Skips password login when set"
              />
            </div>
            {probeMutation.isError && (
              <p className="text-destructive text-sm">{userMessageForServerError(probeMutation.error)}</p>
            )}
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  probeMutation.isPending ||
                  !baseUrl.trim() ||
                  (!tokenOverride.trim() && (!username.trim() || !password))
                }
                onClick={() => probeMutation.mutate()}
              >
                {probeMutation.isPending ? 'Validating…' : 'Continue'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Workspace / team</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {saveMutation.isError && (
              <p className="text-destructive text-sm">{userMessageForServerError(saveMutation.error)}</p>
            )}
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep('form')}>
                Back
              </Button>
              <Button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? 'Saving…' : 'Save connection'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
