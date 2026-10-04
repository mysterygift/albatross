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

import {
  attachReceiptToExpense,
  buildExpenseReceiptPlan,
  RECEIPT_FILE_REQUIRED_MESSAGE,
  updateExpenseReceiptDetails,
} from '@/lib/db/expenseReceiptService'
import { listReceiptsByExpense, listReceiptStatusByExpenseIds } from '@/lib/db/repositories/expenseReceipts'
import { applyFinanceDraftToExpense } from '@/lib/db/applyFinanceDraftToExpense'
import { createExpenseWithFinance, emptyExpenseVendorFinanceDraft } from '@/lib/db/vendorFinanceDocumentService'
import { expenseHasProof, getExpenseProofKind } from '@/lib/budget/receiptStatus'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

const PRODUCTION_ID = 'prod-rcpt'
const VENDOR_A = 'vendor-a'
const ACCOUNT = 'acct-1'
const TS = '2026-06-16T12:00:00.000Z'
const FILE = { fileName: 'till.pdf', bytes: new Uint8Array([1, 2, 3]), mimeType: 'application/pdf' }

async function count(table: string, where = '1=1', binds: unknown[] = []): Promise<number> {
  const rows = await dbAdapter.select<Array<{ c: number }>>(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`, binds)
  return Number(rows[0]!.c)
}

async function insertExpense(id: string, vendorId: string | null = null): Promise<void> {
  await dbAdapter.execute(
    `INSERT INTO expenses (id, production_id, account_id, vendor_id, amount, date, transaction_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 25, '2026-06-16', 'purchase', $5, $5)`,
    [id, PRODUCTION_ID, ACCOUNT, vendorId, TS]
  )
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
  await dbAdapter.execute(
    `INSERT INTO vendors (id, production_id, company_name, created_at, updated_at) VALUES ($1, $2, 'Vendor A', $3, $3)`,
    [VENDOR_A, PRODUCTION_ID, TS]
  )
  await dbAdapter.execute(
    `INSERT INTO budget_accounts (id, production_id, code, name, is_postable, created_at, updated_at)
     VALUES ($1, $2, '1000', 'Camera', 1, $3, $3)`,
    [ACCOUNT, PRODUCTION_ID, TS]
  )
}

describe('buildExpenseReceiptPlan', () => {
  beforeEach(seed)

  it('is a no-op for an empty draft', async () => {
    expect(await buildExpenseReceiptPlan({ expenseId: 'e', productionId: PRODUCTION_ID }, null, TS)).toEqual({
      statements: [],
      writtenFilePaths: [],
    })
    expect(written).toHaveLength(0)
  })

  it('rejects details without a file and writes nothing', async () => {
    await expect(
      buildExpenseReceiptPlan({ expenseId: 'e', productionId: PRODUCTION_ID }, { reference: 'R-1' }, TS)
    ).rejects.toThrow(RECEIPT_FILE_REQUIRED_MESSAGE)
    expect(written).toHaveLength(0)
  })

  it('validates date and amount before writing the file', async () => {
    const target = { expenseId: 'e', productionId: PRODUCTION_ID }
    await expect(buildExpenseReceiptPlan(target, { ...FILE, receiptDate: '16/06/2026' }, TS)).rejects.toThrow(/date/i)
    await expect(buildExpenseReceiptPlan(target, { ...FILE, receiptAmount: -1 }, TS)).rejects.toThrow(/amount/i)
    expect(written).toHaveLength(0)
  })
})

describe('receipt service on an existing expense (no vendor)', () => {
  beforeEach(seed)

  it('attaches a receipt as a document on the expense plus a metadata row', async () => {
    await insertExpense('e1')
    const receipt = await attachReceiptToExpense('e1', {
      ...FILE,
      receiptDate: '2026-06-15',
      receiptAmount: 24.5,
      reference: ' T-100 ',
    })
    expect(receipt).toMatchObject({ expense_id: 'e1', receipt_date: '2026-06-15', amount: 24.5, reference: 'T-100' })
    expect(receipt.document).toMatchObject({
      entity_type: 'expense_receipt',
      entity_id: 'e1',
      file_name: 'till.pdf',
      production_id: PRODUCTION_ID,
    })
    expect(written).toHaveLength(1)
    expect(await count('outbox', `entity = 'expense_receipts'`)).toBe(1)
    expect((await listReceiptsByExpense('e1')).map((r) => r.id)).toEqual([receipt.id])
  })

  it('rejects an unknown or deleted expense without writing a file', async () => {
    await expect(attachReceiptToExpense('missing', FILE)).rejects.toThrow(/not found/i)
    expect(written).toHaveLength(0)
  })

  it('rolls back the document and removes the file when the transaction fails', async () => {
    await insertExpense('e1')
    rawDb.exec('DROP TABLE expense_receipts')
    await expect(attachReceiptToExpense('e1', FILE)).rejects.toThrow()
    expect(await count('documents')).toBe(0)
    expect(written).toHaveLength(1)
    expect(removed).toEqual(written)
  })

  it('updates the receipt details', async () => {
    await insertExpense('e1')
    const r = await attachReceiptToExpense('e1', FILE)
    const updated = await updateExpenseReceiptDetails(r.id, { reference: 'NEW', receiptAmount: 10 })
    expect(updated).toMatchObject({ reference: 'NEW', amount: 10 })
  })
})

describe('listReceiptStatusByExpenseIds', () => {
  beforeEach(seed)

  it('returns an entry for every id, batched, counting receipts and linked-invoice files', async () => {
    await insertExpense('e-receipt')
    await insertExpense('e-invoice', VENDOR_A)
    await insertExpense('e-invoice-nofile', VENDOR_A)
    await insertExpense('e-none')
    await attachReceiptToExpense('e-receipt', FILE)

    for (const [id, withFile] of [
      ['inv-1', true],
      ['inv-2', false],
    ] as const) {
      await dbAdapter.execute(
        `INSERT INTO vendor_invoices (id, production_id, vendor_id, invoice_number, status, created_at, updated_at)
         VALUES ($1, $2, $3, $1, 'received', $4, $4)`,
        [id, PRODUCTION_ID, VENDOR_A, TS]
      )
      if (withFile) {
        await dbAdapter.execute(
          `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, created_at, updated_at)
           VALUES ('doc-inv', $1, 'vendor_invoice', $2, 'i.pdf', 'attachments/i.pdf', $3, $3)`,
          [PRODUCTION_ID, id, TS]
        )
      }
    }
    await dbAdapter.execute(
      `INSERT INTO vendor_invoice_expenses (id, vendor_invoice_id, expense_id, created_at, updated_at) VALUES ('l1', 'inv-1', 'e-invoice', $1, $1), ('l2', 'inv-2', 'e-invoice-nofile', $1, $1)`,
      [TS]
    )

    const status = await listReceiptStatusByExpenseIds(['e-receipt', 'e-invoice', 'e-invoice-nofile', 'e-none', 'e-receipt'])
    expect(Object.keys(status).sort()).toEqual(['e-invoice', 'e-invoice-nofile', 'e-none', 'e-receipt'])
    expect(getExpenseProofKind(status['e-receipt'])).toBe('receipt')
    expect(getExpenseProofKind(status['e-invoice'])).toBe('invoice')
    expect(expenseHasProof(status['e-invoice-nofile'])).toBe(false)
    expect(expenseHasProof(status['e-none'])).toBe(false)
    expect(await listReceiptStatusByExpenseIds([])).toEqual({})
  })

  it('ignores removed receipts', async () => {
    await insertExpense('e1')
    const r = await attachReceiptToExpense('e1', FILE)
    await applyFinanceDraftToExpense({
      expenseId: 'e1',
      productionCurrency: 'GBP',
      draft: { ...emptyExpenseVendorFinanceDraft(), removeReceiptIds: [r.id] },
    })
    expect((await listReceiptStatusByExpenseIds(['e1']))['e1']).toEqual({ receiptCount: 0, invoiceDocumentCount: 0 })
  })
})

describe('createExpenseWithFinance with a receipt', () => {
  beforeEach(seed)

  function params(over: Record<string, unknown> = {}) {
    return {
      productionId: PRODUCTION_ID,
      accountId: ACCOUNT,
      transactionType: 'purchase' as const,
      draft: { purchase_description: 'Gaffer tape', amount: 25 },
      vendorCompanyName: 'Vendor A',
      productionCurrency: 'GBP',
      finance: { ...emptyExpenseVendorFinanceDraft(), receipt: { ...FILE, reference: 'T-9' } },
      ...over,
    }
  }

  it('saves the receipt with the expense in one transaction, with no vendor', async () => {
    const res = await createExpenseWithFinance(params())
    const receipts = await listReceiptsByExpense(res.expense.id)
    expect(receipts).toHaveLength(1)
    expect(receipts[0]).toMatchObject({ reference: 'T-9' })
    expect(receipts[0]!.document.entity_type).toBe('expense_receipt')
    expect(written).toHaveLength(1)
    expect(removed).toHaveLength(0)
  })

  it('writes nothing and removes the file when the transaction fails', async () => {
    rawDb.exec('DROP TABLE expense_receipts')
    await expect(createExpenseWithFinance(params())).rejects.toThrow()
    expect(await count('expenses')).toBe(0)
    expect(await count('documents')).toBe(0)
    expect(removed).toEqual(written)
    expect(written).toHaveLength(1)
  })

  it('rejects receipt details without a file before saving the expense', async () => {
    await expect(
      createExpenseWithFinance(params({ finance: { ...emptyExpenseVendorFinanceDraft(), receipt: { reference: 'x' } } }))
    ).rejects.toThrow(RECEIPT_FILE_REQUIRED_MESSAGE)
    expect(await count('expenses')).toBe(0)
  })

  it('does not duplicate the receipt on a same-id retry', async () => {
    const p = params({ expenseId: 'fixed-id' })
    await createExpenseWithFinance(p)
    const again = await createExpenseWithFinance(p)
    expect(again.alreadyCreated).toBe(true)
    expect(await count('expense_receipts')).toBe(1)
  })
})
