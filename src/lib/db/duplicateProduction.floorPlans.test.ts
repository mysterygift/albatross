import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'
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
        for (const s of statements) await db.execute(s.sql, s.bindValues)
      }
    ),
  }
})

vi.mock('@/lib/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/files')>()),
  deleteAttachmentFile: vi.fn(async () => {}),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => {}),
}))

import { duplicateProduction } from '@/lib/db/duplicateProduction'
import { createProduction } from '@/lib/db/repositories/production'
import {
  createFloorPlan,
  listFloorPlanSetupsByProduction,
  listFloorPlansByProduction,
  saveFloorPlanSetup,
  setFloorPlanBackgroundImage,
  updateFloorPlan,
} from '@/lib/db/repositories/floor-plans'
import { emptyLayout } from '@/lib/floor-plans/model'

describe('duplicateProduction — floor plans', () => {
  beforeEach(async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    const dir = join(process.cwd(), 'src-tauri/migrations')
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf8'))
    db.exec('PRAGMA foreign_keys = ON')
    dbAdapter = createSqlJsTauriAdapter(db)
  })

  it('copies plans and setups onto the copied location, scene and shot', async () => {
    const source = await createProduction({ name: 'Source', notes: null })
    await dbAdapter.execute(
      `INSERT INTO locations (id, production_id, name, address, created_at, updated_at) VALUES ('loc', $1, 'Diner', '1 Road', 't', 't')`,
      [source.id]
    )
    await dbAdapter.execute(
      `INSERT INTO scenes (id, production_id, scene_number, location_id, created_at, updated_at) VALUES ('sc', $1, '4', 'loc', 't', 't')`,
      [source.id]
    )
    await dbAdapter.execute(`INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at) VALUES ('sh', 'sc', '4A', 't', 't')`)
    const plan = await createFloorPlan({ productionId: source.id, locationId: 'loc', name: 'Diner' })
    const layout = { ...emptyLayout(), unitsPerMetre: 30, shapes: [{ id: 'r', kind: 'rect' as const, x: 0, y: 0, width: 100, height: 80 }] }
    await updateFloorPlan(plan.id, { layout })
    await setFloorPlanBackgroundImage(plan.id, 'data:image/png;base64,BBBB')
    const markers = [{ id: 'm', kind: 'camera' as const, x: 10, y: 10, rotation: 0, label: 'A' }]
    await saveFloorPlanSetup({ productionId: source.id, floorPlanId: plan.id, sceneId: 'sc', shotId: 'sh', markers, notes: 'Wide' })
    await saveFloorPlanSetup({ productionId: source.id, floorPlanId: plan.id, sceneId: 'sc', shotId: null, markers })

    const copy = await duplicateProduction(source.id, 'Copy')

    const [copiedPlan] = await listFloorPlansByProduction(copy.id)
    expect(copiedPlan).toMatchObject({ name: 'Diner', layout, background_image: 'data:image/png;base64,BBBB' })
    expect(copiedPlan!.id).not.toBe(plan.id)
    expect(copiedPlan!.location_id).not.toBe('loc')
    const setups = await listFloorPlanSetupsByProduction(copy.id)
    expect(setups).toHaveLength(2)
    const shotIds = await dbAdapter.select<Array<{ id: string }>>(
      `SELECT sh.id FROM shots sh INNER JOIN scenes sc ON sc.id = sh.scene_id WHERE sc.production_id = $1`,
      [copy.id]
    )
    const shotSetup = setups.find((s) => s.shot_id != null)!
    expect(shotSetup).toMatchObject({ floor_plan_id: copiedPlan!.id, shot_id: shotIds[0]!.id, markers, notes: 'Wide' })
    expect(setups.every((s) => s.scene_id !== 'sc')).toBe(true)
    // The source is untouched.
    expect(await listFloorPlanSetupsByProduction(source.id)).toHaveLength(2)
  })
})
