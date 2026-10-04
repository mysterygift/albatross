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
  discardUnopenableSetupDatabase: vi.fn(async () => true),
  removeDbEncryptionMeta: vi.fn(async () => undefined),
}))

const detectionMocks = vi.hoisted(() => ({
  detectInstallState: vi.fn(),
}))

const progressMocks = vi.hoisted(() => ({
  readSetupProgress: vi.fn(),
}))

const instanceKeyMocks = vi.hoisted(() => ({
  readInstanceKeyWrappersMeta: vi.fn<
    () => Promise<{ version: 1; wrappers: Array<Record<string, unknown>> } | null>
  >(async () => null),
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
vi.mock('@/lib/auth/installDetection', () => detectionMocks)
vi.mock('@/lib/auth/setupProgress', () => progressMocks)

import type { InstallDetectionResult } from '@/lib/auth/installDetection'
import type { SetupProgressState } from '@/lib/auth/setupProgress'
import {
  detectInstallStateForSetup,
  discardStrandedSetupEncryption,
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

  describe('stranded setup encryption', () => {
    const strandedDetection: InstallDetectionResult = {
      kind: 'encrypted_incomplete',
      route: 'repair',
      diagnostics: {
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
        encryptionMode: 'instance_key',
        recoveryMetaExists: false,
        activeWrapperCount: 0,
        plainAdminCount: null,
      },
    }
    const adminPending: SetupProgressState = {
      version: 1,
      phase: 'admin_pending',
      started_at: '2026-10-04T21:11:12.428Z',
      updated_at: '2026-10-04T21:11:13.344Z',
    }

    beforeEach(() => {
      clientMocks.isDbUnlocked.mockReturnValue(false)
    })

    it('discards an encrypted DB whose instance key was never persisted', async () => {
      await expect(discardStrandedSetupEncryption(strandedDetection, adminPending)).resolves.toBe(
        true
      )
      expect(clientMocks.closeDb).toHaveBeenCalled()
      expect(dbFileMocks.discardUnopenableSetupDatabase).toHaveBeenCalled()
      expect(dbFileMocks.removeDbEncryptionMeta).toHaveBeenCalled()
    })

    it.each([
      ['no setup in progress', strandedDetection, null],
      ['admin already created', strandedDetection, { ...adminPending, phase: 'recovery_pending' }],
      [
        'recovery escrow exists',
        {
          ...strandedDetection,
          diagnostics: { ...strandedDetection.diagnostics, recoveryMetaExists: true },
        },
        adminPending,
      ],
      [
        'legacy password-derived DB',
        {
          ...strandedDetection,
          diagnostics: {
            ...strandedDetection.diagnostics,
            encryptionMode: 'legacy_password_derived',
          },
        },
        adminPending,
      ],
      ['a plain DB', { ...strandedDetection, kind: 'inconsistent_state' }, adminPending],
    ] as Array<[string, InstallDetectionResult, SetupProgressState | null]>)(
      'keeps the DB when %s',
      async (_label, detection, progress) => {
        await expect(discardStrandedSetupEncryption(detection, progress)).resolves.toBe(false)
        expect(dbFileMocks.discardUnopenableSetupDatabase).not.toHaveBeenCalled()
      }
    )

    it('keeps the DB when any wrapper exists, even a revoked one', async () => {
      instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue({
        version: 1,
        wrappers: [{ revoked_at: '2026-01-01T00:00:00.000Z' }],
      })
      await expect(discardStrandedSetupEncryption(strandedDetection, adminPending)).resolves.toBe(
        false
      )
      expect(dbFileMocks.discardUnopenableSetupDatabase).not.toHaveBeenCalled()
    })

    it('keeps the DB while it is unlocked in this session', async () => {
      clientMocks.isDbUnlocked.mockReturnValue(true)
      await expect(discardStrandedSetupEncryption(strandedDetection, adminPending)).resolves.toBe(
        false
      )
    })

    it('detectInstallStateForSetup re-detects after discarding', async () => {
      const fresh = { ...strandedDetection, kind: 'fresh_install', route: 'admin' } as const
      detectionMocks.detectInstallState
        .mockResolvedValueOnce(strandedDetection)
        .mockResolvedValueOnce(fresh)
      progressMocks.readSetupProgress.mockResolvedValue({ ...adminPending, phase: 'detect' })

      await expect(detectInstallStateForSetup()).resolves.toEqual(fresh)
      expect(dbFileMocks.discardUnopenableSetupDatabase).toHaveBeenCalledTimes(1)
    })
  })
})
