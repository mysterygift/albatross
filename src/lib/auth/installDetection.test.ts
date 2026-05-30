import { beforeEach, describe, expect, it, vi } from 'vitest'

import { detectInstallState } from '@/lib/auth/installDetection'

const statusMocks = vi.hoisted(() => ({
  getLocalDbStatus: vi.fn(async () => ({
    dbFileExists: false,
    encryptionMetaExists: false,
    isPlainSqlite: true,
  })),
  readDbEncryptionMeta: vi.fn(async () => null),
}))

const setupStatusMocks = vi.hoisted(() => ({
  isInitialSetupComplete: vi.fn(async () => false),
  getPlainDbAdminsCountIfAvailable: vi.fn(async () => 0),
  getUnlockedDbAdminsCountIfAvailable: vi.fn(async () => null as number | null),
}))

const dbMocks = vi.hoisted(() => ({
  closeDb: vi.fn(async () => undefined),
}))

const recoveryMocks = vi.hoisted(() => ({
  recoveryKeyMetaExists: vi.fn(async () => false),
}))

const instanceKeyMocks = vi.hoisted(() => ({
  readInstanceKeyWrappersMeta: vi.fn(async () => null),
}))

vi.mock('@/lib/security/dbFileEncryption', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/dbFileEncryption')>()
  return {
    ...actual,
    getLocalDbStatus: statusMocks.getLocalDbStatus,
    readDbEncryptionMeta: statusMocks.readDbEncryptionMeta,
  }
})

vi.mock('@/lib/auth/initialSetupStatus', () => ({
  isInitialSetupComplete: setupStatusMocks.isInitialSetupComplete,
  getPlainDbAdminsCountIfAvailable: setupStatusMocks.getPlainDbAdminsCountIfAvailable,
  getUnlockedDbAdminsCountIfAvailable: setupStatusMocks.getUnlockedDbAdminsCountIfAvailable,
}))

vi.mock('@/lib/db/client', () => ({
  closeDb: dbMocks.closeDb,
  openPlainDbIfExists: vi.fn(),
}))

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

describe('installDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    statusMocks.getLocalDbStatus.mockResolvedValue({
      dbFileExists: false,
      encryptionMetaExists: false,
      isPlainSqlite: true,
    })
    statusMocks.readDbEncryptionMeta.mockResolvedValue(null)
    setupStatusMocks.isInitialSetupComplete.mockResolvedValue(false)
    setupStatusMocks.getPlainDbAdminsCountIfAvailable.mockResolvedValue(0)
    recoveryMocks.recoveryKeyMetaExists.mockResolvedValue(false)
    instanceKeyMocks.readInstanceKeyWrappersMeta.mockResolvedValue(null)
  })

  it('detects fresh install', async () => {
    const result = await detectInstallState()
    expect(result.kind).toBe('fresh_install')
    expect(result.route).toBe('admin')
  })

  it('detects completed install', async () => {
    setupStatusMocks.isInitialSetupComplete.mockResolvedValue(true)
    const result = await detectInstallState()
    expect(result.kind).toBe('complete_install')
    expect(result.route).toBe('sign_in')
  })

  it('detects encrypted incomplete install when setup state is unknown', async () => {
    statusMocks.getLocalDbStatus.mockResolvedValue({
      dbFileExists: true,
      encryptionMetaExists: true,
      isPlainSqlite: false,
    })
    statusMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'unknown_mode',
    })

    const result = await detectInstallState()
    expect(result.kind).toBe('encrypted_incomplete')
    expect(result.route).toBe('repair')
  })

  it('detects encrypted setup pending admin account', async () => {
    statusMocks.getLocalDbStatus.mockResolvedValue({
      dbFileExists: true,
      encryptionMetaExists: true,
      isPlainSqlite: false,
    })
    statusMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    setupStatusMocks.getUnlockedDbAdminsCountIfAvailable.mockResolvedValue(0)

    const result = await detectInstallState()
    expect(result.kind).toBe('setup_encrypted_pending_admin')
    expect(result.route).toBe('admin')
  })

  it('detects encrypted setup pending recovery', async () => {
    statusMocks.getLocalDbStatus.mockResolvedValue({
      dbFileExists: true,
      encryptionMetaExists: true,
      isPlainSqlite: false,
    })
    statusMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    setupStatusMocks.getUnlockedDbAdminsCountIfAvailable.mockResolvedValue(1)

    const result = await detectInstallState()
    expect(result.kind).toBe('setup_encrypted_pending_recovery')
    expect(result.route).toBe('admin')
  })

  it('detects encrypted incomplete install when admin count is unavailable', async () => {
    statusMocks.getLocalDbStatus.mockResolvedValue({
      dbFileExists: true,
      encryptionMetaExists: true,
      isPlainSqlite: false,
    })
    statusMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    setupStatusMocks.getUnlockedDbAdminsCountIfAvailable.mockResolvedValue(null)

    const result = await detectInstallState()
    expect(result.kind).toBe('encrypted_incomplete')
    expect(result.route).toBe('repair')
  })

  it('detects legacy plain install with no admin', async () => {
    statusMocks.getLocalDbStatus.mockResolvedValue({
      dbFileExists: true,
      encryptionMetaExists: false,
      isPlainSqlite: true,
    })
    setupStatusMocks.getPlainDbAdminsCountIfAvailable.mockResolvedValue(0)

    const result = await detectInstallState()
    expect(result.kind).toBe('legacy_plain_no_admin')
    expect(result.route).toBe('admin')
    expect(dbMocks.closeDb).toHaveBeenCalled()
  })

  it('detects legacy password-derived metadata', async () => {
    statusMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 1,
      kdf_salt: 'abc123',
    })

    const result = await detectInstallState()
    expect(result.kind).toBe('legacy_password_derived')
    expect(result.route).toBe('sign_in')
  })

  it('detects inconsistent meta with plain database header', async () => {
    statusMocks.getLocalDbStatus.mockResolvedValue({
      dbFileExists: true,
      encryptionMetaExists: true,
      isPlainSqlite: true,
    })
    statusMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })

    const result = await detectInstallState()
    expect(result.kind).toBe('inconsistent_state')
    expect(result.route).toBe('repair')
  })
})
