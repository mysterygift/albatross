import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  closeDb: vi.fn(async () => undefined),
  openDbWithFileKey: vi.fn(async () => undefined),
  isDbUnlocked: vi.fn(() => true),
  getActiveSqlCipherKeyHex: vi.fn(() => 'a'.repeat(64)),
}))

const dbUnlockMocks = vi.hoisted(() => ({
  prepareEncryptedDatabaseForFirstAdmin: vi.fn(async () => ({
    instanceKeyHex: 'a'.repeat(64),
  })),
  recoverFromPreSqlcipherBackupIfAvailable: vi.fn(async () => false),
}))

const dbFileMocks = vi.hoisted(() => ({
  needsPlainToEncryptedMigration: vi.fn(async () => false),
  readDbEncryptionMeta: vi.fn(async () => ({
    version: 2 as const,
    key_mode: 'instance_key' as const,
  })),
  deriveSqlCipherPassphraseFromPassword: vi.fn(async () => 'legacy-pass'),
}))

const instanceKeyMocks = vi.hoisted(() => ({
  readInstanceKeyWrappersMeta: vi.fn(async () => null),
}))

const recoveryMocks = vi.hoisted(() => ({
  recoveryKeyMetaExists: vi.fn(async () => false),
}))

vi.mock('@/lib/db/client', () => clientMocks)
vi.mock('@/lib/db/dbUnlock', () => dbUnlockMocks)
vi.mock('@/lib/security/dbFileEncryption', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/dbFileEncryption')>()
  return {
    ...actual,
    ...dbFileMocks,
  }
})
vi.mock('@/lib/security/instanceKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/instanceKey')>()
  return {
    ...actual,
    ...instanceKeyMocks,
  }
})
vi.mock('@/lib/security/recoveryKey', () => recoveryMocks)

import {
  getPreparedInstanceKeyForSetup,
  isSetupEncryptionAlreadyPrepared,
  runSetupEncryption,
  SETUP_ENCRYPTION_FAILED_MESSAGE,
} from '@/lib/auth/setupEncryptionService'

describe('setupEncryptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clientMocks.isDbUnlocked.mockReturnValue(true)
    dbUnlockMocks.prepareEncryptedDatabaseForFirstAdmin.mockImplementation(async () => {
      clientMocks.isDbUnlocked.mockReturnValue(true)
      return { instanceKeyHex: 'a'.repeat(64) }
    })
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    dbFileMocks.needsPlainToEncryptedMigration.mockResolvedValue(false)
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(false)
    instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(null)
  })

  it('runSetupEncryption returns safe status without key material', async () => {
    clientMocks.isDbUnlocked.mockReturnValue(false)

    const result = await runSetupEncryption()

    expect(result).toEqual({ status: 'ready', keyMode: 'instance_key' })
    expect(JSON.stringify(result)).not.toContain('a'.repeat(64))
    expect(dbUnlockMocks.prepareEncryptedDatabaseForFirstAdmin).toHaveBeenCalled()
  })

  it('runSetupEncryption skips prepare when already prepared in same session', async () => {
    await runSetupEncryption()
    vi.clearAllMocks()
    clientMocks.isDbUnlocked.mockReturnValue(true)

    const result = await runSetupEncryption()
    expect(result).toEqual({ status: 'ready', keyMode: 'instance_key' })
    expect(dbUnlockMocks.prepareEncryptedDatabaseForFirstAdmin).not.toHaveBeenCalled()
  })

  it('isSetupEncryptionAlreadyPrepared is false when DB is locked', async () => {
    clientMocks.isDbUnlocked.mockReturnValue(false)
    await expect(isSetupEncryptionAlreadyPrepared()).resolves.toBe(false)
  })

  it('isSetupEncryptionAlreadyPrepared is false when recovery meta exists', async () => {
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
    await expect(isSetupEncryptionAlreadyPrepared()).resolves.toBe(false)
  })

  it('getPreparedInstanceKeyForSetup returns active SQLCipher key', () => {
    expect(getPreparedInstanceKeyForSetup()).toBe('a'.repeat(64))
  })

  it('runSetupEncryption restores backup and throws generic message on failure', async () => {
    clientMocks.isDbUnlocked.mockReturnValue(false)
    dbFileMocks.needsPlainToEncryptedMigration.mockResolvedValue(true)
    dbUnlockMocks.prepareEncryptedDatabaseForFirstAdmin.mockRejectedValueOnce(
      new Error('migration failed with secret key abc')
    )

    await expect(runSetupEncryption()).rejects.toThrow(SETUP_ENCRYPTION_FAILED_MESSAGE)
    expect(dbUnlockMocks.recoverFromPreSqlcipherBackupIfAvailable).toHaveBeenCalled()
    expect(clientMocks.closeDb).toHaveBeenCalled()
  })

  it('runSetupEncryption does not derive SQLCipher key from admin password', async () => {
    clientMocks.isDbUnlocked.mockReturnValue(false)
    await runSetupEncryption()
    expect(dbFileMocks.deriveSqlCipherPassphraseFromPassword).not.toHaveBeenCalled()
  })
})
