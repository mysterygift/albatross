import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import type { AuthenticatedUser } from '@/lib/auth/authService'

const clientMocks = vi.hoisted(() => ({
  isDbUnlocked: vi.fn(() => true),
  getActiveSqlCipherKeyHex: vi.fn(() => 'a'.repeat(64)),
}))

const dbFileMocks = vi.hoisted(() => ({
  readDbEncryptionMeta: vi.fn(async () => ({
    version: 2 as const,
    key_mode: 'instance_key' as const,
  })),
}))

const instanceKeyMocks = vi.hoisted(() => ({
  wrapInstanceKeyForUser: vi.fn(async () => ({
    user_id: '',
    username: 'newuser',
    wrap_salt: 'bb'.repeat(16),
    wrapped_instance_key: 'wrap1:new',
    version: 1 as const,
    created_at: '2026-01-01T00:00:00.000Z',
    rotated_at: null,
    revoked_at: null,
  })),
  replaceUserInstanceKeyWrapper: vi.fn(async () => ({
    user_id: 'target-1',
    username: 'target',
    wrap_salt: 'cc'.repeat(16),
    wrapped_instance_key: 'wrap1:reset',
    version: 1 as const,
    created_at: '2025-01-01T00:00:00.000Z',
    rotated_at: '2026-01-02T00:00:00.000Z',
    revoked_at: null,
  })),
  upsertUserInstanceKeyWrapper: vi.fn(async () => undefined),
  revokeUserInstanceKeyWrapper: vi.fn(async () => undefined),
  clearUserInstanceKeyRevocation: vi.fn(async () => undefined),
  removeUserInstanceKeyWrapper: vi.fn(async () => undefined),
  readInstanceKeyWrappersMeta: vi.fn(async () => ({
    version: 1 as const,
    wrappers: [
      {
        user_id: 'target-1',
        username: 'target',
        wrap_salt: 'dd'.repeat(16),
        wrapped_instance_key: 'wrap1:old',
        version: 1 as const,
        created_at: '2025-01-01T00:00:00.000Z',
        rotated_at: null,
        revoked_at: null,
      },
    ],
  })),
  findWrapperForUserId: vi.fn(() => ({
    user_id: 'target-1',
    username: 'target',
    wrap_salt: 'dd'.repeat(16),
    wrapped_instance_key: 'wrap1:old',
    version: 1 as const,
    created_at: '2025-01-01T00:00:00.000Z',
    rotated_at: null,
    revoked_at: null,
  })),
}))

const mirrorMocks = vi.hoisted(() => ({
  clearUserInstanceKeyMirror: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db/client', () => clientMocks)
vi.mock('@/lib/security/dbFileEncryption', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/dbFileEncryption')>()
  return { ...actual, ...dbFileMocks }
})
vi.mock('@/lib/security/instanceKey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/instanceKey')>()
  return { ...actual, ...instanceKeyMocks }
})
vi.mock('@/lib/db/repositories/userInstanceKeyWrapper', () => mirrorMocks)
vi.mock('@/lib/security/auditLog', () => ({
  appendAuditLog: vi.fn(async () => undefined),
}))
vi.mock('@/lib/security/rateLimiter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/rateLimiter')>()
  return {
    ...actual,
    enforceRateLimit: vi.fn(),
    DEFAULT_ADMIN_MUTATION_RATE_LIMIT: actual.DEFAULT_ADMIN_MUTATION_RATE_LIMIT,
  }
})
vi.mock('./passwordHash', () => ({
  hashPassword: vi.fn(async () => '$argon2id$v=19$m=4096,t=3,p=1$abc$def'),
}))

import {
  createUserAsAdmin,
  deleteUserAsAdmin,
  disableUserAsAdmin,
  resetUserPasswordAsAdmin,
} from '@/lib/auth/adminUserManagementService'

const actor: AuthenticatedUser = { id: 'admin-1', username: 'admin', role: 'admin' }

function makeDb(overrides?: Partial<DatabaseAdapter>): DatabaseAdapter {
  return {
    dialect: 'sqlite',
    select: vi.fn(async (sql: string, params?: unknown[]) => {
      const id = params?.[0]
      if (sql.includes('INSERT INTO users')) {
        return [
          {
            id: 'new-user-id',
            username: 'newuser',
            role: 'user',
            created_at: 't',
            updated_at: 't',
            disabled_at: null,
          },
        ]
      }
      if (sql.includes('instance_key_wrapped')) {
        return [
          {
            id: 'target-1',
            username: 'target',
            instance_key_wrapped: 'wrap1:old',
          },
        ]
      }
      if (sql.includes('SELECT id, role, disabled_at') && sql.includes('FROM users')) {
        if (id === 'admin-1') {
          return [{ id: 'admin-1', role: 'admin', disabled_at: null }]
        }
        if (id === 'target-1') {
          return [{ id: 'target-1', role: 'user', disabled_at: null }]
        }
        return []
      }
      if (sql.includes('SELECT id, username, role, disabled_at') && sql.includes('FROM users')) {
        return [{ id: 'target-1', username: 'target', role: 'user', disabled_at: null }]
      }
      if (sql.includes('SELECT id, username, disabled_at') && sql.includes('FROM users')) {
        return [{ id: 'target-1', username: 'target', disabled_at: null }]
      }
      if (sql.includes('SELECT id, disabled_at FROM users')) {
        return [{ id: 'target-1', disabled_at: null }]
      }
      if (sql.includes('count')) return [{ count: 2 }]
      return []
    }),
    execute: vi.fn(async () => undefined),
    executeBatch: vi.fn(async () => undefined),
    runInSerializedTransaction: vi.fn(async (fn) => fn()),
    ...overrides,
  } as unknown as DatabaseAdapter
}

describe('adminUserManagementService instance key', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clientMocks.isDbUnlocked.mockReturnValue(true)
  })

  it('createUserAsAdmin upserts sidecar wrapper when instance key mode', async () => {
    const db = makeDb()
    await createUserAsAdmin({
      db,
      actor,
      username: 'newuser',
      password: 'password123',
      role: 'user',
    })
    expect(instanceKeyMocks.wrapInstanceKeyForUser).toHaveBeenCalledWith(
      'password123',
      'a'.repeat(64),
      expect.objectContaining({ username: 'newuser' })
    )
    expect(instanceKeyMocks.upsertUserInstanceKeyWrapper).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'new-user-id', username: 'newuser' })
    )
  })

  it('disableUserAsAdmin revokes sidecar wrapper', async () => {
    const db = makeDb()
    await disableUserAsAdmin({ db, actor, targetUserId: 'target-1' })
    expect(instanceKeyMocks.revokeUserInstanceKeyWrapper).toHaveBeenCalledWith(
      'target-1',
      expect.any(String)
    )
    expect(mirrorMocks.clearUserInstanceKeyMirror).toHaveBeenCalledWith(db, 'target-1')
  })

  it('deleteUserAsAdmin removes sidecar wrapper', async () => {
    const db = makeDb()
    await deleteUserAsAdmin({ db, actor, targetUserId: 'target-1' })
    expect(instanceKeyMocks.removeUserInstanceKeyWrapper).toHaveBeenCalledWith({
      userId: 'target-1',
      username: 'target',
    })
  })

  it('resetUserPasswordAsAdmin re-wraps instance key', async () => {
    const db = makeDb()
    await resetUserPasswordAsAdmin({
      db,
      actor,
      targetUserId: 'target-1',
      newPassword: 'newpass123',
    })
    expect(instanceKeyMocks.replaceUserInstanceKeyWrapper).toHaveBeenCalled()
    expect(instanceKeyMocks.upsertUserInstanceKeyWrapper).toHaveBeenCalled()
  })
})
