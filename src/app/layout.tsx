import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { TopBar } from '@/components/top-bar'
import { DevPerfHud } from '@/components/dev/DevPerfHud'
import { getSetting } from '@/lib/db/repositories/settings'
import { setPerfLoggingEnabled } from '@/lib/db/perf'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { FirstLaunchTutorial } from '@/components/FirstLaunchTutorial'

const DB_PERF_SETTING_KEY = 'enable_db_perf_logging'

export function AppLayout() {
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const { isLoading: tutorialLoading, showFirstLaunchTutorial, completeFirstLaunchTutorial } =
    useFirstLaunchTutorial()

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

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopBar />
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </SidebarInset>
      <DevPerfHud />
      <FirstLaunchTutorial
        open={tutorialOpen}
        onOpenChange={setTutorialOpen}
        onComplete={completeFirstLaunchTutorial}
      />
    </SidebarProvider>
  )
}
