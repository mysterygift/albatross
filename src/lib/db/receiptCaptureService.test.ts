import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>
const written: string[] = []

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 'AppData' },
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async (path: string) => {
    written.push(path)
  }),
  remove: vi.fn(async () => undefined),
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
          if (open) await db.execute('ROLLBACK', []).catch(() => undefined)
          throw e
        }
      }
    ),
  }
})

import { saveCapturedReceipt, type SaveCapturedReceiptInput } from '@/lib/db/receiptCaptureService'
import { resolveBudgetRevisionId } from '@/lib/db/repositories/budgetRevisions'
import { createFloat, listFloatsByProduction } from '@/lib/db/repositories/floats'

const P = 'prod-toothpick'
const OTHER = 'prod-other'
const TS = '2026-11-04T15:31:00.000Z'

async function count(table: string, where = '1=1', binds: unknown[] = []): Promise<number> {
  const rows = await dbAdapter.select<Array<{ c: number }>>(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`, binds)
  return Number(rows[0]!.c)
}

async function addFloat(productionId: string, personId: string, itemId: string): Promise<string> {
  const revisionId = await resolveBudgetRevisionId({ productionId })
  await dbAdapter.execute(
    `INSERT INTO budget_items (id, production_id, account_id, budget_revision_id, description, estimated_cost, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Props purchase', 2000, $5, $5)`,
    [itemId, productionId, productionId === P ? 'acc-3009' : 'acc-other', revisionId, TS]
  )
  await createFloat({
    production_id: productionId,
    budget_item_id: itemId,
    person_id: personId,
    amount: 400,
    currency: 'GBP',
    issued_date: '2026-10-20',
  })
  const floats = await listFloatsByProduction(productionId)
  return floats.find((f) => f.budget_item_id === itemId)!.id
}

function input(overrides: Partial<SaveCapturedReceiptInput> = {}): SaveCapturedReceiptInput {
  return {
    expenseId: 'exp-receipt-1',
    productionId: P,
    productionCurrency: 'GBP',
    accountId: 'acc-3009',
    amount: 114.12,
    date: '2026-11-04',
    description: 'Beer mats, pint glasses and bar towels for Sc 10',
    vendorId: 'vendor-rusholme',
    vendorName: 'Rusholme Props & Dressing',
    notes: null,
    reference: 'T-4417',
    vatRatePercent: 20,
    floatId: null,
    receipt: { fileName: 'receipt-2026-11-04-rusholme-props-dressing.jpg', bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
    ...overrides,
  }
}

describe('saveCapturedReceipt', () => {
  beforeEach(async () => {
    const SQL = await initSqlJs({})
    const raw = new SQL.Database()
    applyAlbatrossMigrationsSqlJs(raw)
    dbAdapter = createSqlJsTauriAdapter(raw)
    written.length = 0
    for (const id of [P, OTHER]) {
      await dbAdapter.execute(`INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, $1, $2, $2)`, [id, TS])
      await dbAdapter.execute(
        `INSERT INTO budget_accounts (id, production_id, code, name, is_postable, created_at, updated_at)
         VALUES ($1, $2, '3009', 'Props Purchase', 1, $3, $3)`,
        [id === P ? 'acc-3009' : 'acc-other', id, TS]
      )
      await dbAdapter.execute(
        `INSERT INTO people (id, production_id, name, is_cast, department, created_at, updated_at)
         VALUES ($1, $2, 'Lakshmi Iyer', 0, 'Art', $3, $3)`,
        [id === P ? 'lakshmi' : 'lakshmi-other', id, TS]
      )
    }
    await dbAdapter.execute(
      `INSERT INTO vendors (id, production_id, company_name, created_at, updated_at) VALUES ('vendor-rusholme', $1, 'Rusholme Props & Dressing', $2, $2)`,
      [P, TS]
    )
  })

  it('saves a purchase expense with the photo as its receipt', async () => {
    const result = await saveCapturedReceipt(input())
    expect(result.alreadyCreated).toBe(false)
    expect(result.floatMatched).toBe(false)
    expect(result.floatError).toBeNull()

    const [expense] = await dbAdapter.select<Record<string, unknown>[]>(`SELECT * FROM expenses WHERE id = 'exp-receipt-1'`)
    expect(expense).toMatchObject({
      account_id: 'acc-3009',
      transaction_type: 'purchase',
      vendor_id: 'vendor-rusholme',
      date: '2026-11-04',
      vat_rate_percent: 20,
    })
    expect(Number(expense!.amount)).toBe(114.12)

    const [details] = await dbAdapter.select<Array<{ details_json: string }>>(
      `SELECT details_json FROM expense_transaction_details WHERE expense_id = 'exp-receipt-1'`
    )
    expect(JSON.parse(details!.details_json)).toMatchObject({
      purchase_description: 'Beer mats, pint glasses and bar towels for Sc 10',
      vendor_id: 'vendor-rusholme',
      amount: 114.12,
    })

    const [receipt] = await dbAdapter.select<Record<string, unknown>[]>(
      `SELECT r.receipt_date, r.amount, r.reference, d.entity_type, d.file_name
       FROM expense_receipts r JOIN documents d ON d.id = r.document_id WHERE r.expense_id = 'exp-receipt-1'`
    )
    expect(receipt).toMatchObject({ receipt_date: '2026-11-04', reference: 'T-4417', entity_type: 'expense_receipt' })
    expect(Number(receipt!.amount)).toBe(114.12)
    expect(written).toHaveLength(1)
  })

  it('matches the spend to a float', async () => {
    const floatId = await addFloat(P, 'lakshmi', 'item-props')
    const result = await saveCapturedReceipt(input({ floatId }))
    expect(result.floatMatched).toBe(true)
    const links = await dbAdapter.select<Array<{ float_id: string; matched_amount: number }>>(
      `SELECT float_id, matched_amount FROM float_expense_links WHERE expense_id = 'exp-receipt-1' AND deleted_at IS NULL`
    )
    expect(links).toEqual([{ float_id: floatId, matched_amount: 114.12 }])
  })

  it('creates nothing twice when a save is retried with the same id', async () => {
    const floatId = await addFloat(P, 'lakshmi', 'item-props')
    await saveCapturedReceipt(input({ floatId }))
    const retry = await saveCapturedReceipt(input({ floatId }))
    expect(retry.alreadyCreated).toBe(true)
    expect(retry.floatMatched).toBe(true)
    expect(await count('expenses', `id = 'exp-receipt-1'`)).toBe(1)
    expect(await count('expense_receipts', `expense_id = 'exp-receipt-1'`)).toBe(1)
    expect(await count('float_expense_links', `expense_id = 'exp-receipt-1' AND deleted_at IS NULL`)).toBe(1)
  })

  it('keeps the expense and reports why when the float match fails', async () => {
    const otherFloat = await addFloat(OTHER, 'lakshmi-other', 'item-other')
    const result = await saveCapturedReceipt(input({ floatId: otherFloat }))
    expect(result.floatMatched).toBe(false)
    expect(result.floatError).toMatch(/does not belong to this production/)
    expect(await count('expenses', `id = 'exp-receipt-1'`)).toBe(1)
    expect(await count('expense_receipts', `expense_id = 'exp-receipt-1'`)).toBe(1)
  })

  it('writes nothing for an account in another production', async () => {
    await expect(saveCapturedReceipt(input({ accountId: 'acc-other' }))).rejects.toThrow(/does not belong/)
    expect(await count('expenses')).toBe(0)
    expect(await count('expense_receipts')).toBe(0)
  })
})
