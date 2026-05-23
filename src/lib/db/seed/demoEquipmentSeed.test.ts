import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'
import { IDS } from '@/lib/db/seed/constants'
import { seedDemoEquipment } from '@/lib/db/seed/demoEquipmentSeed'
import { listEquipmentByProduction } from '@/lib/db/repositories/equipment'
import {
  addEquipmentItemToList,
  listEquipmentListItems,
} from '@/lib/db/repositories/equipmentLists'
import { getOverStockListItems } from '@/lib/equipment/listQuantity'

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

function scalar(db: Database, sql: string): number {
  const r = sqlJsQueryExec(db, sql)
  const v = r[0]?.values[0]?.[0]
  return typeof v === 'number' ? v : Number(v ?? 0)
}

function addDaysLocal(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function seedMinimalProduction(db: Database, ts: string): Promise<void> {
  const pid = IDS.production
  db.run(
    `INSERT INTO productions (id, name, slug, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [pid, 'Demo Equipment Test', 'demo-equipment-test', null, ts, ts]
  )
  for (let d = 1; d <= 12; d++) {
    db.run(
      `INSERT INTO shoot_days (id, production_id, shoot_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [IDS.shootDay(d), pid, `2025-03-${String(d).padStart(2, '0')}`, ts, ts]
    )
  }
}

describe('seedDemoEquipment list quantities', () => {
  let db: Database
  const ts = '2025-03-01T00:00:00.000Z'
  const startDate = '2025-03-01'

  beforeEach(async () => {
    vi.clearAllMocks()
    db = await makeDb()
    await seedMinimalProduction(db, ts)
    await seedDemoEquipment(IDS.production, startDate, ts, addDaysLocal, {})
  })

  it('defaults list item quantity to 1 for hero gear', async () => {
    const alexaId = IDS.equipment(1)
    const qty = scalar(
      db,
      `SELECT quantity FROM equipment_list_items WHERE equipment_id = '${alexaId}' LIMIT 1`
    )
    expect(qty).toBe(1)
  })

  it('seeds explicit pack quantities on curated demo rows', async () => {
    const vLockId = IDS.equipment(19)
    const qty = scalar(
      db,
      `SELECT quantity FROM equipment_list_items WHERE equipment_id = '${vLockId}' LIMIT 1`
    )
    expect(qty).toBe(3)
  })

  it('surfaces over-stock rows from seeded lighting list', async () => {
    const lightingListId = IDS.equipmentList(2)
    const items = await listEquipmentListItems(lightingListId)
    const equipment = await listEquipmentByProduction(IDS.production)
    const equipmentById = new Map(equipment.map((e) => [e.id, e]))
    const overStock = getOverStockListItems(items, equipmentById)
    const quasarId = IDS.equipment(60)
    expect(overStock.some(({ item }) => item.equipment_id === quasarId)).toBe(true)
  })

  it('allows addEquipmentItemToList without quantity after demo seed', async () => {
    const cameraListId = IDS.equipmentList(1)
    const spareId = IDS.equipment(100)
    const sortOrder = scalar(
      db,
      `SELECT COUNT(*) FROM equipment_list_items WHERE equipment_list_id = '${cameraListId}'`
    )
    const added = await addEquipmentItemToList({
      equipment_list_id: cameraListId,
      equipment_id: spareId,
      sort_order: sortOrder,
    })
    expect(added.quantity).toBe(1)
  })
})
