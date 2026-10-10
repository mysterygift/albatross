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
  FLOOR_PLANS_REMOTE_ERROR,
  createFloorPlan,
  deleteFloorPlan,
  deleteFloorPlanSetup,
  listFloorPlanSetupsByProduction,
  listFloorPlansByProduction,
  saveFloorPlanSetup,
  setFloorPlanBackgroundImage,
  updateFloorPlan,
} from '@/lib/db/repositories/floor-plans'
import { emptyLayout, type FloorPlanMarker } from '@/lib/floor-plans/model'

const P = 'prod-diner'
const OTHER = 'prod-other'
const TS = '2026-10-09T09:00:00.000Z'

const camera: FloorPlanMarker = { id: 'm1', kind: 'camera', x: 100, y: 120, rotation: 90, label: 'A' }
const actor: FloorPlanMarker = { id: 'm2', kind: 'actor', x: 300, y: 200, rotation: 180, label: 'Marta', personId: 'p-marta' }

async function count(table: string, where = '1=1', binds: unknown[] = []): Promise<number> {
  const rows = await dbAdapter.select<Array<{ c: number }>>(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`, binds)
  return Number(rows[0]!.c)
}

describe('floor plans repository', () => {
  beforeEach(async () => {
    const SQL = await initSqlJs({})
    const raw = new SQL.Database()
    applyAlbatrossMigrationsSqlJs(raw)
    dbAdapter = createSqlJsTauriAdapter(raw)
    dataSourceOverride = null
    for (const id of [P, OTHER]) {
      await dbAdapter.execute(`INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, $1, $2, $2)`, [id, TS])
    }
    for (const [id, prod, name] of [
      ['diner', P, 'Rosie’s Diner'],
      ['garage', P, 'Garage'],
      ['elsewhere', OTHER, 'Elsewhere'],
    ] as const) {
      await dbAdapter.execute(
        `INSERT INTO locations (id, production_id, name, address, created_at, updated_at) VALUES ($1, $2, $3, '1 Road', $4, $4)`,
        [id, prod, name, TS]
      )
    }
    await dbAdapter.execute(
      `INSERT INTO scenes (id, production_id, scene_number, location_id, created_at, updated_at) VALUES ('sc4', $1, '4', 'diner', $2, $2)`,
      [P, TS]
    )
    await dbAdapter.execute(
      `INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at) VALUES ('sc9', $1, '9', $2, $2)`,
      [OTHER, TS]
    )
    for (const [id, number] of [['sh4a', '4A'], ['sh4b', '4B']] as const) {
      await dbAdapter.execute(
        `INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at) VALUES ($1, 'sc4', $2, $3, $3)`,
        [id, number, TS]
      )
    }
  })

  it('creates, renames and redraws a plan, with outbox rows', async () => {
    const plan = await createFloorPlan({ productionId: P, locationId: 'diner', name: '  Dining room ' })
    expect(plan).toMatchObject({ name: 'Dining room', location_id: 'diner', layout: emptyLayout(), background_image: null })

    const layout = {
      ...emptyLayout(),
      unitsPerMetre: 25,
      north: 15,
      geo: { lat: 51.5, lon: -0.12, timezone: 'Europe/London' },
      background: { source: 'image' as const, x: 0, y: 0, width: 1200, height: 800, opacity: 0.5, rotation: 0, map: null },
      shapes: [
        { id: 'r1', kind: 'rect' as const, x: 10, y: 20, width: 300, height: 200 },
        { id: 'p1', kind: 'path' as const, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], closed: true },
        { id: 't1', kind: 'text' as const, x: 40, y: 40, width: 120, height: 30, rotation: 90, text: 'Counter', fontSize: 18 },
        { id: 'i1', kind: 'item' as const, type: 'easy-up-3x3', x: 900, y: 600, rotation: 0, label: 'Easy-up | Video village', width: 3, depth: 3 },
      ],
    }
    const updated = await updateFloorPlan(plan.id, { name: 'Diner floor', layout })
    expect(updated.name).toBe('Diner floor')
    expect(updated.layout).toEqual(layout)
    expect(await listFloorPlansByProduction(P)).toHaveLength(1)
    expect(await count('outbox', `entity = 'floor_plans'`)).toBe(2)
  })

  it('sets and clears the background image apart from the drawing', async () => {
    const plan = await createFloorPlan({ productionId: P, locationId: 'diner', name: 'Diner' })
    await setFloorPlanBackgroundImage(plan.id, 'data:image/jpeg;base64,AAAA')
    expect((await listFloorPlansByProduction(P))[0]!.background_image).toBe('data:image/jpeg;base64,AAAA')
    const outbox = await dbAdapter.select<Array<{ payload_json: string }>>(
      `SELECT payload_json FROM outbox WHERE entity = 'floor_plans' ORDER BY rowid DESC LIMIT 1`
    )
    expect(outbox[0]!.payload_json).toBe('{"background_image":"set"}')
    await expect(setFloorPlanBackgroundImage(plan.id, 'data:text/html;base64,AAAA')).rejects.toThrow(/PNG, JPEG or WebP/)
    await setFloorPlanBackgroundImage(plan.id, null)
    expect((await listFloorPlansByProduction(P))[0]!.background_image).toBeNull()
  })

  it('refuses a location from another production and a blank name', async () => {
    await expect(createFloorPlan({ productionId: P, locationId: 'elsewhere', name: 'X' })).rejects.toThrow(/different production/)
    await expect(createFloorPlan({ productionId: P, locationId: 'diner', name: '  ' })).rejects.toThrow(/name/)
    expect(await count('floor_plans')).toBe(0)
  })

  it('keeps one setup per plan, scene and shot, and removes it once emptied', async () => {
    const plan = await createFloorPlan({ productionId: P, locationId: 'diner', name: 'Diner' })
    const shotSetup = await saveFloorPlanSetup({ productionId: P, floorPlanId: plan.id, sceneId: 'sc4', shotId: 'sh4a', markers: [camera] })
    expect(shotSetup).toMatchObject({ scene_id: 'sc4', shot_id: 'sh4a', markers: [camera] })

    const again = await saveFloorPlanSetup({
      productionId: P,
      floorPlanId: plan.id,
      sceneId: 'sc4',
      shotId: 'sh4a',
      markers: [camera, actor],
      notes: 'Dolly along the counter',
    })
    expect(again!.id).toBe(shotSetup!.id)
    expect(again!.markers).toEqual([camera, actor])

    // Scene-wide blocking is a separate setup.
    await saveFloorPlanSetup({ productionId: P, floorPlanId: plan.id, sceneId: 'sc4', shotId: null, markers: [actor] })
    expect(await listFloorPlanSetupsByProduction(P)).toHaveLength(2)

    expect(await saveFloorPlanSetup({ productionId: P, floorPlanId: plan.id, sceneId: 'sc4', shotId: 'sh4a', markers: [], notes: '' })).toBeNull()
    const left = await listFloorPlanSetupsByProduction(P)
    expect(left.map((s) => s.shot_id)).toEqual([null])

    await deleteFloorPlanSetup(left[0]!.id)
    expect(await listFloorPlanSetupsByProduction(P)).toEqual([])
  })

  it('checks the scene and shot belong together', async () => {
    const plan = await createFloorPlan({ productionId: P, locationId: 'diner', name: 'Diner' })
    await expect(
      saveFloorPlanSetup({ productionId: P, floorPlanId: plan.id, sceneId: 'sc9', shotId: null, markers: [camera] })
    ).rejects.toThrow(/different production/)
    await dbAdapter.execute(
      `INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at) VALUES ('sc5', $1, '5', $2, $2)`,
      [P, TS]
    )
    await expect(
      saveFloorPlanSetup({ productionId: P, floorPlanId: plan.id, sceneId: 'sc5', shotId: 'sh4a', markers: [camera] })
    ).rejects.toThrow(/different scene/)
  })

  it('deleting a plan removes its setups; deleted shots and locations hide them', async () => {
    const diner = await createFloorPlan({ productionId: P, locationId: 'diner', name: 'Diner' })
    const garage = await createFloorPlan({ productionId: P, locationId: 'garage', name: 'Garage' })
    await saveFloorPlanSetup({ productionId: P, floorPlanId: diner.id, sceneId: 'sc4', shotId: 'sh4a', markers: [camera] })
    await saveFloorPlanSetup({ productionId: P, floorPlanId: garage.id, sceneId: 'sc4', shotId: 'sh4b', markers: [camera] })

    await dbAdapter.execute(`UPDATE shots SET deleted_at = $1 WHERE id = 'sh4b'`, [TS])
    expect((await listFloorPlanSetupsByProduction(P)).map((s) => s.shot_id)).toEqual(['sh4a'])

    await dbAdapter.execute(`UPDATE locations SET deleted_at = $1 WHERE id = 'garage'`, [TS])
    expect((await listFloorPlansByProduction(P)).map((p) => p.name)).toEqual(['Diner'])

    await deleteFloorPlan(diner.id)
    expect(await listFloorPlansByProduction(P)).toEqual([])
    expect(await count('floor_plan_setups', `floor_plan_id = $1 AND deleted_at IS NULL`, [diner.id])).toBe(0)
  })

  it('cascades when the production is deleted', async () => {
    const plan = await createFloorPlan({ productionId: P, locationId: 'diner', name: 'Diner' })
    await saveFloorPlanSetup({ productionId: P, floorPlanId: plan.id, sceneId: 'sc4', shotId: 'sh4a', markers: [camera] })
    await dbAdapter.execute(`PRAGMA foreign_keys = ON`, [])
    await dbAdapter.execute(`DELETE FROM productions WHERE id = $1`, [P])
    expect(await count('floor_plans')).toBe(0)
    expect(await count('floor_plan_setups')).toBe(0)
  })

  it('is local only', async () => {
    dataSourceOverride = 'remote_server'
    await expect(createFloorPlan({ productionId: P, locationId: 'diner', name: 'Diner' })).rejects.toThrow(FLOOR_PLANS_REMOTE_ERROR)
  })
})
