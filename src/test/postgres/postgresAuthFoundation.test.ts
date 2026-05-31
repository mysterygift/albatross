import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { Pool } from 'pg'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import {
  bootstrapFirstAdmin,
  createUserAccount,
  getInvalidCredentialsMessage,
  login,
  logout,
  resolveAuthenticatedUserFromSessionToken,
  setupInitialAdmin,
} from '@/lib/auth/authService'
import { hashPassword, verifyPassword } from '@/lib/auth/passwordHash'
import { resolveRequestUserContext } from '@/lib/auth/requestAuth'
import { RATE_LIMIT_ERROR_MESSAGE, resetRateLimiterForTests } from '@/lib/security/rateLimiter'
import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'
import { PostgresDatabaseAdapter } from '@/lib/db/postgresDatabaseAdapter'
import { deterministicSchemaName } from '@/test/postgres/schemaAudit'

type AuthHarness = {
  adapter: DatabaseAdapter
  close: () => Promise<void>
}

describe('postgres auth foundation (UAM1)', () => {
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

  async function withHarness(
    prefix: string,
    run: (ctx: { adapter: DatabaseAdapter }) => Promise<void>
  ): Promise<void> {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL auth assertions: ${connectionError}`)
      return
    }
    const harness = await createAuthHarness(prefix)
    try {
      await run({ adapter: harness.adapter })
    } finally {
      await harness.close()
    }
  }

  it('enforces username uniqueness and role constraint in schema', async () => {
    await withHarness('pg_auth_schema', async ({ adapter }) => {
      await createUserAccount(adapter, { username: 'alice', password: 'correct horse battery staple' })
      await expect(
        createUserAccount(adapter, { username: 'Alice', password: 'another very secure password' })
      ).rejects.toThrow()

      await expect(
        adapter.execute(
          `INSERT INTO users (username, password_hash, role)
           VALUES ($1, $2, $3)`,
          ['role-test', '$argon2id$v=19$m=4096,t=3,p=1$abc$def', 'owner']
        )
      ).rejects.toThrow()
    })
  })

  it('stores passwords as salted hashes and verifies credentials correctly', async () => {
    const password = 'super-secret-password-123'
    const hashed = await hashPassword(password)
    expect(hashed).not.toBe(password)
    expect(hashed.startsWith('$argon2')).toBe(true)
    await expect(verifyPassword(password, hashed)).resolves.toBe(true)
    await expect(verifyPassword('wrong-password', hashed)).resolves.toBe(false)
  })

  it('bootstraps first admin only once and requires secret', async () => {
    await withHarness('pg_auth_bootstrap', async ({ adapter }) => {
      await expect(
        bootstrapFirstAdmin(adapter, {
          username: 'admin',
          password: 'bootstrap-admin-password',
          bootstrapSecret: 'bad-secret',
          expectedBootstrapSecret: 'expected-secret',
        })
      ).rejects.toThrow('Invalid bootstrap secret')

      const firstBootstrap = await bootstrapFirstAdmin(adapter, {
        username: 'admin',
        password: 'bootstrap-admin-password',
        bootstrapSecret: 'expected-secret',
        expectedBootstrapSecret: 'expected-secret',
      })
      expect(firstBootstrap.user.role).toBe('admin')
      expect(firstBootstrap.user.username).toBe('admin')
      expect(firstBootstrap.sessionToken!.length).toBeGreaterThan(20)

      await expect(
        bootstrapFirstAdmin(adapter, {
          username: 'second-admin',
          password: 'different-password',
          bootstrapSecret: 'expected-secret',
          expectedBootstrapSecret: 'expected-secret',
        })
      ).rejects.toThrow('Bootstrap unavailable')

      const auditRows = await adapter.select<Array<{ action: string; metadata_json: unknown }>>(
        `SELECT action, metadata_json
         FROM audit_logs
         ORDER BY created_at`,
        []
      )
      expect(auditRows.some((row) => row.action === 'auth.bootstrap_admin_created')).toBe(true)
    })
  })

  it('sets up an initial admin in-app when no admin exists', async () => {
    await withHarness('pg_auth_initial_admin_setup', async ({ adapter }) => {
      await createUserAccount(adapter, { username: 'regular-user', password: 'regular-user-password', role: 'user' })

      const result = await setupInitialAdmin(adapter, {
        username: 'setup-admin',
        password: 'setup-admin-password',
        confirmPassword: 'setup-admin-password',
      })
      expect(result.user.role).toBe('admin')
      expect(result.user.username).toBe('setup-admin')
      expect(result.sessionToken!.length).toBeGreaterThan(20)

      const userRows = await adapter.select<Array<{ password_hash: string }>>(
        `SELECT password_hash FROM users WHERE username = $1`,
        ['setup-admin']
      )
      expect(userRows[0]?.password_hash).not.toBe('setup-admin-password')
      expect(userRows[0]?.password_hash.startsWith('$argon2')).toBe(true)

      await expect(
        setupInitialAdmin(adapter, {
          username: 'setup-admin-2',
          password: 'setup-admin-2-password',
          confirmPassword: 'setup-admin-2-password',
        })
      ).rejects.toThrow('Initial admin setup unavailable')

      const auditRows = await adapter.select<Array<{ action: string }>>(
        `SELECT action FROM audit_logs ORDER BY created_at`,
        []
      )
      expect(auditRows.some((row) => row.action === 'auth.initial_admin_created')).toBe(true)
    })
  })

  it('can create initial admin without a session during setup', async () => {
    await withHarness('pg_auth_initial_admin_no_session', async ({ adapter }) => {
      const result = await setupInitialAdmin(adapter, {
        username: 'NoSessionAdmin',
        password: 'no-session-password',
        confirmPassword: 'no-session-password',
        createSession: false,
      })

      expect(result.user.username).toBe('nosessionadmin')
      expect(result.session).toBeUndefined()
      expect(result.sessionToken).toBeUndefined()

      const sessionRows = await adapter.select<Array<{ count: number | string }>>(
        `SELECT COUNT(*)::int AS count FROM sessions`,
        []
      )
      expect(Number(sessionRows[0]?.count ?? 0)).toBe(0)
    })
  })

  it('rate limits repeated login attempts and bootstrap attempts', async () => {
    await withHarness('pg_auth_rate_limit', async ({ adapter }) => {
      await createUserAccount(adapter, { username: 'ratelimit-user', password: 'ratelimit-password' })
      await expect(
        login(adapter, {
          username: 'ratelimit-user',
          password: 'wrong-password',
          rateLimitRule: { maxAttempts: 1, windowMs: 60_000 },
          rateLimitNowMs: 1,
        })
      ).rejects.toThrow(getInvalidCredentialsMessage())
      await expect(
        login(adapter, {
          username: 'ratelimit-user',
          password: 'wrong-password',
          rateLimitRule: { maxAttempts: 1, windowMs: 60_000 },
          rateLimitNowMs: 2,
        })
      ).rejects.toThrow(RATE_LIMIT_ERROR_MESSAGE)

      await expect(
        bootstrapFirstAdmin(adapter, {
          username: 'bootstrap-ratelimit',
          password: 'bootstrap-ratelimit-password',
          bootstrapSecret: 'bad-secret',
          expectedBootstrapSecret: 'expected-secret',
          sourceIp: '127.0.0.1',
          rateLimitRule: { maxAttempts: 1, windowMs: 60_000 },
          rateLimitNowMs: 5,
        })
      ).rejects.toThrow('Invalid bootstrap secret')
      await expect(
        bootstrapFirstAdmin(adapter, {
          username: 'bootstrap-ratelimit',
          password: 'bootstrap-ratelimit-password',
          bootstrapSecret: 'expected-secret',
          expectedBootstrapSecret: 'expected-secret',
          sourceIp: '127.0.0.1',
          rateLimitRule: { maxAttempts: 1, windowMs: 60_000 },
          rateLimitNowMs: 6,
        })
      ).rejects.toThrow(RATE_LIMIT_ERROR_MESSAGE)
    })
  })

  it('logs in with valid credentials and creates server-side sessions', async () => {
    await withHarness('pg_auth_login_ok', async ({ adapter }) => {
      await createUserAccount(adapter, { username: 'producer', password: 'producer-password' })
      const auth = await login(adapter, { username: 'Producer', password: 'producer-password' })
      expect(auth.user.username).toBe('producer')
      expect(auth.session!.user_id).toBe(auth.user.id)
      expect(auth.sessionToken!.length).toBeGreaterThan(20)

      const tokenRows = await adapter.select<Array<{ token_hash: string }>>(
        `SELECT token_hash FROM sessions WHERE id = $1`,
        [auth.session!.id]
      )
      expect(tokenRows).toHaveLength(1)
      expect(tokenRows[0]!.token_hash).not.toBe(auth.sessionToken)
    })
  })

  it('fails login safely for invalid username/password and disabled users', async () => {
    await withHarness('pg_auth_login_fail', async ({ adapter }) => {
      await createUserAccount(adapter, { username: 'lineproducer', password: 'lineproducer-password' })
      await expect(login(adapter, { username: 'missing-user', password: 'x' })).rejects.toThrow(
        getInvalidCredentialsMessage()
      )
      await expect(login(adapter, { username: 'lineproducer', password: 'wrong' })).rejects.toThrow(
        getInvalidCredentialsMessage()
      )

      await adapter.execute(`UPDATE users SET disabled_at = CURRENT_TIMESTAMP WHERE username = $1`, ['lineproducer'])
      await expect(login(adapter, { username: 'lineproducer', password: 'lineproducer-password' })).rejects.toThrow(
        getInvalidCredentialsMessage()
      )
    })
  })

  it('logout revokes session and revoked/expired sessions no longer authenticate', async () => {
    await withHarness('pg_auth_logout', async ({ adapter }) => {
      await createUserAccount(adapter, { username: 'assistant', password: 'assistant-password' })
      const auth = await login(adapter, { username: 'assistant', password: 'assistant-password' })

      const resolvedBefore = await resolveAuthenticatedUserFromSessionToken(adapter, auth.sessionToken!)
      expect(resolvedBefore?.user.username).toBe('assistant')

      await logout(adapter, auth.sessionToken!)
      await logout(adapter, auth.sessionToken!)
      await expect(resolveAuthenticatedUserFromSessionToken(adapter, auth.sessionToken!)).resolves.toBeNull()

      const second = await login(adapter, {
        username: 'assistant',
        password: 'assistant-password',
        sessionTtlMs: 1,
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
      await expect(resolveAuthenticatedUserFromSessionToken(adapter, second.sessionToken!)).resolves.toBeNull()
    })
  })

  it('rejects disabled users even when their session token was previously valid', async () => {
    await withHarness('pg_auth_disabled_session', async ({ adapter }) => {
      await createUserAccount(adapter, { username: 'coordinator', password: 'coordinator-password' })
      const auth = await login(adapter, { username: 'coordinator', password: 'coordinator-password' })
      await adapter.execute(`UPDATE users SET disabled_at = CURRENT_TIMESTAMP WHERE id = $1`, [auth.user.id])
      await expect(resolveAuthenticatedUserFromSessionToken(adapter, auth.sessionToken!)).resolves.toBeNull()
    })
  })

  it('resolves current user context from bearer token headers', async () => {
    await withHarness('pg_auth_middleware', async ({ adapter }) => {
      await createUserAccount(adapter, { username: 'director', password: 'director-password', role: 'admin' })
      const auth = await login(adapter, { username: 'director', password: 'director-password' })

      const context = await resolveRequestUserContext(adapter, {
        authorization: `Bearer ${auth.sessionToken}`,
      })
      expect(context).toEqual({
        id: auth.user.id,
        username: 'director',
        role: 'admin',
      })
    })
  })
})

async function createAuthHarness(prefix: string): Promise<AuthHarness> {
  const schemaName = deterministicSchemaName(prefix)
  const pool = new Pool(await resolvePostgresTestConfig())
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)
  await pool.query(`SET search_path TO ${schemaName}, public`)
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  const authMigrationSql = readFileSync(
    join(process.cwd(), 'postgres', 'migrations', '0003_uam1_auth_foundation.sql'),
    'utf8'
  )
  const auditMigrationSql = readFileSync(
    join(process.cwd(), 'postgres', 'migrations', '0005_uam6_audit_logs.sql'),
    'utf8'
  )
  await pool.query(authMigrationSql)
  await pool.query(auditMigrationSql)

  return {
    adapter: new PostgresDatabaseAdapter(pool, schemaName),
    close: async () => {
      await pool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
      await pool.end()
    },
  }
}
