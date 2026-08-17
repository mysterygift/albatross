import { beforeEach, describe, expect, it, vi } from 'vitest'

const recoveryMocks = vi.hoisted(() => ({
  hashRecoveryKey: vi.fn(async () => '$argon2id$v=19$m=19456,t=2,p=1$mock'),
  persistRecoveryKeyMaterial: vi.fn(async () => undefined),
  recoveryKeyMetaExists: vi.fn(async () => false),
}))

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(async () => ({
    dialect: 'sqlite',
    select: vi.fn(async () => [{ id: 'admin-1', username: 'admin', role: 'admin' }]),
  })),
  closeDb: vi.fn(async () => undefined),
  isDbUnlocked: vi.fn(() => true),
}))

const encryptionMocks = vi.hoisted(() => ({
  getPreparedInstanceKeyForSetup: vi.fn(() => 'f'.repeat(64)),
  isSetupEncryptionAlreadyPrepared: vi.fn(async () => true),
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

const dataEncryptionMocks = vi.hoisted(() => ({
  establishDataEncryptionKey: vi.fn(async () => undefined),
  exportDataEncryptionKeyHex: vi.fn(
    () => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  ),
}))

const authMocks = vi.hoisted(() => ({
  login: vi.fn(async () => ({
    user: { id: 'admin-1', username: 'admin', role: 'admin' as const },
    sessionToken: 'session-token-abc',
  })),
}))

const backfillMocks = vi.hoisted(() => ({
  backfillClientEncryptionIfNeeded: vi.fn(async () => undefined),
  backfillSensitiveEntityEncryptionIfNeeded: vi.fn(async () => undefined),
  backfillPeopleIsCastIntegerIfNeeded: vi.fn(async () => 0),
}))

const statusMocks = vi.hoisted(() => ({
  verifySetupCommitPredicates: vi.fn(async () => true),
}))

vi.mock('@/lib/security/recoveryKey', () => recoveryMocks)
vi.mock('@/lib/security/instanceKey', () => instanceKeyMocks)
vi.mock('@/lib/auth/setupEncryptionService', () => encryptionMocks)
vi.mock('@/lib/db/client', () => dbMocks)
vi.mock('@/lib/security/dataEncryptionContext', () => dataEncryptionMocks)
vi.mock('@/lib/auth/authService', () => authMocks)
vi.mock('@/lib/db/migrations/backfillClientEncryption', () => ({
  backfillClientEncryptionIfNeeded: backfillMocks.backfillClientEncryptionIfNeeded,
}))
vi.mock('@/lib/db/migrations/backfillSensitiveEntityEncryption', () => ({
  backfillSensitiveEntityEncryptionIfNeeded: backfillMocks.backfillSensitiveEntityEncryptionIfNeeded,
}))
vi.mock('@/lib/db/migrations/backfillPeopleIsCastInteger', () => ({
  backfillPeopleIsCastIntegerIfNeeded: backfillMocks.backfillPeopleIsCastIntegerIfNeeded,
}))

vi.mock('@/lib/auth/initialSetupStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/initialSetupStatus')>()
  return {
    ...actual,
    verifySetupCommitPredicates: statusMocks.verifySetupCommitPredicates,
  }
})

import {
  runSetupCommit,
  SETUP_COMMIT_FAILED_MESSAGE,
} from '@/lib/auth/setupCommitService'

const TEST_RECOVERY_KEY =
  '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888'
const TEST_PASSWORD = 'validpass123'

describe('setupCommitService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMocks.isDbUnlocked.mockReturnValue(true)
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(false)
    encryptionMocks.isSetupEncryptionAlreadyPrepared.mockResolvedValue(true)
    statusMocks.verifySetupCommitPredicates.mockResolvedValue(true)
    authMocks.login.mockResolvedValue({
      user: { id: 'admin-1', username: 'admin', role: 'admin' as const },
      sessionToken: 'session-token-abc',
    })
  })

  it('persists recovery verifier and escrow metadata', async () => {
    await runSetupCommit({
      plainRecoveryKey: TEST_RECOVERY_KEY,
      username: 'admin',
      password: TEST_PASSWORD,
    })

    expect(recoveryMocks.hashRecoveryKey).toHaveBeenCalledWith(TEST_RECOVERY_KEY)
    expect(recoveryMocks.persistRecoveryKeyMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        plainRecoveryKey: TEST_RECOVERY_KEY,
        verifier: '$argon2id$v=19$m=19456,t=2,p=1$mock',
        sqlCipherPassphraseHex: 'f'.repeat(64),
        dekHex: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      })
    )
  })

  it('creates admin instance-key wrapper', async () => {
    await runSetupCommit({
      plainRecoveryKey: TEST_RECOVERY_KEY,
      username: 'admin',
      password: TEST_PASSWORD,
    })

    expect(instanceKeyMocks.wrapInstanceKeyForUser).toHaveBeenCalledWith(
      TEST_PASSWORD,
      'f'.repeat(64),
      expect.objectContaining({ userId: 'admin-1', username: 'admin' })
    )
    expect(instanceKeyMocks.upsertUserInstanceKeyWrapper).toHaveBeenCalled()
    expect(dataEncryptionMocks.establishDataEncryptionKey).toHaveBeenCalled()
  })

  it('creates a session and returns safe result payload', async () => {
    const result = await runSetupCommit({
      plainRecoveryKey: TEST_RECOVERY_KEY,
      username: 'admin',
      password: TEST_PASSWORD,
    })

    expect(authMocks.login).toHaveBeenCalledWith(expect.anything(), {
      username: 'admin',
      password: TEST_PASSWORD,
    })
    expect(result).toEqual({
      sessionToken: 'session-token-abc',
      repairedPeople: 0,
    })
    expect(JSON.stringify(result)).not.toContain(TEST_RECOVERY_KEY)
    expect(JSON.stringify(result)).not.toContain(TEST_PASSWORD)
    expect(JSON.stringify(result)).not.toContain('f'.repeat(64))
  })

  it('reports progress phases in order', async () => {
    const phases: string[] = []
    await runSetupCommit(
      {
        plainRecoveryKey: TEST_RECOVERY_KEY,
        username: 'admin',
        password: TEST_PASSWORD,
      },
      {
        onProgress: (phase) => phases.push(phase),
      }
    )

    expect(phases).toEqual([
      'encrypting_database',
      'creating_admin_access',
      'preparing_recovery',
    ])
  })

  it('rejects when recovery metadata already exists but predicates are incomplete', async () => {
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
    statusMocks.verifySetupCommitPredicates.mockResolvedValue(false)

    await expect(
      runSetupCommit({
        plainRecoveryKey: TEST_RECOVERY_KEY,
        username: 'admin',
        password: TEST_PASSWORD,
      })
    ).rejects.toThrow(SETUP_COMMIT_FAILED_MESSAGE)

    expect(instanceKeyMocks.wrapInstanceKeyForUser).not.toHaveBeenCalled()
    expect(authMocks.login).not.toHaveBeenCalled()
    expect(dbMocks.closeDb).toHaveBeenCalled()
  })

  it('skips re-persist when recovery metadata already exists and predicates pass', async () => {
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
    statusMocks.verifySetupCommitPredicates.mockResolvedValue(true)

    const result = await runSetupCommit({
      plainRecoveryKey: TEST_RECOVERY_KEY,
      username: 'admin',
      password: TEST_PASSWORD,
    })

    expect(instanceKeyMocks.wrapInstanceKeyForUser).not.toHaveBeenCalled()
    expect(recoveryMocks.persistRecoveryKeyMaterial).not.toHaveBeenCalled()
    expect(authMocks.login).toHaveBeenCalled()
    expect(result.sessionToken).toBe('session-token-abc')
  })

  it('verifies commit predicates before creating a session', async () => {
    await runSetupCommit({
      plainRecoveryKey: TEST_RECOVERY_KEY,
      username: 'admin',
      password: TEST_PASSWORD,
    })

    expect(statusMocks.verifySetupCommitPredicates).toHaveBeenCalled()
    expect(authMocks.login).toHaveBeenCalled()
  })

  it('rejects when commit predicates fail after persist', async () => {
    statusMocks.verifySetupCommitPredicates.mockResolvedValue(false)

    await expect(
      runSetupCommit({
        plainRecoveryKey: TEST_RECOVERY_KEY,
        username: 'admin',
        password: TEST_PASSWORD,
      })
    ).rejects.toThrow(SETUP_COMMIT_FAILED_MESSAGE)

    expect(authMocks.login).not.toHaveBeenCalled()
    expect(dbMocks.closeDb).toHaveBeenCalled()
  })

  it('maps failures to a safe message and closes the database', async () => {
    instanceKeyMocks.wrapInstanceKeyForUser.mockRejectedValueOnce(
      new Error('secret instance key leak')
    )

    await expect(
      runSetupCommit({
        plainRecoveryKey: TEST_RECOVERY_KEY,
        username: 'admin',
        password: TEST_PASSWORD,
      })
    ).rejects.toThrow(SETUP_COMMIT_FAILED_MESSAGE)

    expect(authMocks.login).not.toHaveBeenCalled()
    expect(dbMocks.closeDb).toHaveBeenCalled()
  })

  it('supports safe retry after a failed attempt', async () => {
    instanceKeyMocks.wrapInstanceKeyForUser
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce({
        user_id: 'admin-1',
        username: 'admin',
        wrap_salt: 'aa'.repeat(16),
        wrapped_instance_key: 'wrap1:abc',
        version: 1 as const,
        created_at: '2026-01-01T00:00:00.000Z',
        rotated_at: null,
        revoked_at: null,
      })

    await expect(
      runSetupCommit({
        plainRecoveryKey: TEST_RECOVERY_KEY,
        username: 'admin',
        password: TEST_PASSWORD,
      })
    ).rejects.toThrow(SETUP_COMMIT_FAILED_MESSAGE)

    const result = await runSetupCommit({
      plainRecoveryKey: TEST_RECOVERY_KEY,
      username: 'admin',
      password: TEST_PASSWORD,
    })

    expect(result.sessionToken).toBe('session-token-abc')
    expect(instanceKeyMocks.wrapInstanceKeyForUser).toHaveBeenCalledTimes(2)
  })
})
