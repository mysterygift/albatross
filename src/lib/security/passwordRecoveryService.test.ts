import { beforeEach, describe, expect, it, vi } from 'vitest'

const recoveryMocks = vi.hoisted(() => ({
  recoveryKeyMetaExists: vi.fn(async () => true),
  readRecoveryKeyMeta: vi.fn(),
  verifyRecoveryKey: vi.fn(async () => true),
  unwrapSqlCipherPassphrase: vi.fn(async () => 'c'.repeat(64)),
  unwrapInstanceKeyFromRecoveryEscrow: vi.fn(async () => 'c'.repeat(64)),
  unwrapEscrowedDek: vi.fn(async () => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  refreshRecoveryEscrowAfterRecovery: vi.fn(async () => undefined),
  hashRecoveryKey: vi.fn(async () => '$argon2id$dummy'),
}))

const instanceKeyMocks = vi.hoisted(() => ({
  readInstanceKeyWrappersMeta: vi.fn(async () => ({
    version: 1 as const,
    wrappers: [],
  })),
  findWrapperForUsername: vi.fn(() => null),
  upsertUserInstanceKeyWrapper: vi.fn(async () => undefined),
  replaceUserInstanceKeyWrapper: vi.fn(async () => ({
    user_id: 'admin-1',
    username: 'admin',
    wrap_salt: 'aa'.repeat(16),
    wrapped_instance_key: 'wrap1:abc',
    version: 1 as const,
    created_at: '2025-01-01T00:00:00.000Z',
    rotated_at: '2026-01-02T00:00:00.000Z',
    revoked_at: null,
  })),
  findWrapperForUserId: vi.fn(() => null),
}))

const dbFileMocks = vi.hoisted(() => ({
  readDbEncryptionMeta: vi.fn(async () => ({ version: 1 as const, kdf_salt: 'f'.repeat(32) })),
  deriveSqlCipherPassphraseFromPassword: vi.fn(async () => 'n'.repeat(64)),
  rekeySqlCipherDatabase: vi.fn(async () => undefined),
}))

const clientMocks = vi.hoisted(() => ({
  closeDb: vi.fn(async () => undefined),
  openDbWithFileKey: vi.fn(),
}))

const authMocks = vi.hoisted(() => ({
  clearPersistedAuthSession: vi.fn(async () => undefined),
  hashPassword: vi.fn(async () => '$argon2id$new'),
}))

const reencryptMocks = vi.hoisted(() => ({
  reencryptAllClientFields: vi.fn(async () => 1),
}))

const dekMocks = vi.hoisted(() => ({
  deriveDekFromPassword: vi.fn(async () => new Uint8Array(32)),
  dataEncryptionKeyFromHex: vi.fn(() => new Uint8Array(32)),
  dekBytesToHex: vi.fn(() => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
}))

vi.mock('@/lib/security/recoveryKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/recoveryKey')>()
  return {
    ...actual,
    ...recoveryMocks,
  }
})
vi.mock('@/lib/security/dbFileEncryption', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/dbFileEncryption')>()
  return { ...actual, ...dbFileMocks }
})
vi.mock('@/lib/security/instanceKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/instanceKey')>()
  return { ...actual, ...instanceKeyMocks }
})
vi.mock('@/lib/db/client', () => clientMocks)
vi.mock('@/lib/auth/authService', () => ({
  clearPersistedAuthSession: authMocks.clearPersistedAuthSession,
}))
vi.mock('@/lib/auth/passwordHash', () => ({
  hashPassword: authMocks.hashPassword,
}))
vi.mock('@/lib/security/auditLog', () => ({
  appendAuditLog: vi.fn(async () => undefined),
}))
vi.mock('@/lib/db/migrations/reencryptClientFields', () => reencryptMocks)
vi.mock('@/lib/security/dataEncryptionContext', () => dekMocks)

import { appendAuditLog } from '@/lib/security/auditLog'
import {
  RATE_LIMIT_ERROR_MESSAGE,
  resetRateLimiterForTests,
} from '@/lib/security/rateLimiter'
import {
  RECOVERY_FAILED_MESSAGE,
  recoverAdminPasswordWithRecoveryKey,
} from '@/lib/security/passwordRecoveryService'

function v2Meta() {
  return {
    version: 2 as const,
    verifier: '$argon2id$v',
    created_at: '2026-01-01T00:00:00.000Z',
    wrap_salt: 'aa'.repeat(16),
    wrapped_file_passphrase: 'wrap1:abc',
  }
}

function v3Meta() {
  return {
    version: 3 as const,
    verifier: '$argon2id$v',
    created_at: '2026-01-01T00:00:00.000Z',
    wrap_salt: 'aa'.repeat(16),
    wrapped_file_passphrase: 'wrap1:abc',
    dek_wrap_salt: 'bb'.repeat(16),
    wrapped_dek: 'wrap1:dek',
    dek_wrap_mode: 'recovery' as const,
  }
}

function mockDb(adminId = 'admin-1', dekSalt = 'cc'.repeat(16)) {
  const db = {
    dialect: 'sqlite' as const,
    select: vi.fn(async () => [
      { id: adminId, username: 'admin', dek_salt: dekSalt },
    ]),
    execute: vi.fn(async () => undefined),
  }
  clientMocks.openDbWithFileKey.mockResolvedValue(db)
  return db
}

describe('passwordRecoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimiterForTests()
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
    recoveryMocks.readRecoveryKeyMeta.mockResolvedValue(v2Meta())
    recoveryMocks.verifyRecoveryKey.mockResolvedValue(true)
    recoveryMocks.unwrapSqlCipherPassphrase.mockResolvedValue('c'.repeat(64))
    mockDb()
  })

  it('instance key mode recovery opens DB without rekey and re-wraps user wrapper', async () => {
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    const db = mockDb()
    await recoverAdminPasswordWithRecoveryKey({
      recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123',
    })

    expect(recoveryMocks.unwrapInstanceKeyFromRecoveryEscrow).toHaveBeenCalled()
    expect(dbFileMocks.rekeySqlCipherDatabase).not.toHaveBeenCalled()
    expect(clientMocks.openDbWithFileKey).toHaveBeenCalledWith('c'.repeat(64))
    expect(instanceKeyMocks.replaceUserInstanceKeyWrapper).toHaveBeenCalledWith(
      'newpass123',
      'c'.repeat(64),
      expect.objectContaining({ userId: 'admin-1', username: 'admin' }),
      null
    )
    expect(instanceKeyMocks.upsertUserInstanceKeyWrapper).toHaveBeenCalled()
  })

  it('valid recovery key rekeys DB and resets admin password', async () => {
    const db = mockDb()
    await recoverAdminPasswordWithRecoveryKey({
      recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123',
    })

    expect(dbFileMocks.rekeySqlCipherDatabase).toHaveBeenCalledWith('c'.repeat(64), 'n'.repeat(64))
    expect(clientMocks.openDbWithFileKey).toHaveBeenCalledWith('n'.repeat(64))
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      expect.arrayContaining(['$argon2id$new'])
    )
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE sessions'),
      expect.any(Array)
    )
    expect(authMocks.clearPersistedAuthSession).toHaveBeenCalled()
    expect(appendAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: 'auth.password_recovered',
        metadata: expect.objectContaining({ clientPiiReencrypted: false }),
      })
    )
    expect(reencryptMocks.reencryptAllClientFields).not.toHaveBeenCalled()
  })

  it('v3 recovery re-encrypts client PII and refreshes escrow', async () => {
    recoveryMocks.readRecoveryKeyMeta.mockResolvedValue(v3Meta())
    const db = mockDb()
    await recoverAdminPasswordWithRecoveryKey({
      recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123',
    })

    expect(recoveryMocks.unwrapEscrowedDek).toHaveBeenCalled()
    expect(reencryptMocks.reencryptAllClientFields).toHaveBeenCalled()
    expect(recoveryMocks.refreshRecoveryEscrowAfterRecovery).toHaveBeenCalled()
    expect(appendAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        metadata: expect.objectContaining({ clientPiiReencrypted: true, version: 3 }),
      })
    )
  })

  it('v3 DEK unwrap failure blocks rekey', async () => {
    recoveryMocks.readRecoveryKeyMeta.mockResolvedValue(v3Meta())
    recoveryMocks.unwrapEscrowedDek.mockRejectedValue(new Error('bad dek'))
    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
        newPassword: 'newpass123',
        confirmPassword: 'newpass123',
      })
    ).rejects.toThrow(RECOVERY_FAILED_MESSAGE)
    expect(dbFileMocks.rekeySqlCipherDatabase).not.toHaveBeenCalled()
  })

  it('invalid recovery key blocks reset', async () => {
    recoveryMocks.verifyRecoveryKey.mockResolvedValue(false)
    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: 'bad-key',
        newPassword: 'newpass123',
        confirmPassword: 'newpass123',
      })
    ).rejects.toThrow(RECOVERY_FAILED_MESSAGE)
    expect(dbFileMocks.rekeySqlCipherDatabase).not.toHaveBeenCalled()
    expect(clientMocks.openDbWithFileKey).not.toHaveBeenCalled()
  })

  it('v1 recovery meta blocks reset without opening DB', async () => {
    recoveryMocks.readRecoveryKeyMeta.mockResolvedValue({
      version: 1,
      verifier: '$argon2id$v',
      created_at: '2026-01-01T00:00:00.000Z',
    })
    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
        newPassword: 'newpass123',
        confirmPassword: 'newpass123',
      })
    ).rejects.toThrow(RECOVERY_FAILED_MESSAGE)
    expect(dbFileMocks.rekeySqlCipherDatabase).not.toHaveBeenCalled()
    expect(clientMocks.openDbWithFileKey).not.toHaveBeenCalled()
  })

  it('password mismatch is rejected before recovery', async () => {
    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: 'key',
        newPassword: 'newpass123',
        confirmPassword: 'different',
      })
    ).rejects.toThrow('Passwords do not match')
    expect(dbFileMocks.rekeySqlCipherDatabase).not.toHaveBeenCalled()
  })

  it('missing recovery meta blocks reset', async () => {
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(false)
    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: 'key',
        newPassword: 'newpass123',
        confirmPassword: 'newpass123',
      })
    ).rejects.toThrow(RECOVERY_FAILED_MESSAGE)
    expect(dbFileMocks.rekeySqlCipherDatabase).not.toHaveBeenCalled()
  })

  it('rate limits recovery attempts', async () => {
    const rule = { maxAttempts: 1, windowMs: 60_000 }
    await recoverAdminPasswordWithRecoveryKey({
      recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123',
      rateLimitRule: rule,
      rateLimitNowMs: 1,
    })
    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
        newPassword: 'newpass123',
        confirmPassword: 'newpass123',
        rateLimitRule: rule,
        rateLimitNowMs: 2,
      })
    ).rejects.toThrow(RATE_LIMIT_ERROR_MESSAGE)
    expect(dbFileMocks.rekeySqlCipherDatabase).toHaveBeenCalledTimes(1)
  })

  it('unwrap failure blocks rekey and DB open', async () => {
    recoveryMocks.unwrapSqlCipherPassphrase.mockRejectedValue(new Error('decrypt failed'))
    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
        newPassword: 'newpass123',
        confirmPassword: 'newpass123',
      })
    ).rejects.toThrow(RECOVERY_FAILED_MESSAGE)
    expect(dbFileMocks.rekeySqlCipherDatabase).not.toHaveBeenCalled()
    expect(clientMocks.openDbWithFileKey).not.toHaveBeenCalled()
  })

  it('rekey failure blocks DB open and credential updates', async () => {
    dbFileMocks.rekeySqlCipherDatabase.mockRejectedValue(new Error('rekey failed'))
    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
        newPassword: 'newpass123',
        confirmPassword: 'newpass123',
      })
    ).rejects.toThrow(RECOVERY_FAILED_MESSAGE)
    expect(clientMocks.openDbWithFileKey).not.toHaveBeenCalled()
    expect(authMocks.clearPersistedAuthSession).not.toHaveBeenCalled()
  })

  it('closes DB when recovery fails after openDbWithFileKey', async () => {
    const db = mockDb()
    db.select.mockResolvedValueOnce([])
    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
        newPassword: 'newpass123',
        confirmPassword: 'newpass123',
      })
    ).rejects.toThrow(RECOVERY_FAILED_MESSAGE)
    expect(dbFileMocks.rekeySqlCipherDatabase).toHaveBeenCalled()
    expect(clientMocks.openDbWithFileKey).toHaveBeenCalled()
    expect(clientMocks.closeDb).toHaveBeenCalled()
    expect(authMocks.clearPersistedAuthSession).not.toHaveBeenCalled()
  })

  it('successful recovery clears persisted session', async () => {
    await recoverAdminPasswordWithRecoveryKey({
      recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123',
    })
    expect(authMocks.clearPersistedAuthSession).toHaveBeenCalled()
  })
})
