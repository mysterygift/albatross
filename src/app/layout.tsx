import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar'
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

  if (showAuthGate && handoff.armed) {
    return <AuthGateScreen loadingAuthState={false} />
  }

  if (transitionActive) {
    const shellReady =
      sessionReady &&
      (handoff.phase === 'brandWash' ||
        handoff.phase === 'revealingApp' ||
        handoff.phase === 'complete')
    const shellRevealed = handoff.phase === 'revealingApp' || handoff.phase === 'complete'

    return (
      <>
        {shellReady && (
          <div
            className={
              shellRevealed
                ? 'min-h-screen animate-in fade-in-0 slide-in-from-bottom-2 duration-300 fill-mode-forwards motion-reduce:animate-none motion-reduce:opacity-100'
                : 'pointer-events-none fixed inset-0 opacity-0'
            }
            aria-hidden={!shellRevealed}
          >
            <AppLayoutShell />
          </div>
        )}
        <SetupWorkspaceTransitionOverlay
          phase={handoff.phase}
          reducedMotion={reducedMotion}
          shellVisible={shellRevealed}
        />
      </>
    )
  }

  if (showAuthGate) {
    return <AuthGateScreen loadingAuthState={false} />
  }

  return <AppLayoutShell />
}

function AppLayoutShell() {
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
      <MenuSidebarBridge />
      <ApfDesktopOpenBridge />
      <ApfMenuEventBridge />
      <AppSidebar />
      <SidebarInset>
        <TopBar onOpenTutorial={handleOpenTutorialFromHelp} />
        <ServerCollabBanner />
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

function MenuSidebarBridge() {
  const { toggleSidebar } = useSidebar()

  useEffect(() => {
    const onToggleSidebar = () => toggleSidebar()
    window.addEventListener('albatross-menu-view-toggle-sidebar', onToggleSidebar)
    return () => window.removeEventListener('albatross-menu-view-toggle-sidebar', onToggleSidebar)
  }, [toggleSidebar])

  return null
}
