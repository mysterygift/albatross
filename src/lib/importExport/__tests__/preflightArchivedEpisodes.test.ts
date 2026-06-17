import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { preflightApfImportDb } from '@/lib/importExport/preflightApfImport'
import { TEST_PRODUCTION_ID, buildFixtureDataAndManifest, emptyApfTables, minimalProductionRow } from '@/test/apf/fixtures'
import type { ApfTableRow } from '@/lib/importExport/payload'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
  }
})

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function makeEmptyDb(): Promise<void> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  dbAdapter = createSqlJsTauriAdapter(db)
}

describe('preflightApfImportDb archived episode assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows scene episode_id pointing at archived payload episode (restore semantics)', async () => {
    await makeEmptyDb()
    const EP_ACTIVE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const EP_ARCH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow({ id: TEST_PRODUCTION_ID, is_episodic: 1 })]
    tables.episodes = [
      {
        id: EP_ACTIVE,
        production_id: TEST_PRODUCTION_ID,
        name: 'E1',
        sort_order: 0,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      } as ApfTableRow,
      {
        id: EP_ARCH,
        production_id: TEST_PRODUCTION_ID,
        name: 'E2',
        sort_order: 1,
        created_at: 't',
        updated_at: 't',
        deleted_at: '2025-01-01T00:00:00.000Z',
      } as ApfTableRow,
    ]
    tables.scenes = [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        production_id: TEST_PRODUCTION_ID,
        episode_id: EP_ARCH,
        scene_number: '1',
        title: null,
        description: null,
        int_ext: null,
        day_night: null,
        page_eighths: null,
        location_id: null,
        duration_minutes: null,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      } as ApfTableRow,
    ]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    await expect(preflightApfImportDb({ manifest, data: dataFile })).resolves.toBeUndefined()
  })

  it('allows deliverable episode_id pointing at archived payload episode', async () => {
    await makeEmptyDb()
    const EP_ACTIVE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const EP_ARCH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow({ id: TEST_PRODUCTION_ID, is_episodic: 1 })]
    tables.episodes = [
      {
        id: EP_ACTIVE,
        production_id: TEST_PRODUCTION_ID,
        name: 'E1',
        sort_order: 0,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      } as ApfTableRow,
      {
        id: EP_ARCH,
        production_id: TEST_PRODUCTION_ID,
        name: 'E2',
        sort_order: 1,
        created_at: 't',
        updated_at: 't',
        deleted_at: '2025-01-01',
      } as ApfTableRow,
    ]
    tables.scenes = [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        production_id: TEST_PRODUCTION_ID,
        episode_id: EP_ACTIVE,
      } as ApfTableRow,
    ]
    tables.deliverables = [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        production_id: TEST_PRODUCTION_ID,
        episode_id: EP_ARCH,
        name: 'D1',
        due_date: null,
        status: 'not_started',
        recipient: null,
        delivery_method: null,
        delivered_by: null,
        delivered_at: null,
        approval_status: 'pending',
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      } as ApfTableRow,
    ]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    await expect(preflightApfImportDb({ manifest, data: dataFile })).resolves.toBeUndefined()
  })
})

describe('preflightApfImportDb shooting_bloc_id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects shoot_days shooting_bloc_id not in tables.shooting_blocs', async () => {
    await makeEmptyDb()
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow({ id: TEST_PRODUCTION_ID })]
    tables.shoot_days = [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        production_id: TEST_PRODUCTION_ID,
        shoot_date: '2025-01-15',
        shooting_bloc_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        day_number: null,
        call_time: null,
        notes: null,
        weather_manual: null,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      } as ApfTableRow,
    ]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    await expect(preflightApfImportDb({ manifest, data: dataFile })).rejects.toThrow(/shoot_days\[0\] shooting_bloc_id/)
  })

  it('rejects shooting_blocs row with mismatched production_id', async () => {
    await makeEmptyDb()
    const BLOC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow({ id: TEST_PRODUCTION_ID })]
    tables.shooting_blocs = [
      {
        id: BLOC,
        production_id: '99999999-9999-4999-8999-999999999999',
        name: 'Bloc A',
        start_date: '2025-01-01',
        end_date: '2025-01-31',
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      } as ApfTableRow,
    ]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    await expect(preflightApfImportDb({ manifest, data: dataFile })).rejects.toThrow(/shooting_blocs\[0\] production_id/)
  })
})
