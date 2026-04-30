import type { DatabaseAdapter, SqlStatement } from '@/lib/db/databaseAdapter'
import type { AuthenticatedUser } from '@/lib/auth/authService'
import {
  isValidProjectAccessLevel,
  type ProjectAccessLevel,
} from '@/lib/access/projectAccess'

const USERS_TABLE = 'users'
const PRODUCTIONS_TABLE = 'productions'
const MEMBERSHIPS_TABLE = 'project_memberships'

type UserStateRow = {
  id: string
  username: string
  role: 'user' | 'admin'
  disabled_at: string | null
}

type MembershipRow = {
  id: string
  production_id: string
  user_id: string
  access_level: ProjectAccessLevel
  created_at: string
  updated_at: string
  revoked_at: string | null
}

export type ProjectMembership = MembershipRow

export type ProjectMemberWithUser = ProjectMembership & {
  username: string
  user_role: 'user' | 'admin'
  user_disabled_at: string | null
}

/** Active memberships for a user with production display name (admin / reporting). */
export type UserProjectVisibilityRow = {
  membership_id: string
  production_id: string
  production_name: string
  access_level: ProjectAccessLevel
  created_at: string
  updated_at: string
}

/** Active membership access levels for a user on a set of productions (UI batch). */
export async function getProjectAccessLevelsForUserOnProductions(
  db: DatabaseAdapter,
  userId: string,
  productionIds: readonly string[]
): Promise<Map<string, ProjectAccessLevel>> {
  const unique = [...new Set(productionIds.filter((id) => id !== ''))]
  const out = new Map<string, ProjectAccessLevel>()
  if (unique.length === 0) return out
  const placeholders = unique.map((_, i) => `$${i + 2}`).join(', ')
  const rows = await db.select<Array<{ production_id: string; access_level: ProjectAccessLevel }>>(
    `SELECT production_id, access_level
     FROM ${MEMBERSHIPS_TABLE}
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND production_id IN (${placeholders})`,
    [userId, ...unique]
  )
  for (const row of rows) {
    out.set(row.production_id, row.access_level)
  }
  return out
}

export async function listActiveProjectMembershipsForUser(
  db: DatabaseAdapter,
  userId: string
): Promise<UserProjectVisibilityRow[]> {
  return db.select<UserProjectVisibilityRow[]>(
    `SELECT
       pm.id AS membership_id,
       pm.production_id,
       p.name AS production_name,
       pm.access_level,
       pm.created_at,
       pm.updated_at
     FROM ${MEMBERSHIPS_TABLE} pm
     INNER JOIN ${PRODUCTIONS_TABLE} p ON p.id = pm.production_id AND p.deleted_at IS NULL
     WHERE pm.user_id = $1
       AND pm.revoked_at IS NULL
     ORDER BY p.name`,
    [userId]
  )
}

export function projectMembershipInsertStatement(args: {
  id: string
  productionId: string
  userId: string
  accessLevel: ProjectAccessLevel
  ts: string
}): SqlStatement {
  return {
    sql: `INSERT INTO ${MEMBERSHIPS_TABLE} (id, production_id, user_id, access_level, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)`,
    bindValues: [args.id, args.productionId, args.userId, args.accessLevel, args.ts, args.ts],
  }
}

async function getUserState(db: DatabaseAdapter, userId: string): Promise<UserStateRow | null> {
  const rows = await db.select<UserStateRow[]>(
    `SELECT id, username, role, disabled_at FROM ${USERS_TABLE} WHERE id = $1 LIMIT 1`,
    [userId]
  )
  return rows[0] ?? null
}

async function assertEnabledUserExists(db: DatabaseAdapter, userId: string): Promise<UserStateRow> {
  const user = await getUserState(db, userId)
  if (!user) throw new Error('User not found')
  if (user.disabled_at) throw new Error('User is disabled')
  return user
}

async function assertProductionExists(db: DatabaseAdapter, productionId: string): Promise<void> {
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT id FROM ${PRODUCTIONS_TABLE} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [productionId]
  )
  if (!rows[0]) throw new Error('Project not found')
}

export async function getActiveProjectMembership(
  db: DatabaseAdapter,
  productionId: string,
  userId: string
): Promise<ProjectMembership | null> {
  const rows = await db.select<MembershipRow[]>(
    `SELECT id, production_id, user_id, access_level, created_at, updated_at, revoked_at
     FROM ${MEMBERSHIPS_TABLE}
     WHERE production_id = $1
       AND user_id = $2
       AND revoked_at IS NULL
     LIMIT 1`,
    [productionId, userId]
  )
  return rows[0] ?? null
}

export async function listProjectMemberships(
  db: DatabaseAdapter,
  productionId: string
): Promise<ProjectMemberWithUser[]> {
  return db.select<ProjectMemberWithUser[]>(
    `SELECT
       pm.id,
       pm.production_id,
       pm.user_id,
       pm.access_level,
       pm.created_at,
       pm.updated_at,
       pm.revoked_at,
       u.username,
       u.role AS user_role,
       u.disabled_at AS user_disabled_at
     FROM ${MEMBERSHIPS_TABLE} pm
     INNER JOIN ${USERS_TABLE} u ON u.id = pm.user_id
     WHERE pm.production_id = $1
       AND pm.revoked_at IS NULL
     ORDER BY
       CASE pm.access_level
         WHEN 'administrator' THEN 1
         WHEN 'editor' THEN 2
         ELSE 3
       END,
       u.username`,
    [productionId]
  )
}

export async function listAssignableUsersForProject(
  db: DatabaseAdapter,
  productionId: string
): Promise<Array<{ id: string; username: string; role: 'user' | 'admin'; disabled_at: string | null }>> {
  await assertProductionExists(db, productionId)
  return db.select<Array<{ id: string; username: string; role: 'user' | 'admin'; disabled_at: string | null }>>(
    `SELECT u.id, u.username, u.role, u.disabled_at
     FROM ${USERS_TABLE} u
     WHERE NOT EXISTS (
       SELECT 1
       FROM ${MEMBERSHIPS_TABLE} pm
       WHERE pm.production_id = $1
         AND pm.user_id = u.id
         AND pm.revoked_at IS NULL
     )
     ORDER BY u.username`,
    [productionId]
  )
}

export async function listVisibleProductionIdsForUser(
  db: DatabaseAdapter,
  user: AuthenticatedUser,
  options?: { includeArchived?: boolean }
): Promise<string[]> {
  const state = await assertEnabledUserExists(db, user.id)
  const includeArchived = options?.includeArchived === true
  if (state.role === 'admin') {
    const where = includeArchived
      ? 'deleted_at IS NULL'
      : 'deleted_at IS NULL AND archived_at IS NULL'
    const rows = await db.select<Array<{ id: string }>>(
      `SELECT id FROM ${PRODUCTIONS_TABLE} WHERE ${where} ORDER BY name`,
      []
    )
    return rows.map((row) => row.id)
  }
  const where = includeArchived
    ? 'p.deleted_at IS NULL'
    : 'p.deleted_at IS NULL AND p.archived_at IS NULL'
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT p.id
     FROM ${PRODUCTIONS_TABLE} p
     INNER JOIN ${MEMBERSHIPS_TABLE} pm
       ON pm.production_id = p.id
      AND pm.user_id = $1
      AND pm.revoked_at IS NULL
     WHERE ${where}
     ORDER BY p.name`,
    [user.id]
  )
  return rows.map((row) => row.id)
}

async function countActiveProjectAdministrators(db: DatabaseAdapter, productionId: string): Promise<number> {
  const rows = await db.select<Array<{ count: number | string }>>(
    `SELECT COUNT(*)::int AS count
     FROM ${MEMBERSHIPS_TABLE}
     WHERE production_id = $1
       AND revoked_at IS NULL
       AND access_level = 'administrator'`,
    [productionId]
  )
  return Number(rows[0]?.count ?? 0)
}

export async function addUserToProject(args: {
  db: DatabaseAdapter
  productionId: string
  targetUserId: string
  accessLevel: ProjectAccessLevel
  nowIso: string
  membershipId: string
}): Promise<ProjectMembership> {
  if (!isValidProjectAccessLevel(args.accessLevel)) throw new Error('Invalid access level')
  await assertProductionExists(args.db, args.productionId)
  await assertEnabledUserExists(args.db, args.targetUserId)
  const existing = await getActiveProjectMembership(args.db, args.productionId, args.targetUserId)
  if (existing) throw new Error('Membership already exists')

  await args.db.executeBatch([
    { sql: 'BEGIN', bindValues: [] },
    projectMembershipInsertStatement({
      id: args.membershipId,
      productionId: args.productionId,
      userId: args.targetUserId,
      accessLevel: args.accessLevel,
      ts: args.nowIso,
    }),
    { sql: 'COMMIT', bindValues: [] },
  ])
  const membership = await getActiveProjectMembership(args.db, args.productionId, args.targetUserId)
  if (!membership) throw new Error('Membership create failed')
  return membership
}

export async function updateUserProjectAccessLevel(args: {
  db: DatabaseAdapter
  productionId: string
  targetUserId: string
  accessLevel: ProjectAccessLevel
  nowIso: string
}): Promise<ProjectMembership> {
  if (!isValidProjectAccessLevel(args.accessLevel)) throw new Error('Invalid access level')
  await assertProductionExists(args.db, args.productionId)
  await assertEnabledUserExists(args.db, args.targetUserId)

  const existing = await getActiveProjectMembership(args.db, args.productionId, args.targetUserId)
  if (!existing) throw new Error('Membership not found')
  if (existing.access_level === 'administrator' && args.accessLevel !== 'administrator') {
    const adminCount = await countActiveProjectAdministrators(args.db, args.productionId)
    if (adminCount <= 1) {
      throw new Error('Cannot remove the final project administrator')
    }
  }
  await args.db.execute(
    `UPDATE ${MEMBERSHIPS_TABLE}
     SET access_level = $1, updated_at = $2
     WHERE id = $3`,
    [args.accessLevel, args.nowIso, existing.id]
  )
  const updated = await getActiveProjectMembership(args.db, args.productionId, args.targetUserId)
  if (!updated) throw new Error('Membership update failed')
  return updated
}

export async function revokeUserProjectMembership(args: {
  db: DatabaseAdapter
  productionId: string
  targetUserId: string
  nowIso: string
}): Promise<void> {
  await assertProductionExists(args.db, args.productionId)
  const existing = await getActiveProjectMembership(args.db, args.productionId, args.targetUserId)
  if (!existing) return
  if (existing.access_level === 'administrator') {
    const adminCount = await countActiveProjectAdministrators(args.db, args.productionId)
    if (adminCount <= 1) {
      throw new Error('Cannot remove the final project administrator')
    }
  }
  await args.db.execute(
    `UPDATE ${MEMBERSHIPS_TABLE}
     SET revoked_at = $1, updated_at = $1
     WHERE id = $2`,
    [args.nowIso, existing.id]
  )
}

export async function listUsersForAccessManagement(
  db: DatabaseAdapter
): Promise<Array<{ id: string; username: string; role: 'user' | 'admin'; disabled_at: string | null }>> {
  return db.select<Array<{ id: string; username: string; role: 'user' | 'admin'; disabled_at: string | null }>>(
    `SELECT id, username, role, disabled_at
     FROM ${USERS_TABLE}
     ORDER BY username`,
    []
  )
}
