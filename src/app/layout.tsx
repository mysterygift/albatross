import { useEffect, useMemo, useRef, useState } from 'react'
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
import { useCurrentProduction } from '@/features/productions/context'
import { DEMO_SLUG } from '@/lib/db/seed/constants'

const DB_PERF_SETTING_KEY = 'enable_db_perf_logging'

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tutorialEntryOpen, setTutorialEntryOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [isPreparingTutorial, setIsPreparingTutorial] = useState(false)
  const [tutorialStartupError, setTutorialStartupError] = useState<string | null>(null)
  const [completionToast, setCompletionToast] = useState<string | null>(null)
  const {
    isLoading: tutorialLoading,
    showFirstLaunchTutorial,
    completeFirstLaunchTutorial,
    resetFirstLaunchTutorial,
    skipEntryModal,
    progress,
    updateProgress,
  } = useFirstLaunchTutorial()
  const { setCurrentProductionId, currentProduction } = useCurrentProduction()
  const isDemoProductionCurrent = currentProduction?.slug === DEMO_SLUG

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
    setIsPreparingTutorial(false)
    setTutorialEntryOpen(false)
    setTutorialOpen(true)
  }

  const handleStartTutorial = async () => {
    if (isPreparingTutorial) return
    setTutorialStartupError(null)
    setIsPreparingTutorial(true)
    try {
      await ensureAndOpenDemoProductionForTutorial({
        setCurrentProductionId,
      })
      updateProgress((prev) => ({ ...prev, seenEntryModal: true }))
      setTutorialEntryOpen(false)
      setTutorialOpen(true)
    } catch (err) {
      setTutorialStartupError('Unable to prepare the demo production. Please try again.')
      // Keep the entry modal open so the user can retry.
    } finally {
      setIsPreparingTutorial(false)
    }
  }

  useEffect(() => {
    const state = location.state as { openTutorialHome?: boolean; resetTutorial?: boolean } | null
    if (!state?.openTutorialHome) return
    if (state.resetTutorial) {
      resetFirstLaunchTutorial()
    }
    setTutorialStartupError(null)
    setIsPreparingTutorial(false)
    setTutorialEntryOpen(false)
    setTutorialOpen(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate, resetFirstLaunchTutorial])

  return (
    <SidebarProvider>
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
        onOpenChange={setTutorialOpen}
        progress={progress}
        onProgressChange={updateProgress}
        onSkip={completeFirstLaunchTutorial}
        onReset={() => {
          resetFirstLaunchTutorial()
          setTutorialEntryOpen(false)
          setTutorialOpen(true)
        }}
        isDemoProductionCurrent={isDemoProductionCurrent}
        onOpenDemoProduction={async () => {
          await ensureAndOpenDemoProductionForTutorial({ setCurrentProductionId })
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
