import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client, Pool } from 'pg'

import { PostgresDatabaseAdapter } from '@/lib/db/postgresDatabaseAdapter'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import {
  createUserAsAdmin,
  disableUserAsAdmin,
  enableUserAsAdmin,
  listUsersAsAdmin,
  resetUserPasswordAsAdmin,
  updateUserRoleAsAdmin,
} from '@/lib/auth/adminUserManagementService'
import { login, resolveAuthenticatedUserFromSessionToken } from '@/lib/auth/authService'
import { RATE_LIMIT_ERROR_MESSAGE, resetRateLimiterForTests } from '@/lib/security/rateLimiter'
import { deterministicSchemaName } from '@/test/postgres/schemaAudit'
import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'

type Harness = {
  db: DatabaseAdapter
  close: () => Promise<void>
}

describe('postgres admin user-management service (UAM3)', () => {
  let connectionError: string | null = null

  beforeAll(async () => {
    const client = new Client(await resolvePostgresTestConfig())
    try {
      await client.connect()
    } catch (error) {
      connectionError = error instanceof Error ? error.message : String(error)
    } finally {
      await client.end().catch(() => undefined)
    }
  })

  beforeEach(() => {
    resetRateLimiterForTests()
  })

  async function withHarness(prefix: string, fn: (ctx: Harness) => Promise<void>) {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL UAM3 assertions: ${connectionError}`)
      return
    }
    const harness = await createHarness(prefix)
    try {
      await fn(harness)
    } finally {
      await harness.close()
    }
  }

  async function seedUser(
    db: DatabaseAdapter,
    username: string,
    role: 'user' | 'admin',
    password: string = 'pass12345'
  ): Promise<{ id: string; username: string; role: 'user' | 'admin' }> {
    const rows = await db.select<Array<{ id: string; username: string; role: 'user' | 'admin' }>>(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role`,
      [username, '$argon2id$v=19$m=4096,t=3,p=1$abc$def', role]
    )
    await resetUserPasswordAsAdmin({
      db,
      actor: rows[0]!,
      targetUserId: rows[0]!.id,
      newPassword: password,
    }).catch(() => undefined)
    return rows[0]!
  }

  it('non-admin cannot list/create/disable/reset/update users', async () => {
    await withHarness('pg_uam3_non_admin', async ({ db }) => {
      const admin = await seedUser(db, 'admin-root', 'admin')
      const user = await seedUser(db, 'normal-user', 'user')

      await expect(listUsersAsAdmin(db, user)).rejects.toThrow('Forbidden')
      await expect(
        createUserAsAdmin({
          db,
          actor: user,
          username: 'new-user',
          password: 'password123',
          role: 'user',
        })
      ).rejects.toThrow('Forbidden')
      await expect(disableUserAsAdmin({ db, actor: user, targetUserId: admin.id })).rejects.toThrow('Forbidden')
      await expect(
        resetUserPasswordAsAdmin({
          db,
          actor: user,
          targetUserId: admin.id,
          newPassword: 'newpass123',
        })
      ).rejects.toThrow('Forbidden')
      await expect(
        updateUserRoleAsAdmin({
          db,
          actor: user,
          targetUserId: admin.id,
          role: 'user',
        })
      ).rejects.toThrow('Forbidden')

      const deniedAuditRows = await db.select<Array<{ action: string }>>(
        `SELECT action
         FROM audit_logs
         WHERE actor_user_id = $1
         ORDER BY created_at`,
        [user.id]
      )
      expect(deniedAuditRows.some((row) => row.action === 'admin.authorization_failed')).toBe(true)
    })
  })

  it('admin can list users and create users, duplicate username rejected', async () => {
    await withHarness('pg_uam3_create_list', async ({ db }) => {
      const admin = await seedUser(db, 'admin-root', 'admin')
      const created = await createUserAsAdmin({
        db,
        actor: admin,
        username: 'new-user',
        password: 'password123',
        role: 'user',
      })
      expect(created.username).toBe('new-user')
      const users = await listUsersAsAdmin(db, admin)
      expect(users.some((u) => u.username === 'new-user')).toBe(true)
      await expect(
        createUserAsAdmin({
          db,
          actor: admin,
          username: 'new-user',
          password: 'password123',
          role: 'user',
        })
      ).rejects.toThrow()
    })
  })

  it('admin can disable user and disabled user cannot authenticate', async () => {
    await withHarness('pg_uam3_disable', async ({ db }) => {
      const admin = await createUserAsAdmin({
        db,
        actor: await seedUser(db, 'bootstrap-admin', 'admin'),
        username: 'admin-root',
        password: 'adminpass123',
        role: 'admin',
      })
      const target = await createUserAsAdmin({
        db,
        actor: admin,
        username: 'to-disable',
        password: 'targetpass123',
        role: 'user',
      })
      await expect(login(db, { username: 'to-disable', password: 'targetpass123' })).resolves.toBeTruthy()
      await disableUserAsAdmin({ db, actor: admin, targetUserId: target.id })
      await expect(login(db, { username: 'to-disable', password: 'targetpass123' })).rejects.toThrow(
        'Invalid credentials'
      )
    })
  })

  it('admin can reset password and old password no longer works', async () => {
    await withHarness('pg_uam3_reset', async ({ db }) => {
      const admin = await seedUser(db, 'admin-root', 'admin', 'adminpass123')
      const user = await createUserAsAdmin({
        db,
        actor: admin,
        username: 'reset-me',
        password: 'oldpass123',
        role: 'user',
      })
      await expect(login(db, { username: 'reset-me', password: 'oldpass123' })).resolves.toBeTruthy()
      await resetUserPasswordAsAdmin({
        db,
        actor: admin,
        targetUserId: user.id,
        newPassword: 'newpass123',
      })
      await expect(login(db, { username: 'reset-me', password: 'oldpass123' })).rejects.toThrow('Invalid credentials')
      await expect(login(db, { username: 'reset-me', password: 'newpass123' })).resolves.toBeTruthy()
    })
  })

  it('users table includes instance key wrapper mirror columns (ENC6)', async () => {
    await withHarness('pg_enc6_wrapper_columns', async ({ db }) => {
      const rows = await db.select<Array<{ column_name: string }>>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name LIKE 'instance_key%'
         ORDER BY column_name`,
        []
      )
      const names = rows.map((r) => r.column_name)
      expect(names).toEqual([
        'instance_key_wrap_created_at',
        'instance_key_wrap_rotated_at',
        'instance_key_wrap_salt',
        'instance_key_wrap_version',
        'instance_key_wrapped',
      ])
    })
  })

  it('rejects password reset for disabled target users', async () => {
    await withHarness('pg_uam6_reset_disabled_target', async ({ db }) => {
      const admin = await seedUser(db, 'reset-disabled-admin', 'admin', 'adminpass123')
      const user = await createUserAsAdmin({
        db,
        actor: admin,
        username: 'disabled-reset-target',
        password: 'oldpass123',
        role: 'user',
      })
      await disableUserAsAdmin({ db, actor: admin, targetUserId: user.id })
      await expect(
        resetUserPasswordAsAdmin({
          db,
          actor: admin,
          targetUserId: user.id,
          newPassword: 'newpass123',
        })
      ).rejects.toThrow('Cannot reset password for disabled user')
    })
  })

  it('revokes active sessions on disable, password reset, and role change', async () => {
    await withHarness('pg_uam6_session_revoke', async ({ db }) => {
      const admin = await seedUser(db, 'session-admin', 'admin', 'adminpass123')
      const target = await createUserAsAdmin({
        db,
        actor: admin,
        username: 'session-target',
        password: 'targetpass123',
        role: 'user',
      })
      const firstSession = await login(db, { username: 'session-target', password: 'targetpass123' })
      await disableUserAsAdmin({ db, actor: admin, targetUserId: target.id })
      await expect(resolveAuthenticatedUserFromSessionToken(db, firstSession.sessionToken)).resolves.toBeNull()

      await enableUserAsAdmin({ db, actor: admin, targetUserId: target.id })
      await resetUserPasswordAsAdmin({
        db,
        actor: admin,
        targetUserId: target.id,
        newPassword: 'newtargetpass123',
      })
      const secondSession = await login(db, { username: 'session-target', password: 'newtargetpass123' })
      await updateUserRoleAsAdmin({
        db,
        actor: admin,
        targetUserId: target.id,
        role: 'admin',
      })
      await expect(resolveAuthenticatedUserFromSessionToken(db, secondSession.sessionToken)).resolves.toBeNull()
    })
  })

  it('writes audit logs for sensitive admin actions without password content', async () => {
    await withHarness('pg_uam6_admin_audit', async ({ db }) => {
      const admin = await seedUser(db, 'audit-admin', 'admin', 'adminpass123')
      const target = await createUserAsAdmin({
        db,
        actor: admin,
        username: 'audit-target',
        password: 'targetpass123',
        role: 'user',
      })
      await updateUserRoleAsAdmin({
        db,
        actor: admin,
        targetUserId: target.id,
        role: 'admin',
      })
      await resetUserPasswordAsAdmin({
        db,
        actor: admin,
        targetUserId: target.id,
        newPassword: 'very-secret-password',
      })
      await disableUserAsAdmin({ db, actor: admin, targetUserId: target.id })
      await enableUserAsAdmin({ db, actor: admin, targetUserId: target.id })

      const rows = await db.select<Array<{ action: string; metadata_json: unknown }>>(
        `SELECT action, metadata_json
         FROM audit_logs
         ORDER BY created_at`,
        []
      )
      expect(rows.some((row) => row.action === 'admin.user_created')).toBe(true)
      expect(rows.some((row) => row.action === 'admin.user_role_changed')).toBe(true)
      expect(rows.some((row) => row.action === 'admin.user_password_reset')).toBe(true)
      expect(rows.some((row) => row.action === 'admin.user_disabled')).toBe(true)
      expect(rows.some((row) => row.action === 'admin.user_enabled')).toBe(true)

      const serialized = JSON.stringify(rows.map((row) => row.metadata_json))
      expect(serialized.toLowerCase()).not.toContain('password')
      expect(serialized.toLowerCase()).not.toContain('hash')
      expect(serialized.toLowerCase()).not.toContain('token')
      expect(serialized).not.toContain('very-secret-password')
    })
  })

  it('rate limits sensitive admin mutations deterministically', async () => {
    await withHarness('pg_uam6_admin_rate_limit', async ({ db }) => {
      const admin = await seedUser(db, 'rate-admin', 'admin', 'adminpass123')
      const target = await createUserAsAdmin({
        db,
        actor: admin,
        username: 'rate-target',
        password: 'targetpass123',
        role: 'user',
      })

      await expect(
        resetUserPasswordAsAdmin({
          db,
          actor: admin,
          targetUserId: target.id,
          newPassword: 'targetpass124',
          options: {
            sourceIp: '127.0.0.1',
            rateLimitRule: { maxAttempts: 1, windowMs: 60_000 },
            rateLimitNowMs: 1,
          },
        })
      ).resolves.toBeUndefined()

      await expect(
        resetUserPasswordAsAdmin({
          db,
          actor: admin,
          targetUserId: target.id,
          newPassword: 'targetpass125',
          options: {
            sourceIp: '127.0.0.1',
            rateLimitRule: { maxAttempts: 1, windowMs: 60_000 },
            rateLimitNowMs: 2,
          },
        })
      ).rejects.toThrow(RATE_LIMIT_ERROR_MESSAGE)
    })
  })

  it('admin can change roles, but final active admin cannot be demoted or disabled', async () => {
    await withHarness('pg_uam3_roles', async ({ db }) => {
      const admin = await seedUser(db, 'only-admin', 'admin', 'adminpass123')
      const target = await createUserAsAdmin({
        db,
        actor: admin,
        username: 'target-user',
        password: 'pass12345',
        role: 'user',
      })

      await updateUserRoleAsAdmin({
        db,
        actor: admin,
        targetUserId: target.id,
        role: 'admin',
      })
      const usersAfterPromote = await listUsersAsAdmin(db, admin)
      expect(usersAfterPromote.find((u) => u.id === target.id)?.role).toBe('admin')

      await expect(
        updateUserRoleAsAdmin({
          db,
          actor: admin,
          targetUserId: admin.id,
          role: 'user',
        })
      ).rejects.toThrow()

      await disableUserAsAdmin({ db, actor: admin, targetUserId: target.id })
      await expect(disableUserAsAdmin({ db, actor: admin, targetUserId: admin.id })).rejects.toThrow()
    })
  })
})

async function createHarness(prefix: string): Promise<Harness> {
  const schemaName = deterministicSchemaName(prefix)
  const pool = new Pool(await resolvePostgresTestConfig())
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)
  await pool.query(`SET search_path TO ${schemaName}, public`)
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  const uam1Sql = readFileSync(
    join(process.cwd(), 'postgres', 'migrations', '0003_uam1_auth_foundation.sql'),
    'utf8'
  )
  const uam6AuditSql = readFileSync(
    join(process.cwd(), 'postgres', 'migrations', '0005_uam6_audit_logs.sql'),
    'utf8'
  )
  const enc6WrapperSql = readFileSync(
    join(process.cwd(), 'postgres', 'migrations', '0010_user_instance_key_wrapper.sql'),
    'utf8'
  )
  await pool.query(uam1Sql)
  await pool.query(uam6AuditSql)
  await pool.query(enc6WrapperSql)
  return {
    db: new PostgresDatabaseAdapter(pool, schemaName),
    close: async () => {
      await pool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
      await pool.end()
    },
  }
}
