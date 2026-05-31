import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  closeDb: vi.fn(async () => undefined),
  openDbWithFileKey: vi.fn(async () => undefined),
}))

const dbFileMocks = vi.hoisted(() => ({
  readDbEncryptionMeta: vi.fn(),
  deriveSqlCipherPassphraseFromPassword: vi.fn(async () => 'legacy-pass-hex'),
  backupEncryptedDbBeforeRekey: vi.fn(async () => undefined),
  rekeySqlCipherDatabase: vi.fn(async () => undefined),
  restoreSqliteFromInstanceKeyBackup: vi.fn(async () => undefined),
  writeDbEncryptionMeta: vi.fn(async () => undefined),
}))

const instanceKeyMocks = vi.hoisted(() => ({
  generateInstanceKeyHex: vi.fn(() => 'b'.repeat(64)),
  wrapInstanceKeyForUser: vi.fn(async () => ({
    user_id: 'user-1',
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

const recoveryMocks = vi.hoisted(() => ({
  readRecoveryKeyMeta: vi.fn(async () => null),
  updateRecoveryEscrowInstanceKey: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db/client', () => clientMocks)
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
vi.mock('@/lib/security/recoveryKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/recoveryKey')>()
  return {
    ...actual,
    readRecoveryKeyMeta: recoveryMocks.readRecoveryKeyMeta,
    updateRecoveryEscrowInstanceKey: recoveryMocks.updateRecoveryEscrowInstanceKey,
  }
})

import {
  INSTANCE_KEY_MIGRATION_FAILED_MESSAGE,
  migrateToInstanceKeyModeIfNeeded,
} from '@/lib/security/instanceKeyMigration'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

const mockDb: DatabaseAdapter = {
  dialect: 'sqlite',
  select: vi.fn(async () => [{ ok: 1 }]) as DatabaseAdapter['select'],
  execute: vi.fn(async () => ({ rowsAffected: 0, lastInsertId: 0 })),
  executeBatch: vi.fn(async () => undefined),
  runInSerializedTransaction: vi.fn(async (fn) => fn()),
}

describe('instanceKeyMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 1,
      kdf_salt: 'f'.repeat(32),
    })
  })

  it('skips when already on instance key mode', async () => {
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    const migrated = await migrateToInstanceKeyModeIfNeeded(
      mockDb,
      { userId: 'user-1', username: 'admin' },
      'password'
    )
    expect(migrated).toBe(false)
    expect(dbFileMocks.rekeySqlCipherDatabase).not.toHaveBeenCalled()
  })

  it('migrates legacy v1 meta to instance key mode', async () => {
    const migrated = await migrateToInstanceKeyModeIfNeeded(
      mockDb,
      { userId: 'user-1', username: 'admin' },
      'password'
    )
    expect(migrated).toBe(true)
    expect(dbFileMocks.backupEncryptedDbBeforeRekey).toHaveBeenCalled()
    expect(dbFileMocks.rekeySqlCipherDatabase).toHaveBeenCalledWith(
      'legacy-pass-hex',
      'b'.repeat(64)
    )
    expect(instanceKeyMocks.upsertUserInstanceKeyWrapper).toHaveBeenCalled()
    expect(dbFileMocks.writeDbEncryptionMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 2,
        key_mode: 'instance_key',
        legacy_kdf_salt: 'f'.repeat(32),
      })
    )
    expect(clientMocks.openDbWithFileKey).toHaveBeenCalledWith('b'.repeat(64))
  })

  it('rolls back when rekey fails', async () => {
    dbFileMocks.rekeySqlCipherDatabase.mockRejectedValueOnce(new Error('rekey failed'))
    await expect(
      migrateToInstanceKeyModeIfNeeded(
        mockDb,
        { userId: 'user-1', username: 'admin' },
        'password'
      )
    ).rejects.toThrow(INSTANCE_KEY_MIGRATION_FAILED_MESSAGE)
    expect(dbFileMocks.restoreSqliteFromInstanceKeyBackup).toHaveBeenCalled()
    expect(dbFileMocks.writeDbEncryptionMeta).not.toHaveBeenCalled()
  })
})
