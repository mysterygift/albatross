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
  createScene,
  createShootDayWithDefaultMainUnit,
  createShot,
  getShootDayById,
  listShootDaysByProduction,
} from '@/lib/db/repositories/schedule'
import {
  addUnitToShootDays,
  moveShootDayUnitToDate,
  reorderShootDayUnits,
  swapShootDayUnitRanks,
} from '@/lib/db/repositories/shoot-day-unit-ranks'
import { listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
import {
  createShotStrip,
  listStripsForDayUnit,
  updateCallWrapStripTime,
} from '@/lib/db/repositories/stripboard-strips'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { getCallSheetByShootDayAndUnit, upsertCallSheet } from '@/lib/db/repositories/call-sheets'
import { getRiskAssessment, saveRiskAssessment } from '@/lib/db/repositories/risk-assessments'

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
  db.exec('PRAGMA foreign_keys = ON')
  dbAdapter = createSqlJsTauriAdapter(db)
  return db
}

async function setup() {
  const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
  const scene = await createScene({ production_id: production.id, scene_number: '1' })
  return { production, scene }
}

/** Unit names on a day, in rank order, with each row's id. */
async function dayUnits(productionId: string, shootDayId: string) {
  const units = await listUnitsByProduction(productionId)
  const nameById = new Map(units.map((u) => [u.id, u.name]))
  return (await listShootDayUnitsByShootDay(shootDayId)).map((du) => ({ id: du.id, name: nameById.get(du.unit_id) }))
}

async function setCallTime(shootDayId: string, shootDayUnitId: string, time: string) {
  const call = (await listStripsForDayUnit(shootDayId, shootDayUnitId)).find((s) => s.strip_type === 'CALL')!
  await updateCallWrapStripTime(call.id, time)
}

async function unitCount(table: string): Promise<number> {
  const rows = await dbAdapter.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM ${table}`)
  return Number(rows[0]!.n)
}

describe('moveShootDayUnitToDate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('makes a Main Unit moved onto a day with a Main Unit its Second Unit, and promotes the unit left behind', async () => {
    await makeDb()
    const { production, scene } = await setup()
    const dayA = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-01' })
    const dayB = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-03' })
    const { linkedShootDayUnitIds } = await addUnitToShootDays({
      productionId: production.id,
      shootDayIds: [dayA.shootDay.id],
    })
    const secondOnA = linkedShootDayUnitIds[0]!
    await setCallTime(dayA.shootDay.id, dayA.shootDayUnitId, '07:00')
    await setCallTime(dayA.shootDay.id, secondOnA, '09:30')
    await setCallTime(dayB.shootDay.id, dayB.shootDayUnitId, '06:00')
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    const strip = await createShotStrip(production.id, shot.id, dayA.shootDay.id, dayA.shootDayUnitId)
    await upsertCallSheet({
      production_id: production.id,
      shoot_day_id: dayA.shootDay.id,
      shoot_day_unit_id: dayA.shootDayUnitId,
    })
    const unitsBefore = await unitCount('units')

    const result = await moveShootDayUnitToDate({
      shootDayUnitId: dayA.shootDayUnitId,
      targetDate: '2026-06-03',
    })

    expect(result).toEqual({
      status: 'moved',
      shootDayId: dayB.shootDay.id,
      unitName: 'Second Unit',
      movedWholeDay: false,
    })
    expect(await dayUnits(production.id, dayB.shootDay.id)).toEqual([
      { id: dayB.shootDayUnitId, name: 'Main Unit' },
      { id: dayA.shootDayUnitId, name: 'Second Unit' },
    ])
    expect(await dayUnits(production.id, dayA.shootDay.id)).toEqual([{ id: secondOnA, name: 'Main Unit' }])

    // Strips and the call sheet travel with the unit.
    const moved = await listStripsForDayUnit(dayB.shootDay.id, dayA.shootDayUnitId)
    expect(moved.map((s) => s.id)).toContain(strip.id)
    expect(moved.every((s) => s.shoot_day_id === dayB.shootDay.id)).toBe(true)
    expect(await getCallSheetByShootDayAndUnit(dayB.shootDay.id, dayA.shootDayUnitId)).not.toBeNull()

    // Each day's call time mirrors its (new) Main Unit.
    expect((await getShootDayById(dayA.shootDay.id))?.call_time).toBe('09:30')
    expect((await getShootDayById(dayB.shootDay.id))?.call_time).toBe('06:00')

    // Throwaway units used for the rank shuffle are gone.
    expect(await unitCount('units')).toBe(unitsBefore)
  })

  it('creates a shoot day for a unit moved to an empty date, as its Main Unit', async () => {
    await makeDb()
    const { production } = await setup()
    const dayA = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-05' })
    const { linkedShootDayUnitIds } = await addUnitToShootDays({
      productionId: production.id,
      shootDayIds: [dayA.shootDay.id],
    })

    const result = await moveShootDayUnitToDate({
      shootDayUnitId: linkedShootDayUnitIds[0]!,
      targetDate: '2026-06-02',
    })

    expect(result.status).toBe('moved')
    const days = await listShootDaysByProduction(production.id)
    expect(days.map((d) => [d.shoot_date, d.day_number])).toEqual([
      ['2026-06-02', 1],
      ['2026-06-05', 2],
    ])
    const newDay = days.find((d) => d.shoot_date === '2026-06-02')!
    expect(await dayUnits(production.id, newDay.id)).toEqual([{ id: linkedShootDayUnitIds[0]!, name: 'Main Unit' }])
    expect(await dayUnits(production.id, dayA.shootDay.id)).toEqual([{ id: dayA.shootDayUnitId, name: 'Main Unit' }])
  })

  it('moves the whole day when its only unit goes to an empty date', async () => {
    await makeDb()
    const { production } = await setup()
    const dayA = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-05' })

    const result = await moveShootDayUnitToDate({ shootDayUnitId: dayA.shootDayUnitId, targetDate: '2026-06-09' })

    expect(result).toMatchObject({ status: 'moved', shootDayId: dayA.shootDay.id, movedWholeDay: true })
    expect((await getShootDayById(dayA.shootDay.id))?.shoot_date).toBe('2026-06-09')
  })

  it('asks before emptying a day, then deletes or keeps it as chosen', async () => {
    await makeDb()
    const { production } = await setup()
    const dayA = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-01' })
    const dayB = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-02' })
    const dayC = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-03' })

    const asked = await moveShootDayUnitToDate({ shootDayUnitId: dayA.shootDayUnitId, targetDate: '2026-06-02' })
    expect(asked).toEqual({
      status: 'needs_source_decision',
      sourceShootDayId: dayA.shootDay.id,
      targetShootDayId: dayB.shootDay.id,
    })
    expect(await dayUnits(production.id, dayB.shootDay.id)).toHaveLength(1)

    await moveShootDayUnitToDate({
      shootDayUnitId: dayA.shootDayUnitId,
      targetDate: '2026-06-02',
      emptiedSourceDay: 'delete',
    })
    expect(await getShootDayById(dayA.shootDay.id)).toBeNull()
    expect((await dayUnits(production.id, dayB.shootDay.id)).map((u) => u.name)).toEqual(['Main Unit', 'Second Unit'])

    await moveShootDayUnitToDate({
      shootDayUnitId: dayC.shootDayUnitId,
      targetDate: '2026-06-02',
      emptiedSourceDay: 'keep',
    })
    expect((await dayUnits(production.id, dayB.shootDay.id)).map((u) => u.name)).toEqual([
      'Main Unit',
      'Second Unit',
      'Third Unit',
    ])
    const keptUnits = await dayUnits(production.id, dayC.shootDay.id)
    expect(keptUnits.map((u) => u.name)).toEqual(['Main Unit'])
    expect(keptUnits[0]!.id).not.toBe(dayC.shootDayUnitId)
    const keptStrips = await listStripsForDayUnit(dayC.shootDay.id, keptUnits[0]!.id)
    expect(keptStrips.map((s) => s.strip_type).sort()).toEqual(['CALL', 'WRAP'])
  })

  it('refuses a day that already runs five units', async () => {
    await makeDb()
    const { production } = await setup()
    const full = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-01' })
    for (let i = 0; i < 4; i++) {
      await addUnitToShootDays({ productionId: production.id, shootDayIds: [full.shootDay.id] })
    }
    const other = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-02' })
    await addUnitToShootDays({ productionId: production.id, shootDayIds: [other.shootDay.id] })

    await expect(
      moveShootDayUnitToDate({ shootDayUnitId: other.shootDayUnitId, targetDate: '2026-06-01' })
    ).rejects.toThrow(/TARGET_DAY_FULL/)
    expect(await dayUnits(production.id, other.shootDay.id)).toHaveLength(2)
  })

  it('drops the moved unit from the old day\'s RAMS', async () => {
    await makeDb()
    const { production } = await setup()
    const dayA = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-01' })
    const dayB = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-02' })
    const { linkedShootDayUnitIds } = await addUnitToShootDays({
      productionId: production.id,
      shootDayIds: [dayA.shootDay.id],
    })
    const rams = await saveRiskAssessment({
      production_id: production.id,
      shoot_day_id: dayA.shootDay.id,
      shoot_day_unit_ids: [dayA.shootDayUnitId, linkedShootDayUnitIds[0]!],
      hazards: [],
    })

    await moveShootDayUnitToDate({ shootDayUnitId: linkedShootDayUnitIds[0]!, targetDate: '2026-06-02' })

    expect((await getRiskAssessment(rams.id))?.shoot_day_unit_ids).toEqual([dayA.shootDayUnitId])
    expect((await dayUnits(production.id, dayB.shootDay.id)).map((u) => u.name)).toEqual(['Main Unit', 'Second Unit'])
  })
})

describe('swapShootDayUnitRanks / reorderShootDayUnits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('swaps Main and Second Unit, keeping each unit\'s strips and re-mirroring the call time', async () => {
    await makeDb()
    const { production, scene } = await setup()
    const day = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-01' })
    const { linkedShootDayUnitIds } = await addUnitToShootDays({
      productionId: production.id,
      shootDayIds: [day.shootDay.id],
    })
    const second = linkedShootDayUnitIds[0]!
    await setCallTime(day.shootDay.id, day.shootDayUnitId, '07:00')
    await setCallTime(day.shootDay.id, second, '05:45')
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    const strip = await createShotStrip(production.id, shot.id, day.shootDay.id, second)

    await swapShootDayUnitRanks(second, day.shootDayUnitId)

    expect(await dayUnits(production.id, day.shootDay.id)).toEqual([
      { id: second, name: 'Main Unit' },
      { id: day.shootDayUnitId, name: 'Second Unit' },
    ])
    expect((await listStripsForDayUnit(day.shootDay.id, second)).map((s) => s.id)).toContain(strip.id)
    expect((await getShootDayById(day.shootDay.id))?.call_time).toBe('05:45')
  })

  it('reorders five units in one go', async () => {
    await makeDb()
    const { production } = await setup()
    const day = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-01' })
    for (let i = 0; i < 4; i++) {
      await addUnitToShootDays({ productionId: production.id, shootDayIds: [day.shootDay.id] })
    }
    const before = await dayUnits(production.id, day.shootDay.id)
    const reversed = [...before].reverse().map((u) => u.id)

    await reorderShootDayUnits(day.shootDay.id, reversed)

    const after = await dayUnits(production.id, day.shootDay.id)
    expect(after.map((u) => u.id)).toEqual(reversed)
    expect(after.map((u) => u.name)).toEqual(['Main Unit', 'Second Unit', 'Third Unit', 'Fourth Unit', 'Fifth Unit'])
  })

  it('rejects an order that does not list every unit on the day', async () => {
    await makeDb()
    const { production } = await setup()
    const day = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-06-01' })
    await addUnitToShootDays({ productionId: production.id, shootDayIds: [day.shootDay.id] })

    await expect(reorderShootDayUnits(day.shootDay.id, [day.shootDayUnitId])).rejects.toThrow(/UNIT_ORDER_MISMATCH/)
  })
})
