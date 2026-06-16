import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'

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

import { createProduction, updateProduction } from '@/lib/db/repositories/production'
import { enableEpisodicProduction } from '@/lib/db/episodicProductionService'
import { listEpisodesByProduction } from '@/lib/db/repositories/episodes'
import {
  createShootDayWithDefaultMainUnit,
  getShootDayById,
} from '@/lib/db/repositories/schedule'
import {
  createShootingBloc,
  DEFAULT_EPISODIC_SHOOTING_BLOC_NAME,
  deleteShootingBloc,
  listShootingBlocsByProduction,
  shootingBlocRangesOverlap,
  updateShootingBloc,
} from '@/lib/db/repositories/shootingBlocs'

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

function exec(db: Database, sql: string, args: unknown[] = []): void {
  db.run(sql, args)
}

describe('shootingBlocRangesOverlap', () => {
  it('treats adjacent YYYY-MM-DD ranges as non-overlapping', () => {
    expect(shootingBlocRangesOverlap('2025-01-01', '2025-01-10', '2025-01-11', '2025-01-20')).toBe(false)
  })

  it('detects overlapping inclusive ranges', () => {
    expect(shootingBlocRangesOverlap('2025-01-01', '2025-01-15', '2025-01-10', '2025-01-20')).toBe(true)
    expect(shootingBlocRangesOverlap('2025-01-05', '2025-01-05', '2025-01-05', '2025-01-05')).toBe(true)
  })
})

describe('episodic production foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults new productions to non-episodic', async () => {
    const db = await makeDb()
    const p = await createProduction({ name: 'Film', notes: null })
    expect(p.is_episodic).toBe(false)
    const rows = sqlJsQueryExec(db, `SELECT is_episodic FROM productions WHERE id = '${p.id}'`)
    expect(rows[0]?.values[0]?.[0]).toBe(0)
  })

  it('creates episodic production with first episode atomically', async () => {
    const db = await makeDb()
    const p = await createProduction(
      { name: 'Series', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'Pilot' }
    )
    expect(p.is_episodic).toBe(true)
    const eps = await listEpisodesByProduction(p.id)
    expect(eps).toHaveLength(1)
    expect(eps[0]!.name).toBe('Pilot')
    expect(eps[0]!.sort_order).toBe(0)
    const n = sqlJsQueryExec(db, `SELECT COUNT(*) FROM episodes WHERE production_id = '${p.id}' AND deleted_at IS NULL`)
    expect(n[0]?.values[0]?.[0]).toBe(1)
    const blocs = await listShootingBlocsByProduction(p.id)
    expect(blocs).toHaveLength(1)
    expect(blocs[0]!.name).toBe(DEFAULT_EPISODIC_SHOOTING_BLOC_NAME)
    expect(blocs[0]!.start_date <= blocs[0]!.end_date).toBe(true)
  })

  it('rejects episodic create with empty episode name', async () => {
    await makeDb()
    await expect(
      createProduction({ name: 'X', notes: null }, { episodicInitialEpisodeName: '   ' })
    ).rejects.toThrow(/non-empty first episode/)
  })

  it('enableEpisodicProduction creates episode and sets flag', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Late', notes: null }, { skipBudgetSeed: true })
    const updated = await enableEpisodicProduction({
      productionId: p.id,
      initialEpisodeName: 'E1',
    })
    expect(updated.is_episodic).toBe(true)
    const eps = await listEpisodesByProduction(p.id)
    expect(eps.map((e) => e.name)).toEqual(['E1'])
    const blocs = await listShootingBlocsByProduction(p.id)
    expect(blocs).toHaveLength(1)
    expect(blocs[0]!.name).toBe(DEFAULT_EPISODIC_SHOOTING_BLOC_NAME)
  })

  it('enableEpisodicProduction rejects empty episode name', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Y', notes: null }, { skipBudgetSeed: true })
    await expect(enableEpisodicProduction({ productionId: p.id, initialEpisodeName: '  ' })).rejects.toThrow(
      /at least one episode name/
    )
  })

  it('does not clear is_episodic via updateProduction cast', async () => {
    await makeDb()
    const p = await createProduction(
      { name: 'Keep', notes: null },
      { skipBudgetSeed: true, episodicInitialEpisodeName: 'One' }
    )
    await expect(
      // Deliberately pass forbidden field to assert repository guard (not exposed in types).
      updateProduction(p.id, { name: p.name, notes: null, is_episodic: false } as never)
    ).rejects.toThrow(/cannot be disabled/)
  })

  it('shooting blocs reject overlap and allow adjacent', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Bloc test', notes: null }, { skipBudgetSeed: true })
    await createShootingBloc({
      production_id: p.id,
      name: 'A',
      start_date: '2025-06-01',
      end_date: '2025-06-10',
    })
    await createShootingBloc({
      production_id: p.id,
      name: 'B',
      start_date: '2025-06-11',
      end_date: '2025-06-20',
    })
    await expect(
      createShootingBloc({
        production_id: p.id,
        name: 'Bad',
        start_date: '2025-06-08',
        end_date: '2025-06-12',
      })
    ).rejects.toThrow(/overlaps/)
  })

  it('updateShootingBloc rejects overlap with another bloc', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Up', notes: null }, { skipBudgetSeed: true })
    await createShootingBloc({
      production_id: p.id,
      name: 'A',
      start_date: '2025-01-01',
      end_date: '2025-01-05',
    })
    const b2 = await createShootingBloc({
      production_id: p.id,
      name: 'B',
      start_date: '2025-01-10',
      end_date: '2025-01-15',
    })
    await expect(updateShootingBloc(b2.id, { start_date: '2025-01-03' })).rejects.toThrow(/overlaps/)
  })

  it('deleteShootingBloc rejects deleting the first bloc', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Del', notes: null }, { skipBudgetSeed: true })
    const a = await createShootingBloc({
      production_id: p.id,
      name: 'A',
      start_date: '2025-06-01',
      end_date: '2025-06-10',
    })
    await expect(deleteShootingBloc(a.id)).rejects.toThrow(/first shooting bloc/)
  })

  it('deleteShootingBloc merges middle bloc into previous and extends end date', async () => {
    const db = await makeDb()
    const p = await createProduction({ name: 'Merge', notes: null }, { skipBudgetSeed: true })
    const a = await createShootingBloc({
      production_id: p.id,
      name: 'A',
      start_date: '2025-06-01',
      end_date: '2025-06-10',
    })
    const b = await createShootingBloc({
      production_id: p.id,
      name: 'B',
      start_date: '2025-06-11',
      end_date: '2025-06-20',
    })
    const day = await createShootDayWithDefaultMainUnit({
      productionId: p.id,
      shootDate: '2025-06-15',
    })
    expect(day.shootDay.shooting_bloc_id).toBe(b.id)

    await deleteShootingBloc(b.id)

    const afterDay = await getShootDayById(day.shootDay.id)
    expect(afterDay?.shooting_bloc_id).toBe(a.id)

    const blocs = await listShootingBlocsByProduction(p.id)
    expect(blocs).toHaveLength(1)
    expect(blocs[0]!.id).toBe(a.id)
    expect(blocs[0]!.end_date).toBe('2025-06-20')

    const deleted = sqlJsQueryExec(db, `SELECT deleted_at FROM shooting_blocs WHERE id = '${b.id}'`)
    expect(deleted[0]?.values[0]?.[0]).not.toBeNull()
  })

  it('migration leaves legacy production row non-episodic without episodes', async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    applyAllMigrations(db)
    exec(db, `INSERT INTO productions (id, name, slug, currency_code, notes, created_at, updated_at) VALUES ('leg', 'L', 'l', 'GBP', NULL, 't', 't')`)
    const r = sqlJsQueryExec(db, `SELECT is_episodic FROM productions WHERE id = 'leg'`)
    expect(r[0]?.values[0]?.[0]).toBe(0)
    const ne = sqlJsQueryExec(db, `SELECT COUNT(*) FROM episodes WHERE production_id = 'leg'`)
    expect(ne[0]?.values[0]?.[0]).toBe(0)
  })

  it('non-episodic productions keep null episode scope on scenes, music_tracks, and deliverables', async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    applyAllMigrations(db)
    exec(
      db,
      `INSERT INTO productions (id, name, slug, currency_code, notes, created_at, updated_at) VALUES ('np', 'N', 'nslug', 'GBP', NULL, 't', 't')`
    )
    exec(
      db,
      `INSERT INTO scenes (id, production_id, scene_number, description, created_at, updated_at) VALUES ('sc1', 'np', '1', NULL, 't', 't')`
    )
    exec(db, `INSERT INTO music_tracks (id, production_id, title, created_at, updated_at) VALUES ('mt1', 'np', 'T', 't', 't')`)
    exec(db, `INSERT INTO deliverables (id, production_id, name, created_at, updated_at) VALUES ('del1', 'np', 'D', 't', 't')`)
    const sEp = sqlJsQueryExec(db, `SELECT episode_id FROM scenes WHERE id = 'sc1'`)
    expect(sEp[0]?.values[0]?.[0] ?? null).toBeNull()
    const mEp = sqlJsQueryExec(db, `SELECT episode_id FROM music_tracks WHERE id = 'mt1'`)
    expect(mEp[0]?.values[0]?.[0] ?? null).toBeNull()
    const dEp = sqlJsQueryExec(db, `SELECT episode_id FROM deliverables WHERE id = 'del1'`)
    expect(dEp[0]?.values[0]?.[0] ?? null).toBeNull()
  })
})
