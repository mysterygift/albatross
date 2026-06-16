import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

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
  listEpisodesByProduction,
  listEpisodesForProductionManagement,
} from '@/lib/db/repositories/episodes'
import {
  appendEpisode,
  archiveEpisode,
  getEpisodeHardDeleteEligibility,
  hardDeleteArchivedEpisode,
  loadEpisodesForSettings,
  renameEpisode,
  reorderEpisodes,
} from '@/lib/db/episodeManagementService'
import { createScene, getSceneById } from '@/lib/db/repositories/schedule'

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

describe('episode management service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loadEpisodesForSettings rejects non-episodic production', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Film', notes: null }, { skipBudgetSeed: true })
    await expect(loadEpisodesForSettings(p.id)).rejects.toThrow(/not episodic/)
  })

  it('appendEpisode adds at end; blank name throws', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'Series', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'Pilot' }
    )
    await appendEpisode(p.id, '  Two  ')
    const active = await listEpisodesByProduction(p.id)
    expect(active.map((e) => e.name)).toEqual(['Pilot', 'Two'])
    expect(active[1]!.sort_order).toBe(1)
    await expect(appendEpisode(p.id, '   ')).rejects.toThrow(/required/)
  })

  it('renameEpisode updates name; blank throws', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'A' }
    )
    const [e0] = await listEpisodesByProduction(p.id)
    const updated = await renameEpisode(p.id, e0!.id, '  Alpha  ')
    expect(updated.id).toBe(e0!.id)
    expect(updated.name).toBe('Alpha')
    await expect(renameEpisode(p.id, e0!.id, '  ')).rejects.toThrow(/required/)
  })

  it('reorderEpisodes persists canonical order', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'First' }
    )
    await appendEpisode(p.id, 'Second')
    await appendEpisode(p.id, 'Third')
    let list = await listEpisodesByProduction(p.id)
    const [a, b, c] = list
    await reorderEpisodes(p.id, [c!.id, a!.id, b!.id])
    list = await listEpisodesByProduction(p.id)
    expect(list.map((e) => e.name)).toEqual(['Third', 'First', 'Second'])
  })

  it('reorderEpisodes rejects invalid id set', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'A' }
    )
    await appendEpisode(p.id, 'B')
    const list = await listEpisodesByProduction(p.id)
    await expect(reorderEpisodes(p.id, [list[0]!.id])).rejects.toThrow()
  })

  it('archive sets deleted_at; excluded from active list; still in management list', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'Keep' }
    )
    await appendEpisode(p.id, 'Gone')
    const list = await listEpisodesByProduction(p.id)
    const toArchive = list.find((e) => e.name === 'Gone')!
    await archiveEpisode(p.id, toArchive.id)
    const active = await listEpisodesByProduction(p.id)
    expect(active).toHaveLength(1)
    expect(active[0]!.name).toBe('Keep')
    const all = await listEpisodesForProductionManagement(p.id)
    expect(all).toHaveLength(2)
    expect(all.find((e) => e.id === toArchive.id)?.deleted_at).not.toBeNull()
  })

  it('cannot archive last active episode', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'Only' }
    )
    const [e] = await listEpisodesByProduction(p.id)
    await expect(archiveEpisode(p.id, e!.id)).rejects.toThrow(/last active/)
  })

  it('hardDeleteArchivedEpisode removes archived episode with no references', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'A' }
    )
    await appendEpisode(p.id, 'B')
    const list = await listEpisodesByProduction(p.id)
    const b = list.find((e) => e.name === 'B')!
    await archiveEpisode(p.id, b.id)
    await hardDeleteArchivedEpisode(p.id, b.id)
    const all = await listEpisodesForProductionManagement(p.id)
    expect(all.some((e) => e.id === b.id)).toBe(false)
  })

  it('hardDeleteArchivedEpisode clears scene episode_id then removes episode', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'A' }
    )
    await appendEpisode(p.id, 'B')
    const list = await listEpisodesByProduction(p.id)
    const b = list.find((e) => e.name === 'B')!
    const scene = await createScene({
      production_id: p.id,
      scene_number: '1',
      episode_id: b.id,
    })
    await archiveEpisode(p.id, b.id)
    await hardDeleteArchivedEpisode(p.id, b.id)
    const after = await getSceneById(scene.id)
    expect(after?.episode_id).toBeNull()
    const all = await listEpisodesForProductionManagement(p.id)
    expect(all.some((e) => e.id === b.id)).toBe(false)
  })

  it('getEpisodeHardDeleteEligibility rejects delete when only one active episode', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'A' }
    )
    const [e] = await listEpisodesByProduction(p.id)
    const el = await getEpisodeHardDeleteEligibility(p.id, e!.id)
    expect(el.allowed).toBe(false)
    if (!el.allowed) expect(el.reason).toMatch(/last active/)
  })

  it('getEpisodeHardDeleteEligibility allows delete for active episode when another active exists', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'S', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'A' }
    )
    await appendEpisode(p.id, 'B')
    const list = await listEpisodesByProduction(p.id)
    const a = list.find((e) => e.name === 'A')!
    const el = await getEpisodeHardDeleteEligibility(p.id, a.id)
    expect(el).toEqual({ allowed: true })
  })
})
