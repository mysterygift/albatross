import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { useCurrentProduction } from '@/features/productions/context'
import { getLinkedProjectByProductionId } from '@/lib/server/linkedProjectRepository'
import { getQueuedMutationCount, runServerSyncOnce } from '@/lib/server/syncEngine'
import { resolveServerPublishContext } from '@/lib/db/projectDataSource'
import { subscribePresence } from '@/lib/server/presenceClient'
import { useServerPublishEnabled } from '@/hooks/useServerPublishEnabled'

const AUTO_SYNC_MS = 25_000

function linkedStatesForRuntime(
  st: string | undefined,
): st is 'linked' | 'offline' | 'conflict' {
  return st === 'linked' || st === 'offline' || st === 'conflict'
}

export function ServerCollabBanner() {
  const { currentProductionId } = useCurrentProduction()
  const feature = useServerPublishEnabled()
  const qc = useQueryClient()
  const [online, setOnline] = useState<number | null>(null)

  const linkedQuery = useQuery({
    queryKey: ['linked-project', currentProductionId],
    queryFn: () => (currentProductionId ? getLinkedProjectByProductionId(currentProductionId) : null),
    enabled: !!currentProductionId && !!feature.data,
  })

  const pendingQuery = useQuery({
    queryKey: ['server-outbox-count', currentProductionId],
    queryFn: () => (currentProductionId ? getQueuedMutationCount(currentProductionId) : 0),
    enabled: !!currentProductionId && !!linkedQuery.data && linkedStatesForRuntime(linkedQuery.data.link_state),
    refetchInterval: 5000,
  })

  useEffect(() => {
    if (!currentProductionId || !feature.data || !linkedQuery.data) return
    let unsub: (() => void) | undefined
    ;(async () => {
      const ctx = await resolveServerPublishContext(currentProductionId)
      if (!ctx) return
      unsub = subscribePresence({
        baseUrl: ctx.baseUrl,
        token: ctx.token,
        remoteProjectId: ctx.remoteProjectId,
        onCount: setOnline,
        onError: () => setOnline(null),
      })
    })()
    return () => {
      unsub?.()
      setOnline(null)
    }
  }, [currentProductionId, feature.data, linkedQuery.data])

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!currentProductionId) return
      await runServerSyncOnce(currentProductionId)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['server-outbox-count', currentProductionId] })
      void qc.invalidateQueries({ queryKey: ['linked-project', currentProductionId] })
      void qc.invalidateQueries()
    },
  })

  useEffect(() => {
    if (!currentProductionId || !feature.data || !linkedQuery.data) return
    if (!linkedStatesForRuntime(linkedQuery.data.link_state)) return

    const onOnline = () => {
      void runServerSyncOnce(currentProductionId).then(() => {
        void qc.invalidateQueries({ queryKey: ['server-outbox-count', currentProductionId] })
        void qc.invalidateQueries({ queryKey: ['linked-project', currentProductionId] })
        void qc.invalidateQueries()
      })
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [currentProductionId, feature.data, linkedQuery.data, qc])

  useEffect(() => {
    if (!currentProductionId || !feature.data || !linkedQuery.data) return
    if (linkedQuery.data.link_state !== 'linked') return

    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void runServerSyncOnce(currentProductionId).then(() => {
        void qc.invalidateQueries({ queryKey: ['server-outbox-count', currentProductionId] })
        void qc.invalidateQueries()
      })
    }, AUTO_SYNC_MS)
    return () => window.clearInterval(id)
  }, [currentProductionId, feature.data, linkedQuery.data?.link_state, qc])

  if (!feature.data || !linkedQuery.data || linkedQuery.data.link_state === 'publishing') return null

  const st = linkedQuery.data.link_state
  const queued = pendingQuery.data ?? 0

  return (
    <div className="border-b bg-muted/30 px-4 py-2 text-sm flex flex-wrap items-center gap-3">
      {st === 'offline' && (
        <span className="text-amber-700 dark:text-amber-300">
          Offline{queued > 0 ? ` · ${queued} queued change(s)` : ''}
        </span>
      )}
      {st === 'linked' && queued > 0 && (
        <span className="text-muted-foreground">{queued} change(s) queued for sync</span>
      )}
      {st === 'conflict' && (
        <span className="text-destructive font-medium">
          Editing conflict — reload the latest data from the server before continuing.
        </span>
      )}
      {st === 'linked' && online != null && online > 0 && (
        <span className="text-muted-foreground">{online} collaborator(s) online</span>
      )}
      {(st === 'linked' || st === 'offline' || st === 'conflict') && (
        <Button size="sm" variant="outline" disabled={syncMutation.isPending} onClick={() => syncMutation.mutate()}>
          {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
      )}
    </div>
  )
}
