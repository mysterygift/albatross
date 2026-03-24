import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { useApfActions, type ApfActionMessage } from '@/features/productions/useApfActions'
import { useCurrentProduction } from '@/features/productions/context'
import { duplicateLiveBudgetRevisionAsDraft } from '@/lib/db/budgetRevisionService'
import {
  canDuplicateLiveAsDraftFromMenuContext,
  runDuplicateLiveAsDraftFromMenu,
} from '@/features/productions/budgetMenuActions'
import { listBudgetRevisionsByProduction } from '@/lib/db/repositories/budgetRevisions'

export function ApfMenuEventBridge() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentProductionId, setSelectedBudgetRevisionId } = useCurrentProduction()
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [duplicateBusy, setDuplicateBusy] = useState(false)
  const { data: revisions = [] } = useQuery({
    queryKey: ['budget-revisions', currentProductionId],
    queryFn: () => listBudgetRevisionsByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })
  const hasLiveRevision = revisions.some((rev) => rev.is_live)
  const canDuplicateLiveAsDraft = canDuplicateLiveAsDraftFromMenuContext({
    currentProductionId,
    hasLiveRevision,
    isBusy: duplicateBusy,
  })

  const { handleImportApf, handleExportApf } = useApfActions({
    onMessage: (msg: ApfActionMessage) => {
      setBanner({ type: msg.type, message: msg.message })
      window.setTimeout(() => setBanner(null), msg.timeoutMs)
    },
  })

  useEffect(() => {
    invoke('set_budget_duplicate_live_as_draft_enabled', { enabled: canDuplicateLiveAsDraft }).catch(() => {
      /* not running in tauri */
    })
  }, [canDuplicateLiveAsDraft])

  useEffect(() => {
    let unlistenImport: (() => void) | undefined
    let unlistenExport: (() => void) | undefined
    let unlistenNewProject: (() => void) | undefined
    let unlistenOpenSettings: (() => void) | undefined
    let unlistenDuplicateLiveAsDraft: (() => void) | undefined
    let onBrowserDuplicateLiveAsDraft: ((event: Event) => void) | undefined

    const runDuplicateAction = async () => {
      if (duplicateBusy) return
      setDuplicateBusy(true)
      try {
        const result = await runDuplicateLiveAsDraftFromMenu({
          currentProductionId,
          hasLiveRevision,
          isBusy: duplicateBusy,
          duplicateLiveBudgetRevisionAsDraft,
          setSelectedBudgetRevisionId: (productionId, revisionId) =>
            setSelectedBudgetRevisionId(productionId, revisionId),
          invalidateQueries: (queryKey) => queryClient.invalidateQueries({ queryKey }),
        })
        if (result) {
          setBanner({ type: result.type, message: result.message })
          window.setTimeout(() => setBanner(null), result.timeoutMs)
        }
      } finally {
        setDuplicateBusy(false)
      }
    }

    async function mount() {
      try {
        unlistenImport = await listen('albatross-menu-import-project', async () => {
          navigate('/productions')
          await handleImportApf()
        })
        unlistenExport = await listen('albatross-menu-export-project', async () => {
          navigate('/productions')
          await handleExportApf()
        })
        unlistenNewProject = await listen('albatross-menu-new-project', () => {
          navigate('/productions')
          window.dispatchEvent(new Event('albatross-open-new-production-dialog'))
        })
        unlistenOpenSettings = await listen('albatross-menu-open-settings', () => {
          navigate('/settings')
        })
        unlistenDuplicateLiveAsDraft = await listen('albatross-menu-duplicate-live-as-draft', async () => {
          await runDuplicateAction()
        })
      } catch {
        /* not running in tauri */
      }

      // Browser/dev fallback: allows local dispatch parity with native menu event behavior.
      onBrowserDuplicateLiveAsDraft = () => {
        void runDuplicateAction()
      }
      window.addEventListener('albatross-menu-duplicate-live-as-draft', onBrowserDuplicateLiveAsDraft)
    }

    void mount()
    return () => {
      unlistenImport?.()
      unlistenExport?.()
      unlistenNewProject?.()
      unlistenOpenSettings?.()
      unlistenDuplicateLiveAsDraft?.()
      if (onBrowserDuplicateLiveAsDraft) {
        window.removeEventListener('albatross-menu-duplicate-live-as-draft', onBrowserDuplicateLiveAsDraft)
      }
    }
  }, [
    hasLiveRevision,
    currentProductionId,
    duplicateBusy,
    handleExportApf,
    handleImportApf,
    navigate,
    queryClient,
    setSelectedBudgetRevisionId,
  ])

  if (!banner) return null

  return (
    <div
      role="status"
      className={
        banner.type === 'success'
          ? 'fixed top-4 left-1/2 z-[100] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-mint-500/30 bg-mint-500/10 px-4 py-3 text-sm text-mint-700 shadow-lg dark:text-mint-400'
          : 'fixed top-4 left-1/2 z-[100] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 shadow-lg dark:text-red-400'
      }
    >
      {banner.message}
    </div>
  )
}
