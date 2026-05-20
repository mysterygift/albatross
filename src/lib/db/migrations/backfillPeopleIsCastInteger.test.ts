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

import { setDbAdapterForTests } from '@/lib/db/client'
import { listCrew } from '@/lib/db/repositories/person'
import { backfillPeopleIsCastIntegerIfNeeded } from '@/lib/db/migrations/backfillPeopleIsCastInteger'

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
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
  `)
  dbAdapter = createSqlJsTauriAdapter(db)
  setDbAdapterForTests(dbAdapter)
  return db
}

describe('backfillPeopleIsCastIntegerIfNeeded', () => {
  beforeEach(async () => {
    await makeDb()
  })

  it('normalizes non-integer is_cast so listCrew includes the person', async () => {
    await dbAdapter.execute(
      `INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at)
       VALUES ('p1', 'prod-1', 'Ghost Crew', 2, 't', 't')`,
      []
    )

    const before = await dbAdapter.select<Array<{ n: number }>>(
      `SELECT COUNT(*) AS n FROM people WHERE production_id = $1 AND is_cast = 0 AND deleted_at IS NULL`,
      ['prod-1']
    )
    expect(Number(before[0]?.n ?? 0)).toBe(0)

    const updated = await backfillPeopleIsCastIntegerIfNeeded(dbAdapter)
    expect(updated).toBe(1)
    expect(await listCrew('prod-1')).toHaveLength(1)
  })
})
