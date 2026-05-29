import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbEncryptionMocks = vi.hoisted(() => ({
  isLocalDbEncryptionEnabled: vi.fn(async () => true),
}))

const clientMocks = vi.hoisted(() => ({
  isDbUnlocked: vi.fn(() => false),
  closeDb: vi.fn(async () => undefined),
  getDb: vi.fn(),
}))

const recoveryMocks = vi.hoisted(() => ({
  recoveryKeyMetaExists: vi.fn(async () => true),
  readRecoveryKeyMeta: vi.fn(),
  verifyRecoveryKey: vi.fn(async () => true),
  unwrapSqlCipherPassphrase: vi.fn(async () => 'current-pass-hex'),
}))

const dbFileMocks = vi.hoisted(() => ({
  readDbEncryptionMeta: vi.fn(async () => ({ version: 1 as const, kdf_salt: 'f'.repeat(32) })),
  deriveSqlCipherPassphraseFromPassword: vi.fn(async () => 'new-pass-hex'),
  rekeySqlCipherDatabase: vi.fn(async () => undefined),
}))

const authMocks = vi.hoisted(() => ({
  getSetting: vi.fn(async () => 'session-token'),
}))

vi.mock('@/lib/security/dbFileEncryption', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/dbFileEncryption')>()
  return {
    ...actual,
    isLocalDbEncryptionEnabled: dbEncryptionMocks.isLocalDbEncryptionEnabled,
    readDbEncryptionMeta: dbFileMocks.readDbEncryptionMeta,
    deriveSqlCipherPassphraseFromPassword: dbFileMocks.deriveSqlCipherPassphraseFromPassword,
    rekeySqlCipherDatabase: dbFileMocks.rekeySqlCipherDatabase,
  }
})

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    isDbUnlocked: clientMocks.isDbUnlocked,
    closeDb: clientMocks.closeDb,
    getDb: clientMocks.getDb,
    openDbWithFileKey: vi.fn(async () => mockDb()),
  }
})

vi.mock('@/lib/security/recoveryKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/recoveryKey')>()
  return {
    ...actual,
    ...recoveryMocks,
  }
})

vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: authMocks.getSetting,
  setSetting: vi.fn(async () => undefined),
}))

vi.mock('@/lib/auth/passwordHash', () => ({
  hashPassword: vi.fn(async () => '$argon2id$new'),
}))

vi.mock('@/lib/auth/sessionToken', () => ({
  generateSessionToken: vi.fn(() => 'session-token'),
  hashSessionToken: vi.fn(async () => 'hashed-token'),
}))

vi.mock('@/lib/security/auditLog', () => ({
  appendAuditLog: vi.fn(async () => undefined),
}))

import { DatabaseLockedError, getDb } from '@/lib/db/client'
import { isLocalDatabaseLocked } from '@/lib/db/dbUnlock'
import {
  clearDataEncryptionKey,
  establishDataEncryptionKey,
  hasDataEncryptionKey,
} from '@/lib/security/dataEncryptionContext'
import {
  RECOVERY_FAILED_MESSAGE,
  recoverAdminPasswordWithRecoveryKey,
} from '@/lib/security/passwordRecoveryService'
import { resetRateLimiterForTests } from '@/lib/security/rateLimiter'

function v2Meta() {
  return {
    version: 2 as const,
    verifier: '$argon2id$v',
    created_at: '2026-01-01T00:00:00.000Z',
    wrap_salt: 'aa'.repeat(16),
    wrapped_file_passphrase: 'wrap1:abc',
  }
}

function mockDb(adminId = 'admin-1') {
  return {
    dialect: 'sqlite' as const,
    select: vi.fn(async (sql: string) => {
      if (sql.includes('dek_salt')) {
        return [{ dek_salt: '0123456789abcdef0123456789abcdef' }]
      }
      return [{ id: adminId, username: 'admin' }]
    }),
    execute: vi.fn(async () => undefined),
  }
}

describe('recovery lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimiterForTests()
    clearDataEncryptionKey()
    dbEncryptionMocks.isLocalDbEncryptionEnabled.mockResolvedValue(true)
    clientMocks.isDbUnlocked.mockReturnValue(false)
    clientMocks.getDb.mockImplementation(async () => {
      throw new DatabaseLockedError()
    })
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
    recoveryMocks.readRecoveryKeyMeta.mockResolvedValue(v2Meta())
    recoveryMocks.verifyRecoveryKey.mockResolvedValue(true)
    authMocks.getSetting.mockResolvedValue('session-token')
  })

  it('cold start with encryption enabled reports locked database', async () => {
    expect(await isLocalDatabaseLocked()).toBe(true)
    await expect(getDb()).rejects.toThrow(DatabaseLockedError)
  })

  it('failed recovery does not rekey and database stays locked', async () => {
    recoveryMocks.verifyRecoveryKey.mockResolvedValue(false)
    await expect(
      recoverAdminPasswordWithRecoveryKey({
        recoveryKey: 'bad-key',
        newPassword: 'newpass123',
        confirmPassword: 'newpass123',
      })
    ).rejects.toThrow(RECOVERY_FAILED_MESSAGE)
    expect(dbFileMocks.rekeySqlCipherDatabase).not.toHaveBeenCalled()
    expect(clientMocks.isDbUnlocked()).toBe(false)
  })

  it('successful recovery rekeys then clears session and closes database', async () => {
    const db = mockDb()
    const { openDbWithFileKey } = await import('@/lib/db/client')
    vi.mocked(openDbWithFileKey).mockResolvedValue(db as never)

    await recoverAdminPasswordWithRecoveryKey({
      recoveryKey: '11111111-22222222-33333333-44444444-55555555-66666666-77777777-88888888',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123',
    })

    expect(dbFileMocks.rekeySqlCipherDatabase).toHaveBeenCalledWith('current-pass-hex', 'new-pass-hex')
    expect(clientMocks.closeDb).toHaveBeenCalled()
    expect(clientMocks.isDbUnlocked()).toBe(false)
  })

  it('clearPersistedAuthSession clears DEK and closes database', async () => {
    const { clearPersistedAuthSession } = await import('@/lib/auth/authService')
    const db = mockDb()
    await establishDataEncryptionKey(db as never, 'admin-1', 'adminpass123')
    expect(hasDataEncryptionKey()).toBe(true)

    await clearPersistedAuthSession(db as never)

    expect(hasDataEncryptionKey()).toBe(false)
    expect(clientMocks.closeDb).toHaveBeenCalled()
  })
})
