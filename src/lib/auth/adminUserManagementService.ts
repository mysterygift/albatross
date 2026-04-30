import type { ProjectAccessLevel } from '@/lib/access/projectAccess'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import {
  addUserToProject,
  listActiveProjectMembershipsForUser,
  revokeUserProjectMembership,
  updateUserProjectAccessLevel,
  type ProjectMembership,
  type UserProjectVisibilityRow,
} from '@/lib/db/repositories/projectMemberships'
import { appendAuditLog } from '@/lib/security/auditLog'
import {
  DEFAULT_ADMIN_MUTATION_RATE_LIMIT,
  enforceRateLimit,
  type RateLimitRule,
} from '@/lib/security/rateLimiter'

import type { AuthenticatedUser } from './authService'
import { sqlActiveAdminUsersCount } from './authSql'

export type InstanceRole = 'user' | 'admin'

export type ManagedUser = {
  id: string
  username: string
  role: InstanceRole
  created_at: string
  updated_at: string
  disabled_at: string | null
}

type ActorState = {
  id: string
  role: InstanceRole
  disabled_at: string | null
}

type AdminMutationOptions = {
  sourceIp?: string | null
  userAgent?: string | null
  rateLimitRule?: RateLimitRule
  rateLimitNowMs?: number
}

function nowIso(): string {
  return new Date().toISOString()
}

async function getPasswordHashHelpers() {
  return import('./passwordHash')
}

async function getActorState(db: DatabaseAdapter, actorId: string): Promise<ActorState | null> {
  const rows = await db.select<ActorState[]>(
    `SELECT id, role, disabled_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [actorId]
  )
  return rows[0] ?? null
}

async function assertActorIsActiveInstanceAdmin(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  operation: string,
  options?: { sourceIp?: string | null; userAgent?: string | null }
): Promise<void> {
  const state = await getActorState(db, actor.id)
  if (!state || state.disabled_at || state.role !== 'admin') {
    await appendAuditLog(db, {
      actorUserId: actor.id,
      action: 'admin.authorization_failed',
      metadata: { operation },
      ipAddress: options?.sourceIp ?? null,
      userAgent: options?.userAgent ?? null,
    })
    throw new Error('Forbidden')
  }
}

function enforceAdminMutationRateLimit(actor: AuthenticatedUser, operation: string, options?: AdminMutationOptions): void {
  enforceRateLimit({
    scope: `admin.${operation}`,
    key: `${options?.sourceIp ?? 'unknown'}:${actor.id}`,
    rule: options?.rateLimitRule ?? DEFAULT_ADMIN_MUTATION_RATE_LIMIT,
    nowMs: options?.rateLimitNowMs,
  })
}

async function countActiveAdmins(db: DatabaseAdapter): Promise<number> {
  const rows = await db.select<Array<{ count: number | string }>>(
    sqlActiveAdminUsersCount(db.dialect),
    []
  )
  return Number(rows[0]?.count ?? 0)
}

export async function listUsersAsAdmin(
  db: DatabaseAdapter,
  actor: AuthenticatedUser
): Promise<ManagedUser[]> {
  await assertActorIsActiveInstanceAdmin(db, actor, 'list_users')
  return db.select<ManagedUser[]>(
    `SELECT id, username, role, created_at, updated_at, disabled_at
     FROM users
     ORDER BY username`,
    []
  )
}

export async function createUserAsAdmin(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  username: string
  password: string
  role: InstanceRole
  options?: AdminMutationOptions
}): Promise<ManagedUser> {
  await assertActorIsActiveInstanceAdmin(args.db, args.actor, 'create_user', args.options)
  enforceAdminMutationRateLimit(args.actor, 'create_user', args.options)
  const username = args.username.trim().toLowerCase()
  if (!username) throw new Error('Username is required')
  if (username.length > 128) throw new Error('Username is too long')
  if (!args.password) throw new Error('Password is required')
  if (args.password.length < 8) throw new Error('Password must be at least 8 characters')
  if (args.role !== 'user' && args.role !== 'admin') throw new Error('Invalid role')

  const { hashPassword } = await getPasswordHashHelpers()
  const passwordHash = await hashPassword(args.password)
  const rows = await args.db.select<ManagedUser[]>(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, username, role, created_at, updated_at, disabled_at`,
    [username, passwordHash, args.role]
  )
  const created = rows[0]
  if (!created) throw new Error('User create failed')
  await appendAuditLog(args.db, {
    actorUserId: args.actor.id,
    targetUserId: created.id,
    action: 'admin.user_created',
    metadata: { role: created.role, username: created.username },
    ipAddress: args.options?.sourceIp ?? null,
    userAgent: args.options?.userAgent ?? null,
  })
  return created
}

export async function disableUserAsAdmin(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  targetUserId: string
  options?: AdminMutationOptions
}): Promise<void> {
  await assertActorIsActiveInstanceAdmin(args.db, args.actor, 'disable_user', args.options)
  enforceAdminMutationRateLimit(args.actor, 'disable_user', args.options)
  if (args.targetUserId === args.actor.id) throw new Error('You cannot disable your own account')
  const targetRows = await args.db.select<Array<{ id: string; role: InstanceRole; disabled_at: string | null }>>(
    `SELECT id, role, disabled_at FROM users WHERE id = $1 LIMIT 1`,
    [args.targetUserId]
  )
  const target = targetRows[0]
  if (!target) throw new Error('User not found')
  if (target.disabled_at) return
  if (target.role === 'admin') {
    const activeAdmins = await countActiveAdmins(args.db)
    if (activeAdmins <= 1) throw new Error('Cannot disable the final active admin')
  }
  const ts = nowIso()
  await args.db.executeBatch([
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE users
            SET disabled_at = $1, updated_at = $1
            WHERE id = $2`,
      bindValues: [ts, args.targetUserId],
    },
    {
      sql: `UPDATE sessions
            SET revoked_at = $1
            WHERE user_id = $2
              AND revoked_at IS NULL`,
      bindValues: [ts, args.targetUserId],
    },
    { sql: 'COMMIT', bindValues: [] },
  ])
  await appendAuditLog(args.db, {
    actorUserId: args.actor.id,
    targetUserId: args.targetUserId,
    action: 'admin.user_disabled',
    metadata: { targetRole: target.role },
    ipAddress: args.options?.sourceIp ?? null,
    userAgent: args.options?.userAgent ?? null,
  })
}

export async function enableUserAsAdmin(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  targetUserId: string
  options?: AdminMutationOptions
}): Promise<void> {
  await assertActorIsActiveInstanceAdmin(args.db, args.actor, 'enable_user', args.options)
  enforceAdminMutationRateLimit(args.actor, 'enable_user', args.options)
  const ts = nowIso()
  await args.db.execute(
    `UPDATE users
     SET disabled_at = NULL, updated_at = $1
     WHERE id = $2`,
    [ts, args.targetUserId]
  )
  await appendAuditLog(args.db, {
    actorUserId: args.actor.id,
    targetUserId: args.targetUserId,
    action: 'admin.user_enabled',
    metadata: {},
    ipAddress: args.options?.sourceIp ?? null,
    userAgent: args.options?.userAgent ?? null,
  })
}

export async function resetUserPasswordAsAdmin(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  targetUserId: string
  newPassword: string
  options?: AdminMutationOptions
}): Promise<void> {
  await assertActorIsActiveInstanceAdmin(args.db, args.actor, 'reset_password', args.options)
  enforceAdminMutationRateLimit(args.actor, 'reset_password', args.options)
  if (!args.newPassword) throw new Error('Password is required')
  if (args.newPassword.length < 8) throw new Error('Password must be at least 8 characters')
  const targetRows = await args.db.select<Array<{ id: string; disabled_at: string | null }>>(
    `SELECT id, disabled_at FROM users WHERE id = $1 LIMIT 1`,
    [args.targetUserId]
  )
  const target = targetRows[0]
  if (!target) throw new Error('User not found')
  if (target.disabled_at) throw new Error('Cannot reset password for disabled user')
  const { hashPassword } = await getPasswordHashHelpers()
  const passwordHash = await hashPassword(args.newPassword)
  const ts = nowIso()
  await args.db.executeBatch([
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE users
            SET password_hash = $1, updated_at = $2
            WHERE id = $3`,
      bindValues: [passwordHash, ts, args.targetUserId],
    },
    {
      sql: `UPDATE sessions
            SET revoked_at = $1
            WHERE user_id = $2
              AND revoked_at IS NULL`,
      bindValues: [ts, args.targetUserId],
    },
    { sql: 'COMMIT', bindValues: [] },
  ])
  await appendAuditLog(args.db, {
    actorUserId: args.actor.id,
    targetUserId: args.targetUserId,
    action: 'admin.user_password_reset',
    metadata: { sessionsRevoked: true },
    ipAddress: args.options?.sourceIp ?? null,
    userAgent: args.options?.userAgent ?? null,
  })
}

export async function updateUserRoleAsAdmin(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  targetUserId: string
  role: InstanceRole
  options?: AdminMutationOptions
}): Promise<void> {
  await assertActorIsActiveInstanceAdmin(args.db, args.actor, 'update_role', args.options)
  enforceAdminMutationRateLimit(args.actor, 'update_role', args.options)
  if (args.role !== 'user' && args.role !== 'admin') throw new Error('Invalid role')

  const targetRows = await args.db.select<Array<{ id: string; role: InstanceRole; disabled_at: string | null }>>(
    `SELECT id, role, disabled_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [args.targetUserId]
  )
  const target = targetRows[0]
  if (!target) throw new Error('User not found')
  if (target.role === args.role) return
  if (args.targetUserId === args.actor.id && args.role !== 'admin') {
    throw new Error('You cannot demote your own account')
  }
  if (target.role === 'admin' && target.disabled_at == null && args.role === 'user') {
    const activeAdmins = await countActiveAdmins(args.db)
    if (activeAdmins <= 1) throw new Error('Cannot demote the final active admin')
  }
  const ts = nowIso()
  await args.db.executeBatch([
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE users
            SET role = $1, updated_at = $2
            WHERE id = $3`,
      bindValues: [args.role, ts, args.targetUserId],
    },
    {
      sql: `UPDATE sessions
            SET revoked_at = $1
            WHERE user_id = $2
              AND revoked_at IS NULL`,
      bindValues: [ts, args.targetUserId],
    },
    { sql: 'COMMIT', bindValues: [] },
  ])
  await appendAuditLog(args.db, {
    actorUserId: args.actor.id,
    targetUserId: args.targetUserId,
    action: 'admin.user_role_changed',
    metadata: { beforeRole: target.role, afterRole: args.role, sessionsRevoked: true },
    ipAddress: args.options?.sourceIp ?? null,
    userAgent: args.options?.userAgent ?? null,
  })
}

export type ProductionBriefForAdmin = {
  id: string
  name: string
  archived_at: string | null
}

export async function listProductionsBriefAsAdmin(
  db: DatabaseAdapter,
  actor: AuthenticatedUser
): Promise<ProductionBriefForAdmin[]> {
  await assertActorIsActiveInstanceAdmin(db, actor, 'list_productions_brief')
  return db.select<ProductionBriefForAdmin[]>(
    `SELECT id, name, archived_at
     FROM productions
     WHERE deleted_at IS NULL
     ORDER BY archived_at IS NOT NULL, name`,
    []
  )
}

export async function listUserProjectVisibilityAsAdmin(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  targetUserId: string
): Promise<UserProjectVisibilityRow[]> {
  await assertActorIsActiveInstanceAdmin(db, actor, 'list_user_project_visibility')
  const exists = await db.select<Array<{ id: string }>>(
    `SELECT id FROM users WHERE id = $1 LIMIT 1`,
    [targetUserId]
  )
  if (!exists[0]) throw new Error('User not found')
  return listActiveProjectMembershipsForUser(db, targetUserId)
}

export async function grantUserProjectAccessAsAdmin(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  targetUserId: string
  productionId: string
  accessLevel: ProjectAccessLevel
  options?: AdminMutationOptions
}): Promise<ProjectMembership> {
  await assertActorIsActiveInstanceAdmin(args.db, args.actor, 'grant_project_access', args.options)
  enforceAdminMutationRateLimit(args.actor, 'grant_project_access', args.options)
  const membership = await addUserToProject({
    db: args.db,
    productionId: args.productionId,
    targetUserId: args.targetUserId,
    accessLevel: args.accessLevel,
    nowIso: nowIso(),
    membershipId: crypto.randomUUID(),
  })
  await appendAuditLog(args.db, {
    actorUserId: args.actor.id,
    targetUserId: args.targetUserId,
    projectId: args.productionId,
    action: 'admin.user_project_access_granted',
    metadata: { accessLevel: args.accessLevel },
    ipAddress: args.options?.sourceIp ?? null,
    userAgent: args.options?.userAgent ?? null,
  })
  return membership
}

export async function updateUserProjectAccessAsAdmin(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  targetUserId: string
  productionId: string
  accessLevel: ProjectAccessLevel
  options?: AdminMutationOptions
}): Promise<ProjectMembership> {
  await assertActorIsActiveInstanceAdmin(args.db, args.actor, 'update_project_access', args.options)
  enforceAdminMutationRateLimit(args.actor, 'update_project_access', args.options)
  const membership = await updateUserProjectAccessLevel({
    db: args.db,
    productionId: args.productionId,
    targetUserId: args.targetUserId,
    accessLevel: args.accessLevel,
    nowIso: nowIso(),
  })
  await appendAuditLog(args.db, {
    actorUserId: args.actor.id,
    targetUserId: args.targetUserId,
    projectId: args.productionId,
    action: 'admin.user_project_access_updated',
    metadata: { accessLevel: args.accessLevel },
    ipAddress: args.options?.sourceIp ?? null,
    userAgent: args.options?.userAgent ?? null,
  })
  return membership
}

export async function revokeUserProjectAccessAsAdmin(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  targetUserId: string
  productionId: string
  options?: AdminMutationOptions
}): Promise<void> {
  await assertActorIsActiveInstanceAdmin(args.db, args.actor, 'revoke_project_access', args.options)
  enforceAdminMutationRateLimit(args.actor, 'revoke_project_access', args.options)
  await revokeUserProjectMembership({
    db: args.db,
    productionId: args.productionId,
    targetUserId: args.targetUserId,
    nowIso: nowIso(),
  })
  await appendAuditLog(args.db, {
    actorUserId: args.actor.id,
    targetUserId: args.targetUserId,
    projectId: args.productionId,
    action: 'admin.user_project_access_revoked',
    metadata: {},
    ipAddress: args.options?.sourceIp ?? null,
    userAgent: args.options?.userAgent ?? null,
  })
}
