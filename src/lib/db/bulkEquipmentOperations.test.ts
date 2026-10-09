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

import { setTestDataEncryptionKeyForTests } from '@/lib/security/dataEncryptionContext'
import { createProduction } from '@/lib/db/repositories/production'
import { createEquipment, listEquipmentByProduction } from '@/lib/db/repositories/equipment'
import { getTaskByEquipmentId } from '@/lib/db/repositories/tasks'
import {
  addEquipmentItemToList,
  addEquipmentItemsToList,
  createEquipmentList,
  listEquipmentListItems,
} from '@/lib/db/repositories/equipmentLists'
import { bulkUpdateEquipmentWithReminderTasks } from '@/lib/db/equipmentReturnReminderService'

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

function installTestDek(): void {
  const key = new Uint8Array(32)
  crypto.getRandomValues(key)
  setTestDataEncryptionKeyForTests(key)
}

async function seedRegistry() {
  const production = await createProduction({ name: 'Bulk Prod', notes: null }, { skipBudgetSeed: true })
  const base = { production_id: production.id, category: 'camera' as const, status: 'planned' as const }
  const camera = await createEquipment({ ...base, name: 'Camera body', source_type: 'rented', serial_number: 'SN-1' })
  const lens = await createEquipment({ ...base, name: 'Lens', source_type: 'rented', serial_number: 'SN-2' })
  const sandbag = await createEquipment({ ...base, name: 'Sandbag', source_type: 'owned', quantity: 10 })
  return { production, camera, lens, sandbag }
}

describe('bulk equipment operations', () => {
  beforeEach(async () => {
    await makeDb()
    installTestDek()
  })

  it('applies one patch to every selected item and leaves names and serials alone', async () => {
    const { production, camera, lens } = await seedRegistry()
    const result = await bulkUpdateEquipmentWithReminderTasks([camera, lens], {
      vendor: 'Hire Co',
      vendor_id: null,
      status: 'active',
    })
    expect(result.failed).toEqual([])
    const after = await listEquipmentByProduction(production.id)
    const byId = new Map(after.map((e) => [e.id, e]))
    for (const [id, name, serial] of [
      [camera.id, 'Camera body', 'SN-1'],
      [lens.id, 'Lens', 'SN-2'],
    ] as const) {
      expect(byId.get(id)).toMatchObject({ vendor: 'Hire Co', status: 'active', name, serial_number: serial })
    }
  })

  it('creates a return reminder for each rented item given a due date', async () => {
    const { camera, lens, sandbag } = await seedRegistry()
    await bulkUpdateEquipmentWithReminderTasks([camera, lens, sandbag], { return_due_date: '2026-11-03' })
    expect((await getTaskByEquipmentId(camera.id))?.description).toBe('Return equipment — Camera body')
    expect((await getTaskByEquipmentId(lens.id))?.due_date).toBe('2026-11-03')
    // Owned kit is not reminder-eligible.
    expect(await getTaskByEquipmentId(sandbag.id)).toBeNull()
  })

  it('adds several items to a list at once, appending in order and skipping duplicates', async () => {
    const { production, camera, lens, sandbag } = await seedRegistry()
    const list = await createEquipmentList({ production_id: production.id, name: 'Day 1' })
    await addEquipmentItemToList({ equipment_list_id: list.id, equipment_id: camera.id, sort_order: 0 })

    const added = await addEquipmentItemsToList(list.id, [
      { equipment_id: sandbag.id, quantity: 6 },
      { equipment_id: camera.id, quantity: 2 },
      { equipment_id: lens.id },
    ])
    expect(added.map((i) => i.equipment_id)).toEqual([sandbag.id, lens.id])

    const items = await listEquipmentListItems(list.id)
    expect(items.map((i) => [i.equipment_id, i.quantity])).toEqual([
      [camera.id, 1],
      [sandbag.id, 6],
      [lens.id, 1],
    ])
  })
})
