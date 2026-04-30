import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client, Pool } from 'pg'

import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'
import { setDbAdapterForTests } from '@/lib/db/client'
import type { AuthenticatedUser } from '@/lib/auth/authService'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { PostgresDatabaseAdapter } from '@/lib/db/postgresDatabaseAdapter'
import { deterministicSchemaName } from '@/test/postgres/schemaAudit'
import {
  createBookingForActor,
  createDocumentForActor,
  deleteBookingForActor,
  listBookingsByProductionForActor,
  listDocumentsByProductionForActor,
  listPeopleByProductionForActor,
  listShootDaysByProductionForActor,
} from '@/lib/access/projectDomainService'

describe('project domain service access guards', () => {
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

  async function withHarness(prefix: string, fn: (args: { actorAdmin: AuthenticatedUser; viewer: AuthenticatedUser; editor: AuthenticatedUser; outsider: AuthenticatedUser; productionId: string; personId: string }) => Promise<void>) {
    if (connectionError) {
      console.warn(`Skipping projectDomainService postgres assertions: ${connectionError}`)
      return
    }
    const harness = await createHarness(prefix)
    setDbAdapterForTests(harness.adapter)
    try {
      const db = harness.adapter
      const actorAdmin = await seedUser(db, 'domain-admin', 'admin')
      const viewer = await seedUser(db, 'domain-viewer', 'user')
      const editor = await seedUser(db, 'domain-editor', 'user')
      const outsider = await seedUser(db, 'domain-outsider', 'user')
      const productionId = await seedProduction(db, 'Domain Project', 'domain-project')
      await seedMembership(db, productionId, actorAdmin.id, 'administrator')
      await seedMembership(db, productionId, viewer.id, 'viewer')
      await seedMembership(db, productionId, editor.id, 'editor')
      const personId = await seedPerson(db, productionId, 'Crew Member')
      await seedShootDay(db, productionId, '2026-01-05')
      await fn({ actorAdmin, viewer, editor, outsider, productionId, personId })
    } finally {
      setDbAdapterForTests(null)
      await harness.close()
    }
  }

  it('viewer can read project-scoped domains but cannot mutate', async () => {
    await withHarness('pg_uam_followup_domain_viewer', async ({ viewer, productionId, personId }) => {
      const db = await import('@/lib/db/client').then((m) => m.getDb())
      await expect(
        listDocumentsByProductionForActor({
          db,
          actor: viewer,
          productionId,
        })
      ).resolves.toBeTruthy()
      await expect(
        listBookingsByProductionForActor({
          db,
          actor: viewer,
          productionId,
        })
      ).resolves.toBeTruthy()
      await expect(
        listPeopleByProductionForActor({
          db,
          actor: viewer,
          productionId,
        })
      ).resolves.toBeTruthy()
      await expect(
        listShootDaysByProductionForActor({
          db,
          actor: viewer,
          productionId,
        })
      ).resolves.toBeTruthy()

      await expect(
        createDocumentForActor({
          db,
          actor: viewer,
          productionId,
          fileName: 'viewer-blocked.txt',
          filePath: 'attachments/viewer-blocked.txt',
        })
      ).rejects.toThrow('Forbidden')

      await expect(
        createBookingForActor({
          db,
          actor: viewer,
          productionId,
          personId,
          shootDayId: null,
        })
      ).rejects.toThrow('Forbidden')
    })
  })

  it('editor can mutate and non-member cannot read', async () => {
    await withHarness('pg_uam_followup_domain_editor', async ({ editor, outsider, productionId, personId }) => {
      const db = await import('@/lib/db/client').then((m) => m.getDb())
      await expect(
        listDocumentsByProductionForActor({
          db,
          actor: outsider,
          productionId,
        })
      ).rejects.toThrow('Forbidden')

      await expect(
        createDocumentForActor({
          db,
          actor: editor,
          productionId,
          fileName: 'editor-created.txt',
          filePath: 'attachments/editor-created.txt',
        })
      ).resolves.toBeTruthy()

      const booking = await createBookingForActor({
        db,
        actor: editor,
        productionId,
        personId,
        shootDayId: null,
      })
      await expect(
        deleteBookingForActor({
          db,
          actor: editor,
          bookingId: booking.id,
        })
      ).resolves.toBeUndefined()
    })
  })
})

type Harness = {
  adapter: DatabaseAdapter
  close: () => Promise<void>
}

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
  await pool.query(`
    CREATE TABLE people (
      id UUID PRIMARY KEY,
      production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_cast BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMPTZ
    );
  `)
  await pool.query(`
    CREATE TABLE shoot_days (
      id UUID PRIMARY KEY,
      production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
      shoot_date DATE NOT NULL,
      day_number INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMPTZ
    );
  `)
  await pool.query(`
    CREATE TABLE bookings (
      id UUID PRIMARY KEY,
      production_id UUID NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
      person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      shoot_day_id UUID REFERENCES shoot_days(id) ON DELETE SET NULL,
      start_date DATE,
      end_date DATE,
      role TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMPTZ
    );
  `)
  await pool.query(`
    CREATE TABLE documents (
      id UUID PRIMARY KEY,
      production_id UUID REFERENCES productions(id) ON DELETE CASCADE,
      entity_type TEXT,
      entity_id UUID,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMPTZ
    );
  `)
  await pool.query(`
    CREATE TABLE outbox (
      id UUID PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  await pool.query(uam1Sql)
  await pool.query(uam2Sql)
  return {
    adapter: new PostgresDatabaseAdapter(pool, schemaName),
    close: async () => {
      await pool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
      await pool.end()
    },
  }
}

async function seedUser(
  db: DatabaseAdapter,
  username: string,
  role: 'user' | 'admin'
): Promise<AuthenticatedUser> {
  const rows = await db.select<Array<{ id: string; username: string; role: 'user' | 'admin' }>>(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, username, role`,
    [username, '$argon2id$v=19$m=4096,t=3,p=1$abc$def', role]
  )
  return rows[0]!
}

async function seedProduction(
  db: DatabaseAdapter,
  name: string,
  slug: string
): Promise<string> {
  const rows = await db.select<Array<{ id: string }>>(
    `INSERT INTO productions (name, slug, notes, currency_code, is_episodic, created_at, updated_at)
     VALUES ($1, $2, NULL, 'GBP', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [name, slug]
  )
  return rows[0]!.id
}

async function seedMembership(
  db: DatabaseAdapter,
  productionId: string,
  userId: string,
  accessLevel: 'viewer' | 'editor' | 'administrator'
): Promise<void> {
  await db.execute(
    `INSERT INTO project_memberships (id, production_id, user_id, access_level, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [productionId, userId, accessLevel]
  )
}

async function seedPerson(
  db: DatabaseAdapter,
  productionId: string,
  name: string
): Promise<string> {
  const rows = await db.select<Array<{ id: string }>>(
    `INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [productionId, name]
  )
  return rows[0]!.id
}

async function seedShootDay(
  db: DatabaseAdapter,
  productionId: string,
  shootDate: string
): Promise<string> {
  const rows = await db.select<Array<{ id: string }>>(
    `INSERT INTO shoot_days (id, production_id, shoot_date, day_number, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [productionId, shootDate]
  )
  return rows[0]!.id
}
