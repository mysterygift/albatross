import { beforeEach, describe, expect, it, vi } from 'vitest'

const fsMock = vi.hoisted(() => ({
  exists: vi.fn(async () => false),
  readTextFile: vi.fn(async () => ''),
  writeTextFile: vi.fn(async () => undefined),
}))

vi.mock('@tauri-apps/plugin-fs', () => fsMock)

vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => '/mock/config'),
  join: vi.fn((...parts: string[]) => parts.join('/')),
}))

vi.mock('@/lib/security/auditLog', () => ({
  appendAuditLog: vi.fn(async () => undefined),
}))

import { appendAuditLog } from '@/lib/security/auditLog'
import {
  generateRecoveryKey,
  hashRecoveryKey,
  persistRecoveryKeyMaterial,
  readRecoveryKeyMeta,
  recoveryMetaSupportsClientPiiRecovery,
  recoveryMetaSupportsPasswordRecovery,
  unwrapDekWithFilePassphrase,
  unwrapDekWithRecoveryKey,
  unwrapSqlCipherPassphrase,
  unwrapInstanceKeyFromRecoveryEscrow,
  updateRecoveryEscrowInstanceKey,
  upgradeRecoveryMetaWithDekEscrow,
  verifyRecoveryKey,
  wrapDekWithFilePassphrase,
  wrapDekWithRecoveryKey,
  wrapSqlCipherPassphrase,
  writeRecoveryKeyMeta,
} from '@/lib/security/recoveryKey'

const DEK_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('recoveryKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fsMock.exists.mockResolvedValue(false)
    fsMock.readTextFile.mockReset()
    fsMock.writeTextFile.mockReset()
  })

  it('generateRecoveryKey returns 8 groups of 8 uppercase hex chars', () => {
    const key = generateRecoveryKey()
    expect(key).toMatch(/^[0-9A-F]{8}(-[0-9A-F]{8}){7}$/)
    const other = generateRecoveryKey()
    expect(other).toMatch(/^[0-9A-F]{8}(-[0-9A-F]{8}){7}$/)
    expect(other).not.toBe(key)
  })

  it('hashRecoveryKey and verifyRecoveryKey round-trip', async () => {
    const key = generateRecoveryKey()
    const verifier = await hashRecoveryKey(key)
    expect(verifier).not.toBe(key)
    expect(verifier).not.toContain(key.replace(/-/g, ''))
    const meta = {
      version: 2 as const,
      verifier,
      created_at: new Date().toISOString(),
      wrap_salt: 'aa',
      wrapped_file_passphrase: 'wrap1:x',
    }
    await expect(verifyRecoveryKey(key, meta)).resolves.toBe(true)
    await expect(
      verifyRecoveryKey(
        'WRONG-KEY-WRONG-KEY-WRONG-KEY-WRONG-KEY-WRONG-KEY-WRONG-KEY-WRONG-KEY-WRONG',
        meta
      )
    ).resolves.toBe(false)
  })

  it('wrapSqlCipherPassphrase and unwrapSqlCipherPassphrase round-trip', async () => {
    const key = generateRecoveryKey()
    const passphraseHex = 'a'.repeat(64)
    const wrapped = await wrapSqlCipherPassphrase(key, passphraseHex)
    const meta = {
      version: 2 as const,
      verifier: await hashRecoveryKey(key),
      created_at: new Date().toISOString(),
      ...wrapped,
    }
    const unwrapped = await unwrapSqlCipherPassphrase(key, meta)
    expect(unwrapped).toBe(passphraseHex)
  })

  it('wrapDekWithRecoveryKey and unwrapDekWithRecoveryKey round-trip', async () => {
    const key = generateRecoveryKey()
    const wrapped = await wrapDekWithRecoveryKey(key, DEK_HEX)
    const meta = {
      version: 3 as const,
      verifier: await hashRecoveryKey(key),
      created_at: new Date().toISOString(),
      wrap_salt: 'bb'.repeat(16),
      wrapped_file_passphrase: 'wrap1:file',
      dek_wrap_mode: 'recovery' as const,
      ...wrapped,
    }
    const unwrapped = await unwrapDekWithRecoveryKey(key, meta)
    expect(unwrapped).toBe(DEK_HEX)
  })

  it('wrapDekWithFilePassphrase and unwrapDekWithFilePassphrase round-trip', async () => {
    const passphraseHex = 'c'.repeat(64)
    const wrapped = await wrapDekWithFilePassphrase(passphraseHex, DEK_HEX)
    const meta = {
      version: 3 as const,
      verifier: 'hash',
      created_at: new Date().toISOString(),
      wrap_salt: 'dd'.repeat(16),
      wrapped_file_passphrase: 'wrap1:file',
      dek_wrap_mode: 'file_passphrase' as const,
      ...wrapped,
    }
    const unwrapped = await unwrapDekWithFilePassphrase(passphraseHex, meta)
    expect(unwrapped).toBe(DEK_HEX)
  })

  it('wrong recovery key fails DEK unwrap', async () => {
    const key = generateRecoveryKey()
    const wrapped = await wrapDekWithRecoveryKey(key, DEK_HEX)
    const meta = {
      version: 3 as const,
      verifier: await hashRecoveryKey(key),
      created_at: new Date().toISOString(),
      wrap_salt: 'ee'.repeat(16),
      wrapped_file_passphrase: 'wrap1:file',
      dek_wrap_mode: 'recovery' as const,
      ...wrapped,
    }
    await expect(
      unwrapDekWithRecoveryKey(
        'AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD-EEEEEEEE-FFFFFFFF-00000000-11111111',
        meta
      )
    ).rejects.toThrow()
  })

  it('corrupted wrapped_dek fails safely', async () => {
    const key = generateRecoveryKey()
    const meta = {
      version: 3 as const,
      verifier: await hashRecoveryKey(key),
      created_at: new Date().toISOString(),
      wrap_salt: 'ff'.repeat(16),
      wrapped_file_passphrase: 'wrap1:file',
      dek_wrap_salt: '11'.repeat(16),
      wrapped_dek: 'wrap1:not-valid-ciphertext',
      dek_wrap_mode: 'recovery' as const,
    }
    await expect(unwrapDekWithRecoveryKey(key, meta)).rejects.toThrow()
  })

  it('recoveryMetaSupportsPasswordRecovery accepts v2 and v3', () => {
    const v1 = { version: 1 as const, verifier: 'hash', created_at: '2026-01-01T00:00:00.000Z' }
    expect(recoveryMetaSupportsPasswordRecovery(v1)).toBe(false)

    const v2 = {
      version: 2 as const,
      verifier: 'hash',
      created_at: '2026-01-01T00:00:00.000Z',
      wrap_salt: 'aa',
      wrapped_file_passphrase: 'wrap1:x',
    }
    expect(recoveryMetaSupportsPasswordRecovery(v2)).toBe(true)
    expect(recoveryMetaSupportsClientPiiRecovery(v2)).toBe(false)

    const v3 = {
      version: 3 as const,
      verifier: 'hash',
      created_at: '2026-01-01T00:00:00.000Z',
      wrap_salt: 'aa',
      wrapped_file_passphrase: 'wrap1:x',
      dek_wrap_salt: 'bb',
      wrapped_dek: 'wrap1:y',
      dek_wrap_mode: 'recovery' as const,
    }
    expect(recoveryMetaSupportsPasswordRecovery(v3)).toBe(true)
    expect(recoveryMetaSupportsClientPiiRecovery(v3)).toBe(true)
  })

  it('writeRecoveryKeyMeta persists verifier without plaintext key or DEK', async () => {
    const key = generateRecoveryKey()
    const verifier = await hashRecoveryKey(key)
    const fileWrapped = await wrapSqlCipherPassphrase(key, 'b'.repeat(64))
    const dekWrapped = await wrapDekWithRecoveryKey(key, DEK_HEX)
    const meta = {
      version: 3 as const,
      verifier,
      created_at: '2026-01-01T00:00:00.000Z',
      ...fileWrapped,
      ...dekWrapped,
      dek_wrap_mode: 'recovery' as const,
    }
    await writeRecoveryKeyMeta(meta)
    expect(fsMock.writeTextFile).toHaveBeenCalledTimes(1)
    const written =
      (fsMock.writeTextFile.mock.calls as unknown as Array<[string, string]>)[0]?.[1] ?? ''
    expect(written).toContain('"verifier"')
    expect(written).toContain('"version": 3')
    expect(written).toContain('"wrapped_dek"')
    expect(written).not.toContain(key)
    expect(written).not.toContain(key.replace(/-/g, ''))
    expect(written).not.toContain(DEK_HEX)
  })

  it('readRecoveryKeyMeta parses v3 stored metadata', async () => {
    const key = generateRecoveryKey()
    const verifier = await hashRecoveryKey(key)
    const fileWrapped = await wrapSqlCipherPassphrase(key, 'c'.repeat(64))
    const dekWrapped = await wrapDekWithRecoveryKey(key, DEK_HEX)
    const stored = JSON.stringify({
      version: 3,
      verifier,
      created_at: '2026-01-01T00:00:00.000Z',
      ...fileWrapped,
      ...dekWrapped,
      dek_wrap_mode: 'recovery',
    })
    fsMock.exists.mockResolvedValue(true)
    fsMock.readTextFile.mockResolvedValue(stored)
    const meta = await readRecoveryKeyMeta()
    expect(meta?.version).toBe(3)
    expect(recoveryMetaSupportsClientPiiRecovery(meta!)).toBe(true)
  })

  it('persistRecoveryKeyMaterial writes v3 sidecar and audit log', async () => {
    const key = generateRecoveryKey()
    const verifier = await hashRecoveryKey(key)
    const db = { dialect: 'postgres' } as never
    await persistRecoveryKeyMaterial({
      db,
      actorUserId: 'user-1',
      plainRecoveryKey: key,
      verifier,
      sqlCipherPassphraseHex: 'd'.repeat(64),
      dekHex: DEK_HEX,
    })
    expect(fsMock.writeTextFile).toHaveBeenCalledTimes(1)
    const written =
      (fsMock.writeTextFile.mock.calls as unknown as Array<[string, string]>)[0]?.[1] ?? ''
    expect(written).toContain('"version": 3')
    expect(written).toContain('"wrapped_dek"')
    expect(written).not.toContain(DEK_HEX)
    expect(appendAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        actorUserId: 'user-1',
        action: 'auth.recovery_key_registered',
        metadata: { version: 3 },
      })
    )
  })

  it('persistRecoveryKeyMaterial refuses when meta already exists', async () => {
    fsMock.exists.mockResolvedValue(true)
    await expect(
      persistRecoveryKeyMaterial({
        db: { dialect: 'postgres' } as never,
        actorUserId: 'user-1',
        plainRecoveryKey: generateRecoveryKey(),
        verifier: 'hash',
        sqlCipherPassphraseHex: 'e'.repeat(64),
        dekHex: DEK_HEX,
      })
    ).rejects.toThrow('Recovery key already registered')
  })

  it('unwrapInstanceKeyFromRecoveryEscrow chains legacy escrow after migration', async () => {
    const recoveryKey = generateRecoveryKey()
    const legacyPassphrase = 'a'.repeat(64)
    const instanceKeyHex = 'b'.repeat(64)
    const fileWrapped = await wrapSqlCipherPassphrase(recoveryKey, legacyPassphrase)
    const baseMeta = {
      version: 2 as const,
      verifier: await hashRecoveryKey(recoveryKey),
      created_at: new Date().toISOString(),
      ...fileWrapped,
    }
    await updateRecoveryEscrowInstanceKey({
      recoveryMeta: baseMeta,
      legacyPassphraseHex: legacyPassphrase,
      instanceKeyHex,
    })
    const written =
      (fsMock.writeTextFile.mock.calls as unknown as Array<[string, string]>)[0]?.[1] ?? ''
    const migratedMeta = JSON.parse(written)
    const resolved = await unwrapInstanceKeyFromRecoveryEscrow(recoveryKey, migratedMeta, {
      expectInstanceKeyMode: true,
    })
    expect(resolved).toBe(instanceKeyHex)
  })

  it('upgradeRecoveryMetaWithDekEscrow patches v2 to v3 with file_passphrase mode', async () => {
    const key = generateRecoveryKey()
    const verifier = await hashRecoveryKey(key)
    const fileWrapped = await wrapSqlCipherPassphrase(key, 'f'.repeat(64))
    const v2 = {
      version: 2 as const,
      verifier,
      created_at: '2026-01-01T00:00:00.000Z',
      ...fileWrapped,
    }
    fsMock.exists.mockResolvedValue(true)
    fsMock.readTextFile.mockResolvedValue(JSON.stringify(v2))

    const db = { dialect: 'sqlite' } as never
    await upgradeRecoveryMetaWithDekEscrow({
      db,
      actorUserId: 'user-1',
      sqlCipherPassphraseHex: 'f'.repeat(64),
      dekHex: DEK_HEX,
      dek_wrap_mode: 'file_passphrase',
    })

    const written =
      (fsMock.writeTextFile.mock.calls as unknown as Array<[string, string]>)[0]?.[1] ?? ''
    expect(written).toContain('"version": 3')
    expect(written).toContain('"dek_wrap_mode": "file_passphrase"')
    expect(written).not.toContain(DEK_HEX)
    expect(appendAuditLog).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ action: 'auth.dek_escrow_upgraded' })
    )
  })
})
