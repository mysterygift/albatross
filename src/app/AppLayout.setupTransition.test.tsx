// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/app/layout'
import {
  INITIAL_SETUP_STATUS_QUERY_KEY,
} from '@/lib/auth/initialSetupStatus'
import {
  advanceSetupWorkspaceHandoffPhase,
  armSetupWorkspaceHandoff,
  disarmSetupWorkspaceHandoff,
  resetSetupWorkspaceHandoffForTests,
  startSetupWorkspaceTransition,
} from '@/lib/auth/setupWorkspaceHandoff'

const authMocks = vi.hoisted(() => ({
  useAuthSession: vi.fn(),
}))

const setupMocks = vi.hoisted(() => ({
  isInitialSetupComplete: vi.fn(async () => true),
}))

vi.mock('@/lib/auth/useAuthSession', () => ({
  useAuthSession: authMocks.useAuthSession,
}))

vi.mock('@/lib/auth/initialSetupStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/initialSetupStatus')>()
  return {
    ...actual,
    isInitialSetupComplete: setupMocks.isInitialSetupComplete,
  }
})

vi.mock('@/features/auth/AuthGateScreen', () => ({
  AuthGateScreen: () => <div data-testid="auth-gate">Auth gate</div>,
}))

vi.mock('@/components/app-sidebar', () => ({
  AppSidebar: () => <aside data-testid="app-sidebar">Sidebar</aside>,
}))

vi.mock('@/components/top-bar', () => ({
  TopBar: () => <header data-testid="top-bar">Top bar</header>,
}))

vi.mock('@/features/server/ServerCollabBanner', () => ({
  ServerCollabBanner: () => null,
}))

vi.mock('@/features/productions/ApfDesktopOpenBridge', () => ({
  ApfDesktopOpenBridge: () => null,
}))

vi.mock('@/features/productions/ApfMenuEventBridge', () => ({
  ApfMenuEventBridge: () => null,
}))

vi.mock('@/components/dev/DevPerfHud', () => ({
  DevPerfHud: () => null,
}))

vi.mock('@/hooks/useFirstLaunchTutorial', () => ({
  useFirstLaunchTutorial: () => ({
    isLoading: false,
    showFirstLaunchTutorial: false,
    completeFirstLaunchTutorial: vi.fn(),
    resetFirstLaunchTutorial: vi.fn(),
    skipEntryModal: vi.fn(),
    progress: { sections: {}, dismissed: true, seenEntryModal: true },
    updateProgress: vi.fn(),
  }),
}))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({
    setCurrentProductionId: vi.fn(),
    currentProduction: null,
    refetchProductions: vi.fn(),
  }),
}))

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnMount: false,
      },
    },
  })
  queryClient.setQueryData(INITIAL_SETUP_STATUS_QUERY_KEY, true)
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AppLayout setup transition', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    resetSetupWorkspaceHandoffForTests()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    authMocks.useAuthSession.mockReturnValue({
      status: 'success',
      isPending: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      data: {
        supported: true,
        dbDialect: 'sqlite',
        dbLocked: false,
        sessionToken: 'token',
        user: { id: 'user-1', username: 'admin', role: 'admin' },
      },
      authSupported: true,
      authDbDialect: 'sqlite',
      isAuthenticated: true,
      dbLocked: false,
      currentUser: { id: 'user-1', username: 'admin', role: 'admin' },
      clearSession: vi.fn(),
    })
  })

  it('shows transition overlay during active handoff phases', () => {
    armSetupWorkspaceHandoff()
    startSetupWorkspaceTransition()
    advanceSetupWorkspaceHandoffPhase('brandWash')

    renderLayout()

    expect(screen.getByTestId('setup-workspace-transition-overlay')).toBeTruthy()
    expect(screen.queryByTestId('auth-gate')).toBeNull()
  })

  it('keeps auth gate when armed but not authenticated during done screen', () => {
    armSetupWorkspaceHandoff()
    authMocks.useAuthSession.mockReturnValue({
      status: 'success',
      isPending: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      data: {
        supported: true,
        dbDialect: 'sqlite',
        dbLocked: false,
        sessionToken: null,
        user: null,
      },
      authSupported: true,
      authDbDialect: 'sqlite',
      isAuthenticated: false,
      dbLocked: false,
      currentUser: null,
      clearSession: vi.fn(),
    })

    renderLayout()

    expect(screen.getByTestId('auth-gate')).toBeTruthy()
    expect(screen.queryByTestId('setup-workspace-transition-overlay')).toBeNull()
  })

  it('does not mount sensitive call-sheet or movement-order routes before authentication', () => {
    const sensitiveRouteRender = vi.fn()
    const SensitiveRouteProbe = () => {
      sensitiveRouteRender()
      return <div data-testid="sensitive-route">Sensitive operational route</div>
    }
    authMocks.useAuthSession.mockReturnValue({
      status: 'success',
      isPending: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      data: {
        supported: true,
        dbDialect: 'sqlite',
        dbLocked: false,
        sessionToken: null,
        user: null,
      },
      authSupported: true,
      authDbDialect: 'sqlite',
      isAuthenticated: false,
      dbLocked: false,
      currentUser: null,
      clearSession: vi.fn(),
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    queryClient.setQueryData(INITIAL_SETUP_STATUS_QUERY_KEY, true)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/movement-orders']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="movement-orders" element={<SensitiveRouteProbe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('auth-gate')).toBeTruthy()
    expect(screen.queryByTestId('sensitive-route')).toBeNull()
    expect(sensitiveRouteRender).not.toHaveBeenCalled()
  })

  it('renders app shell after transition completes and handoff disarms', () => {
    renderLayout()
    expect(screen.getByTestId('app-sidebar')).toBeTruthy()
    expect(screen.queryByTestId('setup-workspace-transition-overlay')).toBeNull()
  })

  it('does not show transition overlay on normal login without armed handoff', () => {
    renderLayout()

    expect(screen.getByTestId('app-sidebar')).toBeTruthy()
    expect(screen.queryByTestId('setup-workspace-transition-overlay')).toBeNull()
    expect(screen.queryByTestId('auth-gate')).toBeNull()
  })

  it('does not replay transition after handoff disarms and layout remounts', () => {
    armSetupWorkspaceHandoff()
    startSetupWorkspaceTransition()
    advanceSetupWorkspaceHandoffPhase('complete')
    disarmSetupWorkspaceHandoff()

    const { unmount } = renderLayout()
    expect(screen.queryByTestId('setup-workspace-transition-overlay')).toBeNull()

    unmount()
    renderLayout()
    expect(screen.queryByTestId('setup-workspace-transition-overlay')).toBeNull()
    expect(screen.getByTestId('app-sidebar')).toBeTruthy()
  })

  it('keeps auth gate visible while setup complete query is refetching', async () => {
    let resolveRefetch!: (value: boolean) => void
    setupMocks.isInitialSetupComplete.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRefetch = resolve
        })
    )

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
          refetchOnMount: false,
        },
      },
    })
    queryClient.setQueryData(INITIAL_SETUP_STATUS_QUERY_KEY, true)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AppLayout />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByTestId('app-sidebar')).toBeTruthy()

    void queryClient.invalidateQueries({ queryKey: INITIAL_SETUP_STATUS_QUERY_KEY })

    await waitFor(() => expect(screen.getByTestId('auth-gate')).toBeTruthy())

    resolveRefetch(true)
    await waitFor(() => expect(screen.getByTestId('app-sidebar')).toBeTruthy())
  })
})
