import { beforeEach, describe, expect, it, vi } from 'vitest'

const instanceKeyMocks = vi.hoisted(() => ({
  readInstanceKeyWrappersMeta: vi.fn(),
  findWrapperForUsername: vi.fn(),
  isInstanceKeyWrapperActive: vi.fn(() => true),
  unwrapInstanceKeyForUser: vi.fn(async () => 'c'.repeat(64)),
}))

const recoveryMocks = vi.hoisted(() => ({
  readRecoveryKeyMeta: vi.fn(),
  recoveryMetaSupportsPasswordRecovery: vi.fn(),
  recoveryMetaSupportsClientPiiRecovery: vi.fn(),
  upgradeRecoveryMetaWithDekEscrow: vi.fn(async () => undefined),
}))

const dekMocks = vi.hoisted(() => ({
  exportDataEncryptionKeyHex: vi.fn(() => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  isClientEncryptionEnabled: vi.fn(async () => true),
}))

const dbFileMocks = vi.hoisted(() => ({
  readDbEncryptionMeta: vi.fn(async () => ({ version: 1 as const, kdf_salt: 'f'.repeat(32) })),
  deriveSqlCipherPassphraseFromPassword: vi.fn(async () => 'a'.repeat(64)),
}))

vi.mock('@/lib/security/instanceKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/instanceKey')>()
  return { ...actual, ...instanceKeyMocks }
})
vi.mock('@/lib/security/recoveryKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/recoveryKey')>()
  return { ...actual, ...recoveryMocks }
})
vi.mock('@/lib/security/dataEncryptionContext', () => dekMocks)
vi.mock('@/lib/security/dbFileEncryption', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/dbFileEncryption')>()
  return { ...actual, ...dbFileMocks }
})

import { ensureDekEscrowOnLogin } from '@/lib/security/dekEscrowMigration'

describe('dekEscrowMigration', () => {
  const db = { dialect: 'sqlite' } as never

  beforeEach(() => {
    vi.clearAllMocks()
    recoveryMocks.recoveryMetaSupportsPasswordRecovery.mockReturnValue(true)
    recoveryMocks.recoveryMetaSupportsClientPiiRecovery.mockReturnValue(false)
    recoveryMocks.readRecoveryKeyMeta.mockResolvedValue({
      version: 2,
      verifier: 'hash',
      created_at: '2026-01-01T00:00:00.000Z',
      wrap_salt: 'aa',
      wrapped_file_passphrase: 'wrap1:x',
    })
  })

  it('upgrades v2 sidecar with file_passphrase DEK escrow on login', async () => {
    await ensureDekEscrowOnLogin(db, 'user-1', 'admin', 'password123')
    expect(recoveryMocks.upgradeRecoveryMetaWithDekEscrow).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        dek_wrap_mode: 'file_passphrase',
        sqlCipherPassphraseHex: 'a'.repeat(64),
      })
    )
  })

  it('skips when client PII escrow already exists', async () => {
    recoveryMocks.recoveryMetaSupportsClientPiiRecovery.mockReturnValue(true)
    await ensureDekEscrowOnLogin(db, 'user-1', 'admin', 'password123')
    expect(recoveryMocks.upgradeRecoveryMetaWithDekEscrow).not.toHaveBeenCalled()
  })

  it('skips when recovery meta does not support password recovery', async () => {
    recoveryMocks.recoveryMetaSupportsPasswordRecovery.mockReturnValue(false)
    recoveryMocks.readRecoveryKeyMeta.mockResolvedValue(null)
    await ensureDekEscrowOnLogin(db, 'user-1', 'admin', 'password123')
    expect(recoveryMocks.upgradeRecoveryMetaWithDekEscrow).not.toHaveBeenCalled()
  })

  it('uses instance key unwrap path when meta v2 instance_key mode is active', async () => {
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue({
      version: 1,
      wrappers: [
        {
          user_id: 'user-1',
          username: 'admin',
          wrap_salt: 'aa'.repeat(16),
          wrapped_instance_key: 'wrap1:abc',
          version: 1,
          created_at: '2026-01-01T00:00:00.000Z',
          rotated_at: null,
          revoked_at: null,
        },
      ],
    })
    instanceKeyMocks.findWrapperForUsername.mockReturnValue({
      user_id: 'user-1',
      username: 'admin',
      wrap_salt: 'aa'.repeat(16),
      wrapped_instance_key: 'wrap1:abc',
      version: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      rotated_at: null,
      revoked_at: null,
    })

    await ensureDekEscrowOnLogin(db, 'user-1', 'admin', 'password123')
    expect(instanceKeyMocks.unwrapInstanceKeyForUser).toHaveBeenCalled()
    expect(dbFileMocks.deriveSqlCipherPassphraseFromPassword).not.toHaveBeenCalled()
    expect(recoveryMocks.upgradeRecoveryMetaWithDekEscrow).toHaveBeenCalledWith(
      expect.objectContaining({
        sqlCipherPassphraseHex: 'c'.repeat(64),
        dek_wrap_mode: 'file_passphrase',
      })
    )
  })
})
