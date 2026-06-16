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
  createShootDayWithDefaultMainUnit,
} from '@/lib/db/repositories/schedule'
import { listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
import { listStripsForDayUnit } from '@/lib/db/repositories/stripboard-strips'
import { createUnit, listUnitsByProduction } from '@/lib/db/repositories/units'

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

describe('addSecondUnitToShootDays', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates Second Unit, links a single day, and seeds CALL/WRAP strips', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })

    const result = await addSecondUnitToShootDays({
      productionId: production.id,
      shootDayIds: [shootDay.id],
    })

    const units = await listUnitsByProduction(production.id)
    expect(units.some((u) => u.name === 'Second Unit')).toBe(true)
    expect(result.linkedShootDayUnitIds).toHaveLength(1)

    const dayUnits = await listShootDayUnitsByShootDay(shootDay.id)
    expect(dayUnits).toHaveLength(2)

    const secondDayUnit = dayUnits.find((du) => du.id === result.linkedShootDayUnitIds[0])
    expect(secondDayUnit).toBeTruthy()
    const strips = await listStripsForDayUnit(shootDay.id, secondDayUnit!.id)
    expect(strips.some((s) => s.strip_type === 'CALL')).toBe(true)
    expect(strips.some((s) => s.strip_type === 'WRAP')).toBe(true)
  })

  it('links multiple shoot days in one call', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const day1 = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    const day2 = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-02',
    })

    const result = await addSecondUnitToShootDays({
      productionId: production.id,
      shootDayIds: [day1.shootDay.id, day2.shootDay.id],
    })

    expect(result.linkedShootDayUnitIds).toHaveLength(2)
    for (const shootDayId of [day1.shootDay.id, day2.shootDay.id]) {
      const dayUnits = await listShootDayUnitsByShootDay(shootDayId)
      expect(dayUnits).toHaveLength(2)
    }
  })

  it('is idempotent when second unit is already linked to a day', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })

    const first = await addSecondUnitToShootDays({
      productionId: production.id,
      shootDayIds: [shootDay.id],
    })
    const second = await addSecondUnitToShootDays({
      productionId: production.id,
      shootDayIds: [shootDay.id],
    })

    expect(first.linkedShootDayUnitIds).toHaveLength(1)
    expect(second.linkedShootDayUnitIds).toHaveLength(0)
    const dayUnits = await listShootDayUnitsByShootDay(shootDay.id)
    expect(dayUnits).toHaveLength(2)
  })

  it('reuses an existing second unit instead of creating a duplicate', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const importedSecond = await createUnit({ production_id: production.id, name: '2nd Unit' })
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })

    const result = await addSecondUnitToShootDays({
      productionId: production.id,
      shootDayIds: [shootDay.id],
    })

    expect(result.secondUnitId).toBe(importedSecond.id)
    const units = await listUnitsByProduction(production.id)
    expect(units.filter((u) => u.name.toLowerCase().includes('2nd') || u.name.toLowerCase().includes('second'))).toHaveLength(1)
  })

  it('rejects invalid shoot day ids', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const otherProduction = await createProduction({ name: 'Other', notes: null }, { skipBudgetSeed: true })
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: otherProduction.id,
      shootDate: '2026-06-01',
    })

    await expect(
      addSecondUnitToShootDays({
        productionId: production.id,
        shootDayIds: [shootDay.id],
      })
    ).rejects.toThrow(/INVALID_SHOOT_DAY/)
  })
})
