import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'

import { setDbAdapterForTests } from '@/lib/db/client'
import { OptimisticConcurrencyConflictError } from '@/lib/db/concurrency'
import { createBudgetCategory, createBudgetItem, listBudgetItemsByProduction, updateBudgetItem } from '@/lib/db/repositories/budget'
import {
  getOrCreateLiveBudgetRevisionIdForProduction,
  listBudgetRevisionsByProduction,
  setLiveBudgetRevisionForProduction,
} from '@/lib/db/repositories/budgetRevisions'
import { createBooking, listBookingsByProduction } from '@/lib/db/repositories/booking'
import { listCostReportGroups } from '@/lib/db/repositories/costReportGroups'
import { listPeopleByProduction, createPerson } from '@/lib/db/repositories/person'
import { createProduction, getProductionById, updateProduction } from '@/lib/db/repositories/production'
import {
  createScene,
  createShootDayWithDefaultMainUnit,
  createShot,
  listScenesByProduction,
  listShootDaysByProduction,
  listShotsByProduction,
  updateScene,
  updateShot,
  updateShootDay,
} from '@/lib/db/repositories/schedule'
import {
  createShotStrip,
  listStripsByProduction,
  reorderStrip,
} from '@/lib/db/repositories/stripboard-strips'
import { getStoryboardBundleForShotList } from '@/lib/db/repositories/storyboard'
import { createPostgresRepoHarness } from '@/test/postgres/postgresRepositoryHarness'
import { resolvePostgresTestConfig } from '@/test/postgres/pgTestEnv'

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => undefined),
  writeTextFile: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}))

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]!
}

describe('postgres phase 6 performance and concurrency hardening', () => {
  let connectionError: string | null = null

  beforeAll(async () => {
    const client = new Client(await resolvePostgresTestConfig())
    try {
      await client.connect()
    } catch (error) {
      connectionError = error instanceof Error ? error.message : String(error)
    } finally {
      await client.end().catch(() => undefined)
    }
  })

  afterEach(() => {
    setDbAdapterForTests(null)
  })

  it('runs repeatable multi-user load scenarios with operation latency SLOs and pool/lock metrics', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 6 load assertions: ${connectionError}`)
      return
    }

    const harness = await createPostgresRepoHarness('pg_phase6_load')
    setDbAdapterForTests(harness.adapter)
    try {
      const users = Number(process.env.PG_PHASE6_USERS ?? '6')
      const durationMs = Number(process.env.PG_PHASE6_DURATION_MS ?? '5000')
      const writeEveryN = Number(process.env.PG_PHASE6_WRITE_RATIO_DIVISOR ?? '4')

      const production = await createProduction({ name: 'Demo: North Shore - Phase 6', notes: 'phase6' }, { skipBudgetSeed: true })
      const category = await createBudgetCategory({
        production_id: production.id,
        code: 'ATL',
        name: 'Above The Line',
      })
      await getOrCreateLiveBudgetRevisionIdForProduction(production.id)

      const shootDays: string[] = []
      const budgetItemIds: string[] = []

      for (let d = 0; d < 6; d++) {
        const shootDate = `2026-08-${String(d + 1).padStart(2, '0')}`
        const day = await createShootDayWithDefaultMainUnit({
          productionId: production.id,
          shootDate,
          callTime: '07:00',
          wrapTime: '18:00',
        })
        shootDays.push(day.shootDay.id)
      }

      for (let s = 0; s < 40; s++) {
        const scene = await createScene({
          production_id: production.id,
          scene_number: String(s + 1).padStart(3, '0'),
          heading: `EXT. COAST ROAD - ${s + 1}`,
          description: 'North Shore load data',
        })
        for (let sh = 0; sh < 4; sh++) {
          const shot = await createShot({
            scene_id: scene.id,
            shot_number: String(sh + 1),
            shot_description: `Scene ${scene.scene_number} shot ${sh + 1}`,
            estimated_shoot_minutes: 10 + sh,
          })
          const dayIdx = (s + sh) % shootDays.length
          const dayId = shootDays[dayIdx]!
          const dayUnits = await harness.adapter.select<Array<{ id: string }>>(
            'SELECT id FROM shoot_day_units WHERE shoot_day_id = $1 AND deleted_at IS NULL ORDER BY id ASC LIMIT 1',
            [dayId]
          )
          const strip = await createShotStrip(production.id, shot.shot.id, dayId, dayUnits[0]!.id)
          void strip
        }
      }

      for (let i = 0; i < 120; i++) {
        const item = await createBudgetItem({
          production_id: production.id,
          category_id: category.id,
          description: `Budget line ${i + 1}`,
          estimated_cost: 200 + i,
        })
        budgetItemIds.push(item.id)
      }

      for (let i = 0; i < 40; i++) {
        const person = await createPerson({
          production_id: production.id,
          name: `Crew ${i + 1}`,
          is_cast: 0,
          department: 'camera',
        })
        await createBooking({
          production_id: production.id,
          person_id: person.id,
          shoot_day_id: shootDays[i % shootDays.length],
          start_date: '2026-08-01',
          end_date: '2026-08-12',
          role: 'crew',
        })
      }

      type ScenarioStat = { durations: number[]; errors: number }
      const scenarioStats = new Map<string, ScenarioStat>()

      async function timed(name: string, fn: () => Promise<void>): Promise<void> {
        const start = performance.now()
        try {
          await fn()
          const durationMs = performance.now() - start
          const stat = scenarioStats.get(name) ?? { durations: [], errors: 0 }
          stat.durations.push(durationMs)
          scenarioStats.set(name, stat)
        } catch (error) {
          const stat = scenarioStats.get(name) ?? { durations: [], errors: 0 }
          stat.errors += 1
          scenarioStats.set(name, stat)
        }
      }

      const readOps: Array<{ name: string; run: () => Promise<void> }> = [
        { name: 'open_project_shell', run: async () => { await getProductionById(production.id); await listShootDaysByProduction(production.id) } },
        { name: 'list_scenes_and_shots', run: async () => { await listScenesByProduction(production.id); await listShotsByProduction(production.id) } },
        { name: 'load_schedule_stripboard', run: async () => { await listShootDaysByProduction(production.id); await listStripsByProduction(production.id) } },
        { name: 'load_budget_overview', run: async () => { await listBudgetItemsByProduction(production.id) } },
        { name: 'load_cost_report_revision', run: async () => { await listBudgetRevisionsByProduction(production.id); await listCostReportGroups(production.id) } },
        { name: 'load_storyboard_bundle', run: async () => { await getStoryboardBundleForShotList(production.id) } },
        { name: 'load_people_bookings', run: async () => { await listPeopleByProduction(production.id); await listBookingsByProduction(production.id) } },
      ]

      const writeOps: Array<{ name: string; run: () => Promise<void> }> = [
        {
          name: 'update_production_metadata',
          run: async () => {
            const current = await getProductionById(production.id)
            if (!current) return
            await updateProduction(production.id, { notes: `phase6-${Date.now()}` }, { expectedUpdatedAt: current.updated_at })
          },
        },
        {
          name: 'update_scene',
          run: async () => {
            const scene = await listScenesByProduction(production.id).then((rows) => rows[Math.floor(Math.random() * rows.length)])
            if (!scene) return
            await updateScene(scene.id, { heading: `${scene.heading ?? 'EXT'} / updated` }, { expectedUpdatedAt: scene.updated_at })
          },
        },
        {
          name: 'update_shot',
          run: async () => {
            const shots = await listShotsByProduction(production.id)
            const shot = shots[Math.floor(Math.random() * shots.length)]
            if (!shot) return
            await updateShot(shot.id, { notes: `n${Date.now()}` }, { expectedUpdatedAt: shot.updated_at })
          },
        },
        {
          name: 'reorder_stripboard_strip',
          run: async () => {
            const strips = await listStripsByProduction(production.id)
            const strip = strips[Math.floor(Math.random() * strips.length)]
            if (!strip) return
            await reorderStrip(strip.id, strip.sort_index + 1, { expectedUpdatedAt: strip.updated_at })
          },
        },
        {
          name: 'update_shoot_day_data',
          run: async () => {
            const days = await listShootDaysByProduction(production.id)
            const day = days[Math.floor(Math.random() * days.length)]
            if (!day) return
            await updateShootDay(day.id, { notes: `load-${Date.now()}` }, { expectedUpdatedAt: day.updated_at })
          },
        },
        {
          name: 'update_budget_item',
          run: async () => {
            const itemId = budgetItemIds[Math.floor(Math.random() * budgetItemIds.length)]
            const current = await harness.adapter.select<Array<{ updated_at: string }>>(
              'SELECT updated_at FROM budget_items WHERE id = $1',
              [itemId]
            )
            if (!current[0]) return
            await updateBudgetItem(
              itemId,
              { estimated_cost: Math.round(Math.random() * 10000) / 100 },
              { expectedUpdatedAt: current[0].updated_at }
            )
          },
        },
      ]

      const start = Date.now()
      const workers = Array.from({ length: users }).map(async (_, idx) => {
        let tick = 0
        while (Date.now() - start < durationMs) {
          const pickWrite = (tick + idx) % writeEveryN === 0
          const opPool = pickWrite ? writeOps : readOps
          const op = opPool[Math.floor(Math.random() * opPool.length)]!
          await timed(op.name, op.run)
          tick += 1
        }
      })
      await Promise.all(workers)

      const rows = [...scenarioStats.entries()].map(([name, stat]) => {
        const total = stat.durations.length + stat.errors
        return {
          operation: name,
          calls: total,
          errors: stat.errors,
          p50: Number(percentile(stat.durations, 50).toFixed(2)),
          p95: Number(percentile(stat.durations, 95).toFixed(2)),
          p99: Number(percentile(stat.durations, 99).toFixed(2)),
        }
      })
      rows.sort((a, b) => b.p95 - a.p95)
      console.table(rows)

      const totalCalls = rows.reduce((sum, row) => sum + row.calls, 0)
      const totalErrors = rows.reduce((sum, row) => sum + row.errors, 0)
      const errorRate = totalCalls === 0 ? 0 : totalErrors / totalCalls
      const poolWaitSamples = harness.metrics.map((m) => m.waitMs)
      const p95PoolWait = percentile(poolWaitSamples, 95)
      const deadlockCount = harness.metrics.filter((m) => (m.error ?? '').includes('40P01')).length
      const lockWaitCount = harness.metrics.filter((m) => (m.error ?? '').includes('55P03')).length

      expect(totalCalls).toBeGreaterThan(0)
      expect(errorRate).toBeLessThanOrEqual(Number(process.env.PG_PHASE6_ACCEPTABLE_ERROR_RATE ?? '0.02'))
      expect(p95PoolWait).toBeLessThanOrEqual(Number(process.env.PG_PHASE6_ACCEPTABLE_P95_POOL_WAIT_MS ?? '40'))
      expect(deadlockCount).toBe(0)
      expect(lockWaitCount).toBeLessThanOrEqual(Number(process.env.PG_PHASE6_ACCEPTABLE_LOCK_WAIT_COUNT ?? '2'))
    } finally {
      await harness.close()
    }
  })

  it('uses EXPLAIN ANALYZE for hot query paths and verifies index-backed plans', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 6 explain assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_phase6_explain')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Phase6 Explain', notes: null }, { skipBudgetSeed: true })
      for (let s = 0; s < 120; s++) {
        const scene = await createScene({
          production_id: production.id,
          scene_number: String(s + 1).padStart(3, '0'),
          heading: 'EXT. EXPLAIN',
        })
        for (let sh = 0; sh < 5; sh++) {
          await createShot({ scene_id: scene.id, shot_number: String(sh + 1) })
        }
      }

      const scenePlanRows = await harness.adapter.select<Array<{ 'QUERY PLAN': string }>>(
        `EXPLAIN ANALYZE
         SELECT id, scene_number
         FROM scenes
         WHERE production_id = $1 AND deleted_at IS NULL
         ORDER BY scene_number`,
        [production.id]
      )
      const scenePlan = scenePlanRows.map((r) => r['QUERY PLAN']).join('\n')
      expect(scenePlan).toMatch(/Index Scan|Bitmap Index Scan/i)

      const sceneIds = await harness.adapter.select<Array<{ id: string }>>(
        `SELECT id FROM scenes WHERE production_id = $1 ORDER BY scene_number LIMIT 1`,
        [production.id]
      )
      const shotPlanRows = await harness.adapter.select<Array<{ 'QUERY PLAN': string }>>(
        `EXPLAIN ANALYZE
         SELECT id, shot_number
         FROM shots
         WHERE scene_id = $1 AND deleted_at IS NULL
         ORDER BY shot_number`,
        [sceneIds[0]!.id]
      )
      const shotPlan = shotPlanRows.map((r) => r['QUERY PLAN']).join('\n')
      expect(shotPlan).toMatch(/Index Scan|Bitmap Index Scan/i)
    } finally {
      await harness.close()
    }
  })

  it('enforces optimistic concurrency conflicts and concurrent write safety', async () => {
    if (connectionError) {
      console.warn(`Skipping PostgreSQL phase 6 concurrency assertions: ${connectionError}`)
      return
    }
    const harness = await createPostgresRepoHarness('pg_phase6_conflicts')
    setDbAdapterForTests(harness.adapter)
    try {
      const production = await createProduction({ name: 'Phase6 Conflicts', notes: null }, { skipBudgetSeed: true })
      const category = await createBudgetCategory({ production_id: production.id, code: 'ATL', name: 'ATL' })
      const scene = await createScene({ production_id: production.id, scene_number: '1', heading: 'EXT. BEACH' })
      await createShot({ scene_id: scene.id, shot_number: '1' })
      const budgetItem = await createBudgetItem({
        production_id: production.id,
        category_id: category.id,
        description: 'Conflict row',
        estimated_cost: 10,
      })

      const [freshScene] = await listScenesByProduction(production.id)
      await updateScene(freshScene!.id, { heading: 'EXT. UPDATED 1' }, { expectedUpdatedAt: freshScene!.updated_at })
      await expect(
        updateScene(freshScene!.id, { heading: 'EXT. UPDATED 2' }, { expectedUpdatedAt: freshScene!.updated_at })
      ).rejects.toBeInstanceOf(OptimisticConcurrencyConflictError)

      const [freshShot] = await listShotsByProduction(production.id)
      const shotUpdateA = updateShot(freshShot!.id, { notes: 'a' }, { expectedUpdatedAt: freshShot!.updated_at })
      const shotUpdateB = updateShot(freshShot!.id, { notes: 'b' }, { expectedUpdatedAt: freshShot!.updated_at })
      const shotResults = await Promise.allSettled([shotUpdateA, shotUpdateB])
      expect(shotResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(shotResults.filter((r) => r.status === 'rejected')).toHaveLength(1)

      const current = await harness.adapter.select<Array<{ updated_at: string }>>(
        'SELECT updated_at FROM budget_items WHERE id = $1',
        [budgetItem.id]
      )
      const budgetA = updateBudgetItem(
        budgetItem.id,
        { estimated_cost: 11 },
        { expectedUpdatedAt: current[0]!.updated_at }
      )
      const budgetB = updateBudgetItem(
        budgetItem.id,
        { estimated_cost: 12 },
        { expectedUpdatedAt: current[0]!.updated_at }
      )
      const budgetResults = await Promise.allSettled([budgetA, budgetB])
      expect(budgetResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(budgetResults.filter((r) => r.status === 'rejected')).toHaveLength(1)

      const liveRevisionId = await getOrCreateLiveBudgetRevisionIdForProduction(production.id)
      const secondRevisionId = 'dddddddd-0000-4000-8000-000000000010'
      await harness.adapter.execute(
        `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, approval, created_at, updated_at)
         VALUES ($1, $2, $3, $4, FALSE, 'unapproved', NOW(), NOW())`,
        [secondRevisionId, production.id, 'Scenario B', liveRevisionId]
      )
      await Promise.all([
        setLiveBudgetRevisionForProduction({ productionId: production.id, revisionId: liveRevisionId }),
        setLiveBudgetRevisionForProduction({ productionId: production.id, revisionId: secondRevisionId }),
      ])
      const revisions = await listBudgetRevisionsByProduction(production.id)
      expect(revisions.filter((r) => r.is_live)).toHaveLength(1)
    } finally {
      await harness.close()
    }
  })
})
