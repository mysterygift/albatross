import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getAdminsCount,
  getPlainDbAdminsCountIfAvailable,
  isInitialSetupComplete,
  resolveAuthGateMode,
  verifySetupCommitPredicates,
} from '@/lib/auth/initialSetupStatus'
import type { DbEncryptionMeta } from '@/lib/security/dbFileEncryption'
import type { InstanceKeyWrapperEntry, InstanceKeyWrappersMeta } from '@/lib/security/instanceKey'

function stubWrappersMeta(
  wrappers: Array<Pick<InstanceKeyWrapperEntry, 'revoked_at'>>
): InstanceKeyWrappersMeta {
  return {
    version: 1,
    wrappers: wrappers.map((partial) => ({
      user_id: 'user-1',
      username: 'admin',
      wrap_salt: 'aa'.repeat(16),
      wrapped_instance_key: 'wrap1:abc',
      version: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      rotated_at: null,
      ...partial,
    })),
  }
}

const statusMocks = vi.hoisted(() => ({
  getLocalDbStatus: vi.fn(async () => ({
    dbFileExists: false,
    encryptionMetaExists: false,
    isPlainSqlite: true,
  })),
  readDbEncryptionMeta: vi.fn<() => Promise<DbEncryptionMeta | null>>(async () => null),
}))

const dbMocks = vi.hoisted(() => ({
  openPlainDbIfExists: vi.fn(async () => ({
    dialect: 'sqlite' as const,
    select: vi.fn(async () => [{ count: 0 }]),
  })),
  getDb: vi.fn(async () => ({
    dialect: 'sqlite' as const,
    select: vi.fn(async () => [{ count: 1 }]),
  })),
  isDbUnlocked: vi.fn(() => false),
}))

const recoveryMocks = vi.hoisted(() => ({
  recoveryKeyMetaExists: vi.fn(async () => false),
}))

const instanceKeyMocks = vi.hoisted(() => ({
  readInstanceKeyWrappersMeta: vi.fn<() => Promise<InstanceKeyWrappersMeta | null>>(async () => null),
}))

vi.mock('@/lib/security/dbFileEncryption', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/dbFileEncryption')>()
  return {
    ...actual,
    getLocalDbStatus: statusMocks.getLocalDbStatus,
    readDbEncryptionMeta: statusMocks.readDbEncryptionMeta,
  }
})

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    openPlainDbIfExists: dbMocks.openPlainDbIfExists,
    getDb: dbMocks.getDb,
    isDbUnlocked: dbMocks.isDbUnlocked,
  }
})

vi.mock('@/lib/security/recoveryKey', () => ({
  recoveryKeyMetaExists: recoveryMocks.recoveryKeyMetaExists,
}))

vi.mock('@/lib/security/instanceKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/instanceKey')>()
  return {
    ...actual,
    readInstanceKeyWrappersMeta: instanceKeyMocks.readInstanceKeyWrappersMeta,
  }
})

describe('initialSetupStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    statusMocks.getLocalDbStatus.mockResolvedValue({
      dbFileExists: false,
      encryptionMetaExists: false,
      isPlainSqlite: true,
    })
    statusMocks.readDbEncryptionMeta.mockResolvedValue(null)
    dbMocks.openPlainDbIfExists.mockResolvedValue({
      dialect: 'sqlite',
      select: vi.fn(async () => [{ count: 0 }]),
    })
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(false)
    instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(null)
  })

  describe('getAdminsCount', () => {
    it('returns null for encrypted database without opening plain db', async () => {
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
      })

      await expect(getAdminsCount()).resolves.toBeNull()
      expect(dbMocks.openPlainDbIfExists).not.toHaveBeenCalled()
    })

    it('returns 0 when no database file exists', async () => {
      await expect(getPlainDbAdminsCountIfAvailable()).resolves.toBe(0)
      expect(dbMocks.openPlainDbIfExists).not.toHaveBeenCalled()
    })

    it('queries admin count from plain database', async () => {
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: false,
        isPlainSqlite: true,
      })
      const select = vi.fn(async () => [{ count: 2 }])
      dbMocks.openPlainDbIfExists.mockResolvedValue({ dialect: 'sqlite', select })

      await expect(getAdminsCount()).resolves.toBe(2)
      expect(select).toHaveBeenCalled()
    })
  })

  describe('isInitialSetupComplete', () => {
    it('returns false when no admin exists on plain database', async () => {
      await expect(isInitialSetupComplete()).resolves.toBe(false)
    })

    it('returns false when admin exists but recovery meta is missing', async () => {
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: false,
        isPlainSqlite: true,
      })
      dbMocks.openPlainDbIfExists.mockResolvedValue({
        dialect: 'sqlite',
        select: vi.fn(async () => [{ count: 1 }]),
      })

      await expect(isInitialSetupComplete()).resolves.toBe(false)
    })

    it('returns false when encrypted install is missing sidecars', async () => {
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
      })
      statusMocks.readDbEncryptionMeta.mockResolvedValue({
        version: 2,
        key_mode: 'instance_key',
      })

      await expect(isInitialSetupComplete()).resolves.toBe(false)
      expect(dbMocks.openPlainDbIfExists).not.toHaveBeenCalled()
    })

    it('returns false when encrypted install has wrapper but no recovery meta', async () => {
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
      })
      statusMocks.readDbEncryptionMeta.mockResolvedValue({
        version: 2,
        key_mode: 'instance_key',
      })
      recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(false)
      instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(
        stubWrappersMeta([{ revoked_at: null }])
      )

      await expect(isInitialSetupComplete()).resolves.toBe(false)
    })

    it('returns false when encrypted install has recovery meta but no active wrapper', async () => {
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
      })
      statusMocks.readDbEncryptionMeta.mockResolvedValue({
        version: 2,
        key_mode: 'instance_key',
      })
      recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
      instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(
        stubWrappersMeta([{ revoked_at: '2026-01-01T00:00:00.000Z' }])
      )

      await expect(isInitialSetupComplete()).resolves.toBe(false)
    })

    it('returns false when encrypted install has invalid encryption meta', async () => {
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
      })
      statusMocks.readDbEncryptionMeta.mockResolvedValue(null)
      recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
      instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(
        stubWrappersMeta([{ revoked_at: null }])
      )

      await expect(isInitialSetupComplete()).resolves.toBe(false)
    })

    it('returns true for encrypted install with recovery and active wrapper without SQL', async () => {
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
      })
      statusMocks.readDbEncryptionMeta.mockResolvedValue({
        version: 2,
        key_mode: 'instance_key',
      })
      recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
      instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(
        stubWrappersMeta([{ revoked_at: null }])
      )

      await expect(isInitialSetupComplete()).resolves.toBe(true)
      expect(dbMocks.openPlainDbIfExists).not.toHaveBeenCalled()
    })

    it('returns true when plain admin, recovery meta, and active wrapper exist', async () => {
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: false,
        isPlainSqlite: true,
      })
      dbMocks.openPlainDbIfExists.mockResolvedValue({
        dialect: 'sqlite',
        select: vi.fn(async () => [{ count: 1 }]),
      })
      recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
      instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(
        stubWrappersMeta([{ revoked_at: null }])
      )

      await expect(isInitialSetupComplete()).resolves.toBe(true)
    })
  })

  describe('resolveAuthGateMode', () => {
    it('returns sign_in when setup is complete', async () => {
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
      })
      statusMocks.readDbEncryptionMeta.mockResolvedValue({
        version: 2,
        key_mode: 'instance_key',
      })
      recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
      instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(
        stubWrappersMeta([{ revoked_at: null }])
      )

      await expect(resolveAuthGateMode()).resolves.toBe('sign_in')
    })

    it('returns sign_in for legacy password-derived metadata even when setup is incomplete', async () => {
      statusMocks.readDbEncryptionMeta.mockResolvedValue({
        version: 1,
        kdf_salt: 'abc123',
      })

      await expect(resolveAuthGateMode()).resolves.toBe('sign_in')
    })

    it('returns setup for fresh install', async () => {
      await expect(resolveAuthGateMode()).resolves.toBe('setup')
    })
  })

  describe('verifySetupCommitPredicates', () => {
    beforeEach(() => {
      dbMocks.isDbUnlocked.mockReturnValue(true)
    })

    it('returns false when database is locked', async () => {
      dbMocks.isDbUnlocked.mockReturnValue(false)

      await expect(verifySetupCommitPredicates()).resolves.toBe(false)
    })

    it('returns false when admin is missing while sidecars exist', async () => {
      dbMocks.getDb.mockResolvedValue({
        dialect: 'sqlite',
        select: vi.fn(async () => [{ count: 0 }]),
      })
      recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
      instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(
        stubWrappersMeta([{ revoked_at: null }])
      )
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
      })
      statusMocks.readDbEncryptionMeta.mockResolvedValue({
        version: 2,
        key_mode: 'instance_key',
      })

      await expect(verifySetupCommitPredicates()).resolves.toBe(false)
    })

    it('returns true when all commit predicates are satisfied', async () => {
      dbMocks.getDb.mockResolvedValue({
        dialect: 'sqlite',
        select: vi.fn(async () => [{ count: 1 }]),
      })
      recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(true)
      instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(
        stubWrappersMeta([{ revoked_at: null }])
      )
      statusMocks.getLocalDbStatus.mockResolvedValue({
        dbFileExists: true,
        encryptionMetaExists: true,
        isPlainSqlite: false,
      })
      statusMocks.readDbEncryptionMeta.mockResolvedValue({
        version: 2,
        key_mode: 'instance_key',
      })

      await expect(verifySetupCommitPredicates()).resolves.toBe(true)
    })
  })
})
