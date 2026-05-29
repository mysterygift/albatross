import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  closeDb: vi.fn(async () => undefined),
  openDbWithFileKey: vi.fn(async () => undefined),
  openPlainDbIfExists: vi.fn(async () => ({ dialect: 'sqlite' })),
  isDbUnlocked: vi.fn(() => false),
}))

const dbFileMocks = vi.hoisted(() => ({
  needsPlainToEncryptedMigration: vi.fn(async () => false),
  readDbEncryptionMeta: vi.fn(async () => null),
  deriveSqlCipherPassphraseFromPassword: vi.fn(async () => 'legacy-pass-hex'),
  probeSqlCipherPassphrase: vi.fn(async () => true),
  migratePlainDbToSqlcipher: vi.fn(async () => undefined),
  writeDbEncryptionMeta: vi.fn(async () => undefined),
}))

const instanceKeyMocks = vi.hoisted(() => ({
  readInstanceKeyWrappersMeta: vi.fn(async () => ({
    version: 1 as const,
    wrappers: [
      {
        user_id: 'user-1',
        username: 'admin',
        wrap_salt: 'aa'.repeat(16),
        wrapped_instance_key: 'wrap1:abc',
        version: 1 as const,
        created_at: '2020-01-01T00:00:00.000Z',
        rotated_at: null,
        revoked_at: null,
      },
    ],
  })),
  unwrapInstanceKeyForUser: vi.fn(async () => 'c'.repeat(64)),
  generateInstanceKeyHex: vi.fn(() => 'd'.repeat(64)),
}))

vi.mock('@/lib/db/client', () => clientMocks)
vi.mock('@/lib/db/repositories/settings', () => ({
  setSetting: vi.fn(async () => undefined),
}))
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

import { unlockLocalDatabaseWithPassword } from '@/lib/db/dbUnlock'

describe('dbUnlock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('v2 instance key mode unlocks via user wrapper', async () => {
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    await unlockLocalDatabaseWithPassword({ username: 'admin', password: 'secret' })
    expect(instanceKeyMocks.unwrapInstanceKeyForUser).toHaveBeenCalled()
    expect(clientMocks.openDbWithFileKey).toHaveBeenCalledWith('c'.repeat(64))
    expect(dbFileMocks.deriveSqlCipherPassphraseFromPassword).not.toHaveBeenCalled()
  })

  it('v1 legacy meta still derives passphrase from password', async () => {
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 1,
      kdf_salt: 'f'.repeat(32),
    })
    await unlockLocalDatabaseWithPassword({ username: 'admin', password: 'secret' })
    expect(dbFileMocks.deriveSqlCipherPassphraseFromPassword).toHaveBeenCalledWith(
      'secret',
      'f'.repeat(32)
    )
    expect(clientMocks.openDbWithFileKey).toHaveBeenCalledWith('legacy-pass-hex')
  })

  it('v2 unlock fails when wrapper is missing', async () => {
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValueOnce({ version: 1, wrappers: [] })
    await expect(
      unlockLocalDatabaseWithPassword({ username: 'admin', password: 'secret' })
    ).rejects.toThrow('Unable to unlock local database')
  })

  it('v2 unlock fails when wrapper is revoked', async () => {
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValueOnce({
      version: 1,
      wrappers: [
        {
          user_id: 'user-1',
          username: 'admin',
          wrap_salt: 'aa'.repeat(16),
          wrapped_instance_key: 'wrap1:abc',
          version: 1 as const,
          created_at: '2020-01-01T00:00:00.000Z',
          rotated_at: null,
          revoked_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    await expect(
      unlockLocalDatabaseWithPassword({ username: 'admin', password: 'secret' })
    ).rejects.toThrow('Unable to unlock local database')
    expect(instanceKeyMocks.unwrapInstanceKeyForUser).not.toHaveBeenCalled()
  })
})
