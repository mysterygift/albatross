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
import {
  getAcceleratorConflicts,
  menuCommandTargets,
  resolveMenuSectionForPath,
  RUN_MENU_COMMAND_EVENT,
  type RunMenuCommandDetail,
} from '@/app/menuSchema'
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
    const pendingUnlisten: Array<() => void> = []

    const runDuplicateAction = async () => {
      if (duplicateBusy) return
      setDuplicateBusy(true)
      try {
        // Read revisions at run time: the command can arrive before this component's query has
        // loaded, and a stale `hasLiveRevision` would wrongly report "no live revision".
        const latestRevisions = currentProductionId
          ? await queryClient
              .ensureQueryData({
                queryKey: ['budget-revisions', currentProductionId],
                queryFn: () => listBudgetRevisionsByProduction(currentProductionId),
              })
              .catch(() => null)
          : null
        const liveRevisionExists = latestRevisions ? latestRevisions.some((rev) => rev.is_live) : hasLiveRevision
        const result = await runDuplicateLiveAsDraftFromMenu({
          currentProductionId,
          hasLiveRevision: liveRevisionExists,
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

    // One handler per native menu event name. The native menu (desktop) reaches these through Tauri
    // events; the in-app actions menu (iOS, browser) reaches the same handlers via RUN_MENU_COMMAND_EVENT.
    const handlers = new Map<string, () => void | Promise<void>>()
    handlers.set('albatross-menu-import-project', async () => {
      navigate('/productions')
      await handleImportApf()
    })
    handlers.set('albatross-menu-export-project', async () => {
      navigate('/productions')
      await handleExportApf()
    })
    handlers.set('albatross-menu-new-project', () => {
      navigate('/productions')
      window.dispatchEvent(new Event('albatross-open-new-production-dialog'))
    })
    handlers.set('albatross-menu-open-settings', () => {
      navigate('/settings')
    })
    handlers.set('albatross-menu-logout', async () => {
      const db = await getDb()
      await clearPersistedAuthSession(db)
      await queryClient.invalidateQueries({ queryKey: ['auth-session'] })
    })
    handlers.set('albatross-menu-duplicate-live-as-draft', async () => {
      await runDuplicateAction()
    })
    handlers.set('albatross-menu-publish-to-server', () => {
      navigate('/productions')
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event('albatross-menu-publish-to-server'))
      })
    })
    for (const [id, target] of Object.entries(menuCommandTargets)) {
      // new_project is handled above (identical behaviour via the same table entry).
      if (id === 'new_project') continue
      if (target.browserEvent) {
        const browserEvent = target.browserEvent
        handlers.set(target.eventName, () => {
          if (target.to) navigate(target.to)
          window.dispatchEvent(new Event(browserEvent))
        })
      } else if (target.to) {
        const to = target.to
        handlers.set(target.eventName, () => navigate(to))
      }
    }
    handlers.set('albatross-menu-view-toggle-sidebar', () => {
      window.dispatchEvent(new Event('albatross-menu-view-toggle-sidebar'))
    })

    const onRunMenuCommand = (event: Event) => {
      const eventName = (event as CustomEvent<RunMenuCommandDetail>).detail?.eventName
      const handler = eventName ? handlers.get(eventName) : undefined
      if (handler) void handler()
    }
    window.addEventListener(RUN_MENU_COMMAND_EVENT, onRunMenuCommand)

    // Browser/dev fallback: allows local dispatch parity with native menu event behavior.
    const onBrowserDuplicateLiveAsDraft = () => {
      void runDuplicateAction()
    }
    window.addEventListener('albatross-menu-duplicate-live-as-draft', onBrowserDuplicateLiveAsDraft)

    async function mount() {
      try {
        for (const [eventName, handler] of handlers) {
          const unlisten = await listen(eventName, () => void handler())
          if (cancelled) {
            unlisten()
            return
          }
          pendingUnlisten.push(unlisten)
        }
      } catch {
        /* not running in tauri */
      }
    }

    void mount()
    return () => {
      cancelled = true
      pendingUnlisten.forEach((u) => u())
      window.removeEventListener(RUN_MENU_COMMAND_EVENT, onRunMenuCommand)
      window.removeEventListener('albatross-menu-duplicate-live-as-draft', onBrowserDuplicateLiveAsDraft)
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
