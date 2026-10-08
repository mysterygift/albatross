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
import { createShootDayWithDefaultMainUnit } from '@/lib/db/repositories/schedule'
import { addUnitToShootDays } from '@/lib/db/repositories/shoot-day-unit-ranks'
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

async function unitNamesOnDay(productionId: string, shootDayId: string): Promise<string[]> {
  const units = await listUnitsByProduction(productionId)
  const nameById = new Map(units.map((u) => [u.id, u.name]))
  return (await listShootDayUnitsByShootDay(shootDayId)).map((du) => nameById.get(du.unit_id) ?? '?')
}

describe('addUnitToShootDays', () => {
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

    const result = await addUnitToShootDays({
      productionId: production.id,
      shootDayIds: [shootDay.id],
    })

    const units = await listUnitsByProduction(production.id)
    expect(units.some((u) => u.name === 'Second Unit')).toBe(true)
    expect(result.linkedShootDayUnitIds).toHaveLength(1)
    expect(result.skippedFullShootDayIds).toEqual([])

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

    const result = await addUnitToShootDays({
      productionId: production.id,
      shootDayIds: [day1.shootDay.id, day2.shootDay.id],
    })

    expect(result.linkedShootDayUnitIds).toHaveLength(2)
    for (const shootDayId of [day1.shootDay.id, day2.shootDay.id]) {
      const dayUnits = await listShootDayUnitsByShootDay(shootDayId)
      expect(dayUnits).toHaveLength(2)
    }
  })

  it('adds the next unit each time, up to Fifth Unit, then skips the full day', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })

    for (let i = 0; i < 4; i++) {
      const result = await addUnitToShootDays({ productionId: production.id, shootDayIds: [shootDay.id] })
      expect(result.linkedShootDayUnitIds).toHaveLength(1)
    }
    expect(await unitNamesOnDay(production.id, shootDay.id)).toEqual([
      'Main Unit',
      'Second Unit',
      'Third Unit',
      'Fourth Unit',
      'Fifth Unit',
    ])

    const full = await addUnitToShootDays({ productionId: production.id, shootDayIds: [shootDay.id] })
    expect(full.linkedShootDayUnitIds).toHaveLength(0)
    expect(full.skippedFullShootDayIds).toEqual([shootDay.id])
    expect(await listShootDayUnitsByShootDay(shootDay.id)).toHaveLength(5)
  })

  it('reuses an existing second unit instead of creating a duplicate', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const importedSecond = await createUnit({ production_id: production.id, name: '2nd Unit' })
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })

    const result = await addUnitToShootDays({
      productionId: production.id,
      shootDayIds: [shootDay.id],
    })

    const dayUnits = await listShootDayUnitsByShootDay(shootDay.id)
    expect(dayUnits.find((du) => du.id === result.linkedShootDayUnitIds[0])?.unit_id).toBe(importedSecond.id)
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
      addUnitToShootDays({
        productionId: production.id,
        shootDayIds: [shootDay.id],
      })
    ).rejects.toThrow(/INVALID_SHOOT_DAY/)
  })
})
