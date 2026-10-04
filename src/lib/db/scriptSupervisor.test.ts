import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>
let dataSourceOverride: 'local_sqlite' | 'remote_server' | null = null

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

vi.mock('@/lib/db/projectDataSource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/projectDataSource')>()
  return {
    ...actual,
    getEffectiveDataSourceForProduction: vi.fn(async (id: string) =>
      dataSourceOverride ?? actual.getEffectiveDataSourceForProduction(id)
    ),
  }
})

import { createProduction } from '@/lib/db/repositories/production'
import { createScene, createShootDayWithDefaultMainUnit } from '@/lib/db/repositories/schedule'
import {
  SCRIPT_SUPERVISOR_REMOTE_ERROR,
  createSlate,
  createTake,
  listSlatesByScene,
  listSlatesByShootDay,
  listTakesBySlateIds,
  softDeleteSlate,
  updateSlate,
  updateTake,
} from '@/lib/db/repositories/scriptSupervisor'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function setup() {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  db.exec('PRAGMA foreign_keys = ON')
  dbAdapter = createSqlJsTauriAdapter(db)

  const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
  const scene = await createScene({ production_id: production.id, scene_number: '23' })
  const { shootDay: day1 } = await createShootDayWithDefaultMainUnit({
    productionId: production.id,
    shootDate: '2026-10-06',
  })
  const { shootDay: day2 } = await createShootDayWithDefaultMainUnit({
    productionId: production.id,
    shootDate: '2026-10-07',
  })
  return { production, scene, day1, day2 }
}

describe('script supervisor slates and takes (SS1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  it('numbers slates consecutively across shoot days, with separate unit series', async () => {
    const { production, scene, day1, day2 } = await setup()
    const base = { production_id: production.id, scene_id: scene.id }

    await createSlate({ ...base, shoot_day_id: day1.id, shot_type: 'master', shot_code: 'WS' })
    await createSlate({ ...base, shoot_day_id: day1.id, shot_type: 'single', shot_code: 'MS' })
    const day2First = await createSlate({ ...base, shoot_day_id: day2.id })
    const secondUnit = await createSlate({ ...base, shoot_day_id: day2.id, slate_prefix: 'x' })

    expect(day2First.slate_number).toBe(3)
    expect(secondUnit.slate_prefix).toBe('X')
    expect(secondUnit.slate_number).toBe(1)
    expect((await listSlatesByShootDay(day1.id)).map((s) => s.slate_number)).toEqual([1, 2])
    expect(await listSlatesByScene(scene.id)).toHaveLength(4)
  })

  it('rejects a live duplicate number but frees it once the slate is deleted', async () => {
    const { production, day1 } = await setup()
    const first = await createSlate({ production_id: production.id, shoot_day_id: day1.id, slate_number: 212 })

    await expect(
      createSlate({ production_id: production.id, shoot_day_id: day1.id, slate_number: 212 })
    ).rejects.toThrow('Slate 212 is already in use')

    const other = await createSlate({ production_id: production.id, shoot_day_id: day1.id })
    expect(other.slate_number).toBe(213)
    await expect(updateSlate(other.id, { slate_number: 212 })).rejects.toThrow('Slate 212 is already in use')

    await softDeleteSlate(first.id)
    const reused = await updateSlate(other.id, { slate_number: 212, lens: '50mm' })
    expect(reused.slate_number).toBe(212)
    expect(reused.lens).toBe('50mm')
  })

  it('logs takes in sequence, clears NG reasons off NG, and deletes takes with their slate', async () => {
    const { production, day1 } = await setup()
    const slate = await createSlate({ production_id: production.id, shoot_day_id: day1.id })

    const t1 = await createTake(slate.id, { status: 'ng', ng_reason: 'focus', duration_ms: 48_000 })
    const t2 = await createTake(slate.id, { duration_ms: 51_400 })
    expect([t1.take_number, t2.take_number]).toEqual([1, 2])
    expect(t1.ng_reason).toBe('focus')

    const printed = await updateTake(t1.id, { status: 'print' })
    expect(printed.status).toBe('print')
    expect(printed.ng_reason).toBeNull()

    await softDeleteSlate(slate.id)
    expect(await listTakesBySlateIds([slate.id])).toEqual([])
    expect(await listSlatesByShootDay(day1.id)).toEqual([])
  })

  it('refuses writes for server-published productions and shoot days from another production', async () => {
    const { production, day1 } = await setup()
    const other = await createProduction({ name: 'Other', notes: null }, { skipBudgetSeed: true })

    await expect(createSlate({ production_id: other.id, shoot_day_id: day1.id })).rejects.toThrow(
      'Shoot day belongs to a different production'
    )

    dataSourceOverride = 'remote_server'
    await expect(createSlate({ production_id: production.id, shoot_day_id: day1.id })).rejects.toThrow(
      SCRIPT_SUPERVISOR_REMOTE_ERROR
    )
  })
})
