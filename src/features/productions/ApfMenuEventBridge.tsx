import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { toast } from '@/components/ui/sonner'
import { invoke } from '@tauri-apps/api/core'
import { useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'

import { useApfActions, type ApfActionMessage } from '@/features/productions/useApfActions'
import { useCurrentProduction } from '@/features/productions/context'
import { duplicateLiveBudgetRevisionAsDraft } from '@/lib/db/budgetRevisionService'
import {
  canDuplicateLiveAsDraftFromMenuContext,
  runDuplicateLiveAsDraftFromMenu,
} from '@/features/productions/budgetMenuActions'
import { listBudgetRevisionsByProduction } from '@/lib/db/repositories/budgetRevisions'
import { getAcceleratorConflicts, menuCommandTargets, resolveMenuSectionForPath } from '@/app/menuSchema'
import { clearPersistedAuthSession } from '@/lib/auth/authService'
import { getDb } from '@/lib/db/client'

export function ApfMenuEventBridge() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { currentProductionId, setSelectedBudgetRevisionId } = useCurrentProduction()
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
      toast[msg.type](msg.message, { duration: msg.timeoutMs })
    },
  })

  useEffect(() => {
    const section = resolveMenuSectionForPath(location.pathname)
    const conflicts = getAcceleratorConflicts(section)
    if (conflicts.length > 0 && import.meta.env.DEV) {
      // Helpful guard while we iterate on command mappings.
      console.warn('Menu accelerator conflicts detected:', conflicts)
    }
    invoke('set_active_menu_section', { section }).catch(() => {
      /* not running in tauri */
    })
  }, [location.pathname])

  useEffect(() => {
    invoke('set_budget_duplicate_live_as_draft_enabled', { enabled: canDuplicateLiveAsDraft }).catch(() => {
      /* not running in tauri */
    })
  }, [canDuplicateLiveAsDraft])

  useEffect(() => {
    let cancelled = false
    let unlistenImport: (() => void) | undefined
    let unlistenExport: (() => void) | undefined
    let unlistenNewProject: (() => void) | undefined
    let unlistenOpenSettings: (() => void) | undefined
    let unlistenLogout: (() => void) | undefined
    let unlistenDuplicateLiveAsDraft: (() => void) | undefined
    let unlistenPublishToServer: (() => void) | undefined
    const unlistenCommands: Array<() => void> = []
    const pendingUnlisten: Array<() => void> = []
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
          toast[result.type](result.message, { duration: result.timeoutMs })
        }
      } finally {
        setDuplicateBusy(false)
      }
    }

    async function registerListener(
      eventName: string,
      handler: Parameters<typeof listen>[1],
      sink?: Array<() => void>,
    ) {
      const unlisten = await listen(eventName, handler)
      if (cancelled) {
        unlisten()
        return undefined
      }
      pendingUnlisten.push(unlisten)
      if (sink) sink.push(unlisten)
      return unlisten
    }

    async function mount() {
      try {
        unlistenImport = await registerListener('albatross-menu-import-project', async () => {
          navigate('/productions')
          await handleImportApf()
        })
        unlistenExport = await registerListener('albatross-menu-export-project', async () => {
          navigate('/productions')
          await handleExportApf()
        })
        unlistenNewProject = await registerListener('albatross-menu-new-project', () => {
          navigate('/productions')
          window.dispatchEvent(new Event('albatross-open-new-production-dialog'))
        })
        unlistenOpenSettings = await registerListener('albatross-menu-open-settings', () => {
          navigate('/settings')
        })
        unlistenLogout = await registerListener('albatross-menu-logout', async () => {
          const db = await getDb()
          await clearPersistedAuthSession(db)
          await queryClient.invalidateQueries({ queryKey: ['auth-session'] })
        })
        unlistenDuplicateLiveAsDraft = await registerListener('albatross-menu-duplicate-live-as-draft', async () => {
          await runDuplicateAction()
        })
        unlistenPublishToServer = await registerListener('albatross-menu-publish-to-server', () => {
          navigate('/productions')
          window.requestAnimationFrame(() => {
            window.dispatchEvent(new Event('albatross-menu-publish-to-server'))
          })
        })

        const bindNavigateCommand = async (eventName: string, to: string) => {
          await registerListener(eventName, () => navigate(to), unlistenCommands)
        }
        const bindDispatchCommand = async (eventName: string, browserEventName: string, to?: string) => {
          await registerListener(eventName, () => {
            if (to) navigate(to)
            window.dispatchEvent(new Event(browserEventName))
          }, unlistenCommands)
        }

        for (const [id, target] of Object.entries(menuCommandTargets)) {
          // new_project is handled above (identical behaviour via the same table entry).
          if (id === 'new_project') continue
          if (target.browserEvent) {
            await bindDispatchCommand(target.eventName, target.browserEvent, target.to)
          } else if (target.to) {
            await bindNavigateCommand(target.eventName, target.to)
          }
        }
        await bindDispatchCommand('albatross-menu-view-toggle-sidebar', 'albatross-menu-view-toggle-sidebar')
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
      cancelled = true
      unlistenImport?.()
      unlistenExport?.()
      unlistenNewProject?.()
      unlistenOpenSettings?.()
      unlistenLogout?.()
      unlistenDuplicateLiveAsDraft?.()
      unlistenPublishToServer?.()
      unlistenCommands.forEach((u) => u())
      pendingUnlisten.forEach((u) => u())
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

  return null
}
