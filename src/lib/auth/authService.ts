import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { getSetting, setSetting } from '@/lib/db/repositories/settings'
import { appendAuditLog } from '@/lib/security/auditLog'
import {
  DEFAULT_AUTH_BOOTSTRAP_RATE_LIMIT,
  DEFAULT_AUTH_LOGIN_RATE_LIMIT,
  enforceRateLimit,
  type RateLimitRule,
} from '@/lib/security/rateLimiter'

import { sqlAdminUsersCount, sqlTotalUsersCount } from './authSql'
import { generateSessionToken, hashSessionToken } from './sessionToken'

export type InstanceUserRole = 'user' | 'admin'

export type AuthenticatedUser = {
  id: string
  username: string
  role: InstanceUserRole
}

export type AuthSession = {
  id: string
  user_id: string
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export type AuthResult = {
  user: AuthenticatedUser
  session: AuthSession
  sessionToken: string
}

export type CreateUserInput = {
  username: string
  password: string
  role?: InstanceUserRole
}

export type BootstrapFirstAdminInput = {
  username: string
  password: string
  bootstrapSecret: string
  expectedBootstrapSecret?: string
  sourceIp?: string | null
  userAgent?: string | null
  rateLimitRule?: RateLimitRule
  rateLimitNowMs?: number
}

export type LoginInput = {
  username: string
  password: string
  sessionTtlMs?: number
  sourceIp?: string | null
  userAgent?: string | null
  rateLimitRule?: RateLimitRule
  rateLimitNowMs?: number
}

export type SetupInitialAdminInput = {
  username: string
  password: string
  sourceIp?: string | null
  userAgent?: string | null
}

const INVALID_CREDENTIALS_ERROR = 'Invalid credentials'
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days
const BOOTSTRAP_SECRET_ENV_KEY = 'ALBATROSS_BOOTSTRAP_SECRET'

type UserRow = {
  id: string
  username: string
  password_hash: string
  role: InstanceUserRole
  disabled_at: string | null
}

type SessionRow = {
  id: string
  user_id: string
  created_at: string
  expires_at: string
  revoked_at: string | null
}

type SessionWithUserRow = {
  session_id: string
  session_user_id: string
  session_created_at: string
  session_expires_at: string
  session_revoked_at: string | null
  user_id: string
  username: string
  role: InstanceUserRole
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function assertNewCredentialShape(username: string, password: string): void {
  if (!username) throw new Error('Username is required')
  if (username.length > 128) throw new Error('Username is too long')
  if (!password) throw new Error('Password is required')
}

function safeSecretEquals(left: string, right: string): boolean {
  const enc = new TextEncoder()
  const leftBytes = enc.encode(left)
  const rightBytes = enc.encode(right)
  if (leftBytes.length !== rightBytes.length) return false
  // Constant-time comparison: don't short-circuit so timing doesn't leak content.
  let diff = 0
  for (let i = 0; i < leftBytes.length; i++) {
    diff |= (leftBytes[i] as number) ^ (rightBytes[i] as number)
  }
  return diff === 0
}

let dummyPasswordHashPromise: Promise<string> | null = null

async function getPasswordHashHelpers() {
  return import('./passwordHash')
}

async function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHashPromise) {
    // Used for failed-login timing flattening when username is unknown.
    const { hashPassword } = await getPasswordHashHelpers()
    dummyPasswordHashPromise = hashPassword('albatross-auth-dummy-password')
  }
  return dummyPasswordHashPromise
}

async function createSession(
  db: DatabaseAdapter,
  userId: string,
  sessionTtlMs: number = DEFAULT_SESSION_TTL_MS
): Promise<{ session: AuthSession; sessionToken: string }> {
  const sessionToken = generateSessionToken()
  const tokenHash = await hashSessionToken(sessionToken)
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString()
  const rows = await db.select<SessionRow[]>(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, created_at, expires_at, revoked_at`,
    [userId, tokenHash, expiresAt]
  )
  const session = rows[0]
  if (!session) throw new Error('Failed to create session')
  return {
    session: {
      id: session.id,
      user_id: session.user_id,
      created_at: session.created_at,
      expires_at: session.expires_at,
      revoked_at: session.revoked_at,
    },
    sessionToken,
  }
}

export function getInvalidCredentialsMessage(): string {
  return INVALID_CREDENTIALS_ERROR
}

export function getNormalizedUsername(username: string): string {
  return normalizeUsername(username)
}

export async function createUserAccount(
  db: DatabaseAdapter,
  input: CreateUserInput
): Promise<AuthenticatedUser> {
  const username = normalizeUsername(input.username)
  assertNewCredentialShape(username, input.password)
  const { hashPassword } = await getPasswordHashHelpers()
  const passwordHash = await hashPassword(input.password)
  const role = input.role ?? 'user'
  const rows = await db.select<AuthenticatedUser[]>(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, username, role`,
    [username, passwordHash, role]
  )
  const user = rows[0]
  if (!user) throw new Error('Failed to create user')
  return user
}

export async function bootstrapFirstAdmin(
  db: DatabaseAdapter,
  input: BootstrapFirstAdminInput
): Promise<AuthResult> {
  const username = normalizeUsername(input.username)
  enforceRateLimit({
    scope: 'auth.bootstrap',
    key: `${input.sourceIp ?? 'unknown'}:${username || 'unknown'}`,
    rule: input.rateLimitRule ?? DEFAULT_AUTH_BOOTSTRAP_RATE_LIMIT,
    nowMs: input.rateLimitNowMs,
  })
  const expectedSecret = input.expectedBootstrapSecret ?? process.env[BOOTSTRAP_SECRET_ENV_KEY]
  if (!expectedSecret) throw new Error(`Bootstrap secret is not configured (${BOOTSTRAP_SECRET_ENV_KEY})`)
  if (!safeSecretEquals(input.bootstrapSecret, expectedSecret)) {
    throw new Error('Invalid bootstrap secret')
  }
  const countRows = await db.select<Array<{ count: number | string }>>(sqlTotalUsersCount(db.dialect))
  const existingUsersCount = Number(countRows[0]?.count ?? 0)
  if (existingUsersCount > 0) {
    throw new Error('Bootstrap unavailable: users already exist')
  }
  const user = await createUserAccount(db, { username: input.username, password: input.password, role: 'admin' })
  const { session, sessionToken } = await createSession(db, user.id)
  await appendAuditLog(db, {
    actorUserId: user.id,
    targetUserId: user.id,
    action: 'auth.bootstrap_admin_created',
    metadata: { username: user.username, role: user.role },
    ipAddress: input.sourceIp ?? null,
    userAgent: input.userAgent ?? null,
  })
  return { user, session, sessionToken }
}

export async function setupInitialAdmin(
  db: DatabaseAdapter,
  input: SetupInitialAdminInput
): Promise<AuthResult> {
  const existingAdminRows = await db.select<Array<{ count: number | string }>>(
    sqlAdminUsersCount(db.dialect),
    []
  )
  const existingAdminCount = Number(existingAdminRows[0]?.count ?? 0)
  if (existingAdminCount > 0) {
    throw new Error('Initial admin setup unavailable: admin user already exists')
  }

  const user = await createUserAccount(db, {
    username: input.username,
    password: input.password,
    role: 'admin',
  })
  const { session, sessionToken } = await createSession(db, user.id)
  await appendAuditLog(db, {
    actorUserId: user.id,
    targetUserId: user.id,
    action: 'auth.initial_admin_created',
    metadata: { username: user.username, role: user.role },
    ipAddress: input.sourceIp ?? null,
    userAgent: input.userAgent ?? null,
  })
  return { user, session, sessionToken }
}

export async function login(
  db: DatabaseAdapter,
  input: LoginInput
): Promise<AuthResult> {
  const { verifyPassword } = await getPasswordHashHelpers()
  const username = normalizeUsername(input.username)
  enforceRateLimit({
    scope: 'auth.login',
    key: `${input.sourceIp ?? 'unknown'}:${username || 'unknown'}`,
    rule: input.rateLimitRule ?? DEFAULT_AUTH_LOGIN_RATE_LIMIT,
    nowMs: input.rateLimitNowMs,
  })
  if (!username || !input.password) {
    throw new Error(INVALID_CREDENTIALS_ERROR)
  }
  const rows = await db.select<UserRow[]>(
    `SELECT id, username, password_hash, role, disabled_at
     FROM users
     WHERE username = $1
     LIMIT 1`,
    [username]
  )
  const user = rows[0]
  if (!user) {
    await verifyPassword(input.password, await getDummyPasswordHash())
    throw new Error(INVALID_CREDENTIALS_ERROR)
  }
  if (user.disabled_at) {
    await verifyPassword(input.password, user.password_hash).catch(() => undefined)
    throw new Error(INVALID_CREDENTIALS_ERROR)
  }
  const valid = await verifyPassword(input.password, user.password_hash)
  if (!valid) throw new Error(INVALID_CREDENTIALS_ERROR)

  const { session, sessionToken } = await createSession(db, user.id, input.sessionTtlMs)
  await appendAuditLog(db, {
    actorUserId: user.id,
    targetUserId: user.id,
    action: 'auth.login_succeeded',
    metadata: { username: user.username, role: user.role },
    ipAddress: input.sourceIp ?? null,
    userAgent: input.userAgent ?? null,
  })
  return {
    user: { id: user.id, username: user.username, role: user.role },
    session,
    sessionToken,
  }
}

export async function logout(db: DatabaseAdapter, sessionToken: string): Promise<void> {
  const tokenHash = await hashSessionToken(sessionToken)
  await db.execute(
    `UPDATE sessions
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1
       AND revoked_at IS NULL`,
    [tokenHash]
  )
}

/** Same setting key as `useAuthSession` — keep in sync. */
const AUTH_SESSION_TOKEN_SETTING_KEY = 'auth_session_token'

/** Revokes the current session row (if any) and clears the persisted token from settings. */
export async function clearPersistedAuthSession(db: DatabaseAdapter): Promise<void> {
  const token = await getSetting(AUTH_SESSION_TOKEN_SETTING_KEY)
  if (token) {
    try {
      await logout(db, token)
    } catch {
      // still clear local token
    }
  }
  await setSetting(AUTH_SESSION_TOKEN_SETTING_KEY, '')
}

export async function resolveAuthenticatedUserFromSessionToken(
  db: DatabaseAdapter,
  sessionToken: string
): Promise<{ user: AuthenticatedUser; session: AuthSession } | null> {
  const tokenHash = await hashSessionToken(sessionToken)
  const rows = await db.select<SessionWithUserRow[]>(
    `SELECT
       s.id AS session_id,
       s.user_id AS session_user_id,
       s.created_at AS session_created_at,
       s.expires_at AS session_expires_at,
       s.revoked_at AS session_revoked_at,
       u.id AS user_id,
       u.username AS username,
       u.role AS role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
       AND u.disabled_at IS NULL
     LIMIT 1`,
    [tokenHash]
  )
  const row = rows[0]
  if (!row) return null
  return {
    user: {
      id: row.user_id,
      username: row.username,
      role: row.role,
    },
    session: {
      id: row.session_id,
      user_id: row.session_user_id,
      created_at: row.session_created_at,
      expires_at: row.session_expires_at,
      revoked_at: row.session_revoked_at,
    },
  }
}

