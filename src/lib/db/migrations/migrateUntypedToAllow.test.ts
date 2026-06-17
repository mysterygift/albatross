import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import {
  buildDefaultAllowLineItemDetails,
  buildMigratedAllowExpenseDetails,
  buildMigratedAllowLineItemDetails,
} from '@/lib/budget/migrations/untypedToAllow'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
    uuid: () => '00000000-0000-4000-8000-000000000001',
    now: () => '2026-01-01T00:00:00.000Z',
  }
})

vi.mock('@/lib/db/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/outbox')>()
  return {
    ...actual,
    outboxStatementForRow: () => ({
      sql: 'SELECT 1',
      bindValues: [],
    }),
  }
})

import { setDbAdapterForTests } from '@/lib/db/client'
import {
  countUntypedBudgetClassifications,
  migrateUntypedToAllow,
} from '@/lib/db/migrations/migrateUntypedToAllow'

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  db.exec(`
    CREATE TABLE expenses (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      category_id TEXT,
      account_id TEXT,
      transaction_type TEXT,
      vendor_id TEXT,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      vendor TEXT,
      notes TEXT,
      expense_type TEXT DEFAULT 'other',
      vat_rate_percent REAL,
      vat_reclaimed_amount REAL,
      vat_reclaim_date TEXT,
      vat_reclaim_reference TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE expense_transaction_details (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL UNIQUE,
      transaction_type TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE budget_items (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      budget_revision_id TEXT,
      category_id TEXT,
      account_id TEXT,
      description TEXT NOT NULL,
      estimated_cost REAL NOT NULL DEFAULT 0,
      actual_cost REAL NOT NULL DEFAULT 0,
      vendor TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      line_item_type TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE budget_item_details (
      id TEXT PRIMARY KEY,
      budget_item_id TEXT NOT NULL UNIQUE,
      line_item_type TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE outbox (
      id TEXT PRIMARY KEY,
      entity_table TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  dbAdapter = createSqlJsTauriAdapter(db)
  setDbAdapterForTests(dbAdapter)
  return db
}

describe('untypedToAllow helpers', () => {
  it('builds migrated expense details from notes, vendor, or fallback', () => {
    expect(buildMigratedAllowExpenseDetails({ notes: '  Kit hire  ', vendor: 'Acme', amount: 500 })).toEqual({
      allow_description: 'Kit hire',
      provisional_amount: 500,
      status: 'resolved',
      notes: 'Kit hire',
    })
    expect(buildMigratedAllowExpenseDetails({ notes: null, vendor: 'Acme', amount: 0 })).toEqual({
      allow_description: 'Acme',
      provisional_amount: null,
      status: 'resolved',
      notes: null,
    })
    expect(buildMigratedAllowExpenseDetails({ notes: null, vendor: null, amount: 10 })).toEqual({
      allow_description: 'General spend',
      provisional_amount: 10,
      status: 'resolved',
      notes: null,
    })
  })

  it('builds migrated line item details with open status', () => {
    expect(buildMigratedAllowLineItemDetails({ description: 'Camera package', estimated_cost: 1200 })).toEqual({
      allow_description: 'Camera package',
      provisional_amount: 1200,
      status: 'open',
      notes: null,
    })
    expect(buildDefaultAllowLineItemDetails({ description: 'Camera package', estimated_cost: 1200 })).toEqual({
      allow_description: 'Camera package',
      provisional_amount: 1200,
      status: 'open',
      notes: null,
    })
  })
})

describe('migrateUntypedToAllow', () => {
  beforeEach(async () => {
    await makeDb()
  })

  it('counts untyped expenses and line items', async () => {
    await dbAdapter.execute(
      `INSERT INTO expenses (id, production_id, amount, date, created_at, updated_at)
       VALUES ('e1', 'prod-1', 100, '2026-01-01', 't', 't')`,
      []
    )
    await dbAdapter.execute(
      `INSERT INTO budget_items (id, production_id, description, estimated_cost, actual_cost, status, created_at, updated_at)
       VALUES ('i1', 'prod-1', 'Line A', 200, 0, 'draft', 't', 't'),
              ('i2', 'prod-1', 'Line B', 300, 0, 'draft', 't', 't')`,
      []
    )

    await expect(countUntypedBudgetClassifications('prod-1')).resolves.toEqual({
      untypedExpenses: 1,
      untypedLineItems: 2,
    })
  })

  it('migrates untyped rows to allow with details and is idempotent', async () => {
    await dbAdapter.execute(
      `INSERT INTO expenses (id, production_id, amount, date, notes, vendor, created_at, updated_at)
       VALUES ('e1', 'prod-1', 250, '2026-01-01', 'Location fee', 'Studio X', 't', 't')`,
      []
    )
    await dbAdapter.execute(
      `INSERT INTO budget_items (id, production_id, description, estimated_cost, actual_cost, status, created_at, updated_at)
       VALUES ('i1', 'prod-1', 'Props budget', 800, 0, 'draft', 't', 't')`,
      []
    )

    const first = await migrateUntypedToAllow('prod-1')
    expect(first).toEqual({ migratedExpenses: 1, migratedLineItems: 1 })

    const expense = await dbAdapter.select<Record<string, unknown>[]>(
      `SELECT transaction_type FROM expenses WHERE id = 'e1'`,
      []
    )
    expect(expense[0]?.transaction_type).toBe('allow')

    const expenseDetails = await dbAdapter.select<Record<string, unknown>[]>(
      `SELECT details_json FROM expense_transaction_details WHERE expense_id = 'e1'`,
      []
    )
    expect(JSON.parse(expenseDetails[0]?.details_json as string)).toMatchObject({
      allow_description: 'Location fee',
      provisional_amount: 250,
      status: 'resolved',
    })

    const item = await dbAdapter.select<Record<string, unknown>[]>(
      `SELECT line_item_type FROM budget_items WHERE id = 'i1'`,
      []
    )
    expect(item[0]?.line_item_type).toBe('allow')

    const itemDetails = await dbAdapter.select<Record<string, unknown>[]>(
      `SELECT details_json FROM budget_item_details WHERE budget_item_id = 'i1'`,
      []
    )
    expect(JSON.parse(itemDetails[0]?.details_json as string)).toMatchObject({
      allow_description: 'Props budget',
      provisional_amount: 800,
      status: 'open',
    })

    await expect(countUntypedBudgetClassifications('prod-1')).resolves.toEqual({
      untypedExpenses: 0,
      untypedLineItems: 0,
    })

    const second = await migrateUntypedToAllow('prod-1')
    expect(second).toEqual({ migratedExpenses: 0, migratedLineItems: 0 })
  })
})
