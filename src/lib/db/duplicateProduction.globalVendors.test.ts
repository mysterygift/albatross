import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { setTestDataEncryptionKeyForTests } from '@/lib/security/dataEncryptionContext'

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

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => {}),
}))

import { duplicateProduction } from '@/lib/db/duplicateProduction'
import { createVendor, promoteVendorToGlobal } from '@/lib/db/repositories/vendors'

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

const SOURCE_PROD = 'source-prod'
const TS = '2026-06-16T12:00:00.000Z'

describe('duplicateProduction — global vendors', () => {
  beforeEach(async () => {
    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(8))
    await makeDb()
    await dbAdapter.execute(
      `INSERT INTO productions (id, name, slug, created_at, updated_at) VALUES ($1, 'Source', 'source', $2, $2)`,
      [SOURCE_PROD, TS]
    )
  })
  afterEach(() => setTestDataEncryptionKeyForTests(null))

  it('preserves global vendor_id on duplicated expenses without copying the vendor row', async () => {
    const globalVendor = await createVendor({
      production_id: SOURCE_PROD,
      company_name: 'Shared Vendor',
    })
    await promoteVendorToGlobal(globalVendor.id, SOURCE_PROD)

    await dbAdapter.execute(
      `INSERT INTO expenses (id, production_id, amount, date, expense_type, vendor_id, created_at, updated_at)
       VALUES ($1, $2, 250, '2026-06-01', 'other', $3, $4, $4)`,
      ['exp-source', SOURCE_PROD, globalVendor.id, TS]
    )

    const copy = await duplicateProduction(SOURCE_PROD, 'Copy Production')

    const vendorRows = await dbAdapter.select<Record<string, unknown>[]>(
      `SELECT * FROM vendors WHERE production_id = $1`,
      [copy.id]
    )
    expect(vendorRows).toHaveLength(0)

    const expenseRows = await dbAdapter.select<Record<string, unknown>[]>(
      `SELECT vendor_id FROM expenses WHERE production_id = $1`,
      [copy.id]
    )
    expect(expenseRows).toHaveLength(1)
    expect(expenseRows[0]!.vendor_id).toBe(globalVendor.id)
  })
})
