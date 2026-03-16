import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { TopBar } from '@/components/top-bar'
import { DevPerfHud } from '@/components/dev/DevPerfHud'
import { getSetting } from '@/lib/db/repositories/settings'
import { setPerfLoggingEnabled } from '@/lib/db/perf'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { TutorialHome } from '@/features/tutorial/TutorialHome'

const DB_PERF_SETTING_KEY = 'enable_db_perf_logging'

export function AppLayout() {
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const {
    isLoading: tutorialLoading,
    showFirstLaunchTutorial,
    completeFirstLaunchTutorial,
    resetFirstLaunchTutorial,
    progress,
    updateProgress,
  } = useFirstLaunchTutorial()

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
    // Reset progress so the tutorial hub makes sense when opened from the help button.
    resetFirstLaunchTutorial()
    setTutorialOpen(true)
  }

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
      />
    </SidebarProvider>
  )
}
