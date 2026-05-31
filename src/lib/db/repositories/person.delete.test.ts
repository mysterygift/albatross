import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
  }
})

vi.mock('@/lib/db/outbox', () => ({
  outboxPush: vi.fn(async () => undefined),
}))

import { setDbAdapterForTests } from '@/lib/db/client'
import { deletePerson, getPersonById, listCrew } from '@/lib/db/repositories/person'
import { getCastIdsByShotIds } from '@/lib/db/repositories/shot-cast'

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  const ts = '2026-01-01T00:00:00.000Z'
  db.exec(`
    CREATE TABLE people (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_cast INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      phone TEXT,
      department TEXT,
      phases TEXT,
      notes TEXT,
      contributor_form_status TEXT,
      cast_number TEXT,
      agent_name TEXT,
      agent_email TEXT,
      agent_phone TEXT,
      role_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE scene_cast (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      scene_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE shot_cast (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      shot_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      shoot_day_id TEXT,
      start_date TEXT,
      end_date TEXT,
      role TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE cast_availability (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      availability TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE crew_availability (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      availability TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE floats (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      budget_revision_id TEXT,
      budget_item_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      issued_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at)
      VALUES ('person-1', 'prod-1', 'Test Cast', 1, '${ts}', '${ts}');
    INSERT INTO scene_cast (id, production_id, scene_id, person_id, created_at, updated_at)
      VALUES ('sc-1', 'prod-1', 'scene-1', 'person-1', '${ts}', '${ts}');
    INSERT INTO shot_cast (id, production_id, shot_id, person_id, created_at, updated_at)
      VALUES ('shotc-1', 'prod-1', 'shot-1', 'person-1', '${ts}', '${ts}');
    INSERT INTO bookings (id, production_id, person_id, created_at, updated_at)
      VALUES ('book-1', 'prod-1', 'person-1', '${ts}', '${ts}');
  `)
  dbAdapter = createSqlJsTauriAdapter(db)
  setDbAdapterForTests(dbAdapter)
  return db
}

describe('deletePerson', () => {
  beforeEach(async () => {
    await makeDb()
  })

  it('soft-deletes person and associations; shot_cast no longer lists person', async () => {
    const castBefore = await getCastIdsByShotIds(['shot-1'])
    expect(castBefore.get('shot-1')).toEqual(['person-1'])

    await deletePerson('person-1')

    expect(await getPersonById('person-1')).toBeNull()

    const personRow = await dbAdapter.select<Array<{ deleted_at: string | null }>>(
      `SELECT deleted_at FROM people WHERE id = 'person-1'`,
      []
    )
    expect(personRow[0]?.deleted_at).not.toBeNull()

    for (const table of ['scene_cast', 'shot_cast', 'bookings'] as const) {
      const rows = await dbAdapter.select<Array<{ deleted_at: string | null }>>(
        `SELECT deleted_at FROM ${table} WHERE person_id = 'person-1'`,
        []
      )
      expect(rows[0]?.deleted_at).not.toBeNull()
    }

    const castAfter = await getCastIdsByShotIds(['shot-1'])
    expect(castAfter.get('shot-1') ?? []).not.toContain('person-1')
  })

  it('soft-deletes crew person from listCrew', async () => {
    const ts = '2026-01-01T00:00:00.000Z'
    await dbAdapter.execute(
      `INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at)
       VALUES ('crew-1', 'prod-1', 'Test Crew', 0, $1, $1)`,
      [ts]
    )
    expect(await listCrew('prod-1')).toHaveLength(1)

    await deletePerson('crew-1')

    expect(await listCrew('prod-1')).toHaveLength(0)
  })
})
