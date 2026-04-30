import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
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
import { getAcceleratorConflicts, resolveMenuSectionForPath } from '@/app/menuSchema'
import { clearPersistedAuthSession } from '@/lib/auth/authService'
import { getDb } from '@/lib/db/client'

export function ApfMenuEventBridge() {
  const navigate = useNavigate()
  const location = useLocation()
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
          setBanner({ type: result.type, message: result.message })
          window.setTimeout(() => setBanner(null), result.timeoutMs)
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

        const bindNavigateCommand = async (eventName: string, to: string) => {
          await registerListener(eventName, () => navigate(to), unlistenCommands)
        }
        const bindDispatchCommand = async (eventName: string, browserEventName: string, to?: string) => {
          await registerListener(eventName, () => {
            if (to) navigate(to)
            window.dispatchEvent(new Event(browserEventName))
          }, unlistenCommands)
        }

        await bindNavigateCommand('albatross-menu-view-go-dashboard', '/')
        await bindNavigateCommand('albatross-menu-view-go-productions', '/productions')
        await bindNavigateCommand('albatross-menu-view-go-budget', '/budget')
        await bindNavigateCommand('albatross-menu-view-go-schedule', '/schedule/calendar')
        await bindNavigateCommand('albatross-menu-view-go-people', '/people/bookings')
        await bindNavigateCommand('albatross-menu-view-go-locations', '/locations')
        await bindNavigateCommand('albatross-menu-view-go-documents', '/documents')
        await bindNavigateCommand('albatross-menu-view-go-deliverables', '/deliverables')
        await bindNavigateCommand('albatross-menu-view-go-tasks', '/readiness')
        await bindDispatchCommand('albatross-menu-view-toggle-sidebar', 'albatross-menu-view-toggle-sidebar')

        await bindDispatchCommand(
          'albatross-menu-people-add-cast',
          'albatross-menu-people-add-cast',
          '/people/cast-manager',
        )
        await bindDispatchCommand(
          'albatross-menu-people-add-crew',
          'albatross-menu-people-add-crew',
          '/people/crew-manager',
        )
        await bindDispatchCommand(
          'albatross-menu-people-add-booking',
          'albatross-menu-people-add-booking',
          '/people/bookings',
        )
        await bindNavigateCommand('albatross-menu-people-open-cast-manager', '/people/cast-manager')
        await bindNavigateCommand('albatross-menu-people-open-crew-manager', '/people/crew-manager')

        await bindDispatchCommand('albatross-menu-budget-log-spend', 'albatross-menu-budget-log-spend', '/budget')
        await bindDispatchCommand('albatross-menu-budget-add-line-item', 'albatross-menu-budget-add-line-item', '/budget')
        await bindDispatchCommand(
          'albatross-menu-budget-manage-revisions',
          'albatross-menu-budget-manage-revisions',
          '/budget',
        )
        await bindDispatchCommand('albatross-menu-budget-export-csv', 'albatross-menu-budget-export-csv', '/budget')

        await bindDispatchCommand(
          'albatross-menu-schedule-new-shoot-day',
          'albatross-menu-schedule-new-shoot-day',
          '/schedule/stripboard',
        )
        await bindDispatchCommand(
          'albatross-menu-schedule-add-strip',
          'albatross-menu-schedule-add-strip',
          '/schedule/stripboard',
        )
        await bindNavigateCommand('albatross-menu-schedule-open-stripboard', '/schedule/stripboard')
        await bindNavigateCommand('albatross-menu-schedule-open-shot-list', '/schedule/shots')
        await bindNavigateCommand('albatross-menu-schedule-parse-script-scenes', '/schedule/script-import')
        await bindDispatchCommand(
          'albatross-menu-tasks-new-task',
          'albatross-menu-tasks-new-task',
          '/readiness',
        )

        await bindDispatchCommand(
          'albatross-menu-locations-add-location',
          'albatross-menu-locations-add-location',
          '/locations',
        )

        await bindDispatchCommand(
          'albatross-menu-documents-upload-file',
          'albatross-menu-documents-upload-file',
          '/documents',
        )

        await bindDispatchCommand(
          'albatross-menu-deliverables-add-deliverable',
          'albatross-menu-deliverables-add-deliverable',
          '/deliverables',
        )
        await bindDispatchCommand(
          'albatross-menu-deliverables-apply-template',
          'albatross-menu-deliverables-apply-template',
          '/deliverables',
        )
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
