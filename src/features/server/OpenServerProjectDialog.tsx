import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getSetting } from '@/lib/db/repositories/settings'
import { insertShellProductionWithId } from '@/lib/db/repositories/production'
import { serverSessionTokenSettingKey } from '@/lib/server/constants'
import { serverListProjects } from '@/lib/server/serverClient'
import { userMessageForServerError } from '@/lib/server/serverErrors'
import { getServerConnectionById } from '@/lib/server/serverConnectionRepository'
import { upsertLinkedProject } from '@/lib/server/linkedProjectRepository'

export function OpenServerProjectDialog({
  open,
  onOpenChange,
  connectionId,
  onOpened,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  connectionId: string
  onOpened?: (productionId: string) => void
}) {
  const qc = useQueryClient()
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !connectionId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const conn = await getServerConnectionById(connectionId)
        if (!conn) throw new Error('Connection not found')
        const token = await getSetting(serverSessionTokenSettingKey(connectionId))
        if (!token) throw new Error('Not signed in')
        const list = await serverListProjects(conn.base_url, token)
        if (!cancelled) setProjects(list.map((p) => ({ id: p.id, name: p.name })))
      } catch (e) {
        if (!cancelled) setError(userMessageForServerError(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, connectionId])

  const openMutation = useMutation({
    mutationFn: async (remote: { id: string; name: string }) => {
      await insertShellProductionWithId({ id: remote.id, name: remote.name })
      await upsertLinkedProject({
        production_id: remote.id,
        connection_id: connectionId,
        remote_project_id: remote.id,
        remote_project_url: null,
        link_state: 'linked',
      })
      return remote.id
    },
    onSuccess: (productionId) => {
      qc.invalidateQueries({ queryKey: ['productions'] })
      qc.invalidateQueries({ queryKey: ['linked-project', productionId] })
      onOpenChange(false)
      onOpened?.(productionId)
    },
    onError: (e) => setError(userMessageForServerError(e)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open project from server</DialogTitle>
          <p className="text-muted-foreground text-sm">Choose a project you have access to on this server.</p>
        </DialogHeader>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="max-h-64 space-y-1 overflow-y-auto py-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading &&
            projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => openMutation.mutate(p)}
                disabled={openMutation.isPending}
              >
                {p.name}
              </button>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
