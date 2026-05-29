// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AuthGateScreen } from '@/features/auth/AuthGateScreen'

const statusMocks = vi.hoisted(() => ({
  getLocalDbStatus: vi.fn(async () => ({
    dbFileExists: true,
    encryptionMetaExists: true,
    isPlainSqlite: false,
  })),
  recoveryPasswordResetAvailable: vi.fn(async () => true),
}))

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

vi.mock('@/features/auth/InitialAdminSetupWizard', () => ({
  InitialAdminSetupWizard: () => <div data-testid="initial-admin-wizard">Setup wizard</div>,
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
    vi.clearAllMocks()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    statusMocks.recoveryPasswordResetAvailable.mockResolvedValue(true)
  })

  it('shows Forgot password link when admin exists and v2 recovery is available', async () => {
    renderGate()
    expect(await screen.findByRole('button', { name: 'Forgot password?' })).toBeTruthy()
  })

  it('hides Forgot password link when recovery is unavailable', async () => {
    statusMocks.recoveryPasswordResetAvailable.mockResolvedValue(false)
    renderGate()
    await screen.findByRole('button', { name: 'Sign in' })
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull()
  })
})
