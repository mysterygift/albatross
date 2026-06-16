import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import {
  buildFixtureDataAndManifest,
  emptyApfTables,
  minimalProductionRow,
  TEST_PRODUCTION_ID,
} from '@/test/apf/fixtures'
import { preflightApfImportDb } from '@/lib/importExport/preflightApfImport'
import { ApfImportPreflightError } from '@/lib/importExport/errors'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
    executeBatch: vi.fn(
      async (
        db: { execute: (sql: string, bindValues?: unknown[]) => Promise<void> },
        statements: Array<{ sql: string; bindValues: unknown[] }>
      ) => {
        let open = false
        try {
          for (const s of statements) {
            const upper = s.sql.trim().toUpperCase()
            if (upper.startsWith('BEGIN')) open = true
            await db.execute(s.sql, s.bindValues)
            if (upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) open = false
          }
        } catch (e) {
          if (open) {
            try {
              await db.execute('ROLLBACK', [])
            } catch {
              /* ignore */
            }
          }
          throw e
        }
      }
    ),
  }
})

import { createProduction } from '@/lib/db/repositories/production'
import {
  createEpisode,
  archiveEpisodeForProduction,
  getEpisodeByIdForProductionIncludeArchived,
  listEpisodesByProduction,
} from '@/lib/db/repositories/episodes'
import {
  createScene,
  updateScene,
  createShot,
  getShotEpisodeContext,
} from '@/lib/db/repositories/schedule'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  dbAdapter = createSqlJsTauriAdapter(db)
  return db
}

describe('scene episode assignment (EP3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('episodic createScene requires episode_id', async () => {
    await makeDb()
    const p = await createProduction({ name: 'S', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'E1' })
    await expect(
      createScene({ production_id: p.id, scene_number: '1' })
    ).rejects.toThrow(/require an episode/)
  })

  it('non-episodic createScene rejects episode_id', async () => {
    await makeDb()
    const p = await createProduction({ name: 'F', notes: null }, { skipBudgetSeed: true })
    await expect(
      createScene({
        production_id: p.id,
        scene_number: '1',
        episode_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
    ).rejects.toThrow(/cannot be set for non-episodic/)
  })

  it('rejects episode from another production', async () => {
    await makeDb()
    const p1 = await createProduction({ name: 'A', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'E1' })
    const p2 = await createProduction({ name: 'B', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'F1' })
    const eps2 = await listEpisodesByProduction(p2.id)
    await expect(
      createScene({
        production_id: p1.id,
        scene_number: '1',
        episode_id: eps2[0]!.id,
      })
    ).rejects.toThrow(/not found or archived/)
  })

  it('cannot create scene with archived episode', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Arc', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'Old' })
    const [ep] = await listEpisodesByProduction(p.id)
    await archiveEpisodeForProduction(p.id, ep!.id)
    await expect(
      createScene({ production_id: p.id, scene_number: '1', episode_id: ep!.id })
    ).rejects.toThrow(/not found or archived/)
  })

  it('reassigns scene between active episodes', async () => {
    await makeDb()
    const p = await createProduction({ name: 'R', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'E1' })
    const e1 = (await listEpisodesByProduction(p.id))[0]!
    const e2 = await createEpisode({ production_id: p.id, name: 'E2', sort_order: 1 })
    const sc = await createScene({ production_id: p.id, scene_number: '5', episode_id: e1.id })
    expect(sc.episode_id).toBe(e1.id)
    const updated = await updateScene(sc.id, { episode_id: e2.id })
    expect(updated.episode_id).toBe(e2.id)
  })

  it('updateScene rejects switching to archived episode', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Sw', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'A' })
    const e1 = (await listEpisodesByProduction(p.id))[0]!
    const e2 = await createEpisode({ production_id: p.id, name: 'B', sort_order: 1 })
    const sc = await createScene({ production_id: p.id, scene_number: '1', episode_id: e1.id })
    await archiveEpisodeForProduction(p.id, e2.id)
    await expect(updateScene(sc.id, { episode_id: e2.id })).rejects.toThrow(/not found or archived/)
  })

  it('include-archived getter returns archived episode for labels', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Lbl', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'Gone' })
    const [ep] = await listEpisodesByProduction(p.id)
    await archiveEpisodeForProduction(p.id, ep!.id)
    const row = await getEpisodeByIdForProductionIncludeArchived(p.id, ep!.id)
    expect(row).not.toBeNull()
    expect(row!.name).toBe('Gone')
    expect(row!.deleted_at).not.toBeNull()
  })

  it('getShotEpisodeContext inherits scene episode', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Shot', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'Ep' })
    const [ep] = await listEpisodesByProduction(p.id)
    const sc = await createScene({ production_id: p.id, scene_number: '10', episode_id: ep!.id })
    const shot = await createShot({ scene_id: sc.id, shot_number: '1' })
    const ctx = await getShotEpisodeContext(shot.shot.id)
    expect(ctx).not.toBeNull()
    expect(ctx!.episode_id).toBe(ep!.id)
    expect(ctx!.episode_name).toBe('Ep')
    expect(ctx!.episode_deleted_at).toBeNull()
  })
})

describe('preflightApfImport episodic scenes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects episodic package when a scene lacks episode_id', async () => {
    await makeDb()
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow({ is_episodic: 1 })]
    tables.episodes = [
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        production_id: TEST_PRODUCTION_ID,
        name: 'E1',
        sort_order: 0,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]
    tables.scenes = [
      {
        id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
        production_id: TEST_PRODUCTION_ID,
        scene_number: '1',
        title: null,
        description: null,
        int_ext: null,
        day_night: null,
        page_eighths: null,
        location_id: null,
        duration_minutes: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    await expect(preflightApfImportDb({ manifest, data: dataFile })).rejects.toThrow(ApfImportPreflightError)
  })

  it('allows non-episodic import with no scene episode_id', async () => {
    await makeDb()
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow({ is_episodic: 0 })]
    tables.scenes = [
      {
        id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
        production_id: TEST_PRODUCTION_ID,
        scene_number: '1',
        title: null,
        description: null,
        int_ext: null,
        day_night: null,
        page_eighths: null,
        location_id: null,
        duration_minutes: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    await expect(preflightApfImportDb({ manifest, data: dataFile })).resolves.toBeUndefined()
  })
})
