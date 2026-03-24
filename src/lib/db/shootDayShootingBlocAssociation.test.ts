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
  createShootDayWithDefaultMainUnit,
  getShootDayById,
  moveShootDayToDate,
  swapShootDays,
  updateShootDay,
} from '@/lib/db/repositories/schedule'
import { createShootingBloc, updateShootingBloc } from '@/lib/db/repositories/shootingBlocs'
import {
  findShootingBlocIdForProductionDate,
  validateShootingBlocForShootDay,
} from '@/lib/db/shootingBlocAssociation'
import { listCalendarShootDayEvents } from '@/lib/db/repositories/calendar'

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

async function episodicProdWithBloc() {
  const p = await createProduction({ name: 'Series', notes: null }, { skipBudgetSeed: true, episodicInitialEpisodeName: 'E1' })
  const bloc = await createShootingBloc({
    production_id: p.id,
    name: 'Block 1',
    start_date: '2025-06-01',
    end_date: '2025-06-10',
  })
  return { p, bloc }
}

describe('shoot day ↔ shooting bloc association', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('assigns shooting_bloc_id when creating a day inside the bloc range', async () => {
    await makeDb()
    const { p, bloc } = await episodicProdWithBloc()
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: p.id,
      shootDate: '2025-06-01',
    })
    expect(shootDay.shooting_bloc_id).toBe(bloc.id)
  })

  it('leaves shooting_bloc_id null when creating outside any bloc', async () => {
    await makeDb()
    const { p } = await episodicProdWithBloc()
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: p.id,
      shootDate: '2025-07-01',
    })
    expect(shootDay.shooting_bloc_id).toBeNull()
  })

  it('boundary dates: start and end of bloc are inclusive', async () => {
    await makeDb()
    const { p, bloc } = await episodicProdWithBloc()
    const a = await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-06-10' })
    const b = await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-06-01' })
    expect(a.shootDay.shooting_bloc_id).toBe(bloc.id)
    expect(b.shootDay.shooting_bloc_id).toBe(bloc.id)
  })

  it('updateShootDay shoot_date recalculates bloc assignment', async () => {
    await makeDb()
    const { p, bloc } = await episodicProdWithBloc()
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: p.id,
      shootDate: '2025-06-05',
    })
    expect(shootDay.shooting_bloc_id).toBe(bloc.id)
    const moved = await updateShootDay(shootDay.id, { shoot_date: '2025-06-20' })
    expect(moved.shoot_date).toBe('2025-06-20')
    expect(moved.shooting_bloc_id).toBeNull()
  })

  it('moveShootDayToDate updates shooting_bloc_id', async () => {
    await makeDb()
    const { p } = await episodicProdWithBloc()
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: p.id,
      shootDate: '2025-06-02',
    })
    await moveShootDayToDate(shootDay.id, '2025-07-05')
    const after = await getShootDayById(shootDay.id)
    expect(after?.shoot_date).toBe('2025-07-05')
    expect(after?.shooting_bloc_id).toBeNull()
  })

  it('swapShootDays swaps dates and recalculates bloc ids', async () => {
    await makeDb()
    const { p, bloc } = await episodicProdWithBloc()
    const d1 = await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-06-02' })
    const d2 = await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-07-15' })
    expect(d1.shootDay.shooting_bloc_id).toBe(bloc.id)
    expect(d2.shootDay.shooting_bloc_id).toBeNull()
    await swapShootDays(d1.shootDay.id, d2.shootDay.id)
    const nd1 = await getShootDayById(d1.shootDay.id)
    const nd2 = await getShootDayById(d2.shootDay.id)
    expect(nd1?.shoot_date).toBe('2025-07-15')
    expect(nd2?.shoot_date).toBe('2025-06-02')
    expect(nd1?.shooting_bloc_id).toBeNull()
    expect(nd2?.shooting_bloc_id).toBe(bloc.id)
  })

  it('updateShootingBloc shrink deletes bloc-tagged shoot days outside new range', async () => {
    await makeDb()
    const { p, bloc } = await episodicProdWithBloc()
    const dIn = await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-06-05' })
    const dEdge = await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-06-10' })
    expect(dIn.shootDay.shooting_bloc_id).toBe(bloc.id)
    expect(dEdge.shootDay.shooting_bloc_id).toBe(bloc.id)
    await updateShootingBloc(bloc.id, { end_date: '2025-06-07' })
    const afterIn = await getShootDayById(dIn.shootDay.id)
    const afterEdge = await getShootDayById(dEdge.shootDay.id)
    expect(afterIn?.shooting_bloc_id).toBe(bloc.id)
    expect(afterEdge).toBeNull()
  })

  it('updateShootingBloc pure shift moves bloc-tagged shoot days by delta', async () => {
    await makeDb()
    const { p, bloc } = await episodicProdWithBloc()
    const d1 = await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-06-03' })
    const d2 = await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-06-04' })
    expect(d1.shootDay.shooting_bloc_id).toBe(bloc.id)
    await updateShootingBloc(bloc.id, {
      start_date: '2025-06-04',
      end_date: '2025-06-13',
    })
    const a1 = await getShootDayById(d1.shootDay.id)
    const a2 = await getShootDayById(d2.shootDay.id)
    expect(a1?.shoot_date).toBe('2025-06-06')
    expect(a1?.shooting_bloc_id).toBe(bloc.id)
    expect(a2?.shoot_date).toBe('2025-06-07')
    expect(a2?.shooting_bloc_id).toBe(bloc.id)
  })

  it('non-episodic production without blocs keeps null shooting_bloc_id', async () => {
    await makeDb()
    const p = await createProduction({ name: 'Film', notes: null }, { skipBudgetSeed: true })
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: p.id,
      shootDate: '2025-06-05',
    })
    expect(shootDay.shooting_bloc_id).toBeNull()
    expect(await findShootingBlocIdForProductionDate(p.id, '2025-06-05')).toBeNull()
  })

  it('validateShootingBlocForShootDay rejects bloc from another production', async () => {
    await makeDb()
    const p1 = await createProduction({ name: 'A', notes: null }, { skipBudgetSeed: true })
    const p2 = await createProduction({ name: 'B', notes: null }, { skipBudgetSeed: true })
    const b = await createShootingBloc({
      production_id: p1.id,
      name: 'X',
      start_date: '2025-01-01',
      end_date: '2025-01-05',
    })
    await expect(validateShootingBlocForShootDay(p2.id, b.id)).rejects.toThrow(/same production/)
  })

  it('listCalendarShootDayEvents exposes bloc id and name', async () => {
    await makeDb()
    const { p, bloc } = await episodicProdWithBloc()
    await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-06-03' })
    const events = await listCalendarShootDayEvents(p.id, { start: '2025-06-01', end: '2025-06-30' })
    expect(events.length).toBeGreaterThan(0)
    expect(events[0]!.shootingBlocId).toBe(bloc.id)
    expect(events[0]!.shootingBlocName).toBe('Block 1')
  })

  it('listCalendarShootDayEvents filters by shooting bloc and unassigned', async () => {
    await makeDb()
    const { p, bloc: bloc1 } = await episodicProdWithBloc()
    const bloc2 = await createShootingBloc({
      production_id: p.id,
      name: 'Block 2',
      start_date: '2025-06-11',
      end_date: '2025-06-20',
    })
    await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-06-03' })
    await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-06-15' })
    await createShootDayWithDefaultMainUnit({ productionId: p.id, shootDate: '2025-07-01' })

    const all = await listCalendarShootDayEvents(p.id, { start: '2025-06-01', end: '2025-07-31' })
    expect(all).toHaveLength(3)

    const inB1 = await listCalendarShootDayEvents(
      p.id,
      { start: '2025-06-01', end: '2025-07-31' },
      { shootingBlocFilter: bloc1.id }
    )
    expect(inB1).toHaveLength(1)
    expect(inB1[0]!.date).toBe('2025-06-03')
    expect(inB1[0]!.shootingBlocId).toBe(bloc1.id)

    const inB2 = await listCalendarShootDayEvents(
      p.id,
      { start: '2025-06-01', end: '2025-07-31' },
      { shootingBlocFilter: bloc2.id }
    )
    expect(inB2).toHaveLength(1)
    expect(inB2[0]!.date).toBe('2025-06-15')

    const unassigned = await listCalendarShootDayEvents(
      p.id,
      { start: '2025-06-01', end: '2025-07-31' },
      { shootingBlocFilter: 'unassigned' }
    )
    expect(unassigned).toHaveLength(1)
    expect(unassigned[0]!.date).toBe('2025-07-01')
    expect(unassigned[0]!.shootingBlocId).toBeNull()
  })
})
