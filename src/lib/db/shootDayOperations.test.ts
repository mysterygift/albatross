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
} from '@/lib/db/repositories/schedule'
import {
  createShotStrip,
  createStrip,
  deleteShootDayAndDiscardStrips,
  listBoneyardStrips,
  listStripsByShootDay,
} from '@/lib/db/repositories/stripboard-strips'

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

describe('shoot day operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects creating a second shoot day on the same production date', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Dup dates', notes: null }, { skipBudgetSeed: true })
    await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-05-10',
    })
    await expect(
      createShootDayWithDefaultMainUnit({
        productionId: production.id,
        shootDate: '2026-05-10',
      })
    ).rejects.toThrow(/SHOOT_DATE_ALREADY_EXISTS/)
  })

  it('deleteShootDayAndDiscardStrips moves SHOT/SCENE strips to Boneyard and soft-deletes the day', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Delete day', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })

    const sceneStrip = await createStrip({
      production_id: production.id,
      shoot_day_id: shootDay.id,
      shoot_day_unit_id: shootDayUnitId,
      strip_type: 'SCENE',
      scene_id: scene.id,
    })

    const shot = await createShot({ scene_id: scene.id, shot_number: '1A' })
    const shotStrip = await createShotStrip(
      production.id,
      shot.id,
      shootDay.id,
      shootDayUnitId
    )

    const beforeDelete = await listStripsByShootDay(shootDay.id)
    expect(beforeDelete.some((s) => s.id === sceneStrip.id)).toBe(true)
    expect(beforeDelete.some((s) => s.id === shotStrip.id)).toBe(true)

    await deleteShootDayAndDiscardStrips(shootDay.id)

    expect(await getShootDayById(shootDay.id)).toBeNull()
    expect(await listStripsByShootDay(shootDay.id)).toHaveLength(0)

    const boneyard = await listBoneyardStrips(production.id)
    const boneyardIds = new Set(boneyard.map((s) => s.id))
    expect(boneyardIds.has(sceneStrip.id)).toBe(true)
    expect(boneyardIds.has(shotStrip.id)).toBe(true)
    expect(boneyard.find((s) => s.id === sceneStrip.id)?.strip_status).toBe('BONEYARD')
    expect(boneyard.find((s) => s.id === shotStrip.id)?.strip_status).toBe('BONEYARD')
  })
})
