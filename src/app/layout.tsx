import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet } from 'react-router-dom'
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { TutorialProvider } from '@/features/tutorial/engine/TutorialProvider'
import { DemoProductionBanner } from '@/features/onboarding/DemoProductionBanner'
import { TopBar } from '@/components/top-bar'
import { SectionTabs } from '@/components/section-tabs'
import { DevPerfHud } from '@/components/dev/DevPerfHud'
import { getSetting } from '@/lib/db/repositories/settings'
import { setPerfLoggingEnabled } from '@/lib/db/perf'
import { useUiTheme } from '@/hooks/useUiTheme'
import { ApfDesktopOpenBridge } from '@/features/productions/ApfDesktopOpenBridge'
import { SidebarSwipeGestures } from '@/components/sidebar-swipe-gestures'
import { PhoneTabBar } from '@/components/phone-tab-bar'
import { isPhoneViewport } from '@/lib/platform'
import { ApfMenuEventBridge } from '@/features/productions/ApfMenuEventBridge'
import { GlobalSearchDialog } from '@/features/search/GlobalSearchDialog'
import { GlobalShortcutBridge } from '@/app/GlobalShortcutBridge'
import { ShortcutCheatSheet } from '@/components/shortcut-cheat-sheet'
import { ServerCollabBanner } from '@/features/server/ServerCollabBanner'
import { useCurrentProduction } from '@/features/productions/context'
import { DEMO_SLUG } from '@/lib/db/seed/constants'
import { Button } from '@/components/ui/button'
import {
  INITIAL_SETUP_STATUS_QUERY_KEY,
  isInitialSetupComplete,
} from '@/lib/auth/initialSetupStatus'
import { useAuthSession } from '@/lib/auth/useAuthSession'
import { AuthGateScreen } from '@/features/auth/AuthGateScreen'
import { useSetupWorkspaceHandoff } from '@/hooks/useSetupWorkspaceHandoff'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { SetupWorkspaceTransitionOverlay } from '@/features/auth/setup/SetupWorkspaceTransitionOverlay'
import { isSetupWorkspaceTransitionActive } from '@/lib/auth/setupWorkspaceHandoff'

const DB_PERF_SETTING_KEY = 'enable_db_perf_logging'

export function AppLayout() {
  return <AppLayoutInner />
}

function AppLayoutInner() {
  const authSession = useAuthSession()
  const handoff = useSetupWorkspaceHandoff()
  const reducedMotion = usePrefersReducedMotion()
  const queryClient = useQueryClient()
  useUiTheme()
  const setupCompleteQuery = useQuery({
    queryKey: INITIAL_SETUP_STATUS_QUERY_KEY,
    queryFn: isInitialSetupComplete,
    enabled: authSession.authSupported,
  })
  const showAuthGate =
    authSession.authSupported &&
    (setupCompleteQuery.isLoading ||
      setupCompleteQuery.isFetching ||
      !setupCompleteQuery.data ||
      !authSession.isAuthenticated ||
      authSession.dbLocked)

  if (authSession.status === 'pending' || (authSession.authSupported && setupCompleteQuery.isLoading)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <p className="text-sm font-medium text-foreground">Connecting…</p>
        <p className="text-xs text-muted-foreground">
          {authSession.dbLocked ? 'Local database is locked' : 'Loading local database session'}
        </p>
      </div>
    )
  }

  if (authSession.isError) {
    const rawErr: unknown = authSession.error
    const errText =
      rawErr instanceof Error
        ? rawErr.message
        : typeof rawErr === 'string'
          ? rawErr
          : 'Unknown error'
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Could not connect for sign-in. Check the database and try again.
        </p>
        <p className="max-w-md break-words font-mono text-xs text-muted-foreground">{errText.slice(0, 400)}</p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ['auth-session'] })}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (authSession.status === 'success' && !authSession.authSupported) {
    const d = authSession.authDbDialect
    if (d === 'sqlite') {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-lg space-y-3 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
            <h1 className="text-lg font-semibold">Sign-in is not available on this database yet</h1>
            <p className="text-sm text-muted-foreground">
              The local SQLite file has no <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">users</code>{' '}
              table, so the app hides the login screen. That usually means the desktop migrations have not been applied
              to this build or database.
            </p>
            <p className="text-sm text-muted-foreground">
              Quit the app, run a fresh <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">npm run tauri:dev</code>{' '}
              so Rust picks up migration <span className="font-mono text-foreground">0065_uam1_auth_foundation</span>, then open the{' '}
              <strong>Albatross</strong> window again (not a separate browser tab to the dev URL).
            </p>
          </div>
        </div>
      )
    }
    if (d === 'postgres') {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-lg space-y-3 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
            <h1 className="text-lg font-semibold">Sign-in is not available on this Postgres database</h1>
            <p className="text-sm text-muted-foreground">
              The <code className="rounded bg-muted px-1 font-mono text-foreground">users</code> table is missing.
              Apply migration <code className="rounded bg-muted px-1 font-mono text-foreground">0003_uam1_auth_foundation.sql</code>{' '}
              (or a later bundle) to this database, then reload.
            </p>
          </div>
        </div>
      )
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Authentication state is incomplete. Try a full page reload. If this persists, check the browser console for
          errors.
        </p>
      </div>
    )
  }

  const transitionActive = isSetupWorkspaceTransitionActive()
  const sessionReady =
    authSession.status === 'success' &&
    authSession.isAuthenticated &&
    !authSession.dbLocked

  // While a sign-in handoff is armed the gate stays up until the session is persisted.
  if (showAuthGate) {
    return <AuthGateScreen loadingAuthState={false} />
  }

  // The shell is mounted (hidden) while the intro plays so it has loaded by the time the iris
  // opens. It sits in the same tree position before, during and after the intro, so it is never
  // remounted when the overlay goes away.
  const shellMounted =
    !transitionActive ||
    (sessionReady &&
      (handoff.phase === 'brandWash' ||
        handoff.phase === 'revealingApp' ||
        handoff.phase === 'complete'))
  const shellHidden = transitionActive && handoff.phase !== 'revealingApp'

  return (
    <>
      {shellMounted && (
        <div
          className={shellHidden ? 'pointer-events-none fixed inset-0 opacity-0' : 'contents'}
          aria-hidden={shellHidden || undefined}
        >
          <AppLayoutShell />
        </div>
      )}
      {transitionActive && (
        <SetupWorkspaceTransitionOverlay
          phase={handoff.phase}
          reducedMotion={reducedMotion}
          shellVisible={!shellHidden}
        />
      )}
    </>
  )
}

function AppLayoutShell() {
  const { currentProduction } = useCurrentProduction()
  const isDemoProductionCurrent = currentProduction?.slug === DEMO_SLUG
  const [searchOpen, setSearchOpen] = useState(false)
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const toggleSearch = useCallback(() => setSearchOpen((prev) => !prev), [])
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const openShortcuts = useCallback(() => setShortcutsOpen(true), [])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    getSetting(DB_PERF_SETTING_KEY)
      .then((v) => setPerfLoggingEnabled(v !== 'false'))
      .catch(() => {})
  }, [])

  return (
    <TutorialProvider>
      {/* A docked sidebar would take over half of an iPhone held sideways, so phones start with it hidden. */}
      <SidebarProvider defaultOpen={!isPhoneViewport()}>
        <MenuSidebarBridge />
        <SidebarSwipeGestures />
        <GlobalShortcutBridge
          searchOpen={searchOpen}
          onToggleSearch={toggleSearch}
          onOpenShortcuts={openShortcuts}
        />
        <ApfDesktopOpenBridge />
        <ApfMenuEventBridge />
        <AppSidebar />
        <SidebarInset>
          <TopBar
            onOpenSearch={openSearch}
            onOpenShortcuts={openShortcuts}
          />
          <ServerCollabBanner />
          <SectionTabs />
          <main className="flex-1 overflow-auto p-3 sm:p-4">
            <DemoProductionBanner
              isDemo={isDemoProductionCurrent}
              currentProduction={currentProduction}
            />
            <Outlet />
          </main>
        </SidebarInset>
        <PhoneTabBar />
        <DevPerfHud />
        <GlobalSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          productionId={currentProduction?.id ?? null}
          onOpenShortcuts={openShortcuts}
        />
        <ShortcutCheatSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </SidebarProvider>
    </TutorialProvider>
  )
}

function MenuSidebarBridge() {
  const { toggleSidebar } = useSidebar()

  useEffect(() => {
    const onToggleSidebar = () => toggleSidebar()
    window.addEventListener('albatross-menu-view-toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('albatross-menu-view-toggle-sidebar', onToggleSidebar)
  }, [toggleSidebar])

  return null
}
