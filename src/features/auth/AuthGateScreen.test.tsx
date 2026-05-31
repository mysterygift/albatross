// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AuthGateScreen } from '@/features/auth/AuthGateScreen'
import type { AuthGateMode } from '@/lib/auth/initialSetupStatus'
import {
  armSetupWorkspaceHandoff,
  resetSetupWorkspaceHandoffForTests,
} from '@/lib/auth/setupWorkspaceHandoff'

const gateMocks = vi.hoisted(() => ({
  resolveAuthGateMode: vi.fn(async (): Promise<AuthGateMode> => 'sign_in'),
}))

const statusMocks = vi.hoisted(() => ({
  getLocalDbStatus: vi.fn(async () => ({
    dbFileExists: true,
    encryptionMetaExists: true,
    isPlainSqlite: false,
  })),
  recoveryPasswordResetAvailable: vi.fn(async () => true),
}))

vi.mock('@/lib/auth/initialSetupStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/initialSetupStatus')>()
  return {
    ...actual,
    resolveAuthGateMode: gateMocks.resolveAuthGateMode,
  }
})

vi.mock('@/lib/security/dbFileEncryption', () => ({
  getLocalDbStatus: statusMocks.getLocalDbStatus,
}))

vi.mock('@/lib/security/recoveryKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/recoveryKey')>()
  return {
    ...actual,
    recoveryPasswordResetAvailable: statusMocks.recoveryPasswordResetAvailable,
  }
})

vi.mock('@/lib/db/client', () => ({
  closeDb: vi.fn(async () => undefined),
  getDb: vi.fn(),
  openPlainDbIfExists: vi.fn(),
}))

vi.mock('@/lib/db/dbUnlock', () => ({
  unlockLocalDatabaseWithPassword: vi.fn(),
}))

vi.mock('@/lib/auth/authService', () => ({
  login: vi.fn(),
}))

vi.mock('@/lib/db/repositories/settings', () => ({
  setSetting: vi.fn(),
}))

vi.mock('@/lib/security/dataEncryptionContext', () => ({
  establishDataEncryptionKey: vi.fn(),
}))

vi.mock('@/lib/db/migrations/backfillClientEncryption', () => ({
  backfillClientEncryptionIfNeeded: vi.fn(),
}))

vi.mock('@/lib/db/migrations/backfillPeopleIsCastInteger', () => ({
  backfillPeopleIsCastIntegerIfNeeded: vi.fn(async () => 0),
}))

vi.mock('@/features/auth/ForgotPasswordRecoveryCard', () => ({
  ForgotPasswordRecoveryCard: () => <div data-testid="forgot-password-card">Forgot password flow</div>,
}))

vi.mock('@/features/auth/setup/SetupWizard', () => ({
  SetupWizard: () => <div data-testid="setup-wizard">Setup wizard</div>,
}))

function renderGate() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthGateScreen loadingAuthState={false} />
    </QueryClientProvider>
  )
}

describe('AuthGateScreen', () => {
  beforeEach(() => {
    cleanup()
    resetSetupWorkspaceHandoffForTests()
    vi.clearAllMocks()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    gateMocks.resolveAuthGateMode.mockResolvedValue('sign_in')
    statusMocks.recoveryPasswordResetAvailable.mockResolvedValue(true)
  })

  it('shows setup wizard instead of sign-in when gate mode is setup', async () => {
    gateMocks.resolveAuthGateMode.mockResolvedValue('setup')
    renderGate()

    expect(await screen.findByTestId('setup-wizard')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    expect(screen.queryByText('Sign in')).toBeNull()
  })

  it('shows sign-in instead of setup wizard when gate mode is sign_in', async () => {
    renderGate()

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByTestId('setup-wizard')).toBeNull()
  })

  it('shows Forgot password link when setup is complete and v2 recovery is available', async () => {
    renderGate()
    expect(await screen.findByRole('button', { name: 'Forgot password?' })).toBeTruthy()
  })

  it('hides Forgot password link when recovery is unavailable', async () => {
    statusMocks.recoveryPasswordResetAvailable.mockResolvedValue(false)
    renderGate()
    await screen.findByRole('button', { name: 'Sign in' })
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull()
  })

  it('does not show setup completion screen on normal sign-in', async () => {
    renderGate()

    await screen.findByRole('button', { name: 'Sign in' })
    expect(screen.queryByText('Your production workspace is ready.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enter Workspace' })).toBeNull()
  })

  it('shows setup wizard instead of sign-in when handoff is armed after setup commit', async () => {
    gateMocks.resolveAuthGateMode.mockResolvedValue('sign_in')
    armSetupWorkspaceHandoff()
    renderGate()

    expect(await screen.findByTestId('setup-wizard')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })

  it('does not show setup completion screen for completed installs on restart', async () => {
    gateMocks.resolveAuthGateMode.mockResolvedValue('sign_in')
    renderGate()

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByTestId('setup-wizard')).toBeNull()
    expect(screen.queryByText('Your production workspace is ready.')).toBeNull()
  })
})
