import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'

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
        db: { execute: (sql: string, bindValues?: unknown[]) => Promise<unknown> },
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
          if (open) await db.execute('ROLLBACK', []).catch(() => undefined)
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

import {
  CREW_HOURS_REMOTE_ERROR,
  getCrewHoursSettings,
  listCrewDayHours,
  listLabourDayRates,
  listOvertimeExemptPersonIds,
  saveCrewHoursSettings,
  setCrewDayTimes,
  setOvertimeExempt,
} from '@/lib/db/repositories/crewHours'
import { resolveBudgetRevisionId } from '@/lib/db/repositories/budgetRevisions'
import { DEFAULT_CREW_HOURS_SETTINGS } from '@/lib/crew-hours/crewHours'

const P = 'prod-toothpick'
const OTHER = 'prod-other'
const DAY3 = 'day-3'
const TS = '2026-11-04T20:30:00.000Z'

async function count(table: string, where = '1=1', binds: unknown[] = []): Promise<number> {
  const rows = await dbAdapter.select<Array<{ c: number }>>(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`, binds)
  return Number(rows[0]!.c)
}

describe('crew hours repository', () => {
  beforeEach(async () => {
    const SQL = await initSqlJs({})
    const raw = new SQL.Database()
    applyAlbatrossMigrationsSqlJs(raw)
    dbAdapter = createSqlJsTauriAdapter(raw)
    dataSourceOverride = null
    for (const id of [P, OTHER]) {
      await dbAdapter.execute(`INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, $1, $2, $2)`, [id, TS])
    }
    await dbAdapter.execute(
      `INSERT INTO shoot_days (id, production_id, shoot_date, day_number, call_time, wrap_time, created_at, updated_at)
       VALUES ($1, $2, '2026-11-04', 3, '08:00', '20:00', $3, $3)`,
      [DAY3, P, TS]
    )
    for (const [id, prod, name] of [
      ['gaffer', P, 'Giorgos Papadakis'],
      ['dit', P, 'Mateusz Zielinski'],
      ['director', P, 'Teodora Vasile'],
      ['stranger', OTHER, 'Someone Else'],
    ] as const) {
      await dbAdapter.execute(
        `INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at) VALUES ($1, $2, $3, 0, $4, $4)`,
        [id, prod, name, TS]
      )
    }
  })

  describe('overtime rule', () => {
    it('defaults until saved, then round-trips', async () => {
      expect(await getCrewHoursSettings(P)).toEqual(DEFAULT_CREW_HOURS_SETTINGS)
      const next = { ...DEFAULT_CREW_HOURS_SETTINGS, overtime_basis: 'day_length' as const, overtime_increment_minutes: 15 }
      expect(await saveCrewHoursSettings(P, next)).toEqual(next)
      await saveCrewHoursSettings(P, { ...next, overtime_multiplier: 2 })
      expect((await getCrewHoursSettings(P)).overtime_multiplier).toBe(2)
      expect(await count('production_crew_hours_settings')).toBe(1)
      expect(await count('outbox', `entity = 'production_crew_hours_settings'`)).toBe(2)
    })

    it('rejects nonsense', async () => {
      await expect(saveCrewHoursSettings(P, { ...DEFAULT_CREW_HOURS_SETTINGS, hourly_rate_divisor: 0 })).rejects.toThrow(/divisor/)
      await expect(saveCrewHoursSettings(P, { ...DEFAULT_CREW_HOURS_SETTINGS, overtime_increment_minutes: Number.NaN })).rejects.toThrow(/Billing/)
      expect(await count('production_crew_hours_settings')).toBe(0)
    })
  })

  describe('per-person times', () => {
    it('records a late wrap, patches it, and removes the row when back to the unit', async () => {
      const row = await setCrewDayTimes({ productionId: P, shootDayId: DAY3, personId: 'gaffer', wrapTime: '2115' })
      expect(row).toMatchObject({ call_time: null, wrap_time: '21:15' })

      await setCrewDayTimes({ productionId: P, shootDayId: DAY3, personId: 'gaffer', callTime: '07:30' })
      const [patched] = await listCrewDayHours([DAY3])
      expect(patched).toMatchObject({ person_id: 'gaffer', call_time: '07:30', wrap_time: '21:15' })

      expect(await setCrewDayTimes({ productionId: P, shootDayId: DAY3, personId: 'gaffer', callTime: null, wrapTime: '' })).toBeNull()
      expect(await listCrewDayHours([DAY3])).toEqual([])
      expect(await count('crew_day_hours', `deleted_at IS NOT NULL`)).toBe(1)

      // A fresh row can be recorded again after the reset (the unique index only covers live rows).
      await setCrewDayTimes({ productionId: P, shootDayId: DAY3, personId: 'gaffer', wrapTime: '21:30' })
      expect(await listCrewDayHours([DAY3])).toHaveLength(1)
      expect(await count('outbox', `entity = 'crew_day_hours'`)).toBe(4)
    })

    it('rejects bad times and people or days from another production', async () => {
      await expect(
        setCrewDayTimes({ productionId: P, shootDayId: DAY3, personId: 'dit', wrapTime: '25:00' })
      ).rejects.toThrow(/not a time/)
      await expect(
        setCrewDayTimes({ productionId: P, shootDayId: DAY3, personId: 'stranger', wrapTime: '21:00' })
      ).rejects.toThrow(/different production/)
      await expect(
        setCrewDayTimes({ productionId: OTHER, shootDayId: DAY3, personId: 'stranger', wrapTime: '21:00' })
      ).rejects.toThrow(/different production/)
      expect(await count('crew_day_hours')).toBe(0)
    })

    it('is local only', async () => {
      dataSourceOverride = 'remote_server'
      await expect(
        setCrewDayTimes({ productionId: P, shootDayId: DAY3, personId: 'dit', wrapTime: '21:10' })
      ).rejects.toThrow(CREW_HOURS_REMOTE_ERROR)
      await expect(setOvertimeExempt(P, 'director', true)).rejects.toThrow(CREW_HOURS_REMOTE_ERROR)
    })
  })

  it('toggles buyouts', async () => {
    await setOvertimeExempt(P, 'director', true)
    expect([...(await listOvertimeExemptPersonIds(P))]).toEqual(['director'])
    await setOvertimeExempt(P, 'director', false)
    expect((await listOvertimeExemptPersonIds(P)).size).toBe(0)
  })

  it('reads day rates from labour line items in the live revision', async () => {
    const revisionId = await resolveBudgetRevisionId({ productionId: P })
    const lines: Array<[string, string, Record<string, unknown>]> = [
      ['li-gaffer', 'Gaffer', { person_id: 'gaffer', labour_rate_type: 'shoot_day', rate_per_day: 250 }],
      ['li-gaffer-ot', 'Gaffer overtime', { person_id: 'gaffer', labour_rate_type: 'overtime', rate_per_day: 900 }],
      ['li-dit', 'DIT', { person_id: 'dit', labour_rate_type: 'shoot_day', rate_per_day: 210 }],
      ['li-unassigned', 'Spark', { person_id: null, labour_rate_type: 'shoot_day', rate_per_day: 180 }],
    ]
    for (const [id, description, details] of lines) {
      await dbAdapter.execute(
        `INSERT INTO budget_items (id, production_id, budget_revision_id, description, line_item_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'labour', $5, $5)`,
        [id, P, revisionId, description, TS]
      )
      await dbAdapter.execute(
        `INSERT INTO budget_item_details (id, budget_item_id, line_item_type, details_json, created_at, updated_at)
         VALUES ($1, $2, 'labour', $3, $4, $4)`,
        [`d-${id}`, id, JSON.stringify(details), TS]
      )
    }
    expect(Object.fromEntries(await listLabourDayRates(P))).toEqual({ gaffer: 250, dit: 210 })
  })

  it('cascades when a production is deleted', async () => {
    await setCrewDayTimes({ productionId: P, shootDayId: DAY3, personId: 'gaffer', wrapTime: '21:15' })
    await setOvertimeExempt(P, 'director', true)
    await saveCrewHoursSettings(P, DEFAULT_CREW_HOURS_SETTINGS)
    await dbAdapter.execute('PRAGMA foreign_keys = ON', [])
    await dbAdapter.execute(`DELETE FROM productions WHERE id = $1`, [P])
    expect(await count('crew_day_hours')).toBe(0)
    expect(await count('crew_hours_person_settings')).toBe(0)
    expect(await count('production_crew_hours_settings')).toBe(0)
  })
})
