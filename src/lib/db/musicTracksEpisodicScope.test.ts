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
  listEpisodesByProduction,
} from '@/lib/db/repositories/episodes'
import {
  createMusicTrack,
  listMusicTracksByProduction,
  updateMusicTrack,
} from '@/lib/db/repositories/music-clearance'

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

const EP_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const EP_ID_2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

function minimalMusicTrackRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    production_id: TEST_PRODUCTION_ID,
    episode_id: null,
    title: 'Track',
    artist: null,
    publisher_label: null,
    notes: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('music tracks episodic scope (EP7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('episodic: project-wide and episode assignment', async () => {
    await makeDb()
    const p = await createProduction({ name: 'M', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'E1' })
    const [ep] = await listEpisodesByProduction(p.id)
    const tw = await createMusicTrack({
      production_id: p.id,
      title: 'Wide',
      episode_id: null,
    })
    expect(tw.episode_id).toBeNull()
    const te = await createMusicTrack({
      production_id: p.id,
      title: 'Ep',
      episode_id: ep!.id,
    })
    expect(te.episode_id).toBe(ep!.id)
    const all = await listMusicTracksByProduction(p.id, { filter: 'all' })
    expect(all).toHaveLength(2)
    const pw = await listMusicTracksByProduction(p.id, { filter: 'project_wide' })
    expect(pw.map((t) => t.title)).toEqual(['Wide'])
    const byEp = await listMusicTracksByProduction(p.id, { filter: 'episode', episodeId: ep!.id })
    expect(byEp.map((t) => t.title)).toEqual(['Ep'])
  })

  it('non-episodic rejects episode_id on create', async () => {
    await makeDb()
    const p = await createProduction({ name: 'F', notes: null }, { skipBudgetSeed: true })
    await expect(
      createMusicTrack({
        production_id: p.id,
        title: 'X',
        episode_id: EP_ID,
      })
    ).rejects.toThrow(/cannot be set for non-episodic/)
  })

  it('rejects episode from another production', async () => {
    await makeDb()
    const p1 = await createProduction({ name: 'A', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'E1' })
    const p2 = await createProduction({ name: 'B', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'F1' })
    const eps2 = await listEpisodesByProduction(p2.id)
    await expect(
      createMusicTrack({
        production_id: p1.id,
        title: 'Cross',
        episode_id: eps2[0]!.id,
      })
    ).rejects.toThrow(/not found or archived/)
  })

  it('rejects create with archived episode', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Arc', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'Old' })
    const [ep] = await listEpisodesByProduction(p.id)
    await archiveEpisodeForProduction(p.id, ep!.id)
    await expect(
      createMusicTrack({ production_id: p.id, title: 'Bad', episode_id: ep!.id })
    ).rejects.toThrow(/not found or archived/)
  })

  it('existing row keeps episode_id when episode is archived; can edit metadata without reassigning', async () => {
    await makeDb()
    const p = await createProduction({ name: 'K', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'E1' })
    const e1 = (await listEpisodesByProduction(p.id))[0]!
    const e2 = await createEpisode({ production_id: p.id, name: 'E2', sort_order: 1 })
    const t = await createMusicTrack({ production_id: p.id, title: 'Hold', episode_id: e1.id })
    await archiveEpisodeForProduction(p.id, e1.id)
    const listed = await listMusicTracksByProduction(p.id)
    expect(listed[0]!.episode_id).toBe(e1.id)
    const u = await updateMusicTrack(t.id, { title: 'Hold Renamed' })
    expect(u.episode_id).toBe(e1.id)
    expect(u.title).toBe('Hold Renamed')
    await expect(updateMusicTrack(t.id, { episode_id: e2.id })).resolves.toBeDefined()
  })

  it('rejects reassigning to archived episode', async () => {
    await makeDb()
    const p = await createProduction({ name: 'R', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'A' })
    const e1 = (await listEpisodesByProduction(p.id))[0]!
    const e2 = await createEpisode({ production_id: p.id, name: 'B', sort_order: 1 })
    const t = await createMusicTrack({ production_id: p.id, title: 'T', episode_id: e1.id })
    await archiveEpisodeForProduction(p.id, e2.id)
    await expect(updateMusicTrack(t.id, { episode_id: e2.id })).rejects.toThrow(/not found or archived/)
  })
})

describe('preflightApfImport music_tracks episode_id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function episodicBaseTables() {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow({ is_episodic: 1 })]
    tables.episodes = [
      {
        id: EP_ID,
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
        episode_id: EP_ID,
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
    return tables
  }

  it('allows episodic import with project-wide music track', async () => {
    await makeDb()
    const tables = episodicBaseTables()
    tables.music_tracks = [minimalMusicTrackRow({ episode_id: null })]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    await expect(preflightApfImportDb({ manifest, data: dataFile })).resolves.toBeUndefined()
  })

  it('allows episodic import with music track tied to episode', async () => {
    await makeDb()
    const tables = episodicBaseTables()
    tables.music_tracks = [minimalMusicTrackRow({ episode_id: EP_ID })]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    await expect(preflightApfImportDb({ manifest, data: dataFile })).resolves.toBeUndefined()
  })

  it('rejects episodic import when music track episode_id unknown', async () => {
    await makeDb()
    const tables = episodicBaseTables()
    tables.music_tracks = [minimalMusicTrackRow({ episode_id: EP_ID_2 })]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    await expect(preflightApfImportDb({ manifest, data: dataFile })).rejects.toThrow(ApfImportPreflightError)
  })

  it('rejects non-episodic import with music track episode_id', async () => {
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
    tables.music_tracks = [minimalMusicTrackRow({ episode_id: EP_ID })]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    await expect(preflightApfImportDb({ manifest, data: dataFile })).rejects.toThrow(ApfImportPreflightError)
  })
})
