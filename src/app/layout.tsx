import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { TopBar } from '@/components/top-bar'
import { DevPerfHud } from '@/components/dev/DevPerfHud'
import { getSetting } from '@/lib/db/repositories/settings'
import { setPerfLoggingEnabled } from '@/lib/db/perf'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { TutorialHome } from '@/features/tutorial/TutorialHome'
import { TUTORIAL_SECTION_IDS } from '@/features/tutorial/tutorialSections'
import { TutorialEntryModal } from '@/features/tutorial/TutorialEntryModal'
import { ensureAndOpenDemoProductionForTutorial } from '@/features/tutorial/ensureAndOpenDemoProductionForTutorial'
import { ApfDesktopOpenBridge } from '@/features/productions/ApfDesktopOpenBridge'
import { ApfMenuEventBridge } from '@/features/productions/ApfMenuEventBridge'
import { useCurrentProduction } from '@/features/productions/context'
import { DEMO_SLUG } from '@/lib/db/seed/constants'

const DB_PERF_SETTING_KEY = 'enable_db_perf_logging'

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tutorialEntryOpen, setTutorialEntryOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [isPreparingTutorial, setIsPreparingTutorial] = useState(false)
  const [isPreparingTutorialHub, setIsPreparingTutorialHub] = useState(false)
  const [tutorialStartupError, setTutorialStartupError] = useState<string | null>(null)
  const [tutorialHubError, setTutorialHubError] = useState<string | null>(null)
  const [completionToast, setCompletionToast] = useState<string | null>(null)
  const {
    isLoading: tutorialLoading,
    showFirstLaunchTutorial,
    resetFirstLaunchTutorial,
    skipEntryModal,
    progress,
    updateProgress,
  } = useFirstLaunchTutorial()
  const { setCurrentProductionId, currentProduction, refetchProductions } = useCurrentProduction()
  const isDemoProductionCurrent = currentProduction?.slug === DEMO_SLUG

  const prepareDemoForTutorialHub = useCallback(async () => {
    await ensureAndOpenDemoProductionForTutorial({ setCurrentProductionId })
    await queryClient.invalidateQueries({ queryKey: ['productions'] })
    await queryClient.invalidateQueries({ queryKey: ['crew'] })
    await queryClient.invalidateQueries({ queryKey: ['people'] })
    await queryClient.invalidateQueries({ queryKey: ['deliverables'] })
    await refetchProductions()
  }, [queryClient, refetchProductions, setCurrentProductionId])

  const allComplete = useMemo(() => {
    if (!progress) return false
    return TUTORIAL_SECTION_IDS.every((id) => progress.sections[id] === 'complete')
  }, [progress])

  const prevAllCompleteRef = useRef<boolean>(false)
  useEffect(() => {
    const prev = prevAllCompleteRef.current
    prevAllCompleteRef.current = allComplete
    if (!prev && allComplete) {
      setCompletionToast('All core tutorial sections completed.')
    }
  }, [allComplete])

  useEffect(() => {
    if (!completionToast) return
    const t = setTimeout(() => setCompletionToast(null), 3200)
    return () => clearTimeout(t)
  }, [completionToast])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    getSetting(DB_PERF_SETTING_KEY)
      .then((v) => setPerfLoggingEnabled(v !== 'false'))
      .catch(() => {})
  }, [])

  // First launch: show entry modal only when eligible and user has not yet skipped/started from it.
  // Require progress to be loaded so we don't flash entry modal before state is ready.
  useEffect(() => {
    if (tutorialLoading || progress == null) return
    if (!showFirstLaunchTutorial) return
    if (progress.seenEntryModal) return
    setTutorialStartupError(null)
    setIsPreparingTutorial(false)
    setTutorialOpen(false)
    setTutorialEntryOpen(true)
  }, [tutorialLoading, showFirstLaunchTutorial, progress])

  const handleOpenTutorialFromHelp = () => {
    setTutorialStartupError(null)
    setTutorialHubError(null)
    setIsPreparingTutorial(false)
    setTutorialEntryOpen(false)
    setTutorialOpen(true)
  }

  const handleStartTutorial = async () => {
    if (isPreparingTutorial) return
    setTutorialStartupError(null)
    setIsPreparingTutorial(true)
    try {
      await prepareDemoForTutorialHub()
      updateProgress((prev) => ({ ...prev, seenEntryModal: true }))
      setTutorialEntryOpen(false)
      setTutorialOpen(true)
    } catch {
      setTutorialStartupError('Unable to prepare the demo production. Please try again.')
      // Keep the entry modal open so the user can retry.
    } finally {
      setIsPreparingTutorial(false)
    }
  }

  const handleBeforeTutorialSectionNavigate = useCallback(async () => {
    setTutorialHubError(null)
    try {
      await prepareDemoForTutorialHub()
      return true
    } catch {
      setTutorialHubError('Unable to prepare the demo production. Please try again.')
      return false
    }
  }, [prepareDemoForTutorialHub])

  useEffect(() => {
    const state = location.state as { openTutorialHome?: boolean; resetTutorial?: boolean } | null
    if (!state?.openTutorialHome) return

    const shouldReset = !!state.resetTutorial
    navigate(location.pathname, { replace: true, state: {} })

    let cancelled = false
    setTutorialStartupError(null)
    setIsPreparingTutorial(false)
    setTutorialEntryOpen(false)

    ;(async () => {
      if (shouldReset) {
        resetFirstLaunchTutorial()
        setTutorialHubError(null)
        setIsPreparingTutorialHub(true)
        try {
          await prepareDemoForTutorialHub()
        } catch {
          if (!cancelled) {
            setTutorialHubError('Unable to prepare the demo production. Please try again.')
          }
        } finally {
          // Always clear loading: effect cleanup sets cancelled before await finishes (e.g. Strict Mode
          // or dependency churn). Skipping this left isPreparingTutorialHub stuck true forever.
          setIsPreparingTutorialHub(false)
        }
      }
      if (!cancelled) {
        setTutorialOpen(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [location.pathname, location.state, navigate, prepareDemoForTutorialHub, resetFirstLaunchTutorial])

  return (
    <SidebarProvider>
      <ApfDesktopOpenBridge />
      <ApfMenuEventBridge />
      <AppSidebar />
      <SidebarInset>
        <TopBar onOpenTutorial={handleOpenTutorialFromHelp} />
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </SidebarInset>
      <DevPerfHud />
      <TutorialEntryModal
        open={tutorialEntryOpen}
        isPreparing={isPreparingTutorial}
        error={tutorialStartupError}
        onOpenChange={(open) => {
          if (!open) {
            setTutorialEntryOpen(false)
          }
        }}
        onSkipForNow={() => {
          skipEntryModal()
          setTutorialEntryOpen(false)
        }}
        onStartTutorial={handleStartTutorial}
      />
      <TutorialHome
        open={tutorialOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTutorialHubError(null)
          }
          setTutorialOpen(open)
        }}
        progress={progress}
        onProgressChange={updateProgress}
        isPreparingDemo={isPreparingTutorialHub}
        tutorialHubError={tutorialHubError}
        onDismissTutorialHubError={() => setTutorialHubError(null)}
        onBeforeSectionNavigate={handleBeforeTutorialSectionNavigate}
        isDemoProductionCurrent={isDemoProductionCurrent}
        onOpenDemoProduction={async () => {
          setTutorialHubError(null)
          try {
            await prepareDemoForTutorialHub()
          } catch {
            setTutorialHubError('Unable to prepare the demo production. Please try again.')
          }
        }}
      />
      {completionToast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground shadow-lg"
        >
          {completionToast}
        </div>
      )}
    </SidebarProvider>
  )
}
