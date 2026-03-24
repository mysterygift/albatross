import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter, tauriSqlAndBindsForSqlJs } from '@/test/apf/sqlJsTauriAdapter'
import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>
let uuidImpl: () => string

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(async () => dbAdapter),
  now: () => '2026-03-24T12:00:00.000Z',
  uuid: vi.fn(() => uuidImpl()),
  runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
  executeBatch: vi.fn(async (db: { execute: (sql: string, bindValues?: unknown[]) => Promise<void> }, statements: Array<{ sql: string; bindValues: unknown[] }>) => {
    let hasOpenTransaction = false
    try {
      for (const s of statements) {
        const upper = s.sql.trim().toUpperCase()
        if (upper.startsWith('BEGIN')) hasOpenTransaction = true
        await db.execute(s.sql, s.bindValues)
        if (upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) {
          hasOpenTransaction = false
        }
      }
    } catch (err) {
      if (hasOpenTransaction) {
        try {
          await db.execute('ROLLBACK', [])
        } catch {
          // ignore rollback follow-up failures in tests
        }
      }
      throw err
    }
  }),
}))

import {
  buildDuplicateLiveDraftName,
  createBlankBudgetRevision,
  createBudgetRevisionFromExisting,
  duplicateLiveBudgetRevisionAsDraft,
} from '@/lib/db/budgetRevisionService'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
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

function exec(db: Database, sql: string, bindValues?: unknown[]): void {
  const { sql: ssql, binds } = tauriSqlAndBindsForSqlJs(sql, bindValues)
  db.run(ssql, binds)
}

describe('budget revision creation flows', () => {
  let seq = 1
  beforeEach(() => {
    seq = 1
    uuidImpl = () => `id-${seq++}`
  })

  it('creates a blank revision with no cloned budget data', async () => {
    const db = await makeDb()
    exec(db, `INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`, ['p1', 'Prod', 't', 't'])

    const created = await createBlankBudgetRevision({ productionId: 'p1', name: '   Draft scenario   ' })
    expect(created.production_id).toBe('p1')
    expect(created.name).toBe('Draft scenario')
    expect(created.is_live).toBe(false)
    expect(created.created_from_revision_id).toBeNull()

    const items = sqlJsQueryExec(db, `SELECT COUNT(*) FROM budget_items WHERE budget_revision_id = '${created.id}'`)
    const floats = sqlJsQueryExec(db, `SELECT COUNT(*) FROM floats WHERE budget_revision_id = '${created.id}'`)
    const links = sqlJsQueryExec(db, `SELECT COUNT(*) FROM budget_item_expense_links WHERE budget_revision_id = '${created.id}'`)
    expect(items[0]!.values[0]![0]).toBe(0)
    expect(floats[0]!.values[0]![0]).toBe(0)
    expect(links[0]!.values[0]![0]).toBe(0)
  })

  it('clones revision-scoped data with FK remapping and keeps source unchanged', async () => {
    const db = await makeDb()
    exec(db, `INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod', 't', 't')`)
    exec(
      db,
      `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, created_at, updated_at, deleted_at)
       VALUES ('r1', 'p1', 'Current budget', NULL, 1, 't', 't', NULL)`
    )
    exec(db, `INSERT INTO budget_accounts (id, production_id, code, name, is_postable, created_at, updated_at) VALUES ('a1', 'p1', '1000', 'Account', 0, 't', 't')`)
    exec(db, `INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at) VALUES ('pe1', 'p1', 'Crew', 0, 't', 't')`)
    exec(
      db,
      `INSERT INTO budget_items (id, production_id, budget_revision_id, category_id, account_id, description, estimated_cost, actual_cost, vendor, status, line_item_type, created_at, updated_at, deleted_at)
       VALUES ('bi1', 'p1', 'r1', NULL, 'a1', 'Line', 100, 0, NULL, 'draft', 'purchase', 't', 't', NULL)`
    )
    exec(
      db,
      `INSERT INTO budget_item_details (id, budget_item_id, line_item_type, details_json, created_at, updated_at)
       VALUES ('bid1', 'bi1', 'purchase', '{"x":1}', 't', 't')`
    )
    exec(
      db,
      `INSERT INTO production_totals (id, production_id, budget_revision_id, name, sort_order, created_at, updated_at, deleted_at)
       VALUES ('pt1', 'p1', 'r1', 'Total', 0, 't', 't', NULL)`
    )
    exec(db, `INSERT INTO production_total_accounts (id, production_total_id, account_id) VALUES ('pta1', 'pt1', 'a1')`)
    exec(
      db,
      `INSERT INTO cost_report_groups (id, production_id, budget_revision_id, code, name, sort_order, created_at, updated_at, deleted_at)
       VALUES ('g1', 'p1', 'r1', 'GRP', 'Group', 0, 't', 't', NULL)`
    )
    exec(db, `INSERT INTO cost_report_group_accounts (id, group_id, account_id) VALUES ('ga1', 'g1', 'a1')`)
    exec(
      db,
      `INSERT INTO expenses (id, production_id, category_id, account_id, amount, date, expense_type, created_at, updated_at)
       VALUES ('e1', 'p1', NULL, 'a1', 50, '2026-03-01', 'other', 't', 't')`
    )
    exec(
      db,
      `INSERT INTO budget_item_expense_links (id, production_id, budget_revision_id, budget_item_id, expense_id, matched_amount, created_at, updated_at, deleted_at)
       VALUES ('l1', 'p1', 'r1', 'bi1', 'e1', 20, 't', 't', NULL)`
    )
    exec(
      db,
      `INSERT INTO floats (id, production_id, budget_revision_id, budget_item_id, person_id, amount, currency, issued_date, notes, created_at, updated_at, deleted_at)
       VALUES ('f1', 'p1', 'r1', 'bi1', 'pe1', 30, 'GBP', '2026-03-01', NULL, 1, 1, NULL)`
    )
    exec(
      db,
      `INSERT INTO float_expense_links (id, budget_revision_id, float_id, expense_id, matched_amount, created_at, updated_at, deleted_at)
       VALUES ('fl1', 'r1', 'f1', 'e1', 10, 1, 1, NULL)`
    )
    exec(
      db,
      `INSERT INTO fringe_rules (id, production_id, budget_revision_id, name, rate, base_kind, scope_mode, is_enabled, created_at, updated_at, deleted_at)
       VALUES ('fr1', 'p1', 'r1', 'Fringe', 0.1, 'budget', 'include_subtrees', 1, 't', 't', NULL)`
    )
    exec(db, `INSERT INTO fringe_rule_scopes (id, rule_id, account_id, include_children) VALUES ('frs1', 'fr1', 'a1', 1)`)
    exec(
      db,
      `INSERT INTO contingency_rules (id, production_id, budget_revision_id, name, rate, base_kind, scope_mode, is_enabled, created_at, updated_at, deleted_at)
       VALUES ('cr1', 'p1', 'r1', 'Contingency', 0.2, 'budget', 'include_subtrees', 1, 't', 't', NULL)`
    )
    exec(db, `INSERT INTO contingency_rule_scopes (id, rule_id, account_id, include_children) VALUES ('crs1', 'cr1', 'a1', 1)`)

    const cloned = await createBudgetRevisionFromExisting({
      productionId: 'p1',
      sourceRevisionId: 'r1',
      newRevisionName: 'Scenario B',
    })

    expect(cloned.created_from_revision_id).toBe('r1')
    expect(cloned.is_live).toBe(false)

    const clonedItem = sqlJsQueryExec(db, `SELECT id FROM budget_items WHERE budget_revision_id = '${cloned.id}'`)[0]!.values[0]![0] as string
    const clonedFloat = sqlJsQueryExec(db, `SELECT id, budget_item_id FROM floats WHERE budget_revision_id = '${cloned.id}'`)[0]!
    const clonedFloatId = clonedFloat.values[0]![0] as string
    const clonedFloatBudgetItemId = clonedFloat.values[0]![1] as string
    const clonedBudgetLinkBudgetItemId = sqlJsQueryExec(
      db,
      `SELECT budget_item_id FROM budget_item_expense_links WHERE budget_revision_id = '${cloned.id}'`
    )[0]!.values[0]![0] as string
    const clonedFloatLinkFloatId = sqlJsQueryExec(
      db,
      `SELECT float_id FROM float_expense_links WHERE budget_revision_id = '${cloned.id}'`
    )[0]!.values[0]![0] as string

    expect(clonedItem).not.toBe('bi1')
    expect(clonedFloatId).not.toBe('f1')
    expect(clonedFloatBudgetItemId).toBe(clonedItem)
    expect(clonedBudgetLinkBudgetItemId).toBe(clonedItem)
    expect(clonedFloatLinkFloatId).toBe(clonedFloatId)

    const sourceItemCount = sqlJsQueryExec(db, `SELECT COUNT(*) FROM budget_items WHERE budget_revision_id = 'r1'`)[0]!.values[0]![0]
    const targetItemCount = sqlJsQueryExec(db, `SELECT COUNT(*) FROM budget_items WHERE budget_revision_id = '${cloned.id}'`)[0]!.values[0]![0]
    expect(sourceItemCount).toBe(1)
    expect(targetItemCount).toBe(1)
  })

  it('rejects cross-production source revision', async () => {
    const db = await makeDb()
    exec(db, `INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'P1', 't', 't')`)
    exec(db, `INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p2', 'P2', 't', 't')`)
    exec(
      db,
      `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, created_at, updated_at, deleted_at)
       VALUES ('r1', 'p1', 'Current budget', NULL, 1, 't', 't', NULL)`
    )

    await expect(
      createBudgetRevisionFromExisting({
        productionId: 'p2',
        sourceRevisionId: 'r1',
        newRevisionName: 'Invalid clone',
      })
    ).rejects.toThrow(/Source revision not found/)
  })

  it('rolls back clone when an insert fails mid-transaction', async () => {
    const db = await makeDb()
    exec(db, `INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'P1', 't', 't')`)
    exec(
      db,
      `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, created_at, updated_at, deleted_at)
       VALUES ('r1', 'p1', 'Current budget', NULL, 1, 't', 't', NULL)`
    )
    exec(
      db,
      `INSERT INTO budget_items (id, production_id, budget_revision_id, description, estimated_cost, actual_cost, status, created_at, updated_at)
       VALUES ('bi1', 'p1', 'r1', 'Line', 10, 0, 'draft', 't', 't')`
    )
    exec(
      db,
      `INSERT INTO budget_items (id, production_id, budget_revision_id, description, estimated_cost, actual_cost, status, created_at, updated_at)
       VALUES ('bi2', 'p1', 'r1', 'Line 2', 20, 0, 'draft', 't', 't')`
    )

    // Force duplicate ids to trigger PK failure after at least one insert is attempted.
    uuidImpl = () => 'dup-id'

    await expect(
      createBudgetRevisionFromExisting({
        productionId: 'p1',
        sourceRevisionId: 'r1',
        newRevisionName: 'Will fail',
      })
    ).rejects.toThrow()

    const failedRevision = sqlJsQueryExec(db, `SELECT COUNT(*) FROM budget_revisions WHERE name = 'Will fail'`)[0]!.values[0]![0]
    expect(failedRevision).toBe(0)
  })

  it('duplicates live revision as a non-live draft with generated name', async () => {
    const db = await makeDb()
    exec(db, `INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod', 't', 't')`)
    exec(
      db,
      `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, created_at, updated_at, deleted_at)
       VALUES ('r-live', 'p1', 'Current budget', NULL, 1, 't', 't', NULL)`
    )
    exec(
      db,
      `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, created_at, updated_at, deleted_at)
       VALUES ('r-draft-a', 'p1', 'Current budget Draft', 'r-live', 0, 't', 't', NULL)`
    )

    const duplicated = await duplicateLiveBudgetRevisionAsDraft({ productionId: 'p1' })
    expect(duplicated.is_live).toBe(false)
    expect(duplicated.created_from_revision_id).toBe('r-live')
    expect(duplicated.name).toBe('Current budget Draft 2')

    const sourceStillLive = sqlJsQueryExec(db, `SELECT is_live FROM budget_revisions WHERE id = 'r-live'`)[0]!.values[0]![0]
    expect(sourceStillLive).toBe(1)
  })

  it('fails duplicate-live shortcut when no live revision exists', async () => {
    const db = await makeDb()
    exec(db, `INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod', 't', 't')`)
    await expect(duplicateLiveBudgetRevisionAsDraft({ productionId: 'p1' })).rejects.toThrow(
      /No live budget revision found/
    )
  })
})

describe('duplicate-live draft naming', () => {
  it('produces deterministic collision-safe names', () => {
    const name = buildDuplicateLiveDraftName({
      liveRevisionName: 'Current budget',
      existingRevisionNames: ['Current budget', 'Current budget Draft', 'Current budget Draft 2'],
    })
    expect(name).toBe('Current budget Draft 3')
  })
})
