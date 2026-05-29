import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { resetUserPasswordAsAdmin } from '@/lib/auth/adminUserManagementService'
import {
  ADMIN_PASSWORD_RESET_NO_KEY_ACCESS_MESSAGE,
  ADMIN_PASSWORD_RESET_WRONG_CURRENT_PASSWORD_MESSAGE,
} from '@/lib/security/adminPasswordResetPaths'
import {
  generateInstanceKeyHex,
  unwrapInstanceKeyForUser,
  wrapInstanceKeyForUser,
} from '@/lib/security/instanceKey'
import { resetRateLimiterForTests } from '@/lib/security/rateLimiter'

const sidecarStore = vi.hoisted(() => ({
  content: JSON.stringify({ version: 1, wrappers: [] as unknown[] }),
}))

const clientMocks = vi.hoisted(() => ({
  isDbUnlocked: vi.fn(() => true),
  getActiveSqlCipherKeyHex: vi.fn(() => 'b'.repeat(64)),
}))

const dbFileMocks = vi.hoisted(() => ({
  readDbEncryptionMeta: vi.fn(async () => ({
    version: 2 as const,
    key_mode: 'instance_key' as const,
  })),
  rekeySqlCipherDatabase: vi.fn(async () => undefined),
}))

const recoveryMocks = vi.hoisted(() => ({
  readRecoveryKeyMeta: vi.fn(async () => ({
    version: 3 as const,
    verifier: '$argon2id$dummy',
    created_at: '2025-01-01T00:00:00.000Z',
    wrap_salt: 'aa'.repeat(16),
    wrapped_file_passphrase: 'wrap:file',
    dek_wrap_salt: 'bb'.repeat(16),
    wrapped_dek: 'wrap:dek',
    dek_wrap_mode: 'recovery' as const,
  })),
  verifyRecoveryKey: vi.fn(async () => true),
  unwrapInstanceKeyFromRecoveryEscrow: vi.fn(async () => 'c'.repeat(64)),
  recoveryMetaSupportsPasswordRecovery: vi.fn(() => true),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async () => true),
  readTextFile: vi.fn(async () => sidecarStore.content),
  writeTextFile: vi.fn(async (_path: string, body: string) => {
    sidecarStore.content = body
  }),
}))

vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => '/tmp'),
  join: vi.fn((...parts: string[]) => parts.join('/')),
}))

vi.mock('@/lib/db/client', () => clientMocks)
vi.mock('@/lib/security/dbFileEncryption', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/dbFileEncryption')>()
  return { ...actual, ...dbFileMocks }
})
vi.mock('@/lib/security/recoveryKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/recoveryKey')>()
  return { ...actual, ...recoveryMocks }
})

type UserRow = {
  id: string
  username: string
  role: 'admin' | 'user'
  password_hash: string
  disabled_at: string | null
  updated_at: string
  instance_key_wrap_version: number | null
  instance_key_wrap_salt: string | null
  instance_key_wrapped: string | null
  instance_key_wrap_created_at: string | null
  instance_key_wrap_rotated_at: string | null
}

type SessionRow = {
  id: string
  user_id: string
  revoked_at: string | null
}

type AuditRow = {
  action: string
  metadata: string | null
}

function createMemoryDb(
  initialUsers: UserRow[],
  sessions: SessionRow[] = [],
  options?: { failBatchOnCommit?: boolean }
): DatabaseAdapter {
  const users = [...initialUsers]
  const sessionRows = [...sessions]
  const auditRows: AuditRow[] = []

  return {
    dialect: 'sqlite',
    async execute(sql, bindValues = []) {
      if (sql.includes('INSERT INTO audit_logs')) {
        auditRows.push({
          action: String(bindValues[3] ?? ''),
          metadata: typeof bindValues[4] === 'string' ? bindValues[4] : null,
        })
      }
      return { rowsAffected: 1, lastInsertId: 1 }
    },
    async select<T>(sql: string, bindValues: unknown[] = []): Promise<T> {
      if (sql.includes('SELECT id, role, disabled_at')) {
        const user = users.find((row) => row.id === bindValues[0])
        return (user ? [{ id: user.id, role: user.role, disabled_at: user.disabled_at }] : []) as T
      }
      if (sql.includes('FROM users') && sql.includes('password_hash')) {
        const user = users.find((row) => row.id === bindValues[0])
        return (user ? [user] : []) as T
      }
      if (sql.includes('FROM sessions')) {
        return sessionRows.filter((row) => row.user_id === bindValues[0]) as T
      }
      return [] as T
    },
    async executeBatch(statements) {
      for (const statement of statements) {
        if (statement.sql.includes('UPDATE users') && statement.sql.includes('password_hash')) {
          const user = users.find((row) => row.id === statement.bindValues[2])
          if (!user) throw new Error('User not found')
          user.password_hash = String(statement.bindValues[0])
          user.updated_at = String(statement.bindValues[1])
          if (statement.sql.includes('instance_key_wrap_version')) {
            user.instance_key_wrap_version = Number(statement.bindValues[3])
            user.instance_key_wrap_salt = String(statement.bindValues[4])
            user.instance_key_wrapped = String(statement.bindValues[5])
            user.instance_key_wrap_created_at = String(statement.bindValues[6])
            user.instance_key_wrap_rotated_at = String(statement.bindValues[7] ?? null)
          }
        }
        if (statement.sql.includes('UPDATE sessions')) {
          for (const row of sessionRows) {
            if (row.user_id === statement.bindValues[1] && row.revoked_at == null) {
              row.revoked_at = String(statement.bindValues[0])
            }
          }
        }
        if (statement.sql === 'COMMIT' && options?.failBatchOnCommit) {
          throw new Error('batch-fail')
        }
      }
    },
    async runInSerializedTransaction(fn) {
      return fn()
    },
    getAuditRows: () => auditRows,
    getUsers: () => users,
    getSessions: () => sessionRows,
  } as DatabaseAdapter & {
    getAuditRows: () => AuditRow[]
    getUsers: () => UserRow[]
    getSessions: () => SessionRow[]
  }
}

describe('resetUserPasswordAsAdmin (ENC7)', () => {
  const actor = { id: 'admin-1', username: 'admin', role: 'admin' as const }
  let instanceKeyHex = generateInstanceKeyHex()

  beforeEach(async () => {
    resetRateLimiterForTests()
    vi.clearAllMocks()
    instanceKeyHex = generateInstanceKeyHex()
    clientMocks.isDbUnlocked.mockReturnValue(true)
    clientMocks.getActiveSqlCipherKeyHex.mockReturnValue(instanceKeyHex)
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue({
      version: 2,
      key_mode: 'instance_key',
    })
    sidecarStore.content = JSON.stringify({ version: 1, wrappers: [] })
  })

  async function adminActorRow(): Promise<UserRow> {
    const { hashPassword } = await import('@/lib/auth/passwordHash')
    return {
      id: 'admin-1',
      username: 'admin',
      role: 'admin',
      password_hash: await hashPassword('adminpass123'),
      disabled_at: null,
      updated_at: '2025-01-01T00:00:00.000Z',
      instance_key_wrap_version: null,
      instance_key_wrap_salt: null,
      instance_key_wrapped: null,
      instance_key_wrap_created_at: null,
      instance_key_wrap_rotated_at: null,
    }
  }

  async function seedTargetUser(args: {
    userId?: string
    username?: string
    oldPassword?: string
    newPasswordForHash?: string
  }) {
    const oldPassword = args.oldPassword ?? 'oldpass123'
    const wrapper = await wrapInstanceKeyForUser(oldPassword, instanceKeyHex, {
      userId: args.userId ?? 'target-1',
      username: args.username ?? 'alice',
    })
    sidecarStore.content = JSON.stringify({
      version: 1,
      wrappers: [wrapper],
    })
    const { hashPassword } = await import('@/lib/auth/passwordHash')
    const passwordHash = await hashPassword(oldPassword)
    return {
      user: {
        id: args.userId ?? 'target-1',
        username: args.username ?? 'alice',
        role: 'admin' as const,
        password_hash: passwordHash,
        disabled_at: null,
        updated_at: '2025-01-01T00:00:00.000Z',
        instance_key_wrap_version: wrapper.version,
        instance_key_wrap_salt: wrapper.wrap_salt,
        instance_key_wrapped: wrapper.wrapped_instance_key,
        instance_key_wrap_created_at: wrapper.created_at,
        instance_key_wrap_rotated_at: wrapper.rotated_at,
      },
      wrapper,
      oldPassword,
    }
  }

  it('Path A: reset with valid old password re-wraps successfully', async () => {
    const { user, oldPassword } = await seedTargetUser({})
    const db = createMemoryDb([await adminActorRow(), user], [{ id: 's-1', user_id: user.id, revoked_at: null }])

    await resetUserPasswordAsAdmin({
      db,
      actor,
      targetUserId: user.id,
      newPassword: 'newpass123',
      targetOldPassword: oldPassword,
    })

    const sidecar = JSON.parse(sidecarStore.content)
    const updatedWrapper = sidecar.wrappers[0]
    await expect(unwrapInstanceKeyForUser('newpass123', updatedWrapper)).resolves.toBe(instanceKeyHex)
    await expect(unwrapInstanceKeyForUser(oldPassword, updatedWrapper)).rejects.toThrow()

    const { verifyPassword } = await import('@/lib/auth/passwordHash')
    const updatedTarget = db.getUsers().find((row) => row.id === user.id)!
    await expect(verifyPassword('newpass123', updatedTarget.password_hash)).resolves.toBe(true)
    await expect(verifyPassword(oldPassword, updatedTarget.password_hash)).resolves.toBe(false)
    expect(db.getSessions().find((row) => row.user_id === user.id)?.revoked_at).not.toBeNull()
    expect(db.getAuditRows().some((row) => row.action === 'admin.user_password_reset')).toBe(true)
    expect(db.getAuditRows()[0]?.metadata).toContain('old_password')
  })

  it('Path B1: reset through admin unlock re-wraps successfully', async () => {
    const { user } = await seedTargetUser({})
    const db = createMemoryDb([await adminActorRow(), user])

    await resetUserPasswordAsAdmin({
      db,
      actor,
      targetUserId: user.id,
      newPassword: 'newpass123',
    })

    const sidecar = JSON.parse(sidecarStore.content)
    await expect(unwrapInstanceKeyForUser('newpass123', sidecar.wrappers[0])).resolves.toBe(instanceKeyHex)
    expect(clientMocks.getActiveSqlCipherKeyHex).toHaveBeenCalled()
    expect(db.getAuditRows()[0]?.metadata).toContain('admin_unlock')
  })

  it('Path B2: reset through recovery escrow re-wraps successfully', async () => {
    const recoveryKeyHex = 'c'.repeat(64)
    clientMocks.isDbUnlocked.mockReturnValue(false)
    recoveryMocks.unwrapInstanceKeyFromRecoveryEscrow.mockResolvedValueOnce(instanceKeyHex)
    const { user } = await seedTargetUser({})
    const db = createMemoryDb([await adminActorRow(), user])

    await resetUserPasswordAsAdmin({
      db,
      actor,
      targetUserId: user.id,
      newPassword: 'newpass123',
      recoveryKey: recoveryKeyHex,
    })

    const sidecar = JSON.parse(sidecarStore.content)
    await expect(unwrapInstanceKeyForUser('newpass123', sidecar.wrappers[0])).resolves.toBe(instanceKeyHex)
    expect(recoveryMocks.unwrapInstanceKeyFromRecoveryEscrow).toHaveBeenCalled()
    expect(db.getAuditRows()[0]?.metadata).toContain('recovery_escrow')
  })

  it('Path C: reset without valid wrapper path is blocked', async () => {
    const { user } = await seedTargetUser({})
    clientMocks.isDbUnlocked.mockReturnValue(false)
    const db = createMemoryDb([await adminActorRow(), user])
    const beforeHash = db.getUsers().find((row) => row.id === user.id)!.password_hash

    await expect(
      resetUserPasswordAsAdmin({
        db,
        actor,
        targetUserId: user.id,
        newPassword: 'newpass123',
      })
    ).rejects.toThrow(ADMIN_PASSWORD_RESET_NO_KEY_ACCESS_MESSAGE)

    expect(db.getUsers().find((row) => row.id === user.id)!.password_hash).toBe(beforeHash)
    const sidecar = JSON.parse(sidecarStore.content)
    await expect(unwrapInstanceKeyForUser('oldpass123', sidecar.wrappers[0])).resolves.toBe(instanceKeyHex)
  })

  it('rejects incorrect current password on Path A', async () => {
    const { user } = await seedTargetUser({})
    const db = createMemoryDb([await adminActorRow(), user])

    await expect(
      resetUserPasswordAsAdmin({
        db,
        actor,
        targetUserId: user.id,
        newPassword: 'newpass123',
        targetOldPassword: 'wrong-pass',
      })
    ).rejects.toThrow(ADMIN_PASSWORD_RESET_WRONG_CURRENT_PASSWORD_MESSAGE)
  })

  it('does not rekey SQLCipher during admin reset', async () => {
    const { user } = await seedTargetUser({})
    const db = createMemoryDb([await adminActorRow(), user])

    await resetUserPasswordAsAdmin({
      db,
      actor,
      targetUserId: user.id,
      newPassword: 'newpass123',
    })

    expect(dbFileMocks.rekeySqlCipherDatabase).not.toHaveBeenCalled()
  })

  it('restores prior sidecar when database batch fails', async () => {
    const { user, wrapper } = await seedTargetUser({})
    const db = createMemoryDb([await adminActorRow(), user], [], { failBatchOnCommit: true })
    const beforeSidecar = sidecarStore.content
    const beforeMeta = JSON.parse(beforeSidecar)

    await expect(
      resetUserPasswordAsAdmin({
        db,
        actor,
        targetUserId: user.id,
        newPassword: 'newpass123',
      })
    ).rejects.toThrow('batch-fail')

    expect(JSON.parse(sidecarStore.content)).toEqual(beforeMeta)
    await expect(unwrapInstanceKeyForUser('oldpass123', wrapper)).resolves.toBe(instanceKeyHex)
  })

  it('uses hash-only reset when instance key wrapping is not required', async () => {
    dbFileMocks.readDbEncryptionMeta.mockResolvedValue(null)
    const { hashPassword } = await import('@/lib/auth/passwordHash')
    const db = createMemoryDb([
      await adminActorRow(),
      {
        id: 'target-1',
        username: 'alice',
        role: 'user',
        password_hash: await hashPassword('oldpass123'),
        disabled_at: null,
        updated_at: '2025-01-01T00:00:00.000Z',
        instance_key_wrap_version: null,
        instance_key_wrap_salt: null,
        instance_key_wrapped: null,
        instance_key_wrap_created_at: null,
        instance_key_wrap_rotated_at: null,
      },
    ])

    await resetUserPasswordAsAdmin({
      db,
      actor,
      targetUserId: 'target-1',
      newPassword: 'newpass123',
    })

    const { verifyPassword } = await import('@/lib/auth/passwordHash')
    const updatedTarget = db.getUsers().find((row) => row.id === 'target-1')!
    await expect(verifyPassword('newpass123', updatedTarget.password_hash)).resolves.toBe(true)
    expect(sidecarStore.content).toBe(JSON.stringify({ version: 1, wrappers: [] }))
    expect(db.getAuditRows()[0]?.metadata).not.toContain('wrapperResetPath')
  })
})
