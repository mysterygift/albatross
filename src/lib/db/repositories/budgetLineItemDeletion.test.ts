import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
    uuid: vi.fn(() => {
      uuidCounter += 1
      return `uuid-${uuidCounter}`
    }),
  }
})

let uuidCounter = 0

vi.mock('@/lib/db/repositories/budgetRevisions', () => ({
  resolveBudgetRevisionId: vi.fn(async () => 'rev-1'),
}))

vi.mock('@/lib/db/repositories/budgetAccounts', () => ({
  getAccountById: vi.fn(async (id: string) => ({
    id,
    production_id: 'prod-1',
    code: id === 'acct-1' ? '1001' : '1002',
    name: id === 'acct-1' ? 'Account 1' : 'Account 2',
    parent_account_id: null,
    sort_order: 0,
    is_postable: true,
    color_hex: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
  })),
}))

import { setDbAdapterForTests } from '@/lib/db/client'
import { deleteBudgetLineItemWithRelinks } from '@/lib/db/repositories/budgetLineItemDeletion'

const TS = '2026-01-01T00:00:00.000Z'

function queryAll<T extends Record<string, unknown>>(
  adapter: ReturnType<typeof createSqlJsTauriAdapter>,
  sql: string
): Promise<T[]> {
  return adapter.select<T[]>(sql, [])
}

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  db.exec(`
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
    CREATE TABLE expenses (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      account_id TEXT,
      transaction_type TEXT,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE budget_item_expense_links (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      budget_revision_id TEXT,
      budget_item_id TEXT NOT NULL,
      expense_id TEXT NOT NULL,
      matched_amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE floats (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      budget_revision_id TEXT,
      budget_item_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      issued_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE outbox (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO budget_items (id, production_id, budget_revision_id, account_id, description, estimated_cost, created_at, updated_at)
      VALUES
        ('item-a', 'prod-1', 'rev-1', 'acct-1', 'Line A', 100, '${TS}', '${TS}'),
        ('item-b', 'prod-1', 'rev-1', 'acct-1', 'Line B', 200, '${TS}', '${TS}'),
        ('item-c', 'prod-1', 'rev-1', 'acct-2', 'Line C', 300, '${TS}', '${TS}');
    INSERT INTO expenses (id, production_id, account_id, amount, date, updated_at)
      VALUES ('exp-1', 'prod-1', 'acct-1', 500, '2026-01-15', '${TS}');
  `)
  return db
}

describe('deleteBudgetLineItemWithRelinks', () => {
  beforeEach(async () => {
    uuidCounter = 0
    const db = await makeDb()
    dbAdapter = createSqlJsTauriAdapter(db)
    setDbAdapterForTests(dbAdapter)
  })

  it('soft-deletes a line item with no associations', async () => {
    await deleteBudgetLineItemWithRelinks({
      productionId: 'prod-1',
      revisionId: 'rev-1',
      budgetItemId: 'item-c',
      expenseRelinks: [],
      expenseAccountRelinks: [],
      floatRelinks: [],
    })

    const rows = await queryAll<{ deleted_at: string | null }>(
      dbAdapter,
      `SELECT deleted_at FROM budget_items WHERE id = 'item-c'`
    )
    expect(rows[0]!.deleted_at).toBeTruthy()
    const outbox = await queryAll(dbAdapter, `SELECT * FROM outbox WHERE entity_id = 'item-c'`)
    expect(outbox).toHaveLength(1)
  })

  it('relinks an expense link to a new line item without merge', async () => {
    await dbAdapter.execute(`
      INSERT INTO budget_item_expense_links (id, production_id, budget_revision_id, budget_item_id, expense_id, matched_amount, created_at, updated_at)
      VALUES ('link-1', 'prod-1', 'rev-1', 'item-a', 'exp-1', 50, '${TS}', '${TS}');
    `)

    await deleteBudgetLineItemWithRelinks({
      productionId: 'prod-1',
      revisionId: 'rev-1',
      budgetItemId: 'item-a',
      expenseRelinks: [{ linkId: 'link-1', targetBudgetItemId: 'item-b' }],
      expenseAccountRelinks: [],
      floatRelinks: [],
    })

    const oldLink = await queryAll<{ deleted_at: string | null }>(
      dbAdapter,
      `SELECT deleted_at FROM budget_item_expense_links WHERE id = 'link-1'`
    )
    expect(oldLink[0]!.deleted_at).toBeTruthy()

    const activeLinks = await queryAll<{ budget_item_id: string; matched_amount: number }>(
      dbAdapter,
      `SELECT budget_item_id, matched_amount FROM budget_item_expense_links WHERE expense_id = 'exp-1' AND deleted_at IS NULL`
    )
    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]!.budget_item_id).toBe('item-b')
    expect(activeLinks[0]!.matched_amount).toBe(50)

    const expense = await queryAll<{ account_id: string | null }>(
      dbAdapter,
      `SELECT account_id FROM expenses WHERE id = 'exp-1'`
    )
    expect(expense[0]!.account_id).toBe('acct-1')
  })

  it('reposts expense to the target line item account when relinking across accounts', async () => {
    await dbAdapter.execute(`
      INSERT INTO budget_item_expense_links (id, production_id, budget_revision_id, budget_item_id, expense_id, matched_amount, created_at, updated_at)
      VALUES ('link-1', 'prod-1', 'rev-1', 'item-a', 'exp-1', 50, '${TS}', '${TS}');
    `)

    await deleteBudgetLineItemWithRelinks({
      productionId: 'prod-1',
      revisionId: 'rev-1',
      budgetItemId: 'item-a',
      expenseRelinks: [{ linkId: 'link-1', targetBudgetItemId: 'item-c' }],
      expenseAccountRelinks: [],
      floatRelinks: [],
    })

    const expense = await queryAll<{ account_id: string | null }>(
      dbAdapter,
      `SELECT account_id FROM expenses WHERE id = 'exp-1'`
    )
    expect(expense[0]!.account_id).toBe('acct-2')
  })

  it('merges expense link when target already linked to the same expense', async () => {
    await dbAdapter.execute(`
      INSERT INTO budget_item_expense_links (id, production_id, budget_revision_id, budget_item_id, expense_id, matched_amount, created_at, updated_at)
      VALUES
        ('link-a', 'prod-1', 'rev-1', 'item-a', 'exp-1', 40, '${TS}', '${TS}'),
        ('link-b', 'prod-1', 'rev-1', 'item-b', 'exp-1', 60, '${TS}', '${TS}');
    `)

    await deleteBudgetLineItemWithRelinks({
      productionId: 'prod-1',
      revisionId: 'rev-1',
      budgetItemId: 'item-a',
      expenseRelinks: [{ linkId: 'link-a', targetBudgetItemId: 'item-b' }],
      expenseAccountRelinks: [],
      floatRelinks: [],
    })

    const activeLinks = await queryAll<{ id: string; matched_amount: number }>(
      dbAdapter,
      `SELECT id, matched_amount FROM budget_item_expense_links WHERE expense_id = 'exp-1' AND deleted_at IS NULL`
    )
    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]!.id).toBe('link-b')
    expect(activeLinks[0]!.matched_amount).toBe(100)
  })

  it('relinks floats and deletes the line item', async () => {
    await dbAdapter.execute(`
      INSERT INTO floats (id, production_id, budget_revision_id, budget_item_id, person_id, amount, currency, issued_date, created_at, updated_at)
      VALUES ('float-1', 'prod-1', 'rev-1', 'item-a', 'person-1', 75, 'GBP', '2026-01-10', '${TS}', '${TS}');
    `)

    await deleteBudgetLineItemWithRelinks({
      productionId: 'prod-1',
      revisionId: 'rev-1',
      budgetItemId: 'item-a',
      expenseRelinks: [],
      expenseAccountRelinks: [{ expenseId: 'exp-1', targetBudgetItemId: 'item-b' }],
      floatRelinks: [{ floatId: 'float-1', targetBudgetItemId: 'item-c' }],
    })

    const floats = await queryAll<{ budget_item_id: string }>(
      dbAdapter,
      `SELECT budget_item_id FROM floats WHERE id = 'float-1'`
    )
    expect(floats[0]!.budget_item_id).toBe('item-c')

    const item = await queryAll<{ deleted_at: string | null }>(
      dbAdapter,
      `SELECT deleted_at FROM budget_items WHERE id = 'item-a'`
    )
    expect(item[0]!.deleted_at).toBeTruthy()
  })

  it('rejects when relink arrays do not cover all associations', async () => {
    await dbAdapter.execute(`
      INSERT INTO budget_item_expense_links (id, production_id, budget_revision_id, budget_item_id, expense_id, matched_amount, created_at, updated_at)
      VALUES ('link-1', 'prod-1', 'rev-1', 'item-a', 'exp-1', 50, '${TS}', '${TS}');
    `)

    await expect(
      deleteBudgetLineItemWithRelinks({
        productionId: 'prod-1',
        revisionId: 'rev-1',
        budgetItemId: 'item-a',
        expenseRelinks: [],
        expenseAccountRelinks: [],
        floatRelinks: [],
      })
    ).rejects.toThrow(/Expected 1 expense link/)

    const item = await queryAll<{ deleted_at: string | null }>(
      dbAdapter,
      `SELECT deleted_at FROM budget_items WHERE id = 'item-a'`
    )
    expect(item[0]!.deleted_at).toBeNull()
  })
})
