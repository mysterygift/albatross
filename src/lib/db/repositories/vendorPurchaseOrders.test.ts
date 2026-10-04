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
  createVendorPurchaseOrder,
  getVendorPurchaseOrderById,
  updateVendorPurchaseOrder,
} from '@/lib/db/repositories/vendorPurchaseOrders'
import { amendPurchaseOrderAmount } from '@/lib/db/repositories/vendorPurchaseOrderAmendments'
import { createVendorInvoice, updateVendorInvoice } from '@/lib/db/repositories/vendorInvoices'
import {
  createVendorPurchaseOrderExpenseLink,
  listPurchaseOrderLinksByExpenseId,
} from '@/lib/db/repositories/vendorFinanceLinks'

const MIGRATIONS_DIR = join(process.cwd(), 'src-tauri/migrations')

function applyMigrations(db: Database, filter: (file: string) => boolean = () => true): void {
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (filter(file)) db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }
}

const PRODUCTION_ID = 'prod-1'
const VENDOR_ID = 'vendor-1'
const TS = '2026-06-16T12:00:00.000Z'

async function seed(db: Database): Promise<void> {
  db.run(`INSERT INTO productions (id, name, created_at, updated_at) VALUES (?, 'Test', ?, ?)`, [PRODUCTION_ID, TS, TS])
  db.run(`INSERT INTO vendors (id, production_id, company_name, created_at, updated_at) VALUES (?, ?, 'Acme', ?, ?)`, [
    VENDOR_ID,
    PRODUCTION_ID,
    TS,
    TS,
  ])
}

const base = { production_id: PRODUCTION_ID, vendor_id: VENDOR_ID }

describe('vendor purchase orders (status-derived approval, currency, rounding)', () => {
  let db: Database
  beforeEach(async () => {
    const SQL = await initSqlJs({})
    db = new SQL.Database()
    applyMigrations(db)
    dbAdapter = createSqlJsTauriAdapter(db)
    await seed(db)
  })

  it('derives approval from status on create', async () => {
    const cases = [
      ['draft', 0],
      ['issued', 0],
      ['approved', 1],
      ['closed', 1],
      ['cancelled', 0],
    ] as const
    for (const [status, approval] of cases) {
      const po = await createVendorPurchaseOrder({ ...base, po_number: `PO-${status}`, status })
      expect(po.approval).toBe(approval)
    }
  })

  it('re-derives approval whenever the status changes and leaves it alone otherwise', async () => {
    const po = await createVendorPurchaseOrder({ ...base, po_number: 'PO-1', status: 'issued' })
    expect(po.approval).toBe(0)
    const approved = await updateVendorPurchaseOrder(po.id, { status: 'approved' })
    expect(approved.approval).toBe(1)
    const renamed = await updateVendorPurchaseOrder(po.id, { description: 'x' })
    expect(renamed.approval).toBe(1)
    const cancelled = await updateVendorPurchaseOrder(po.id, { status: 'cancelled' })
    expect(cancelled.approval).toBe(0)
  })

  it('stores production-currency POs with NULL currency and rate', async () => {
    const po = await createVendorPurchaseOrder({ ...base, po_number: 'PO-1', amount: 1000 })
    expect(po.currency_code).toBeNull()
    expect(po.exchange_rate).toBeNull()
  })

  it('stores a foreign currency with its locked rate (rounded to 6dp, code upper-cased)', async () => {
    const po = await createVendorPurchaseOrder({
      ...base,
      po_number: 'PO-1',
      amount: 1000,
      currency_code: 'usd',
      exchange_rate: 0.7900004,
    })
    expect(po.currency_code).toBe('USD')
    expect(po.exchange_rate).toBe(0.79)
  })

  it('requires a positive rate for a foreign currency', async () => {
    await expect(
      createVendorPurchaseOrder({ ...base, po_number: 'PO-1', currency_code: 'USD', exchange_rate: null })
    ).rejects.toThrow(/exchange rate/i)
    await expect(
      createVendorPurchaseOrder({ ...base, po_number: 'PO-2', currency_code: 'USD', exchange_rate: 0 })
    ).rejects.toThrow(/exchange rate/i)
  })

  it('updates currency and rate together; back to production currency clears both', async () => {
    const po = await createVendorPurchaseOrder({ ...base, po_number: 'PO-1', amount: 100 })
    const usd = await updateVendorPurchaseOrder(po.id, { currency_code: 'USD', exchange_rate: 0.8 })
    expect(usd).toMatchObject({ currency_code: 'USD', exchange_rate: 0.8 })
    const gbp = await updateVendorPurchaseOrder(po.id, { currency_code: null, exchange_rate: null })
    expect(gbp).toMatchObject({ currency_code: null, exchange_rate: null })
    await expect(updateVendorPurchaseOrder(po.id, { exchange_rate: 2 })).rejects.toThrow(/together/)
  })

  it('rounds the PO amount to 2dp on create and update', async () => {
    const po = await createVendorPurchaseOrder({ ...base, po_number: 'PO-1', amount: 1.005 })
    expect(po.amount).toBe(1.01)
    const updated = await updateVendorPurchaseOrder(po.id, { amount: 0.1 + 0.2 })
    expect(updated.amount).toBe(0.3)
  })

  it('rounds amendment amounts and keeps them in PO currency', async () => {
    const po = await createVendorPurchaseOrder({
      ...base,
      po_number: 'PO-1',
      amount: 1000.004,
      currency_code: 'USD',
      exchange_rate: 0.79,
    })
    const { purchaseOrder, amendment } = await amendPurchaseOrderAmount({ poId: po.id, newAmount: 1500.555 })
    expect(amendment.previous_amount).toBe(1000)
    expect(amendment.new_amount).toBe(1500.56)
    expect(purchaseOrder.amount).toBe(1500.56)
    expect(purchaseOrder).toMatchObject({ currency_code: 'USD', exchange_rate: 0.79 })
  })

  it('rejects an amendment that rounds to the current amount', async () => {
    const po = await createVendorPurchaseOrder({ ...base, po_number: 'PO-1', amount: 100 })
    await expect(amendPurchaseOrderAmount({ poId: po.id, newAmount: 100.001 })).rejects.toThrow(/same/)
  })

  it('rounds invoice amount / tax and PO link allocations on write', async () => {
    const invoice = await createVendorInvoice({
      ...base,
      invoice_number: 'INV-1',
      amount: 10.005,
      tax: 2.675,
    })
    expect(invoice.amount).toBe(10.01)
    expect(invoice.tax).toBe(2.68)
    const patched = await updateVendorInvoice(invoice.id, { amount: 0.1 + 0.2 })
    expect(patched.amount).toBe(0.3)

    db.run(
      `INSERT INTO expenses (id, production_id, amount, date, expense_type, vendor_id, created_at, updated_at)
       VALUES ('e1', ?, 100, '2026-06-01', 'other', ?, ?, ?)`,
      [PRODUCTION_ID, VENDOR_ID, TS, TS]
    )
    const po = await createVendorPurchaseOrder({ ...base, po_number: 'PO-1', amount: 500, status: 'issued' })
    await createVendorPurchaseOrderExpenseLink(po.id, 'e1', 33.335)
    const links = await listPurchaseOrderLinksByExpenseId('e1')
    expect(links[0]!.allocated_amount).toBe(33.34)
  })

  it('migration 0090 backfills status from the old approval tickbox and re-derives approval', async () => {
    const SQL = await initSqlJs({})
    const old = new SQL.Database()
    applyMigrations(old, (f) => f < '0090')
    old.run(`INSERT INTO productions (id, name, created_at, updated_at) VALUES (?, 'T', ?, ?)`, [PRODUCTION_ID, TS, TS])
    old.run(`INSERT INTO vendors (id, production_id, company_name, created_at, updated_at) VALUES (?, ?, 'A', ?, ?)`, [
      VENDOR_ID,
      PRODUCTION_ID,
      TS,
      TS,
    ])
    const insert = (id: string, status: string, approval: number) =>
      old.run(
        `INSERT INTO vendor_purchase_orders (id, production_id, vendor_id, po_number, status, approval, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, PRODUCTION_ID, VENDOR_ID, id, status, approval, TS, TS]
      )
    insert('ticked-draft', 'draft', 1)
    insert('ticked-issued', 'issued', 1)
    insert('plain-issued', 'issued', 0)
    insert('approved-unticked', 'approved', 0)
    insert('closed-unticked', 'closed', 0)
    insert('cancelled-ticked', 'cancelled', 1)
    applyMigrations(old, (f) => f.startsWith('0090'))

    dbAdapter = createSqlJsTauriAdapter(old)
    const get = async (id: string) => (await getVendorPurchaseOrderById(id))!
    expect(await get('ticked-draft')).toMatchObject({ status: 'approved', approval: 1, currency_code: null, exchange_rate: null })
    expect(await get('ticked-issued')).toMatchObject({ status: 'approved', approval: 1 })
    expect(await get('plain-issued')).toMatchObject({ status: 'issued', approval: 0 })
    expect(await get('approved-unticked')).toMatchObject({ status: 'approved', approval: 1 })
    expect(await get('closed-unticked')).toMatchObject({ status: 'closed', approval: 1 })
    expect(await get('cancelled-ticked')).toMatchObject({ status: 'cancelled', approval: 0 })
  })
})
