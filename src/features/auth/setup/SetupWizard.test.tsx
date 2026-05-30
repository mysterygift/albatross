// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SetupWizard } from '@/features/auth/setup/SetupWizard'
import {
  getSetupWorkspaceHandoffSnapshot,
  resetSetupWorkspaceHandoffForTests,
} from '@/lib/auth/setupWorkspaceHandoff'

const TEST_RECOVERY_KEY =
  '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888'

const detectionMocks = vi.hoisted(() => ({
  detectInstallState: vi.fn(async () => ({
    kind: 'fresh_install' as const,
    route: 'admin' as const,
    diagnostics: {
      dbFileExists: false,
      encryptionMetaExists: false,
      isPlainSqlite: true,
      encryptionMode: 'none' as const,
      recoveryMetaExists: false,
      activeWrapperCount: 0,
      plainAdminCount: 0,
    },
  })),
  preparePlainDatabaseForSetup: vi.fn(async () => undefined),
}))

const progressMocks = vi.hoisted(() => ({
  readSetupProgress: vi.fn(async () => null),
  writeSetupProgress: vi.fn(async (phase: string) => ({
    version: 1 as const,
    phase,
    started_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  })),
  clearSetupProgress: vi.fn(async () => undefined),
  markSetupFailed: vi.fn(async () => ({
    version: 1 as const,
    phase: 'failed' as const,
    started_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  })),
}))

const encryptionMocks = vi.hoisted(() => ({
  isSetupEncryptionAlreadyPrepared: vi.fn(async () => true),
  runSetupEncryption: vi.fn(async () => ({ status: 'ready' as const, keyMode: 'instance_key' as const })),
  SETUP_ENCRYPTION_FAILED_MESSAGE:
    'Could not secure the local database. Try setup again from the beginning.',
}))

const setupStatusMocks = vi.hoisted(() => ({
  getUnlockedDbAdminsCountIfAvailable: vi.fn(async () => 0),
}))

const recoveryMocks = vi.hoisted(() => ({
  generateRecoveryKey: vi.fn(() => TEST_RECOVERY_KEY),
}))

const commitMocks = vi.hoisted(() => ({
  runSetupCommit: vi.fn(async () => ({
    sessionToken: 'test-session-token',
    repairedPeople: 0,
  })),
}))

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(async () => ({
    dialect: 'sqlite',
    select: vi.fn(async () => [{ username: 'admin' }]),
  })),
}))

vi.mock('@/lib/auth/installDetection', () => ({
  detectInstallState: detectionMocks.detectInstallState,
  preparePlainDatabaseForSetup: detectionMocks.preparePlainDatabaseForSetup,
}))

vi.mock('@/lib/auth/setupEncryptionService', () => encryptionMocks)

vi.mock('@/lib/auth/initialSetupStatus', () => ({
  getUnlockedDbAdminsCountIfAvailable: setupStatusMocks.getUnlockedDbAdminsCountIfAvailable,
}))

vi.mock('@/lib/auth/setupProgress', () => ({
  readSetupProgress: progressMocks.readSetupProgress,
  writeSetupProgress: progressMocks.writeSetupProgress,
  clearSetupProgress: progressMocks.clearSetupProgress,
  markSetupFailed: progressMocks.markSetupFailed,
}))

vi.mock('@/lib/security/recoveryKey', () => recoveryMocks)

vi.mock('@/lib/auth/setupCommitService', () => ({
  runSetupCommit: commitMocks.runSetupCommit,
  SETUP_COMMIT_FAILED_MESSAGE: 'Could not finish securing your workspace. Try again.',
}))

vi.mock('@/lib/db/client', () => dbMocks)

vi.mock('@/features/auth/setup/setupWorkspaceTransitionController', () => ({
  runSetupWorkspaceTransition: vi.fn(async ({ onPersistSession }: { onPersistSession: () => Promise<void> }) => {
    const { advanceSetupWorkspaceHandoffPhase } = await import('@/lib/auth/setupWorkspaceHandoff')
    await onPersistSession()
    advanceSetupWorkspaceHandoffPhase('complete')
  }),
}))

vi.mock('@/features/auth/setup/SetupAdminAccountScreen', () => ({
  SetupAdminAccountScreen: ({
    onAdminCreated,
  }: {
    onAdminCreated: (credentials: {
      username: string
      password: string
    }) => void
  }) => (
    <div data-testid="setup-admin-account-screen">
      <button
        type="button"
        onClick={() =>
          onAdminCreated({
            username: 'admin',
            password: 'validpass123',
          })
        }
      >
        Create admin account
      </button>
    </div>
  ),
}))

describe('SetupWizard', () => {
  beforeEach(() => {
    cleanup()
    resetSetupWorkspaceHandoffForTests()
    vi.clearAllMocks()
    vi.useRealTimers()
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
    detectionMocks.detectInstallState.mockResolvedValue({
      kind: 'fresh_install',
      route: 'admin',
      diagnostics: {
        dbFileExists: false,
        encryptionMetaExists: false,
        isPlainSqlite: true,
        encryptionMode: 'none',
        recoveryMetaExists: false,
        activeWrapperCount: 0,
        plainAdminCount: 0,
      },
    })
    progressMocks.readSetupProgress.mockResolvedValue(null)
    encryptionMocks.isSetupEncryptionAlreadyPrepared.mockResolvedValue(true)
    setupStatusMocks.getUnlockedDbAdminsCountIfAvailable.mockResolvedValue(0)
    recoveryMocks.generateRecoveryKey.mockReturnValue(TEST_RECOVERY_KEY)
    commitMocks.runSetupCommit.mockResolvedValue({
      sessionToken: 'test-session-token',
      repairedPeople: 0,
    })
  })

  it('starts on the welcome screen', async () => {
    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    expect(await screen.findByText('Welcome to Albatross')).toBeTruthy()
    expect(screen.queryByTestId('setup-admin-account-screen')).toBeNull()
  })

  it('runs encryption before admin step and writes admin_pending', async () => {
    const user = userEvent.setup()
    let resolveDetection!: (value: Awaited<ReturnType<typeof detectionMocks.detectInstallState>>) => void
    let resolveEncryption!: (value: { status: 'ready'; keyMode: 'instance_key' }) => void
    const detectionPromise = new Promise<Awaited<ReturnType<typeof detectionMocks.detectInstallState>>>(
      (resolve) => {
        resolveDetection = resolve
      }
    )
    const encryptionPromise = new Promise<{ status: 'ready'; keyMode: 'instance_key' }>((resolve) => {
      resolveEncryption = resolve
    })
    detectionMocks.detectInstallState.mockReturnValue(detectionPromise)
    encryptionMocks.runSetupEncryption.mockReturnValue(encryptionPromise)

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    await screen.findByText('Welcome to Albatross')
    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    expect(await screen.findByText('Preparing database…')).toBeTruthy()

    resolveDetection({
      kind: 'fresh_install',
      route: 'admin',
      diagnostics: {
        dbFileExists: false,
        encryptionMetaExists: false,
        isPlainSqlite: true,
        encryptionMode: 'none',
        recoveryMetaExists: false,
        activeWrapperCount: 0,
        plainAdminCount: 0,
      },
    })

    expect(await screen.findByText('Securing database…')).toBeTruthy()
    resolveEncryption({ status: 'ready', keyMode: 'instance_key' })

    await waitFor(() => expect(screen.getByTestId('setup-admin-account-screen')).toBeTruthy())
    expect(detectionMocks.preparePlainDatabaseForSetup).toHaveBeenCalled()
    expect(encryptionMocks.runSetupEncryption).toHaveBeenCalled()
    expect(progressMocks.writeSetupProgress).toHaveBeenCalledWith('admin_pending')
  })

  it('does not generate recovery key on welcome or admin steps', async () => {
    const user = userEvent.setup()

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    await screen.findByText('Welcome to Albatross')
    expect(recoveryMocks.generateRecoveryKey).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    await waitFor(() => expect(screen.getByTestId('setup-admin-account-screen')).toBeTruthy())
    expect(recoveryMocks.generateRecoveryKey).not.toHaveBeenCalled()
  })

  it('advances to recovery screen after admin creation without completing setup', async () => {
    const user = userEvent.setup()
    const onSetupComplete = vi.fn()

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={onSetupComplete}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    await screen.findByText('Welcome to Albatross')
    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    await waitFor(() => expect(screen.getByTestId('setup-admin-account-screen')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Create admin account' }))

    expect(await screen.findByText('Save your recovery key')).toBeTruthy()
    expect(screen.getByLabelText('Recovery key').textContent).toBe(TEST_RECOVERY_KEY)
    expect(progressMocks.writeSetupProgress).toHaveBeenCalledWith('recovery_pending')
    expect(onSetupComplete).not.toHaveBeenCalled()
    expect(recoveryMocks.generateRecoveryKey).toHaveBeenCalledTimes(1)
  })

  it('advances to committing screen after recovery acknowledgment', async () => {
    const user = userEvent.setup()
    let resolveCommit!: (value: { sessionToken: string; repairedPeople: number }) => void
    commitMocks.runSetupCommit.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCommit = resolve
      })
    )

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    await screen.findByText('Welcome to Albatross')
    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    await waitFor(() => expect(screen.getByTestId('setup-admin-account-screen')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Create admin account' }))
    await screen.findByText('Save your recovery key')
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Securing your workspace…')).toBeTruthy()
    expect(screen.queryByText(TEST_RECOVERY_KEY)).toBeNull()

    resolveCommit({ sessionToken: 'test-session-token', repairedPeople: 0 })
  })

  it('shows done screen after commit succeeds without calling onSetupComplete', async () => {
    const user = userEvent.setup()
    const onSetupComplete = vi.fn(async () => undefined)

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={onSetupComplete}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    await screen.findByText('Welcome to Albatross')
    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    await waitFor(() => expect(screen.getByTestId('setup-admin-account-screen')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Create admin account' }))
    await screen.findByText('Save your recovery key')
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Your production workspace is ready.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enter Workspace' })).toBeTruthy()
    expect(onSetupComplete).not.toHaveBeenCalled()
    expect(progressMocks.clearSetupProgress).toHaveBeenCalled()
    expect(getSetupWorkspaceHandoffSnapshot().armed).toBe(true)
  })

  it('calls onSetupComplete when Enter Workspace is clicked', async () => {
    const user = userEvent.setup()
    const onSetupComplete = vi.fn(async () => undefined)

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={onSetupComplete}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    await screen.findByText('Welcome to Albatross')
    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    await waitFor(() => expect(screen.getByTestId('setup-admin-account-screen')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Create admin account' }))
    await screen.findByText('Save your recovery key')
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await screen.findByText('Your production workspace is ready.')
    await user.click(screen.getByRole('button', { name: 'Enter Workspace' }))

    await waitFor(() =>
      expect(onSetupComplete).toHaveBeenCalledWith({
        sessionToken: 'test-session-token',
        repairedPeople: 0,
      })
    )
    expect(getSetupWorkspaceHandoffSnapshot().armed).toBe(false)
    expect(commitMocks.runSetupCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        plainRecoveryKey: TEST_RECOVERY_KEY,
        username: 'admin',
        password: 'validpass123',
      }),
      expect.objectContaining({ onProgress: expect.any(Function) })
    )
  })

  it('does not show done screen when resumed install routes to sign-in', async () => {
    progressMocks.readSetupProgress.mockResolvedValue({
      version: 1,
      phase: 'detect',
      started_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    detectionMocks.detectInstallState.mockResolvedValue({
      kind: 'complete_install',
      route: 'sign_in',
      diagnostics: {
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
        encryptionMode: 'instance_key',
        recoveryMetaExists: true,
        activeWrapperCount: 1,
        plainAdminCount: null,
      },
    })
    const onRequireSignIn = vi.fn()

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={onRequireSignIn}
      />
    )

    await waitFor(() => expect(onRequireSignIn).toHaveBeenCalled())
    expect(screen.queryByText('Your production workspace is ready.')).toBeNull()
  })

  it('shows retry on commit failure without completing setup', async () => {
    const user = userEvent.setup()
    const onSetupComplete = vi.fn()
    commitMocks.runSetupCommit.mockRejectedValueOnce(
      new Error('Could not finish securing your workspace. Try again.')
    )

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={onSetupComplete}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    await screen.findByText('Welcome to Albatross')
    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    await waitFor(() => expect(screen.getByTestId('setup-admin-account-screen')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Create admin account' }))
    await screen.findByText('Save your recovery key')
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(onSetupComplete).not.toHaveBeenCalled()
    expect(progressMocks.clearSetupProgress).not.toHaveBeenCalled()
    expect(getSetupWorkspaceHandoffSnapshot().armed).toBe(false)
    expect(screen.queryByText('Your production workspace is ready.')).toBeNull()
  })

  it('completes setup after retrying failed commit', async () => {
    const user = userEvent.setup()
    const onSetupComplete = vi.fn()
    commitMocks.runSetupCommit
      .mockRejectedValueOnce(new Error('Could not finish securing your workspace. Try again.'))
      .mockResolvedValueOnce({
        sessionToken: 'test-session-token',
        repairedPeople: 0,
      })

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={onSetupComplete}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    await screen.findByText('Welcome to Albatross')
    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    await waitFor(() => expect(screen.getByTestId('setup-admin-account-screen')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Create admin account' }))
    await screen.findByText('Save your recovery key')
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Your production workspace is ready.')).toBeTruthy()
    expect(progressMocks.clearSetupProgress).toHaveBeenCalled()
    expect(getSetupWorkspaceHandoffSnapshot().armed).toBe(true)
    expect(onSetupComplete).not.toHaveBeenCalled()
  })

  it('shows admin password field when resuming recovery without in-memory credentials', async () => {
    progressMocks.readSetupProgress.mockResolvedValue({
      version: 1,
      phase: 'recovery_pending',
      started_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    setupStatusMocks.getUnlockedDbAdminsCountIfAvailable.mockResolvedValue(1)

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    expect(await screen.findByLabelText(/Admin password \(admin\)/i)).toBeTruthy()
  })

  it('does not expose sign-in controls', async () => {
    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    expect(await screen.findByText('Welcome to Albatross')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })

  it('shows blocked screen for encrypted incomplete install', async () => {
    const user = userEvent.setup()
    detectionMocks.detectInstallState.mockResolvedValue({
      kind: 'encrypted_incomplete',
      route: 'repair',
      diagnostics: {
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
        encryptionMode: 'unknown',
        recoveryMetaExists: false,
        activeWrapperCount: 0,
        plainAdminCount: null,
      },
    })

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    await screen.findByText('Welcome to Albatross')
    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    expect(await screen.findByText("Setup can't continue automatically")).toBeTruthy()
    expect(screen.queryByTestId('setup-admin-account-screen')).toBeNull()
  })

  it('routes legacy password-derived installs to sign-in screen', async () => {
    const user = userEvent.setup()
    const onRequireSignIn = vi.fn()
    detectionMocks.detectInstallState.mockResolvedValue({
      kind: 'legacy_password_derived',
      route: 'sign_in',
      diagnostics: {
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
        encryptionMode: 'legacy_password_derived',
        recoveryMetaExists: true,
        activeWrapperCount: 1,
        plainAdminCount: null,
      },
    })

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={onRequireSignIn}
      />
    )

    await screen.findByText('Welcome to Albatross')
    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    expect(await screen.findByText('Sign in to continue')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Go to sign in' }))
    expect(onRequireSignIn).toHaveBeenCalled()
  })

  it('resumes admin step when progress is admin_pending and detection is safe', async () => {
    progressMocks.readSetupProgress.mockResolvedValue({
      version: 1,
      phase: 'admin_pending',
      started_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    expect(await screen.findByTestId('setup-admin-account-screen')).toBeTruthy()
  })

  it('shows repair screen when stale admin_pending conflicts with unsafe detection', async () => {
    progressMocks.readSetupProgress.mockResolvedValue({
      version: 1,
      phase: 'admin_pending',
      started_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    detectionMocks.detectInstallState.mockResolvedValue({
      kind: 'encrypted_incomplete',
      route: 'repair',
      diagnostics: {
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
        encryptionMode: 'unknown',
        recoveryMetaExists: false,
        activeWrapperCount: 0,
        plainAdminCount: null,
      },
    })

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    expect(await screen.findByText("Setup can't continue automatically")).toBeTruthy()
    expect(screen.queryByTestId('setup-admin-account-screen')).toBeNull()
  })

  it('resumes recovery screen when progress is recovery_pending and admin exists', async () => {
    progressMocks.readSetupProgress.mockResolvedValue({
      version: 1,
      phase: 'recovery_pending',
      started_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    setupStatusMocks.getUnlockedDbAdminsCountIfAvailable.mockResolvedValue(1)

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    expect(await screen.findByText('Save your recovery key')).toBeTruthy()
    expect(recoveryMocks.generateRecoveryKey).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('setup-admin-account-screen')).toBeNull()
  })

  it('shows repair when recovery_pending but admin does not exist', async () => {
    progressMocks.readSetupProgress.mockResolvedValue({
      version: 1,
      phase: 'recovery_pending',
      started_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    encryptionMocks.isSetupEncryptionAlreadyPrepared.mockResolvedValue(false)

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    expect(await screen.findByText("Setup can't continue automatically")).toBeTruthy()
    expect(screen.queryByText('Save your recovery key')).toBeNull()
  })

  it('does not write recovery key material to setup progress', async () => {
    const user = userEvent.setup()

    render(
      <SetupWizard
        busy={false}
        onSetupComplete={vi.fn()}
        onError={vi.fn()}
        onRequireSignIn={vi.fn()}
      />
    )

    await screen.findByText('Welcome to Albatross')
    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    await waitFor(() => expect(screen.getByTestId('setup-admin-account-screen')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Create admin account' }))
    await screen.findByText('Save your recovery key')
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    for (const call of progressMocks.writeSetupProgress.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(TEST_RECOVERY_KEY)
    }
  })
})
