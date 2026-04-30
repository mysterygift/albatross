import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client, Pool } from 'pg'

import { PostgresDatabaseAdapter } from '@/lib/db/postgresDatabaseAdapter'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import type { AuthenticatedUser } from '@/lib/auth/authService'
import {
  addProjectMemberForActor,
  archiveProjectForActor,
  canManageProjectAccessForActor,
  createProjectForActor,
  duplicateProductionForActor,
  getProjectForActor,
  listAssignableUsersForProjectForActor,
  listProjectMembersForActor,
  listUsersForActorAccessManagement,
  listVisibleProjectsForActor,
  permanentlyDeleteProductionForActor,
  removeProjectMemberForActor,
  requireProjectAccess,
  requireProjectAdminAccess,
  requireProjectEditAccess,
  requireProjectViewAccess,
  updateProjectMemberAccessForActor,
  updateProjectMetadataForActor,
  wrapProjectForActor,
} from '@/lib/access/projectAccessService'
import { deterministicSchemaName } from '@/test/postgres/schemaAudit'
import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'
import { RATE_LIMIT_ERROR_MESSAGE, resetRateLimiterForTests } from '@/lib/security/rateLimiter'

type Harness = {
  db: DatabaseAdapter
  close: () => Promise<void>
}

describe('postgres project memberships and access control (UAM2)', () => {
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

  async function withHarness(prefix: string, fn: (ctx: Harness) => Promise<void>): Promise<void> {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL UAM2 assertions: ${connectionError}`)
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
    role: 'user' | 'admin' = 'user'
  ): Promise<AuthenticatedUser> {
    const rows = await db.select<Array<{ id: string; username: string; role: 'user' | 'admin' }>>(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role`,
      [username, '$argon2id$v=19$m=4096,t=3,p=1$abc$def', role]
    )
    return rows[0]!
  }

  async function seedProject(db: DatabaseAdapter, name: string, slug: string): Promise<string> {
    const rows = await db.select<Array<{ id: string }>>(
      `INSERT INTO productions
       (name, slug, notes, currency_code, is_episodic, created_at, updated_at)
       VALUES ($1, $2, NULL, 'GBP', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [name, slug]
    )
    return rows[0]!.id
  }

  afterEach(() => {
    // no global adapter state
  })

  it('schema enforces access levels, uniqueness and foreign keys', async () => {
    await withHarness('pg_uam2_schema', async ({ db }) => {
      const admin = await seedUser(db, 'schema-admin', 'admin')
      const user = await seedUser(db, 'schema-user')
      const productionId = await seedProject(db, 'Schema Project', 'schema-project')

      await addProjectMemberForActor({
        db,
        actor: admin,
        productionId,
        targetUserId: admin.id,
        accessLevel: 'administrator',
      })
      await addProjectMemberForActor({
        db,
        actor: admin,
        productionId,
        targetUserId: user.id,
        accessLevel: 'viewer',
      })

      await expect(
        db.execute(
          `INSERT INTO project_memberships (production_id, user_id, access_level)
           VALUES ($1, $2, $3)`,
          [productionId, user.id, 'owner']
        )
      ).rejects.toThrow()
      await expect(
        db.execute(
          `INSERT INTO project_memberships (production_id, user_id, access_level)
           VALUES ($1, $2, $3)`,
          [productionId, user.id, 'viewer']
        )
      ).rejects.toThrow()
      await expect(
        db.execute(
          `INSERT INTO project_memberships (production_id, user_id, access_level)
           VALUES ($1, $2, $3)`,
          [crypto.randomUUID(), user.id, 'viewer']
        )
      ).rejects.toThrow()
    })
  })

  it('filters project visibility by active membership and allows instance-admin global visibility', async () => {
    await withHarness('pg_uam2_visibility', async ({ db }) => {
      const instanceAdmin = await seedUser(db, 'instance-admin', 'admin')
      const viewer = await seedUser(db, 'viewer-user')
      const outsider = await seedUser(db, 'outsider-user')
      const p1 = await seedProject(db, 'Visible One', 'visible-one')
      const p2 = await seedProject(db, 'Visible Two', 'visible-two')

      await addProjectMemberForActor({
        db,
        actor: instanceAdmin,
        productionId: p1,
        targetUserId: instanceAdmin.id,
        accessLevel: 'administrator',
      })
      await addProjectMemberForActor({
        db,
        actor: instanceAdmin,
        productionId: p1,
        targetUserId: viewer.id,
        accessLevel: 'viewer',
      })

      const viewerProjects = await listVisibleProjectsForActor(db, viewer)
      expect(viewerProjects.map((p) => p.id)).toEqual([p1])

      const outsiderProjects = await listVisibleProjectsForActor(db, outsider)
      expect(outsiderProjects).toHaveLength(0)

      const adminProjects = await listVisibleProjectsForActor(db, instanceAdmin)
      expect(new Set(adminProjects.map((p) => p.id))).toEqual(new Set([p1, p2]))
    })
  })

  it('enforces read access: viewer can read, non-member cannot', async () => {
    await withHarness('pg_uam2_read', async ({ db }) => {
      const admin = await seedUser(db, 'read-admin', 'admin')
      const viewer = await seedUser(db, 'read-viewer')
      const outsider = await seedUser(db, 'read-outsider')
      const productionId = await seedProject(db, 'Read Project', 'read-project')

      await addProjectMemberForActor({
        db,
        actor: admin,
        productionId,
        targetUserId: admin.id,
        accessLevel: 'administrator',
      })
      await addProjectMemberForActor({
        db,
        actor: admin,
        productionId,
        targetUserId: viewer.id,
        accessLevel: 'viewer',
      })

      await expect(getProjectForActor(db, viewer, productionId)).resolves.toBeTruthy()
      await expect(getProjectForActor(db, outsider, productionId)).resolves.toBeNull()
    })
  })

  it('enforces write/admin access levels for project mutations', async () => {
    await withHarness('pg_uam2_write', async ({ db }) => {
      const instanceAdmin = await seedUser(db, 'write-instance-admin', 'admin')
      const projectAdmin = await seedUser(db, 'write-project-admin')
      const editor = await seedUser(db, 'write-editor')
      const viewer = await seedUser(db, 'write-viewer')
      const outsider = await seedUser(db, 'write-outsider')
      const productionId = await seedProject(db, 'Write Project', 'write-project')

      await addProjectMemberForActor({
        db,
        actor: instanceAdmin,
        productionId,
        targetUserId: projectAdmin.id,
        accessLevel: 'administrator',
      })
      await addProjectMemberForActor({
        db,
        actor: projectAdmin,
        productionId,
        targetUserId: editor.id,
        accessLevel: 'editor',
      })
      await addProjectMemberForActor({
        db,
        actor: projectAdmin,
        productionId,
        targetUserId: viewer.id,
        accessLevel: 'viewer',
      })

      await expect(
        updateProjectMetadataForActor({
          db,
          actor: viewer,
          productionId,
          name: 'Nope',
          notes: null,
        })
      ).rejects.toThrow('Forbidden')

      await expect(
        updateProjectMetadataForActor({
          db,
          actor: outsider,
          productionId,
          name: 'Nope',
          notes: null,
        })
      ).rejects.toThrow('Forbidden')

      await expect(
        updateProjectMetadataForActor({
          db,
          actor: editor,
          productionId,
          name: 'Editor Updated Name',
          notes: 'ok',
        })
      ).resolves.toBeUndefined()

      await expect(archiveProjectForActor(db, editor, productionId)).rejects.toThrow('Forbidden')
      await expect(archiveProjectForActor(db, projectAdmin, productionId)).resolves.toBeUndefined()
      await expect(wrapProjectForActor(db, instanceAdmin, productionId)).resolves.toBeUndefined()

      await expect(duplicateProductionForActor(db, viewer, productionId, 'Viewer copy')).rejects.toThrow('Forbidden')
      await expect(permanentlyDeleteProductionForActor(db, editor, productionId)).rejects.toThrow('Forbidden')
    })
  })

  it('enforces access management permissions and blocks final administrator removal', async () => {
    await withHarness('pg_uam2_manage', async ({ db }) => {
      const instanceAdmin = await seedUser(db, 'manage-instance-admin', 'admin')
      const projectAdmin = await seedUser(db, 'manage-project-admin')
      const editor = await seedUser(db, 'manage-editor')
      const viewer = await seedUser(db, 'manage-viewer')
      const target = await seedUser(db, 'manage-target')
      const productionId = await seedProject(db, 'Manage Project', 'manage-project')

      await addProjectMemberForActor({
        db,
        actor: instanceAdmin,
        productionId,
        targetUserId: projectAdmin.id,
        accessLevel: 'administrator',
      })
      await addProjectMemberForActor({
        db,
        actor: projectAdmin,
        productionId,
        targetUserId: editor.id,
        accessLevel: 'editor',
      })
      await addProjectMemberForActor({
        db,
        actor: projectAdmin,
        productionId,
        targetUserId: viewer.id,
        accessLevel: 'viewer',
      })

      await expect(
        addProjectMemberForActor({
          db,
          actor: editor,
          productionId,
          targetUserId: target.id,
          accessLevel: 'viewer',
        })
      ).rejects.toThrow('Forbidden')

      await expect(
        addProjectMemberForActor({
          db,
          actor: viewer,
          productionId,
          targetUserId: target.id,
          accessLevel: 'viewer',
        })
      ).rejects.toThrow('Forbidden')

      await expect(
        addProjectMemberForActor({
          db,
          actor: target,
          productionId,
          targetUserId: target.id,
          accessLevel: 'administrator',
        })
      ).rejects.toThrow('Forbidden')

      await expect(
        addProjectMemberForActor({
          db,
          actor: projectAdmin,
          productionId,
          targetUserId: target.id,
          accessLevel: 'viewer',
        })
      ).resolves.toBeTruthy()

      await expect(
        updateProjectMemberAccessForActor({
          db,
          actor: projectAdmin,
          productionId,
          targetUserId: target.id,
          accessLevel: 'editor',
        })
      ).resolves.toBeTruthy()

      await expect(
        removeProjectMemberForActor({
          db,
          actor: projectAdmin,
          productionId,
          targetUserId: projectAdmin.id,
        })
      ).rejects.toThrow('Cannot remove the final project administrator')

      await expect(
        addProjectMemberForActor({
          db,
          actor: instanceAdmin,
          productionId,
          targetUserId: instanceAdmin.id,
          accessLevel: 'administrator',
        })
      ).resolves.toBeTruthy()

      await expect(
        removeProjectMemberForActor({
          db,
          actor: projectAdmin,
          productionId,
          targetUserId: projectAdmin.id,
        })
      ).resolves.toBeUndefined()

      const members = await listProjectMembersForActor({
        db,
        actor: instanceAdmin,
        productionId,
      })
      expect(members.some((m) => m.user_id === projectAdmin.id && m.revoked_at == null)).toBe(false)

      const auditRows = await db.select<Array<{ action: string; metadata_json: unknown }>>(
        `SELECT action, metadata_json
         FROM audit_logs
         WHERE project_id = $1
         ORDER BY created_at`,
        [productionId]
      )
      expect(auditRows.some((row) => row.action === 'project_access.member_added')).toBe(true)
      expect(auditRows.some((row) => row.action === 'project_access.member_access_changed')).toBe(true)
      expect(auditRows.some((row) => row.action === 'project_access.member_revoked')).toBe(true)

      const serialized = JSON.stringify(auditRows.map((row) => row.metadata_json)).toLowerCase()
      expect(serialized).not.toContain('password')
      expect(serialized).not.toContain('hash')
      expect(serialized).not.toContain('token')
    })
  })

  it('allows project administrators to list members and assignable users, but blocks editor/viewer/non-member', async () => {
    await withHarness('pg_uam2_manage_read', async ({ db }) => {
      const instanceAdmin = await seedUser(db, 'manage-read-instance-admin', 'admin')
      const projectAdmin = await seedUser(db, 'manage-read-project-admin')
      const editor = await seedUser(db, 'manage-read-editor')
      const viewer = await seedUser(db, 'manage-read-viewer')
      const outsider = await seedUser(db, 'manage-read-outsider')
      const productionId = await seedProject(db, 'Manage Read Project', 'manage-read-project')
      await addProjectMemberForActor({
        db,
        actor: instanceAdmin,
        productionId,
        targetUserId: projectAdmin.id,
        accessLevel: 'administrator',
      })
      await addProjectMemberForActor({
        db,
        actor: projectAdmin,
        productionId,
        targetUserId: editor.id,
        accessLevel: 'editor',
      })
      await addProjectMemberForActor({
        db,
        actor: projectAdmin,
        productionId,
        targetUserId: viewer.id,
        accessLevel: 'viewer',
      })

      await expect(canManageProjectAccessForActor(db, projectAdmin, productionId)).resolves.toBe(true)
      await expect(canManageProjectAccessForActor(db, editor, productionId)).resolves.toBe(false)
      await expect(canManageProjectAccessForActor(db, viewer, productionId)).resolves.toBe(false)
      await expect(canManageProjectAccessForActor(db, outsider, productionId)).resolves.toBe(false)

      await expect(
        listProjectMembersForActor({
          db,
          actor: projectAdmin,
          productionId,
        })
      ).resolves.toHaveLength(3)
      await expect(
        listProjectMembersForActor({
          db,
          actor: editor,
          productionId,
        })
      ).rejects.toThrow('Forbidden')
      await expect(
        listProjectMembersForActor({
          db,
          actor: viewer,
          productionId,
        })
      ).rejects.toThrow('Forbidden')
      await expect(
        listProjectMembersForActor({
          db,
          actor: outsider,
          productionId,
        })
      ).rejects.toThrow('Forbidden')

      await expect(
        listAssignableUsersForProjectForActor({
          db,
          actor: projectAdmin,
          productionId,
        })
      ).resolves.toSatisfy((rows: unknown) => Array.isArray(rows))
      await expect(
        listAssignableUsersForProjectForActor({
          db,
          actor: editor,
          productionId,
        })
      ).rejects.toThrow('Forbidden')
    })
  })

  it('rejects duplicate membership add and invalid access levels', async () => {
    await withHarness('pg_uam2_invalid_duplicate', async ({ db }) => {
      const admin = await seedUser(db, 'invalid-dup-admin', 'admin')
      const user = await seedUser(db, 'invalid-dup-user')
      const productionId = await seedProject(db, 'Invalid Duplicate Project', 'invalid-duplicate-project')

      await addProjectMemberForActor({
        db,
        actor: admin,
        productionId,
        targetUserId: user.id,
        accessLevel: 'viewer',
      })

      await expect(
        addProjectMemberForActor({
          db,
          actor: admin,
          productionId,
          targetUserId: user.id,
          accessLevel: 'editor',
        })
      ).rejects.toThrow('Membership already exists')

      await expect(
        updateProjectMemberAccessForActor({
          db,
          actor: admin,
          productionId,
          targetUserId: user.id,
          accessLevel: 'owner' as never,
        })
      ).rejects.toThrow('Invalid access level')
    })
  })

  it('lists users for access management only to instance admins', async () => {
    await withHarness('pg_uam2_list_users', async ({ db }) => {
      const instanceAdmin = await seedUser(db, 'list-admin', 'admin')
      const normal = await seedUser(db, 'list-user')
      await expect(listUsersForActorAccessManagement(db, instanceAdmin)).resolves.toSatisfy((rows: unknown) =>
        Array.isArray(rows)
      )
      await expect(listUsersForActorAccessManagement(db, normal)).rejects.toThrow('Forbidden')
    })
  })

  it('assigns creator as project administrator atomically and project is immediately visible', async () => {
    await withHarness('pg_uam2_creator_admin', async ({ db }) => {
      const creator = await seedUser(db, 'creator-user')
      const created = await createProjectForActor({
        db,
        actor: creator,
        name: 'Created By Actor',
        slug: 'created-by-actor',
        notes: null,
      })
      const visible = await listVisibleProjectsForActor(db, creator)
      expect(visible.some((p) => p.id === created.id)).toBe(true)
      const members = await listProjectMembersForActor({
        db,
        actor: creator,
        productionId: created.id,
      })
      expect(
        members.some((m) => m.user_id === creator.id && m.access_level === 'administrator' && m.revoked_at == null)
      ).toBe(true)
    })
  })

  it('rejects disabled users from using memberships for visibility/access', async () => {
    await withHarness('pg_uam2_disabled', async ({ db }) => {
      const admin = await seedUser(db, 'disabled-admin', 'admin')
      const member = await seedUser(db, 'disabled-member')
      const productionId = await seedProject(db, 'Disabled Guard Project', 'disabled-guard-project')
      await addProjectMemberForActor({
        db,
        actor: admin,
        productionId,
        targetUserId: member.id,
        accessLevel: 'editor',
      })
      await db.execute(`UPDATE users SET disabled_at = CURRENT_TIMESTAMP WHERE id = $1`, [member.id])

      await expect(listVisibleProjectsForActor(db, member)).rejects.toThrow('Forbidden')
      await expect(
        listProjectMembersForActor({
          db,
          actor: member,
          productionId,
        })
      ).rejects.toThrow('Forbidden')
      await expect(
        updateProjectMetadataForActor({
          db,
          actor: member,
          productionId,
          name: 'Should Fail',
          notes: null,
        })
      ).rejects.toThrow('Forbidden')
    })
  })

  it('enforces canonical requireProject*Access helpers consistently', async () => {
    await withHarness('pg_uam5_require_helpers', async ({ db }) => {
      const instanceAdmin = await seedUser(db, 'require-instance-admin', 'admin')
      const viewer = await seedUser(db, 'require-viewer')
      const editor = await seedUser(db, 'require-editor')
      const productionId = await seedProject(db, 'Require Helpers Project', 'require-helpers-project')

      await addProjectMemberForActor({
        db,
        actor: instanceAdmin,
        productionId,
        targetUserId: viewer.id,
        accessLevel: 'viewer',
      })
      await addProjectMemberForActor({
        db,
        actor: instanceAdmin,
        productionId,
        targetUserId: editor.id,
        accessLevel: 'editor',
      })

      await expect(requireProjectViewAccess(db, viewer, productionId)).resolves.toBeUndefined()
      await expect(requireProjectEditAccess(db, viewer, productionId)).rejects.toThrow('Forbidden')
      await expect(requireProjectAdminAccess(db, viewer, productionId)).rejects.toThrow('Forbidden')

      await expect(requireProjectEditAccess(db, editor, productionId)).resolves.toBeUndefined()
      await expect(requireProjectAdminAccess(db, editor, productionId)).rejects.toThrow('Forbidden')

      await expect(requireProjectAccess(db, instanceAdmin, productionId, 'administrator')).resolves.toBeUndefined()
      await expect(requireProjectViewAccess(db, null, productionId)).rejects.toThrow('Unauthenticated')
    })
  })

  it('rate limits project-access member mutation operations', async () => {
    await withHarness('pg_uam6_project_access_rate_limit', async ({ db }) => {
      const instanceAdmin = await seedUser(db, 'rate-limit-instance-admin', 'admin')
      const targetA = await seedUser(db, 'rate-limit-target-a')
      const targetB = await seedUser(db, 'rate-limit-target-b')
      const productionId = await seedProject(db, 'Rate Limit Project Access', 'rate-limit-project-access')

      await expect(
        addProjectMemberForActor({
          db,
          actor: instanceAdmin,
          productionId,
          targetUserId: targetA.id,
          accessLevel: 'viewer',
          options: {
            sourceIp: '127.0.0.1',
            rateLimitRule: { maxAttempts: 1, windowMs: 60_000 },
            rateLimitNowMs: 1,
          },
        })
      ).resolves.toBeTruthy()

      await expect(
        addProjectMemberForActor({
          db,
          actor: instanceAdmin,
          productionId,
          targetUserId: targetB.id,
          accessLevel: 'viewer',
          options: {
            sourceIp: '127.0.0.1',
            rateLimitRule: { maxAttempts: 1, windowMs: 60_000 },
            rateLimitNowMs: 2,
          },
        })
      ).rejects.toThrow(RATE_LIMIT_ERROR_MESSAGE)
    })
  })
})

async function createHarness(prefix: string): Promise<Harness> {
  const schemaName = deterministicSchemaName(prefix)
  const pool = new Pool(await resolvePostgresTestConfig())
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)
  await pool.query(`SET search_path TO ${schemaName}, public`)
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  await pool.query(`
    CREATE TABLE productions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMPTZ,
      currency_code TEXT NOT NULL DEFAULT 'GBP',
      archived_at TIMESTAMPTZ,
      wrapped_at TIMESTAMPTZ,
      created_from_template TEXT,
      is_episodic BOOLEAN NOT NULL DEFAULT FALSE
    );
  `)
  const uam1Sql = readFileSync(
    join(process.cwd(), 'postgres', 'migrations', '0003_uam1_auth_foundation.sql'),
    'utf8'
  )
  const uam2Sql = readFileSync(
    join(process.cwd(), 'postgres', 'migrations', '0004_project_memberships.sql'),
    'utf8'
  )
  const uam6AuditSql = readFileSync(
    join(process.cwd(), 'postgres', 'migrations', '0005_uam6_audit_logs.sql'),
    'utf8'
  )
  await pool.query(uam1Sql)
  await pool.query(uam2Sql)
  await pool.query(uam6AuditSql)
  return {
    db: new PostgresDatabaseAdapter(pool, schemaName),
    close: async () => {
      await pool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
      await pool.end()
    },
  }
}
