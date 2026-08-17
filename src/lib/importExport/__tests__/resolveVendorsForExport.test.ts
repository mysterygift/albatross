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

import { resolveVendorsForExport } from '@/lib/importExport/resolveVendorsForExport'
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

const PROD_ORIGIN = 'prod-origin'
const PROD_EXPORT = 'prod-export'
const TS = '2026-06-16T12:00:00.000Z'

describe('resolveVendorsForExport', () => {
  beforeEach(async () => {
    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(9))
    await makeDb()
    for (const id of [PROD_ORIGIN, PROD_EXPORT]) {
      await dbAdapter.execute(
        `INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
        [id, id, TS]
      )
    }
  })
  afterEach(() => setTestDataEncryptionKeyForTests(null))

  it('materializes referenced global vendors as local copies for export', async () => {
    const globalVendor = await createVendor({
      production_id: PROD_ORIGIN,
      company_name: 'Global Panavision',
      primary_contact_email: 'contact@panavision.test',
    })
    await promoteVendorToGlobal(globalVendor.id, PROD_ORIGIN)

    await dbAdapter.execute(
      `INSERT INTO expenses (id, production_id, amount, date, expense_type, vendor_id, created_at, updated_at)
       VALUES ($1, $2, 500, '2026-06-01', 'other', $3, $4, $4)`,
      ['exp-1', PROD_EXPORT, globalVendor.id, TS]
    )

    const rows = await resolveVendorsForExport(PROD_EXPORT)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.id).toBe(globalVendor.id)
    expect(row.production_id).toBe(PROD_EXPORT)
    expect(row.is_global).toBe(0)
    expect(row.company_name).toBe('Global Panavision')
    expect(row.primary_contact_email).toBe('contact@panavision.test')
  })

  it('includes production-owned vendors without duplicating global copies already owned', async () => {
    const local = await createVendor({
      production_id: PROD_EXPORT,
      company_name: 'Local Vendor',
    })
    const rows = await resolveVendorsForExport(PROD_EXPORT)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(local.id)
    expect(rows[0]!.is_global).toBe(0)
  })
})
