// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SetupAdminAccountScreen } from '@/features/auth/setup/SetupAdminAccountScreen'

const authMocks = vi.hoisted(() => ({
  setupInitialAdmin: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', role: 'admin' as const },
  })),
  getNormalizedUsername: vi.fn((username: string) => username.trim().toLowerCase()),
}))

const encryptionMocks = vi.hoisted(() => ({
  isSetupEncryptionAlreadyPrepared: vi.fn(async () => true),
  SETUP_ENCRYPTION_FAILED_MESSAGE:
    'Could not secure the local database. Try setup again from the beginning.',
}))

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(async () => ({ dialect: 'sqlite' })),
  isDbUnlocked: vi.fn(() => true),
}))

vi.mock('@/lib/auth/authService', () => authMocks)
vi.mock('@/lib/auth/setupEncryptionService', () => encryptionMocks)
vi.mock('@/lib/db/client', () => dbMocks)

describe('SetupAdminAccountScreen', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    encryptionMocks.isSetupEncryptionAlreadyPrepared.mockResolvedValue(true)
    dbMocks.isDbUnlocked.mockReturnValue(true)
  })

  it('renders username, password, and confirm password fields', async () => {
    render(
      <SetupAdminAccountScreen busy={false} onAdminCreated={vi.fn()} onError={vi.fn()} />
    )

    expect(await screen.findByLabelText('Username')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByLabelText('Confirm password')).toBeTruthy()
  })

  it('blocks submit when passwords do not match', async () => {
    const user = userEvent.setup()
    render(
      <SetupAdminAccountScreen busy={false} onAdminCreated={vi.fn()} onError={vi.fn()} />
    )

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'validpass123')
    await user.type(screen.getByLabelText('Confirm password'), 'different123')

    const submitButton = screen.getByRole('button', { name: 'Create admin account' })
    expect(submitButton.hasAttribute('disabled')).toBe(true)
    await user.click(submitButton)
    expect(authMocks.setupInitialAdmin).not.toHaveBeenCalled()
  })

  it('blocks submit when password is too short', async () => {
    const user = userEvent.setup()
    render(
      <SetupAdminAccountScreen busy={false} onAdminCreated={vi.fn()} onError={vi.fn()} />
    )

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Confirm password'), 'short')

    const submitButton = screen.getByRole('button', { name: 'Create admin account' })
    expect(submitButton.hasAttribute('disabled')).toBe(true)
  })

  it('submits valid credentials with createSession disabled', async () => {
    const user = userEvent.setup()
    const onAdminCreated = vi.fn()
    render(
      <SetupAdminAccountScreen
        busy={false}
        onAdminCreated={onAdminCreated}
        onError={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText('Username'), 'Admin')
    await user.type(screen.getByLabelText('Password'), 'validpass123')
    await user.type(screen.getByLabelText('Confirm password'), 'validpass123')
    await user.click(screen.getByRole('button', { name: 'Create admin account' }))

    await waitFor(() => expect(authMocks.setupInitialAdmin).toHaveBeenCalled())
    expect(authMocks.setupInitialAdmin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        username: 'admin',
        password: 'validpass123',
        confirmPassword: 'validpass123',
        createSession: false,
      })
    )
    expect(onAdminCreated).toHaveBeenCalledWith({
      username: 'admin',
      password: 'validpass123',
    })
  })

  it('does not show sign-in or skip controls', async () => {
    render(
      <SetupAdminAccountScreen busy={false} onAdminCreated={vi.fn()} onError={vi.fn()} />
    )

    expect(await screen.findByLabelText('Username')).toBeTruthy()
    expect(screen.queryByLabelText('Username', { selector: '#auth-username' })).toBeNull()
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
  })

  it('shows service errors without calling onAdminCreated', async () => {
    const user = userEvent.setup()
    const onAdminCreated = vi.fn()
    const onError = vi.fn()
    authMocks.setupInitialAdmin.mockRejectedValueOnce(new Error('Username is already taken'))

    render(
      <SetupAdminAccountScreen
        busy={false}
        onAdminCreated={onAdminCreated}
        onError={onError}
      />
    )

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'validpass123')
    await user.type(screen.getByLabelText('Confirm password'), 'validpass123')
    await user.click(screen.getByRole('button', { name: 'Create admin account' }))

    expect(await screen.findByText('Username is already taken')).toBeTruthy()
    expect(onError).toHaveBeenCalledWith('Username is already taken')
    expect(onAdminCreated).not.toHaveBeenCalled()
  })
})
