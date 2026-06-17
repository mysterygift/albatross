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

import {
  createVendor,
  listVendors,
  promoteVendorToGlobal,
  removeVendorFromProject,
  demoteVendorToLocal,
  excludeVendorFromProduction,
  VendorPromoteError,
  VendorRemoveError,
} from '@/lib/db/repositories/vendors'

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

const PROD_A = 'prod-a'
const PROD_B = 'prod-b'
const TS = '2026-06-16T12:00:00.000Z'

async function seedProductions(): Promise<void> {
  for (const id of [PROD_A, PROD_B]) {
    await dbAdapter.execute(
      `INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
      [id, `Production ${id}`, TS]
    )
  }
}

describe('vendors repository — global vendors', () => {
  beforeEach(async () => {
    await makeDb()
    await seedProductions()
  })

  it('listVendors includes global vendors from other productions', async () => {
    const local = await createVendor({
      production_id: PROD_A,
      company_name: 'Local Vendor A',
    })
    const shared = await createVendor({
      production_id: PROD_A,
      company_name: 'Shared Panavision',
    })
    await promoteVendorToGlobal(shared.id, PROD_A)

    const listA = await listVendors(PROD_A)
    expect(listA.map((v) => v.id).sort()).toEqual([local.id, shared.id].sort())

    const listB = await listVendors(PROD_B)
    expect(listB).toHaveLength(1)
    expect(listB[0]!.id).toBe(shared.id)
    expect(listB[0]!.is_global).toBe(true)
  })

  it('promoteVendorToGlobal rejects vendors from another production', async () => {
    const vendor = await createVendor({
      production_id: PROD_A,
      company_name: 'Origin Only',
    })
    await expect(promoteVendorToGlobal(vendor.id, PROD_B)).rejects.toThrow(VendorPromoteError)
  })

  it('promoteVendorToGlobal rejects already-global vendors', async () => {
    const vendor = await createVendor({
      production_id: PROD_A,
      company_name: 'Already Global',
    })
    await promoteVendorToGlobal(vendor.id, PROD_A)
    await expect(promoteVendorToGlobal(vendor.id, PROD_A)).rejects.toThrow(VendorPromoteError)
  })

  it('createVendor defaults is_global to false', async () => {
    const vendor = await createVendor({
      production_id: PROD_A,
      company_name: 'Local Only',
    })
    expect(vendor.is_global).toBe(false)
  })

  it('demoteVendorToLocal stops sharing from origin project', async () => {
    const shared = await createVendor({
      production_id: PROD_A,
      company_name: 'Shared Vendor',
    })
    await promoteVendorToGlobal(shared.id, PROD_A)
    expect((await listVendors(PROD_B)).some((v) => v.id === shared.id)).toBe(true)

    await demoteVendorToLocal(shared.id, PROD_A)
    expect((await listVendors(PROD_A)).some((v) => v.id === shared.id)).toBe(true)
    expect((await listVendors(PROD_B)).some((v) => v.id === shared.id)).toBe(false)
  })

  it('excludeVendorFromProduction hides global vendor from one project', async () => {
    const shared = await createVendor({
      production_id: PROD_A,
      company_name: 'Shared Vendor',
    })
    await promoteVendorToGlobal(shared.id, PROD_A)
    await excludeVendorFromProduction(shared.id, PROD_B)

    expect((await listVendors(PROD_A)).some((v) => v.id === shared.id)).toBe(true)
    expect((await listVendors(PROD_B)).some((v) => v.id === shared.id)).toBe(false)
  })

  it('removeVendorFromProject soft-deletes local vendors', async () => {
    const local = await createVendor({
      production_id: PROD_A,
      company_name: 'Local Vendor',
    })
    await removeVendorFromProject(local.id, PROD_A)
    expect(await listVendors(PROD_A)).toHaveLength(0)
  })

  it('removeVendorFromProject demotes global vendor on origin project', async () => {
    const shared = await createVendor({
      production_id: PROD_A,
      company_name: 'Shared Vendor',
    })
    await promoteVendorToGlobal(shared.id, PROD_A)
    await removeVendorFromProject(shared.id, PROD_A)
    expect((await listVendors(PROD_B)).some((v) => v.id === shared.id)).toBe(false)
  })

  it('demoteVendorToLocal rejects non-origin project', async () => {
    const shared = await createVendor({
      production_id: PROD_A,
      company_name: 'Shared Vendor',
    })
    await promoteVendorToGlobal(shared.id, PROD_A)
    await expect(demoteVendorToLocal(shared.id, PROD_B)).rejects.toThrow(VendorRemoveError)
  })
})
