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

import { applyFinanceDraftToExpense } from '@/lib/db/applyFinanceDraftToExpense'
import { createExpenseWithFinance, emptyExpenseVendorFinanceDraft } from '@/lib/db/vendorFinanceDocumentService'
import { listReceiptsByExpense } from '@/lib/db/repositories/expenseReceipts'
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

const draftOf = (over: Partial<ReturnType<typeof emptyExpenseVendorFinanceDraft>>) => ({
  ...emptyExpenseVendorFinanceDraft(),
  ...over,
})
const apply = (expenseId: string, draft: ReturnType<typeof draftOf>) =>
  applyFinanceDraftToExpense({ expenseId, productionCurrency: 'GBP', draft })
const FILE = { fileName: 'r.pdf', bytes: new Uint8Array([1, 2, 3]), mimeType: 'application/pdf' }

async function newExpense(finance = emptyExpenseVendorFinanceDraft(), over: Record<string, unknown> = {}) {
  return (await createExpenseWithFinance(params({ finance, ...over }))).expense
}

async function committed(poId: string): Promise<number> {
  const links = await listPoCommitmentLinksByPurchaseOrderIds([poId])
  return computePoCommitments([{ id: poId, amount: 1000 }], links)[poId]!.committed
}

describe('applyFinanceDraftToExpense: POs', () => {
  beforeEach(seed)

  it('adds a PO link, journals it, and committed follows', async () => {
    const e = await newExpense()
    const res = await apply(e.id, draftOf({ poAllocations: [{ poId: PO_1, allocatedAmount: null }] }))
    expect(res).toMatchObject({ changed: true, affectedPoIds: [PO_1] })
    expect(await count('vendor_purchase_order_expenses', 'expense_id = $1', [e.id])).toBe(1)
    expect(await count('outbox', `entity = 'vendor_purchase_order_expenses' AND operation = 'create'`)).toBe(1)
    expect(await committed(PO_1)).toBe(100)
  })

  it('removes a link and the committed figure recomputes; the PO itself is untouched', async () => {
    const e = await newExpense(draftOf({ poAllocations: [{ poId: PO_1, allocatedAmount: null }] }))
    expect(await committed(PO_1)).toBe(100)
    const res = await apply(e.id, draftOf({ poAllocations: [] }))
    expect(res.affectedPoIds).toEqual([PO_1])
    expect(await count('vendor_purchase_order_expenses')).toBe(0)
    expect(await committed(PO_1)).toBe(0)
    expect(await count('outbox', `entity = 'vendor_purchase_order_expenses' AND operation = 'delete'`)).toBe(1)
    expect(await count('vendor_purchase_orders', 'deleted_at IS NULL')).toBe(3)
  })

  it('splits one PO into two with explicit allocations (re-allocates the existing link)', async () => {
    const e = await newExpense(draftOf({ poAllocations: [{ poId: PO_1, allocatedAmount: null }] }))
    const res = await apply(
      e.id,
      draftOf({
        poAllocations: [
          { poId: PO_1, allocatedAmount: 40 },
          { poId: PO_2, allocatedAmount: 60 },
        ],
      })
    )
    expect(res.warnings).toEqual([])
    expect(new Set(res.affectedPoIds)).toEqual(new Set([PO_1, PO_2]))
    expect(await committed(PO_1)).toBe(40)
    expect(await committed(PO_2)).toBe(60)
    expect(await count('outbox', `entity = 'vendor_purchase_order_expenses' AND operation = 'update'`)).toBe(1)
  })

  it('stores a single PO that carries the whole amount as NULL, and is a no-op when nothing changed', async () => {
    const e = await newExpense(draftOf({ poAllocations: [{ poId: PO_1, allocatedAmount: null }] }))
    const res = await apply(e.id, draftOf({ poAllocations: [{ poId: PO_1, allocatedAmount: 100 }] }))
    expect(res).toMatchObject({ changed: false, affectedPoIds: [] })
    const [row] = await dbAdapter.select<Array<{ allocated_amount: number | null }>>(
      `SELECT allocated_amount FROM vendor_purchase_order_expenses`
    )
    expect(row!.allocated_amount).toBeNull()
  })

  it('refuses several POs without an allocation each, and POs of another vendor, writing nothing', async () => {
    const e = await newExpense()
    await expect(
      apply(e.id, draftOf({ poAllocations: [{ poId: PO_1, allocatedAmount: 50 }, { poId: PO_2, allocatedAmount: null }] }))
    ).rejects.toThrow(/allocated amount for each/)
    await expect(apply(e.id, draftOf({ poAllocations: [{ poId: PO_B, allocatedAmount: null }] }))).rejects.toThrow(
      /same vendor/
    )
    expect(await count('vendor_purchase_order_expenses')).toBe(0)
  })

  it('warns (never blocks) when the PO would be over-committed', async () => {
    const e = await newExpense(draftOf({}), { draft: { purchase_description: 'Big', vendor_id: VENDOR_A, amount: 400 } })
    const res = await apply(e.id, draftOf({ poAllocations: [{ poId: PO_1, allocatedAmount: null }] }))
    expect(res.changed).toBe(true)
    expect(res.warnings.map((w) => w.code)).toEqual(['over_po_remaining'])
    expect(await count('vendor_purchase_order_expenses')).toBe(1)
  })
})

describe('applyFinanceDraftToExpense: invoices', () => {
  beforeEach(seed)

  it('links an existing invoice, then unlinks it without touching the invoice record', async () => {
    const e = await newExpense()
    const linked = await apply(e.id, draftOf({ invoiceMode: 'existing', existingInvoiceId: INVOICE_FREE }))
    expect(linked.affectedInvoiceIds).toEqual([INVOICE_FREE])
    expect(await count('vendor_invoice_expenses', 'expense_id = $1', [e.id])).toBe(1)
    expect(await count('outbox', `entity = 'vendor_invoice_expenses' AND operation = 'create'`)).toBe(1)

    await expect(
      apply(e.id, draftOf({ invoiceMode: 'existing', existingInvoiceId: INVOICE_FREE }))
    ).rejects.toThrow(/already linked/)

    const [before] = await dbAdapter.select<Array<Record<string, unknown>>>(`SELECT * FROM vendor_invoices WHERE id = $1`, [INVOICE_FREE])
    await apply(e.id, draftOf({ unlinkInvoiceIds: [INVOICE_FREE] }))
    expect(await count('vendor_invoice_expenses')).toBe(0)
    expect(await count('outbox', `entity = 'vendor_invoice_expenses' AND operation = 'delete'`)).toBe(1)
    const [after] = await dbAdapter.select<Array<Record<string, unknown>>>(`SELECT * FROM vendor_invoices WHERE id = $1`, [INVOICE_FREE])
    expect(after).toEqual(before)
  })

  it('swaps one invoice for another in a single apply', async () => {
    const e = await newExpense(draftOf({ invoiceMode: 'existing', existingInvoiceId: INVOICE_FREE }))
    await apply(
      e.id,
      draftOf({ unlinkInvoiceIds: [INVOICE_FREE], invoiceMode: 'existing', existingInvoiceId: INVOICE_ON_PO2 })
    )
    const links = await dbAdapter.select<Array<{ vendor_invoice_id: string }>>(`SELECT vendor_invoice_id FROM vendor_invoice_expenses`)
    expect(links.map((l) => l.vendor_invoice_id)).toEqual([INVOICE_ON_PO2])
  })

  it('uploads a new invoice with its file and the first PO, atomically', async () => {
    const e = await newExpense()
    const res = await apply(
      e.id,
      draftOf({
        poAllocations: [{ poId: PO_2, allocatedAmount: null }],
        invoiceMode: 'upload',
        uploadInvoice: { invoice_number: 'INV-NEW', amount: 100, ...FILE },
      })
    )
    expect(res.affectedInvoiceIds).toHaveLength(1)
    expect(await count('vendor_invoices', `invoice_number = 'INV-NEW' AND po_id = $1`, [PO_2])).toBe(1)
    expect(await count('documents', `entity_type = 'vendor_invoice'`)).toBe(1)
    expect(written).toHaveLength(1)
  })

  it('rolls everything back and removes written files when a later statement fails', async () => {
    const e = await newExpense()
    rawDb.exec(`CREATE TRIGGER fail_link BEFORE INSERT ON vendor_purchase_order_expenses BEGIN SELECT RAISE(ABORT, 'boom'); END`)
    await expect(
      apply(
        e.id,
        draftOf({
          poAllocations: [{ poId: PO_1, allocatedAmount: null }],
          invoiceMode: 'upload',
          uploadInvoice: { invoice_number: 'INV-X', ...FILE },
          receipt: { ...FILE, reference: 'R' },
        })
      )
    ).rejects.toThrow()
    expect(await count('vendor_invoices', `invoice_number = 'INV-X'`)).toBe(0)
    expect(await count('documents')).toBe(0)
    expect(await count('vendor_invoice_expenses')).toBe(0)
    expect(written).toHaveLength(2)
    expect(new Set(removed)).toEqual(new Set(written))
  })
})

describe('applyFinanceDraftToExpense: receipts', () => {
  beforeEach(seed)

  it('attaches, replaces and removes receipts, including on a vendorless expense', async () => {
    const e = await newExpense(draftOf({}), { draft: { purchase_description: 'Tape', amount: 25 } })
    expect(e.vendor_id).toBeNull()

    await apply(e.id, draftOf({ receipt: { ...FILE, reference: 'T-1' } }))
    await apply(e.id, draftOf({ receipt: { ...FILE, fileName: 'second.pdf' } }))
    const [first, second] = await listReceiptsByExpense(e.id)
    expect(first).toMatchObject({ reference: 'T-1' })

    await apply(
      e.id,
      draftOf({
        replaceReceiptFiles: { [first!.id]: { fileName: 'new.png', bytes: new Uint8Array([9]) } },
        removeReceiptIds: [second!.id],
      })
    )
    const remaining = await listReceiptsByExpense(e.id)
    expect(remaining.map((r) => [r.id, r.reference, r.document.file_name])).toEqual([[first!.id, 'T-1', 'new.png']])
    expect(await count('documents', `entity_type = 'expense_receipt' AND deleted_at IS NULL`)).toBe(1)
    expect(await count('outbox', `entity = 'expense_receipts' AND operation = 'delete'`)).toBe(1)
  })

  it('rejects a receipt that belongs to another expense without writing', async () => {
    const a = await newExpense(draftOf({ receipt: FILE }))
    const b = await newExpense()
    const [receipt] = await listReceiptsByExpense(a.id)
    await expect(apply(b.id, draftOf({ removeReceiptIds: [receipt!.id] }))).rejects.toThrow(/not found/)
    expect(await listReceiptsByExpense(a.id)).toHaveLength(1)
  })

  it('needs a vendor for PO matching but still lets a vendorless expense drop links', async () => {
    const e = await newExpense(draftOf({}), { draft: { purchase_description: 'Tape', amount: 25 } })
    await expect(apply(e.id, draftOf({ poAllocations: [{ poId: PO_1, allocatedAmount: null }] }))).rejects.toThrow(/vendor is required/)
    expect(await count('vendor_purchase_order_expenses')).toBe(0)
  })
})
