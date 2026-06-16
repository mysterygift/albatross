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
  createVendorInvoiceExpenseLink,
  createVendorPurchaseOrderExpenseLink,
  listInvoiceLinksByExpenseId,
  listPurchaseOrderLinksByExpenseId,
} from '@/lib/db/repositories/vendorFinanceLinks'

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

const PRODUCTION_ID = 'prod-vf-1'
const VENDOR_A = 'vendor-a'
const VENDOR_B = 'vendor-b'
const EXPENSE_A = 'expense-a'
const INVOICE_A = 'invoice-a'
const PO_A = 'po-a'
const TS = '2026-06-16T12:00:00.000Z'

async function seedVendorFinance(): Promise<void> {
  await dbAdapter.execute(
    `INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, 'Test', $2, $2)`,
    [PRODUCTION_ID, TS]
  )
  for (const [id, name] of [
    [VENDOR_A, 'Vendor A'],
    [VENDOR_B, 'Vendor B'],
  ] as const) {
    await dbAdapter.execute(
      `INSERT INTO vendors (id, production_id, company_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [id, PRODUCTION_ID, name, TS]
    )
  }
  await dbAdapter.execute(
    `INSERT INTO expenses (id, production_id, amount, date, expense_type, vendor_id, created_at, updated_at)
     VALUES ($1, $2, 100, '2026-06-01', 'other', $3, $4, $4)`,
    [EXPENSE_A, PRODUCTION_ID, VENDOR_A, TS]
  )
  await dbAdapter.execute(
    `INSERT INTO vendor_invoices (id, production_id, vendor_id, invoice_number, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'INV-001', 'received', $4, $4)`,
    [INVOICE_A, PRODUCTION_ID, VENDOR_A, TS]
  )
  await dbAdapter.execute(
    `INSERT INTO vendor_purchase_orders (id, production_id, vendor_id, po_number, status, approval, created_at, updated_at)
     VALUES ($1, $2, $3, 'PO-001', 'issued', 0, $4, $4)`,
    [PO_A, PRODUCTION_ID, VENDOR_A, TS]
  )
}

describe('vendorFinanceLinks reverse lookup', () => {
  beforeEach(async () => {
    await makeDb()
    await seedVendorFinance()
  })

  it('lists invoice and PO links by expense id', async () => {
    await createVendorInvoiceExpenseLink(INVOICE_A, EXPENSE_A)
    await createVendorPurchaseOrderExpenseLink(PO_A, EXPENSE_A)

    const invoiceLinks = await listInvoiceLinksByExpenseId(EXPENSE_A)
    const poLinks = await listPurchaseOrderLinksByExpenseId(EXPENSE_A)

    expect(invoiceLinks).toHaveLength(1)
    expect(invoiceLinks[0]!.vendor_invoice_id).toBe(INVOICE_A)
    expect(poLinks).toHaveLength(1)
    expect(poLinks[0]!.vendor_purchase_order_id).toBe(PO_A)
  })

  it('rejects linking expense to invoice from a different vendor', async () => {
    await dbAdapter.execute(
      `INSERT INTO vendor_invoices (id, production_id, vendor_id, invoice_number, status, created_at, updated_at)
       VALUES ('invoice-b', $1, $2, 'INV-B', 'received', $3, $3)`,
      [PRODUCTION_ID, VENDOR_B, TS]
    )

    await expect(createVendorInvoiceExpenseLink('invoice-b', EXPENSE_A)).rejects.toThrow(
      /same vendor/
    )
  })
})
