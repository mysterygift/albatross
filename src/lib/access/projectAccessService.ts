import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import type { AuthenticatedUser } from '@/lib/auth/authService'
import { canAdminProject, canEditProject, canViewProject, type ProjectAccessLevel } from '@/lib/access/projectAccess'
import { appendAuditLog } from '@/lib/security/auditLog'
import {
  DEFAULT_ACCESS_MUTATION_RATE_LIMIT,
  enforceRateLimit,
  type RateLimitRule,
} from '@/lib/security/rateLimiter'
import {
  addUserToProject,
  getActiveProjectMembership,
  listAssignableUsersForProject,
  listProjectMemberships,
  listUsersForAccessManagement,
  revokeUserProjectMembership,
  updateUserProjectAccessLevel,
} from '@/lib/db/repositories/projectMemberships'
import {
  completeAndArchiveProduction,
  duplicateProduction,
  permanentlyDeleteProduction,
} from '@/lib/db/repositories/production'
import type { Production } from '@/lib/db/types'

type ProductionRow = {
  id: string
  name: string
  slug: string | null
  notes: string | null
  currency_code: string
  is_episodic: boolean
  wrapped_at: string | null
  archived_at: string | null
  created_from_template: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function productionRowToProduction(r: ProductionRow): Production {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug ?? `prod-${r.id}`,
    currency_code: r.currency_code,
    notes: r.notes,
    is_episodic: r.is_episodic,
    wrapped_at: r.wrapped_at,
    archived_at: r.archived_at,
    created_from_template: r.created_from_template,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at,
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return crypto.randomUUID()
}

type AccessMutationOptions = {
  sourceIp?: string | null
  userAgent?: string | null
  rateLimitRule?: RateLimitRule
  rateLimitNowMs?: number
}

function enforceAccessMutationRateLimit(
  actor: AuthenticatedUser,
  operation: string,
  options?: AccessMutationOptions
): void {
  enforceRateLimit({
    scope: `project_access.${operation}`,
    key: `${options?.sourceIp ?? 'unknown'}:${actor.id}`,
    rule: options?.rateLimitRule ?? DEFAULT_ACCESS_MUTATION_RATE_LIMIT,
    nowMs: options?.rateLimitNowMs,
  })
}

async function assertActorEnabled(db: DatabaseAdapter, actor: AuthenticatedUser): Promise<'user' | 'admin'> {
  const rows = await db.select<Array<{ role: 'user' | 'admin'; disabled_at: string | null }>>(
    `SELECT role, disabled_at FROM users WHERE id = $1 LIMIT 1`,
    [actor.id]
  )
  const row = rows[0]
  if (!row) throw new Error('User not found')
  if (row.disabled_at) throw new Error('Forbidden')
  return row.role
}

type RequiredProjectAccess = ProjectAccessLevel

export class ProjectAuthorizationError extends Error {
  readonly statusCode: 401 | 403
  readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN'

  constructor(message: string, statusCode: 401 | 403, code: 'UNAUTHENTICATED' | 'FORBIDDEN') {
    super(message)
    this.name = 'ProjectAuthorizationError'
    this.statusCode = statusCode
    this.code = code
  }
}

async function resolveActorProjectAccess(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<{ isInstanceAdmin: boolean; level: 'viewer' | 'editor' | 'administrator' | null }> {
  const role = await assertActorEnabled(db, actor)
  const membership = await getActiveProjectMembership(db, productionId, actor.id)
  return {
    isInstanceAdmin: role === 'admin',
    level: membership?.access_level ?? null,
  }
}

function ensureAuthenticated(actor: AuthenticatedUser | null | undefined): AuthenticatedUser {
  if (!actor) throw new ProjectAuthorizationError('Unauthenticated', 401, 'UNAUTHENTICATED')
  return actor
}

function hasRequiredProjectAccess(
  required: RequiredProjectAccess,
  level: 'viewer' | 'editor' | 'administrator' | null,
  isInstanceAdmin: boolean
): boolean {
  if (required === 'viewer') return canViewProject(level, isInstanceAdmin)
  if (required === 'editor') return canEditProject(level, isInstanceAdmin)
  return canAdminProject(level, isInstanceAdmin)
}

export async function requireProjectAccess(
  db: DatabaseAdapter,
  actor: AuthenticatedUser | null | undefined,
  productionId: string,
  level: RequiredProjectAccess
): Promise<void> {
  const authenticatedActor = ensureAuthenticated(actor)
  const access = await resolveActorProjectAccess(db, authenticatedActor, productionId)
  if (!hasRequiredProjectAccess(level, access.level, access.isInstanceAdmin)) {
    throw new ProjectAuthorizationError('Forbidden', 403, 'FORBIDDEN')
  }
}

export async function requireProjectViewAccess(
  db: DatabaseAdapter,
  actor: AuthenticatedUser | null | undefined,
  productionId: string
): Promise<void> {
  await requireProjectAccess(db, actor, productionId, 'viewer')
}

export async function requireProjectEditAccess(
  db: DatabaseAdapter,
  actor: AuthenticatedUser | null | undefined,
  productionId: string
): Promise<void> {
  await requireProjectAccess(db, actor, productionId, 'editor')
}

export async function requireProjectAdminAccess(
  db: DatabaseAdapter,
  actor: AuthenticatedUser | null | undefined,
  productionId: string
): Promise<void> {
  await requireProjectAccess(db, actor, productionId, 'administrator')
}

async function getProductionByIdRow(db: DatabaseAdapter, productionId: string): Promise<ProductionRow | null> {
  const rows = await db.select<ProductionRow[]>(
    `SELECT *
     FROM productions
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [productionId]
  )
  return rows[0] ?? null
}

export async function listVisibleProjectsForActor(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  options?: { includeArchived?: boolean }
): Promise<Production[]> {
  const role = await assertActorEnabled(db, actor)
  const includeArchived = options?.includeArchived === true
  if (role === 'admin') {
    const where = includeArchived
      ? 'deleted_at IS NULL'
      : 'deleted_at IS NULL AND archived_at IS NULL'
    const rows = await db.select<ProductionRow[]>(
      `SELECT * FROM productions WHERE ${where} ORDER BY archived_at IS NOT NULL, name`,
      [],
    )
    return rows.map(productionRowToProduction)
  }
  const where = includeArchived
    ? 'p.deleted_at IS NULL'
    : 'p.deleted_at IS NULL AND p.archived_at IS NULL'
  const rows = await db.select<ProductionRow[]>(
    `SELECT p.*
     FROM productions p
     INNER JOIN project_memberships pm
       ON pm.production_id = p.id
      AND pm.user_id = $1
      AND pm.revoked_at IS NULL
     WHERE ${where}
     ORDER BY p.archived_at IS NOT NULL, p.name`,
    [actor.id],
  )
  return rows.map(productionRowToProduction)
}

export async function getProjectForActor(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<Production | null> {
  const project = await getProductionByIdRow(db, productionId)
  if (!project) return null
  try {
    await requireProjectViewAccess(db, actor, productionId)
  } catch {
    return null
  }
  return productionRowToProduction(project)
}

export async function assertCanEditProject(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<void> {
  await requireProjectEditAccess(db, actor, productionId)
}

export async function assertCanAdminProject(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<void> {
  await requireProjectAdminAccess(db, actor, productionId)
}

export async function canManageProjectAccessForActor(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<boolean> {
  try {
    await requireProjectAdminAccess(db, actor, productionId)
    return true
  } catch {
    return false
  }
}

export async function updateProjectMetadataForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  name: string
  notes: string | null
}): Promise<void> {
  await assertCanEditProject(args.db, args.actor, args.productionId)
  await args.db.execute(
    `UPDATE productions
     SET name = $1, notes = $2, updated_at = $3
     WHERE id = $4
       AND deleted_at IS NULL`,
    [args.name, args.notes, nowIso(), args.productionId]
  )
}

export async function archiveProjectForActor(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<void> {
  await assertCanAdminProject(db, actor, productionId)
  const ts = nowIso()
  await db.execute(
    `UPDATE productions
     SET archived_at = $1, updated_at = $1
     WHERE id = $2
       AND deleted_at IS NULL`,
    [ts, productionId]
  )
}

export async function unarchiveProjectForActor(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<void> {
  await requireProjectAdminAccess(db, actor, productionId)
  const ts = nowIso()
  await db.execute(
    `UPDATE productions
     SET archived_at = NULL, updated_at = $1
     WHERE id = $2
       AND deleted_at IS NULL`,
    [ts, productionId]
  )
}

export async function wrapProjectForActor(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<void> {
  await assertCanAdminProject(db, actor, productionId)
  const ts = nowIso()
  await db.execute(
    `UPDATE productions
     SET wrapped_at = $1, archived_at = $1, updated_at = $1
     WHERE id = $2
       AND deleted_at IS NULL`,
    [ts, productionId]
  )
}

export async function softDeleteProjectForActor(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<void> {
  await assertCanAdminProject(db, actor, productionId)
  const ts = nowIso()
  await db.execute(
    `UPDATE productions
     SET deleted_at = $1, updated_at = $1
     WHERE id = $2`,
    [ts, productionId]
  )
}

export async function getActorProductionActionCaps(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<{ canView: boolean; canEdit: boolean; canAdmin: boolean }> {
  const access = await resolveActorProjectAccess(db, actor, productionId)
  return {
    canView: canViewProject(access.level, access.isInstanceAdmin),
    canEdit: canEditProject(access.level, access.isInstanceAdmin),
    canAdmin: canAdminProject(access.level, access.isInstanceAdmin),
  }
}

export async function duplicateProductionForActor(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  sourceProductionId: string,
  newName: string
): Promise<{ id: string; name: string; slug: string }> {
  await requireProjectEditAccess(db, actor, sourceProductionId)
  return duplicateProduction(sourceProductionId, newName)
}

export async function permanentlyDeleteProductionForActor(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<void> {
  await assertCanAdminProject(db, actor, productionId)
  await permanentlyDeleteProduction(productionId)
}

export async function completeAndArchiveProductionForActor(
  db: DatabaseAdapter,
  actor: AuthenticatedUser,
  productionId: string
): Promise<void> {
  await assertCanAdminProject(db, actor, productionId)
  await completeAndArchiveProduction(productionId)
}

export async function createProjectForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  name: string
  notes: string | null
  slug: string
  currencyCode?: string
  isEpisodic?: boolean
}): Promise<{ id: string; slug: string }> {
  await assertActorEnabled(args.db, args.actor)
  const productionId = newId()
  const membershipId = newId()
  const ts = nowIso()
  await args.db.executeBatch([
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `INSERT INTO productions
            (id, name, slug, notes, currency_code, is_episodic, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      bindValues: [
        productionId,
        args.name,
        args.slug,
        args.notes,
        args.currencyCode ?? 'GBP',
        args.isEpisodic === true,
        ts,
      ],
    },
    {
      sql: `INSERT INTO project_memberships
            (id, production_id, user_id, access_level, created_at, updated_at)
            VALUES ($1, $2, $3, 'administrator', $4, $4)`,
      bindValues: [membershipId, productionId, args.actor.id, ts],
    },
    { sql: 'COMMIT', bindValues: [] },
  ])
  return { id: productionId, slug: args.slug }
}

export async function listProjectMembersForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectAdminAccess(args.db, args.actor, args.productionId)
  return listProjectMemberships(args.db, args.productionId)
}

export async function listAssignableUsersForProjectForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
}) {
  await requireProjectAdminAccess(args.db, args.actor, args.productionId)
  return listAssignableUsersForProject(args.db, args.productionId)
}

export async function addProjectMemberForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  targetUserId: string
  accessLevel: 'viewer' | 'editor' | 'administrator'
  options?: AccessMutationOptions
}) {
  await requireProjectAdminAccess(args.db, args.actor, args.productionId)
  enforceAccessMutationRateLimit(args.actor, 'add_member', args.options)
  return addUserToProject({
    db: args.db,
    productionId: args.productionId,
    targetUserId: args.targetUserId,
    accessLevel: args.accessLevel,
    nowIso: nowIso(),
    membershipId: newId(),
  })
    .then(async (membership) => {
      await appendAuditLog(args.db, {
        actorUserId: args.actor.id,
        targetUserId: args.targetUserId,
        projectId: args.productionId,
        action: 'project_access.member_added',
        metadata: { accessLevel: args.accessLevel },
        ipAddress: args.options?.sourceIp ?? null,
        userAgent: args.options?.userAgent ?? null,
      })
      return membership
    })
}

export async function updateProjectMemberAccessForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  targetUserId: string
  accessLevel: 'viewer' | 'editor' | 'administrator'
  options?: AccessMutationOptions
}) {
  await requireProjectAdminAccess(args.db, args.actor, args.productionId)
  enforceAccessMutationRateLimit(args.actor, 'update_member_access', args.options)
  const before = await getActiveProjectMembership(args.db, args.productionId, args.targetUserId)
  return updateUserProjectAccessLevel({
    db: args.db,
    productionId: args.productionId,
    targetUserId: args.targetUserId,
    accessLevel: args.accessLevel,
    nowIso: nowIso(),
  })
    .then(async (membership) => {
      await appendAuditLog(args.db, {
        actorUserId: args.actor.id,
        targetUserId: args.targetUserId,
        projectId: args.productionId,
        action: 'project_access.member_access_changed',
        metadata: {
          beforeAccessLevel: before?.access_level ?? null,
          afterAccessLevel: membership.access_level,
        },
        ipAddress: args.options?.sourceIp ?? null,
        userAgent: args.options?.userAgent ?? null,
      })
      return membership
    })
}

export async function removeProjectMemberForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  targetUserId: string
  options?: AccessMutationOptions
}) {
  await requireProjectAdminAccess(args.db, args.actor, args.productionId)
  enforceAccessMutationRateLimit(args.actor, 'remove_member', args.options)
  const before = await getActiveProjectMembership(args.db, args.productionId, args.targetUserId)
  return revokeUserProjectMembership({
    db: args.db,
    productionId: args.productionId,
    targetUserId: args.targetUserId,
    nowIso: nowIso(),
  })
    .then(async () => {
      await appendAuditLog(args.db, {
        actorUserId: args.actor.id,
        targetUserId: args.targetUserId,
        projectId: args.productionId,
        action: 'project_access.member_revoked',
        metadata: { previousAccessLevel: before?.access_level ?? null },
        ipAddress: args.options?.sourceIp ?? null,
        userAgent: args.options?.userAgent ?? null,
      })
    })
}

export async function listUsersForActorAccessManagement(db: DatabaseAdapter, actor: AuthenticatedUser) {
  const role = await assertActorEnabled(db, actor)
  if (role !== 'admin') throw new ProjectAuthorizationError('Forbidden', 403, 'FORBIDDEN')
  return listUsersForAccessManagement(db)
}
