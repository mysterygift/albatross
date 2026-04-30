import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { appDataDir, join } from '@tauri-apps/api/path'
import { mkdir, readFile, remove } from '@tauri-apps/plugin-fs'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getSetting } from '@/lib/db/repositories/settings'
import { getDb, uuid } from '@/lib/db/client'
import {
  exportProductionForPostgresPublish,
  exportProductionForPostgresPublishForActor,
} from '@/lib/publish/exportPublishPackage'
import { serverSessionTokenSettingKey } from '@/lib/server/constants'
import {
  serverCommitPublishJob,
  serverCreatePublishJob,
  serverGetPublishJob,
  serverUploadPublishPackage,
} from '@/lib/server/serverClient'
import { userMessageForServerError } from '@/lib/server/serverErrors'
import { getServerConnectionById } from '@/lib/server/serverConnectionRepository'
import { insertPublishJob, updatePublishJobProgress } from '@/lib/server/publishJobRepository'
import {
  deleteLinkedProject,
  upsertLinkedProject,
  updateLinkedProjectState,
} from '@/lib/server/linkedProjectRepository'
import { CURRENT_PUBLISH_FORMAT_VERSION } from '@/lib/publish/constants'
import { useAuthSession } from '@/lib/auth/useAuthSession'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  productionId: string
  productionName: string
  connectionId: string
  onDone?: () => void
}

export function PreflightPublishSheet({
  open,
  onOpenChange,
  productionId,
  productionName,
  connectionId,
  onDone,
}: Props) {
  const qc = useQueryClient()
  const authSession = useAuthSession()
  const [phase, setPhase] = useState<'idle' | 'exporting' | 'uploading' | 'committing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ assetCount: number; totalBytes: number } | null>(null)
  const [successUrl, setSuccessUrl] = useState<string | null>(null)

  const runMutation = useMutation({
    mutationFn: async () => {
      setError(null)
      setPhase('exporting')
      setMessage('Building publish package…')
      const conn = await getServerConnectionById(connectionId)
      if (!conn) throw new Error('Connection not found')
      const token = await getSetting(serverSessionTokenSettingKey(connectionId))
      if (!token) throw new Error('Not signed in to this server')

      const baseDir = await appDataDir()
      const dir = await join(baseDir, 'publish-temp')
      await mkdir(dir, { recursive: true })
      const outPath = await join(dir, `publish-${productionId}-${uuid()}.zip`)

      let exportResult: { outputPath: string; assetCount: number; tableRowCounts: Record<string, number> }
      if (authSession.authSupported && authSession.currentUser) {
        const db = await getDb()
        exportResult = await exportProductionForPostgresPublishForActor({
          db,
          actor: authSession.currentUser,
          productionId,
          outputPath: outPath,
        })
      } else {
        exportResult = await exportProductionForPostgresPublish(productionId, outPath)
      }

      const bytes = new Uint8Array(await readFile(exportResult.outputPath))
      setSummary({ assetCount: exportResult.assetCount, totalBytes: bytes.byteLength })
      setPhase('uploading')
      setMessage('Creating publish job…')

      const job = await serverCreatePublishJob(conn.base_url, token, {
        productionId,
        productionName,
        formatVersion: CURRENT_PUBLISH_FORMAT_VERSION,
        assetCount: exportResult.assetCount,
        tableRowCounts: exportResult.tableRowCounts,
      })
      const jobId = (job as { id: string }).id
      await insertPublishJob({
        id: jobId,
        production_id: productionId,
        connection_id: connectionId,
        status: 'uploading',
        progress_stage: 'upload',
        progress_message: 'Uploading package',
        total_bytes: bytes.byteLength,
      })
      await updateLinkedProjectState(productionId, 'publishing')

      await serverUploadPublishPackage(conn.base_url, token, jobId, bytes, 'publish-package.zip', (u, t) => {
        void updatePublishJobProgress(jobId, { uploaded_bytes: u, total_bytes: t })
      })

      setPhase('committing')
      setMessage('Importing on server…')
      await serverCommitPublishJob(conn.base_url, token, jobId)

      const deadline = Date.now() + 120_000
      let status = await serverGetPublishJob(conn.base_url, token, jobId)
      while (status.status !== 'succeeded' && status.status !== 'failed' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 800))
        status = await serverGetPublishJob(conn.base_url, token, jobId)
      }
      if (status.status === 'failed') {
        throw new Error(status.error?.message ?? 'Publish failed on server')
      }

      const remoteId = status.remoteProjectId ?? productionId
      const url = status.remoteProjectUrl ?? `${conn.base_url}/projects/${remoteId}`
      await upsertLinkedProject({
        production_id: productionId,
        connection_id: connectionId,
        remote_project_id: remoteId,
        remote_project_url: url,
        link_state: 'linked',
      })
      await updatePublishJobProgress(jobId, {
        status: 'succeeded',
        finished_at: new Date().toISOString(),
        progress_message: 'Done',
      })
      setSuccessUrl(url)
      try {
        await remove(exportResult.outputPath)
      } catch {
        /* ignore */
      }
      return url
    },
    onSuccess: () => {
      setPhase('done')
      setMessage('Published successfully.')
      qc.invalidateQueries({ queryKey: ['productions'] })
      qc.invalidateQueries({ queryKey: ['linked-project'] })
      onDone?.()
    },
    onError: (e) => {
      setPhase('error')
      setError(userMessageForServerError(e))
      void deleteLinkedProject(productionId).catch(() => {})
    },
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Publish to server</SheetTitle>
          <p className="text-muted-foreground text-sm">
            {productionName} — review what will be uploaded, then confirm.
          </p>
        </SheetHeader>
        <div className="space-y-4 py-4">
          {summary && phase !== 'error' && (
            <ul className="text-sm space-y-1 list-disc pl-4">
              <li>Attachments / assets: {summary.assetCount} files</li>
              <li>Approximate package size: {(summary.totalBytes / (1024 * 1024)).toFixed(2)} MB</li>
            </ul>
          )}
          {phase === 'idle' && (
            <p className="text-sm text-muted-foreground">
              The next step builds a ZIP from your local project (strict attachment checks). You can cancel before upload starts.
            </p>
          )}
          {(phase === 'exporting' || phase === 'uploading' || phase === 'committing') && (
            <p className="text-sm">{message}</p>
          )}
          {phase === 'done' && successUrl && (
            <div className="space-y-2 text-sm">
              <p>{message}</p>
              <p>
                <span className="text-muted-foreground">Shared URL: </span>
                <code className="text-xs break-all">{successUrl}</code>
              </p>
            </div>
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <SheetFooter className="flex flex-row gap-2">
          {phase === 'idle' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
                Build &amp; upload
              </Button>
            </>
          )}
          {phase === 'done' && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
          {phase === 'error' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setPhase('idle')
                  setError(null)
                  setSummary(null)
                }}
              >
                Try again
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
