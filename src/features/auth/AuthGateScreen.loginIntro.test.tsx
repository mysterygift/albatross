// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AuthGateScreen } from '@/features/auth/AuthGateScreen'
import { AUTH_SESSION_TOKEN_SETTING_KEY } from '@/lib/auth/useAuthSession'
import {
  getSetupWorkspaceHandoffSnapshot,
  resetSetupWorkspaceHandoffForTests,
} from '@/lib/auth/setupWorkspaceHandoff'

const mocks = vi.hoisted(() => ({
  completeLogin: vi.fn(),
  setSetting: vi.fn(),
  handoffAtPersist: null as unknown,
}))

vi.mock('@/lib/auth/initialSetupStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/initialSetupStatus')>()
  return { ...actual, resolveAuthGateMode: vi.fn(async () => 'sign_in') }
})
vi.mock('@/lib/security/recoveryKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/recoveryKey')>()
  return { ...actual, recoveryPasswordResetAvailable: vi.fn(async () => false) }
})
vi.mock('@/lib/db/client', () => ({
  closeDb: vi.fn(async () => undefined),
  getDb: vi.fn(async () => ({})),
}))
vi.mock('@/lib/db/dbUnlock', () => ({
  unlockLocalDatabaseWithPassword: vi.fn(async () => undefined),
}))
vi.mock('@/lib/auth/loginOrchestration', () => ({
  completeLoginAfterDatabaseUnlock: mocks.completeLogin,
}))
vi.mock('@/lib/db/repositories/settings', () => ({ setSetting: mocks.setSetting }))
vi.mock('@/features/auth/setup/SetupWizard', () => ({ SetupWizard: () => null }))
vi.mock('@/features/auth/ForgotPasswordRecoveryCard', () => ({
  ForgotPasswordRecoveryCard: () => null,
}))

async function submitLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AuthGateScreen loadingAuthState={false} />
    </QueryClientProvider>
  )
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'admin' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('AuthGateScreen login intro', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    resetSetupWorkspaceHandoffForTests()
    mocks.handoffAtPersist = null
    mocks.setSetting.mockImplementation(async () => {
      mocks.handoffAtPersist = { ...getSetupWorkspaceHandoffSnapshot() }
    })
    // Reduced motion keeps the handoff to ~150ms so the test can run on real timers.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
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
  })

  it('arms a login handoff before persisting the session, then disarms', async () => {
    mocks.completeLogin.mockResolvedValue({ sessionToken: 'tok', repairedPeople: 0 })

    await submitLogin()

    await waitFor(() =>
      expect(mocks.setSetting).toHaveBeenCalledWith(AUTH_SESSION_TOKEN_SETTING_KEY, 'tok')
    )
    expect(mocks.handoffAtPersist).toEqual({ armed: true, phase: 'fadingWelcome', kind: 'login' })
    await waitFor(() => expect(getSetupWorkspaceHandoffSnapshot().armed).toBe(false))
  })

  it('does not arm the intro when the credentials are rejected', async () => {
    mocks.completeLogin.mockRejectedValue(new Error('Invalid username or password'))

    await submitLogin()

    expect(await screen.findByText('Invalid username or password')).toBeTruthy()
    expect(mocks.setSetting).not.toHaveBeenCalled()
    expect(getSetupWorkspaceHandoffSnapshot().armed).toBe(false)
  })

  it('tears the handoff down if persisting the session fails', async () => {
    mocks.completeLogin.mockResolvedValue({ sessionToken: 'tok', repairedPeople: 0 })
    mocks.setSetting.mockRejectedValue(new Error('disk full'))

    await submitLogin()

    expect(await screen.findByText('disk full')).toBeTruthy()
    expect(getSetupWorkspaceHandoffSnapshot()).toEqual({ armed: false, phase: 'idle', kind: 'setup' })
  })
})
