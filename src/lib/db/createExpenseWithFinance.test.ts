import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>
let rawDb: Database

const removed: string[] = []
const written: string[] = []

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 'AppData' },
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async (path: string) => {
    written.push(path)
  }),
  remove: vi.fn(async (path: string) => {
    removed.push(path)
  }),
}))

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

import { createExpenseWithFinance, emptyExpenseVendorFinanceDraft } from '@/lib/db/vendorFinanceDocumentService'
import {
  amendPurchaseOrderAmount,
  listAmendmentsByPurchaseOrderIds,
} from '@/lib/db/repositories/vendorPurchaseOrderAmendments'
import { listPoCommitmentLinksByPurchaseOrderIds } from '@/lib/db/repositories/vendorFinanceLinks'
import { computePoCommitments } from '@/lib/budget/vendors/poMatching'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

const PRODUCTION_ID = 'prod-cef'
const VENDOR_A = 'vendor-a'
const VENDOR_B = 'vendor-b'
const ACCOUNT = 'acct-1'
const PO_1 = 'po-1'
const PO_2 = 'po-2'
const PO_B = 'po-b'
const INVOICE_FREE = 'inv-free'
const INVOICE_ON_PO2 = 'inv-on-po2'
const TS = '2026-06-16T12:00:00.000Z'

async function count(table: string, where = '1=1', binds: unknown[] = []): Promise<number> {
  const rows = await dbAdapter.select<Array<{ c: number }>>(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`, binds)
  return Number(rows[0]!.c)
}

async function seed(): Promise<void> {
  const SQL = await initSqlJs({})
  rawDb = new SQL.Database()
  applyAllMigrations(rawDb)
  dbAdapter = createSqlJsTauriAdapter(rawDb)
  removed.length = 0
  written.length = 0

  await dbAdapter.execute(`INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, 'Test', $2, $2)`, [
    PRODUCTION_ID,
    TS,
  ])
  for (const [id, name] of [
    [VENDOR_A, 'Vendor A'],
    [VENDOR_B, 'Vendor B'],
  ] as const) {
    await dbAdapter.execute(
      `INSERT INTO vendors (id, production_id, company_name, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)`,
      [id, PRODUCTION_ID, name, TS]
    )
  }
  await dbAdapter.execute(
    `INSERT INTO budget_accounts (id, production_id, code, name, is_postable, created_at, updated_at)
     VALUES ($1, $2, '1000', 'Camera', 1, $3, $3)`,
    [ACCOUNT, PRODUCTION_ID, TS]
  )
  for (const [id, vendor, num, amount] of [
    [PO_1, VENDOR_A, 'PO-001', 150],
    [PO_2, VENDOR_A, 'PO-002', 500],
    [PO_B, VENDOR_B, 'PO-B', 500],
  ] as const) {
    await dbAdapter.execute(
      `INSERT INTO vendor_purchase_orders (id, production_id, vendor_id, po_number, amount, status, approval, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'issued', 0, $6, $6)`,
      [id, PRODUCTION_ID, vendor, num, amount, TS]
    )
  }
  await dbAdapter.execute(
    `INSERT INTO vendor_invoices (id, production_id, vendor_id, po_id, invoice_number, amount, status, created_at, updated_at)
     VALUES ($1, $2, $3, NULL, 'INV-FREE', 100, 'received', $4, $4)`,
    [INVOICE_FREE, PRODUCTION_ID, VENDOR_A, TS]
  )
  await dbAdapter.execute(
    `INSERT INTO vendor_invoices (id, production_id, vendor_id, po_id, invoice_number, amount, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'INV-PO2', 100, 'received', $5, $5)`,
    [INVOICE_ON_PO2, PRODUCTION_ID, VENDOR_A, PO_2, TS]
  )
}

function params(over: Record<string, unknown> = {}) {
  return {
    productionId: PRODUCTION_ID,
    accountId: ACCOUNT,
    transactionType: 'purchase' as const,
    draft: { purchase_description: 'Lens', vendor_id: VENDOR_A, amount: 100 },
    vendorCompanyName: 'Vendor A',
    productionCurrency: 'GBP',
    finance: emptyExpenseVendorFinanceDraft(),
    ...over,
  }
}

describe('createExpenseWithFinance', () => {
  beforeEach(seed)

  it('creates an expense without any finance matching', async () => {
    const res = await createExpenseWithFinance(params())
    expect(res.alreadyCreated).toBe(false)
    expect(res.poIds).toEqual([])
    expect(await count('expenses')).toBe(1)
    expect(await count('vendor_purchase_order_expenses')).toBe(0)
  })

  it('creates expense + multi-PO links with allocations + new invoice and document atomically', async () => {
    const res = await createExpenseWithFinance(
      params({
        finance: {
          poAllocations: [
            { poId: PO_1, allocatedAmount: 40 },
            { poId: PO_2, allocatedAmount: 60 },
          ],
          invoiceMode: 'upload',
          existingInvoiceId: null,
          uploadInvoice: {
            invoice_number: 'INV-NEW',
            amount: 100,
            fileName: 'inv.pdf',
            bytes: new Uint8Array([1, 2, 3]),
            mimeType: 'application/pdf',
          },
        },
      })
    )
    expect(res.warnings).toEqual([])
    expect(res.poIds).toEqual([PO_1, PO_2])
    const links = await dbAdapter.select<Array<{ vendor_purchase_order_id: string; allocated_amount: number }>>(
      `SELECT vendor_purchase_order_id, allocated_amount FROM vendor_purchase_order_expenses ORDER BY allocated_amount`
    )
    expect(links.map((l) => [l.vendor_purchase_order_id, l.allocated_amount])).toEqual([
      [PO_1, 40],
      [PO_2, 60],
    ])
    expect(await count('vendor_invoices', `invoice_number = 'INV-NEW' AND po_id = $1`, [PO_1])).toBe(1)
    expect(await count('vendor_invoice_expenses', 'expense_id = $1', [res.expense.id])).toBe(1)
    expect(await count('documents', `entity_type = 'vendor_invoice'`)).toBe(1)
    expect(written).toHaveLength(1)
    expect(removed).toHaveLength(0)
  })

  it('stores a NULL allocation for a single PO (whole expense) and counts it as committed', async () => {
    const res = await createExpenseWithFinance(
      params({ finance: { ...emptyExpenseVendorFinanceDraft(), poAllocations: [{ poId: PO_1, allocatedAmount: null }] } })
    )
    const [link] = await dbAdapter.select<Array<{ allocated_amount: number | null }>>(
      `SELECT allocated_amount FROM vendor_purchase_order_expenses WHERE expense_id = $1`,
      [res.expense.id]
    )
    expect(link!.allocated_amount).toBeNull()
    const commitments = computePoCommitments(
      [{ id: PO_1, amount: 150 }],
      await listPoCommitmentLinksByPurchaseOrderIds([PO_1])
    )
    expect(commitments[PO_1]).toMatchObject({ committed: 100, remaining: 50 })
  })

  it('returns warnings (does not block) when the spend exceeds the PO remaining', async () => {
    const res = await createExpenseWithFinance(
      params({
        draft: { purchase_description: 'Big', vendor_id: VENDOR_A, amount: 200 },
        finance: { ...emptyExpenseVendorFinanceDraft(), poAllocations: [{ poId: PO_1, allocatedAmount: null }] },
      })
    )
    expect(res.warnings.map((w) => w.code)).toEqual(['over_po_remaining'])
    expect(await count('expenses')).toBe(1)
  })

  it('requires explicit allocations when matching several POs and writes nothing otherwise', async () => {
    await expect(
      createExpenseWithFinance(
        params({
          finance: {
            ...emptyExpenseVendorFinanceDraft(),
            poAllocations: [
              { poId: PO_1, allocatedAmount: 50 },
              { poId: PO_2, allocatedAmount: null },
            ],
          },
        })
      )
    ).rejects.toThrow(/allocated amount/i)
    expect(await count('expenses')).toBe(0)
  })

  it('rejects a PO from another vendor and writes nothing (no orphan expense)', async () => {
    await expect(
      createExpenseWithFinance(
        params({ finance: { ...emptyExpenseVendorFinanceDraft(), poAllocations: [{ poId: PO_B, allocatedAmount: null }] } })
      )
    ).rejects.toThrow(/same vendor/)
    expect(await count('expenses')).toBe(0)
    expect(await count('expense_transaction_details')).toBe(0)
  })

  it('requires a vendor for PO matching', async () => {
    await expect(
      createExpenseWithFinance(
        params({
          transactionType: 'allow',
          draft: { allowance_description: 'x', provisional_amount: 100 },
          finance: { ...emptyExpenseVendorFinanceDraft(), poAllocations: [{ poId: PO_1, allocatedAmount: null }] },
        })
      )
    ).rejects.toThrow()
    expect(await count('expenses')).toBe(0)
  })

  it('rolls back everything and removes written files when a late statement fails, and a retry does not duplicate', async () => {
    const realExecute = dbAdapter.execute.bind(dbAdapter)
    let failOnce = true
    const spy = vi.spyOn(dbAdapter, 'execute').mockImplementation(async (sql: string, binds?: unknown[]) => {
      if (failOnce && /INSERT INTO vendor_purchase_order_expenses/.test(sql)) {
        failOnce = false
        throw new Error('boom')
      }
      return realExecute(sql, binds)
    })

    const expenseId = 'exp-retry'
    const finance = {
      poAllocations: [{ poId: PO_1, allocatedAmount: null }],
      invoiceMode: 'upload' as const,
      existingInvoiceId: null,
      uploadInvoice: { invoice_number: 'INV-RETRY', fileName: 'a.pdf', bytes: new Uint8Array([9]) },
    }
    await expect(createExpenseWithFinance(params({ expenseId, finance }))).rejects.toThrow('boom')

    expect(await count('expenses')).toBe(0)
    expect(await count('vendor_invoices', `invoice_number = 'INV-RETRY'`)).toBe(0)
    expect(await count('documents')).toBe(0)
    expect(await count('outbox', `entity = 'expenses'`)).toBe(0)
    expect(removed).toEqual(written)

    // Retry with the same id succeeds with exactly one expense / invoice / link.
    const ok = await createExpenseWithFinance(params({ expenseId, finance }))
    expect(ok.alreadyCreated).toBe(false)
    expect(await count('expenses')).toBe(1)
    expect(await count('vendor_invoices', `invoice_number = 'INV-RETRY'`)).toBe(1)
    expect(await count('vendor_purchase_order_expenses')).toBe(1)

    // A further retry (UI never saw the success) is a no-op.
    const again = await createExpenseWithFinance(params({ expenseId, finance }))
    expect(again.alreadyCreated).toBe(true)
    expect(again.expense.id).toBe(expenseId)
    expect(await count('expenses')).toBe(1)
    expect(await count('vendor_invoices', `invoice_number = 'INV-RETRY'`)).toBe(1)
    spy.mockRestore()
  })

  it('does not overwrite an existing invoice.po_id and warns instead', async () => {
    const res = await createExpenseWithFinance(
      params({
        finance: {
          poAllocations: [{ poId: PO_1, allocatedAmount: null }],
          invoiceMode: 'existing',
          existingInvoiceId: INVOICE_ON_PO2,
          uploadInvoice: null,
        },
      })
    )
    const [inv] = await dbAdapter.select<Array<{ po_id: string }>>(`SELECT po_id FROM vendor_invoices WHERE id = $1`, [
      INVOICE_ON_PO2,
    ])
    expect(inv!.po_id).toBe(PO_2)
    expect(res.warnings.map((w) => w.code)).toContain('invoice_on_different_po')
    expect(await count('vendor_invoice_expenses')).toBe(1)
  })

  it('fills in invoice.po_id when the invoice has none', async () => {
    await createExpenseWithFinance(
      params({
        finance: {
          poAllocations: [{ poId: PO_1, allocatedAmount: null }],
          invoiceMode: 'existing',
          existingInvoiceId: INVOICE_FREE,
          uploadInvoice: null,
        },
      })
    )
    const [inv] = await dbAdapter.select<Array<{ po_id: string }>>(`SELECT po_id FROM vendor_invoices WHERE id = $1`, [
      INVOICE_FREE,
    ])
    expect(inv!.po_id).toBe(PO_1)
  })
})

describe('amendPurchaseOrderAmount', () => {
  beforeEach(seed)

  it('updates the PO amount and writes an amendment row in one go', async () => {
    const { purchaseOrder, amendment } = await amendPurchaseOrderAmount({
      poId: PO_1,
      newAmount: 250,
      reason: '  Client uplift  ',
    })
    expect(purchaseOrder.amount).toBe(250)
    expect(amendment).toMatchObject({
      vendor_purchase_order_id: PO_1,
      previous_amount: 150,
      new_amount: 250,
      reason: 'Client uplift',
    })
    expect(await count('outbox', `entity = 'vendor_purchase_order_amendments'`)).toBe(1)
    expect(await count('outbox', `entity = 'vendor_purchase_orders' AND operation = 'update'`)).toBe(1)
  })

  it('treats the reason as optional and keeps a history in order', async () => {
    await amendPurchaseOrderAmount({ poId: PO_1, newAmount: 200 })
    await amendPurchaseOrderAmount({ poId: PO_1, newAmount: 300, reason: 'More' })
    const history = (await listAmendmentsByPurchaseOrderIds([PO_1]))[PO_1]!
    expect(history.map((h) => [h.previous_amount, h.new_amount, h.reason]).sort()).toEqual([
      [150, 200, null],
      [200, 300, 'More'],
    ])
  })

  it('rejects non-positive, non-finite and unchanged amounts without writing', async () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(amendPurchaseOrderAmount({ poId: PO_1, newAmount: bad })).rejects.toThrow(/greater than 0/)
    }
    await expect(amendPurchaseOrderAmount({ poId: PO_1, newAmount: 150 })).rejects.toThrow(/same as the current/)
    expect(await count('vendor_purchase_order_amendments')).toBe(0)
  })

  it('rejects an unknown PO', async () => {
    await expect(amendPurchaseOrderAmount({ poId: 'nope', newAmount: 10 })).rejects.toThrow(/not found/)
  })

  it('sets the amount on a PO that had none', async () => {
    await dbAdapter.execute(`UPDATE vendor_purchase_orders SET amount = NULL WHERE id = $1`, [PO_1])
    const { amendment } = await amendPurchaseOrderAmount({ poId: PO_1, newAmount: 99 })
    expect(amendment.previous_amount).toBeNull()
  })

  it('is atomic: a failing amendment insert leaves the PO amount unchanged', async () => {
    const realExecute = dbAdapter.execute.bind(dbAdapter)
    const spy = vi.spyOn(dbAdapter, 'execute').mockImplementation(async (sql: string, binds?: unknown[]) => {
      if (/UPDATE vendor_purchase_orders SET amount/.test(sql)) throw new Error('boom')
      return realExecute(sql, binds)
    })
    await expect(amendPurchaseOrderAmount({ poId: PO_1, newAmount: 999 })).rejects.toThrow('boom')
    spy.mockRestore()
    const [po] = await dbAdapter.select<Array<{ amount: number }>>(`SELECT amount FROM vendor_purchase_orders WHERE id = $1`, [PO_1])
    expect(po!.amount).toBe(150)
    expect(await count('vendor_purchase_order_amendments')).toBe(0)
  })

  it('saves other PO fields in the same transaction as the amendment', async () => {
    const { purchaseOrder } = await amendPurchaseOrderAmount({
      poId: PO_1,
      newAmount: 400,
      reason: 'Uplift',
      patch: { description: 'Lenses + filters', status: 'approved' },
    })
    expect(purchaseOrder).toMatchObject({ amount: 400, description: 'Lenses + filters', status: 'approved' })
    expect(await count('vendor_purchase_order_amendments', 'vendor_purchase_order_id = $1', [PO_1])).toBe(1)
  })

  it('lists amendments for many POs in one batched query', async () => {
    await amendPurchaseOrderAmount({ poId: PO_1, newAmount: 200 })
    await amendPurchaseOrderAmount({ poId: PO_1, newAmount: 300, reason: 'More' })
    const byPo = await listAmendmentsByPurchaseOrderIds([PO_1, PO_2])
    expect(Object.keys(byPo).sort()).toEqual([PO_1, PO_2])
    expect(byPo[PO_1]!.map((a) => a.new_amount).sort()).toEqual([200, 300])
    expect(byPo[PO_2]).toEqual([])
    expect(await listAmendmentsByPurchaseOrderIds([])).toEqual({})
  })
})
