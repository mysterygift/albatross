// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { InitialAdminSetupWizard } from '@/features/auth/InitialAdminSetupWizard'

const recoveryMocks = vi.hoisted(() => ({
  generateRecoveryKey: vi.fn(() => '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888'),
  hashRecoveryKey: vi.fn(async () => '$argon2id$v=19$m=19456,t=2,p=1$mock'),
  persistRecoveryKeyMaterial: vi.fn(async () => undefined),
  recoveryKeyMetaExists: vi.fn(async () => false),
}))

const authMocks = vi.hoisted(() => ({
  setupInitialAdmin: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', role: 'admin' as const },
    sessionToken: 'session-token',
  })),
}))

const dbMocks = vi.hoisted(() => ({
  prepareEncryptedDatabaseForFirstAdmin: vi.fn(async () => ({
    instanceKeyHex: 'f'.repeat(64),
  })),
  getDb: vi.fn(async () => ({ dialect: 'sqlite' })),
  closeDb: vi.fn(async () => undefined),
  establishDataEncryptionKey: vi.fn(async () => undefined),
  backfillClientEncryptionIfNeeded: vi.fn(async () => undefined),
  backfillPeopleIsCastIntegerIfNeeded: vi.fn(async () => 0),
}))

const instanceKeyMocks = vi.hoisted(() => ({
  wrapInstanceKeyForUser: vi.fn(async () => ({
    user_id: 'admin-1',
    username: 'admin',
    wrap_salt: 'aa'.repeat(16),
    wrapped_instance_key: 'wrap1:abc',
    version: 1 as const,
    created_at: '2026-01-01T00:00:00.000Z',
    rotated_at: null,
    revoked_at: null,
  })),
  upsertUserInstanceKeyWrapper: vi.fn(async () => undefined),
}))

vi.mock('@/lib/security/recoveryKey', () => recoveryMocks)
vi.mock('@/lib/security/instanceKey', () => instanceKeyMocks)
vi.mock('@/lib/auth/authService', () => authMocks)
vi.mock('@/lib/db/dbUnlock', () => ({
  prepareEncryptedDatabaseForFirstAdmin: dbMocks.prepareEncryptedDatabaseForFirstAdmin,
}))
vi.mock('@/lib/db/client', () => ({
  closeDb: dbMocks.closeDb,
  getDb: dbMocks.getDb,
}))
vi.mock('@/lib/security/dataEncryptionContext', () => ({
  establishDataEncryptionKey: dbMocks.establishDataEncryptionKey,
  exportDataEncryptionKeyHex: vi.fn(
    () => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  ),
}))
vi.mock('@/lib/db/migrations/backfillClientEncryption', () => ({
  backfillClientEncryptionIfNeeded: dbMocks.backfillClientEncryptionIfNeeded,
}))
vi.mock('@/lib/db/migrations/backfillPeopleIsCastInteger', () => ({
  backfillPeopleIsCastIntegerIfNeeded: dbMocks.backfillPeopleIsCastIntegerIfNeeded,
}))

describe('InitialAdminSetupWizard', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(false)
    recoveryMocks.generateRecoveryKey.mockReturnValue(
      '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888'
    )
  })

  it('shows recovery key step with warning copy after credentials continue', async () => {
    const user = userEvent.setup()
    render(<InitialAdminSetupWizard busy={false} onComplete={vi.fn()} onError={vi.fn()} />)

    await user.type(screen.getByLabelText('Admin username'), 'admin')
    await user.type(screen.getByLabelText('Admin password'), 'adminpass123')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByText(/will not be shown again/i)).toBeTruthy()
    expect(screen.getByText(/cannot be recovered if you forget your password/i)).toBeTruthy()
    expect(screen.getByText(/Albatross cannot recover your data for you/i)).toBeTruthy()
    expect(screen.getByLabelText('Recovery key').textContent).toContain(
      '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888'
    )
    expect(recoveryMocks.generateRecoveryKey).toHaveBeenCalledTimes(1)
  })

  it('blocks admin creation until recovery key confirmation is checked', async () => {
    const user = userEvent.setup()
    render(<InitialAdminSetupWizard busy={false} onComplete={vi.fn()} onError={vi.fn()} />)

    await user.type(screen.getByLabelText('Admin username'), 'admin')
    await user.type(screen.getByLabelText('Admin password'), 'adminpass123')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const createButton = screen.getByRole('button', { name: 'Create admin account' })
    expect(createButton.hasAttribute('disabled')).toBe(true)

    await user.click(createButton)
    expect(authMocks.setupInitialAdmin).not.toHaveBeenCalled()

    await user.click(screen.getByLabelText('I have saved this recovery key'))
    expect(createButton.hasAttribute('disabled')).toBe(false)
  })

  it('persists verifier hash and completes setup when confirmed', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn(async () => undefined)
    render(<InitialAdminSetupWizard busy={false} onComplete={onComplete} onError={vi.fn()} />)

    await user.type(screen.getByLabelText('Admin username'), 'admin')
    await user.type(screen.getByLabelText('Admin password'), 'adminpass123')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByLabelText('I have saved this recovery key'))
    await user.click(screen.getByRole('button', { name: 'Create admin account' }))

    await waitFor(() => expect(authMocks.setupInitialAdmin).toHaveBeenCalled())
    expect(instanceKeyMocks.wrapInstanceKeyForUser).toHaveBeenCalledWith(
      'adminpass123',
      'f'.repeat(64),
      expect.objectContaining({ userId: 'admin-1', username: 'admin' })
    )
    expect(instanceKeyMocks.upsertUserInstanceKeyWrapper).toHaveBeenCalled()
    expect(dbMocks.establishDataEncryptionKey).toHaveBeenCalled()
    const establishOrder = dbMocks.establishDataEncryptionKey.mock.invocationCallOrder[0] ?? 0
    const persistOrder = recoveryMocks.persistRecoveryKeyMaterial.mock.invocationCallOrder[0] ?? 0
    expect(establishOrder).toBeLessThan(persistOrder)
    expect(recoveryMocks.hashRecoveryKey).toHaveBeenCalledWith(
      '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888'
    )
    expect(recoveryMocks.persistRecoveryKeyMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        verifier: '$argon2id$v=19$m=19456,t=2,p=1$mock',
        sqlCipherPassphraseHex: 'f'.repeat(64),
        dekHex: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      })
    )
    expect(onComplete).toHaveBeenCalledWith({
      sessionToken: 'session-token',
      repairedPeople: 0,
    })
  })
})
