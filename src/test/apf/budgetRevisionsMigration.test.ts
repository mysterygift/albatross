import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'

function applyMigrationsUpTo(db: import('sql.js').Database, maxFileNameInclusive: string): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && f <= maxFileNameInclusive)
    .sort()
  for (const file of files) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

function migrationSql(fileName: string): string {
  return readFileSync(join(process.cwd(), 'src-tauri/migrations', fileName), 'utf8')
}

describe('0054_budget_revisions migration', () => {
  it('backfills Current budget live revision and wires revision-scoped rows', async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    applyMigrationsUpTo(db, '0053_float_expense_links.sql')

    db.exec(`
      INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod 1', 't', 't');
      INSERT INTO budget_items (id, production_id, category_id, description, estimated_cost, actual_cost, vendor, status, created_at, updated_at)
      VALUES ('bi1', 'p1', NULL, 'Line item', 100, 0, NULL, 'draft', 't', 't');
      INSERT INTO expenses (id, production_id, category_id, amount, date, vendor, notes, expense_type, created_at, updated_at)
      VALUES ('e1', 'p1', NULL, 40, '2026-01-01', NULL, NULL, 'other', 't', 't');
      INSERT INTO budget_item_expense_links (id, production_id, budget_item_id, expense_id, matched_amount, created_at, updated_at)
      VALUES ('l1', 'p1', 'bi1', 'e1', 40, 't', 't');
      INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at) VALUES ('pe1', 'p1', 'Crew', 0, 't', 't');
      INSERT INTO floats (id, production_id, budget_item_id, person_id, amount, currency, issued_date, notes, created_at, updated_at)
      VALUES ('f1', 'p1', 'bi1', 'pe1', 50, 'GBP', '2026-01-01', NULL, 1, 1);
      INSERT INTO float_expense_links (id, float_id, expense_id, matched_amount, created_at, updated_at)
      VALUES ('fl1', 'f1', 'e1', 10, 1, 1);
      INSERT INTO cost_report_groups (id, production_id, code, name, sort_order, created_at, updated_at)
      VALUES ('g1', 'p1', NULL, 'Group', 0, 't', 't');
      INSERT INTO production_totals (id, production_id, name, sort_order, created_at, updated_at)
      VALUES ('pt1', 'p1', 'Total', 0, 't', 't');
      INSERT INTO fringe_rules (id, production_id, name, rate, base_kind, scope_mode, is_enabled, created_at, updated_at)
      VALUES ('fr1', 'p1', 'Fringe', 0.1, 'budget', 'include_subtrees', 1, 't', 't');
      INSERT INTO contingency_rules (id, production_id, name, rate, base_kind, scope_mode, is_enabled, created_at, updated_at)
      VALUES ('cr1', 'p1', 'Contingency', 0.1, 'budget', 'include_subtrees', 1, 't', 't');
    `)

    db.exec(migrationSql('0054_budget_revisions.sql'))

    const revisionRows = sqlJsQueryExec(db, `SELECT id, production_id, name, is_live FROM budget_revisions WHERE production_id = 'p1'`)
    expect(revisionRows[0]?.values.length).toBe(1)
    expect(revisionRows[0]?.values[0]?.[2]).toBe('Current budget')
    expect(revisionRows[0]?.values[0]?.[3]).toBe(1)
    const revisionId = String(revisionRows[0]!.values[0]![0])

    const checks = [
      ['budget_items', 'bi1'],
      ['budget_item_expense_links', 'l1'],
      ['floats', 'f1'],
      ['float_expense_links', 'fl1'],
      ['cost_report_groups', 'g1'],
      ['production_totals', 'pt1'],
      ['fringe_rules', 'fr1'],
      ['contingency_rules', 'cr1'],
    ] as const
    for (const [table, id] of checks) {
      const row = sqlJsQueryExec(db, `SELECT budget_revision_id FROM ${table} WHERE id = '${id}'`)
      expect(String(row[0]!.values[0]![0])).toBe(revisionId)
    }
  })

  it('enforces one live revision per production via unique partial index', async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    applyMigrationsUpTo(db, '0054_budget_revisions.sql')

    db.exec(`INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod 1', 't', 't')`)
    db.exec(`
      INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, created_at, updated_at, deleted_at)
      VALUES ('r1', 'p1', 'Current budget', NULL, 1, 't', 't', NULL)
    `)

    expect(() =>
      db.exec(`
        INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, created_at, updated_at, deleted_at)
        VALUES ('r2', 'p1', 'Scenario B', NULL, 1, 't', 't', NULL)
      `)
    ).toThrow()
  })

  it('keeps production-scoped shared data untouched while backfilling revisions', async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    applyMigrationsUpTo(db, '0053_float_expense_links.sql')

    db.exec(`
      INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod 1', 't', 't');
      INSERT INTO budget_accounts (id, production_id, code, name, is_postable, created_at, updated_at)
      VALUES ('a1', 'p1', '1000', 'Account', 1, 't', 't');
      INSERT INTO expenses (id, production_id, category_id, account_id, amount, date, expense_type, created_at, updated_at)
      VALUES ('e1', 'p1', NULL, 'a1', 10, '2026-01-01', 'other', 't', 't');
    `)

    db.exec(migrationSql('0054_budget_revisions.sql'))

    const accountCount = sqlJsQueryExec(db, `SELECT COUNT(*) FROM budget_accounts WHERE production_id = 'p1'`)
    const expenseCount = sqlJsQueryExec(db, `SELECT COUNT(*) FROM expenses WHERE production_id = 'p1'`)
    expect(accountCount[0]?.values[0]?.[0]).toBe(1)
    expect(expenseCount[0]?.values[0]?.[0]).toBe(1)
  })

  it('does not leave orphaned revision ids on scoped tables after migration', async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    applyMigrationsUpTo(db, '0054_budget_revisions.sql')

    db.exec(`
      INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod 1', 't', 't');
      INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, created_at, updated_at, deleted_at)
      VALUES ('r1', 'p1', 'Current budget', NULL, 1, 't', 't', NULL);
      INSERT INTO budget_accounts (id, production_id, code, name, is_postable, created_at, updated_at)
      VALUES ('a1', 'p1', '1000', 'Account', 1, 't', 't');
      INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at) VALUES ('pe1', 'p1', 'Crew', 0, 't', 't');
      INSERT INTO budget_items (id, production_id, budget_revision_id, account_id, description, estimated_cost, actual_cost, status, created_at, updated_at, deleted_at)
      VALUES ('bi1', 'p1', 'r1', 'a1', 'Line', 20, 0, 'draft', 't', 't', NULL);
      INSERT INTO floats (id, production_id, budget_revision_id, budget_item_id, person_id, amount, currency, issued_date, notes, created_at, updated_at, deleted_at)
      VALUES ('f1', 'p1', 'r1', 'bi1', 'pe1', 20, 'GBP', '2026-01-01', NULL, 1, 1, NULL);
      INSERT INTO expenses (id, production_id, account_id, amount, date, expense_type, created_at, updated_at)
      VALUES ('e1', 'p1', 'a1', 5, '2026-01-01', 'other', 't', 't');
      INSERT INTO float_expense_links (id, budget_revision_id, float_id, expense_id, matched_amount, created_at, updated_at, deleted_at)
      VALUES ('fl1', 'r1', 'f1', 'e1', 5, 1, 1, NULL);
    `)

    const orphanLinks = sqlJsQueryExec(db, `
      SELECT COUNT(*) FROM float_expense_links l
      LEFT JOIN budget_revisions r ON r.id = l.budget_revision_id
      WHERE l.deleted_at IS NULL AND r.id IS NULL
    `)
    const orphanItems = sqlJsQueryExec(db, `
      SELECT COUNT(*) FROM budget_items i
      LEFT JOIN budget_revisions r ON r.id = i.budget_revision_id
      WHERE i.deleted_at IS NULL AND r.id IS NULL
    `)
    expect(orphanLinks[0]?.values[0]?.[0]).toBe(0)
    expect(orphanItems[0]?.values[0]?.[0]).toBe(0)
  })
})
