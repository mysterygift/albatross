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
  addSecondUnitToShootDays,
  createScene,
  createShootDayWithDefaultMainUnit,
  createShot,
} from '@/lib/db/repositories/schedule'
import { listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
import {
  createShotStrip,
  listStripsByShootDay,
  listUnscheduledShots,
  removeSecondUnitFromShootDay,
} from '@/lib/db/repositories/stripboard-strips'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { sortShootDayUnitsForDisplay } from '@/lib/schedule/unitKey'

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

describe('removeSecondUnitFromShootDay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('moves scheduled shots to unscheduled and removes the second unit column', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    const { linkedShootDayUnitIds } = await addSecondUnitToShootDays({
      productionId: production.id,
      shootDayIds: [shootDay.id],
    })
    const secondDayUnitId = linkedShootDayUnitIds[0]!
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    const shotStrip = await createShotStrip(production.id, shot.id, shootDay.id, secondDayUnitId)

    await removeSecondUnitFromShootDay(secondDayUnitId)

    const dayUnits = await listShootDayUnitsByShootDay(shootDay.id)
    expect(dayUnits).toHaveLength(1)

    const unscheduled = await listUnscheduledShots(production.id)
    expect(unscheduled.some((u) => u.shot.id === shot.id)).toBe(true)

    const stripsOnDay = await listStripsByShootDay(shootDay.id)
    expect(stripsOnDay.some((s) => s.id === shotStrip.id)).toBe(false)
  })

  it('rejects removing main unit', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const { shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })

    await expect(removeSecondUnitFromShootDay(shootDayUnitId)).rejects.toThrow(/CANNOT_REMOVE_MAIN_UNIT/)
  })
})

describe('sortShootDayUnitsForDisplay', () => {
  it('orders main unit before second unit', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await addSecondUnitToShootDays({
      productionId: production.id,
      shootDayIds: [shootDay.id],
    })

    const units = await listUnitsByProduction(production.id)
    const unitsById = new Map(units.map((u) => [u.id, u]))
    const dayUnits = await listShootDayUnitsByShootDay(shootDay.id)
    const sorted = sortShootDayUnitsForDisplay(dayUnits, unitsById)

    expect(sorted).toHaveLength(2)
    const mainUnit = units.find((u) => u.name === 'Main Unit')!
    const secondUnit = units.find((u) => u.name === 'Second Unit')!
    expect(sorted[0]!.unit_id).toBe(mainUnit.id)
    expect(sorted[1]!.unit_id).toBe(secondUnit.id)
  })
})
