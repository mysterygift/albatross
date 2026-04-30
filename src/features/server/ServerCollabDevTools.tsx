import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useCurrentProduction } from '@/features/productions/context'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import { listPublishJobsForDev } from '@/lib/server/publishJobRepository'
import { runServerSyncOnce } from '@/lib/server/syncEngine'
import { listPendingForProduction } from '@/lib/server/serverOutboxRepository'

const DEV_OFFLINE_KEY = 'dev_simulate_server_offline'

export function ServerCollabDevTools() {
  const qc = useQueryClient()
  const { currentProductionId } = useCurrentProduction()

  const offlineQuery = useQuery({
    queryKey: ['settings', DEV_OFFLINE_KEY],
    queryFn: async () => (await getSetting(DEV_OFFLINE_KEY)) === 'true',
  })

  const jobsQuery = useQuery({
    queryKey: ['dev-server-publish-jobs'],
    queryFn: () => listPublishJobsForDev(40),
  })

  const outboxQuery = useQuery({
    queryKey: ['dev-server-outbox', currentProductionId],
    queryFn: () => (currentProductionId ? listPendingForProduction(currentProductionId) : []),
    enabled: !!currentProductionId,
  })

  const toggleOffline = useMutation({
    mutationFn: async (on: boolean) => {
      await setSetting(DEV_OFFLINE_KEY, on ? 'true' : 'false')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', DEV_OFFLINE_KEY] }),
  })

  const replayOutbox = useMutation({
    mutationFn: async () => {
      if (!currentProductionId) return { processed: 0, failed: 0 }
      return runServerSyncOnce(currentProductionId)
    },
    onSuccess: () => {
      void qc.invalidateQueries()
    },
  })

  return (
    <div className="rounded-md border border-border bg-card/40 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Server collaboration (dev)</h3>
        <p className="text-muted-foreground text-xs mt-1">
          Simulate offline, inspect publish jobs, and replay the server outbox for the current production.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="dev-sim-offline"
          checked={!!offlineQuery.data}
          onChange={(e) => toggleOffline.mutate(e.target.checked)}
          disabled={toggleOffline.isPending}
          className="rounded border-amber-600"
        />
        <Label htmlFor="dev-sim-offline" className="font-medium text-amber-800 dark:text-amber-200 text-sm">
          Simulate server offline (all serverFetchJson calls fail)
        </Label>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!currentProductionId || replayOutbox.isPending}
          onClick={() => replayOutbox.mutate()}
        >
          {replayOutbox.isPending ? 'Replaying…' : 'Replay server outbox (current production)'}
        </Button>
        {replayOutbox.data != null && (
          <span className="text-xs text-muted-foreground">
            Processed {replayOutbox.data.processed}, failed {replayOutbox.data.failed}
          </span>
        )}
      </div>

      {currentProductionId && (
        <div className="text-xs space-y-1">
          <p className="font-medium">Pending outbox rows ({outboxQuery.data?.length ?? 0})</p>
          <ul className="max-h-28 overflow-auto rounded border border-border bg-background/60 p-2 font-mono">
            {(outboxQuery.data ?? []).slice(0, 20).map((r) => (
              <li key={r.id}>
                {r.operation} {r.entity_table} {(r.entity_id ?? '').slice(0, 8)}
                {r.entity_id && r.entity_id.length > 8 ? '…' : ''} tries={r.tries}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs space-y-1">
        <p className="font-medium">Recent publish jobs (local mirror)</p>
        <ul className="max-h-36 overflow-auto rounded border border-border bg-background/60 p-2 font-mono">
          {(jobsQuery.data ?? []).map((j) => (
            <li key={j.id}>
              {j.status} · prod {(j.production_id ?? '').slice(0, 8)}
              {j.production_id && j.production_id.length > 8 ? '…' : ''} · {new Date(j.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
