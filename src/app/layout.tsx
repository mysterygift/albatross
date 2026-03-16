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

const DB_PERF_SETTING_KEY = 'enable_db_perf_logging'

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [completionToast, setCompletionToast] = useState<string | null>(null)
  const {
    isLoading: tutorialLoading,
    showFirstLaunchTutorial,
    completeFirstLaunchTutorial,
    resetFirstLaunchTutorial,
    progress,
    updateProgress,
  } = useFirstLaunchTutorial()

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

  useEffect(() => {
    if (!tutorialLoading && showFirstLaunchTutorial) {
      setTutorialOpen(true)
    }
  }, [tutorialLoading, showFirstLaunchTutorial])

  const handleOpenTutorialFromHelp = () => {
    setTutorialOpen(true)
  }

  useEffect(() => {
    const state = location.state as { openTutorialHome?: boolean; resetTutorial?: boolean } | null
    if (!state?.openTutorialHome) return
    if (state.resetTutorial) {
      resetFirstLaunchTutorial()
    }
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
      <TutorialHome
        open={tutorialOpen}
        onOpenChange={setTutorialOpen}
        progress={progress}
        onProgressChange={updateProgress}
        onSkip={completeFirstLaunchTutorial}
        onReset={() => {
          resetFirstLaunchTutorial()
          setTutorialOpen(true)
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
