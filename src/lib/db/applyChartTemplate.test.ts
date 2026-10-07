import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter, tauriSqlAndBindsForSqlJs } from '@/test/apf/sqlJsTauriAdapter'
import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>
let seq = 1

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(async () => dbAdapter),
  now: () => '2026-10-07T12:00:00.000Z',
  uuid: vi.fn(() => `id-${seq++}`),
  runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
  executeBatch: vi.fn(async (db: { execute: (sql: string, bindValues?: unknown[]) => Promise<void> }, statements: Array<{ sql: string; bindValues: unknown[] }>) => {
    try {
      for (const s of statements) await db.execute(s.sql, s.bindValues)
    } catch (err) {
      try {
        await db.execute('ROLLBACK', [])
      } catch {
        // no open transaction
      }
      throw err
    }
  }),
}))

import { applyChartTemplate } from '@/lib/db/applyChartTemplate'
import { createAccount, getHardDeleteEligibleAccountIds, hardDeleteAccount, listAccounts } from '@/lib/db/repositories/budgetAccounts'
import { listContingencyRules, listFringeRules } from '@/lib/db/repositories/budgetDerived'
import { listProductionTotals } from '@/lib/db/repositories/productionTotals'
import { BBC_CHART_TEMPLATE } from '@/lib/budget/bbcChartTemplate'

let db: Database

function exec(sql: string, bindValues?: unknown[]): void {
  const { sql: ssql, binds } = tauriSqlAndBindsForSqlJs(sql, bindValues)
  db.run(ssql, binds)
}

function count(sql: string): number {
  return sqlJsQueryExec(db, sql)[0]!.values[0]![0] as number
}

function insertAccount(id: string, code: string, parent: string | null, postable: boolean): void {
  exec(
    `INSERT INTO budget_accounts (id, production_id, code, name, parent_account_id, sort_order, is_postable, created_at, updated_at) VALUES ($1, 'p1', $2, $3, $4, 0, $5, 't', 't')`,
    [id, code, `Account ${code}`, parent, postable ? 1 : 0]
  )
}

beforeEach(async () => {
  seq = 1
  const SQL = await initSqlJs({})
  db = new SQL.Database()
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
  dbAdapter = createSqlJsTauriAdapter(db)
  exec(`INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod', 't', 't')`)
  exec(
    `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, created_at, updated_at, deleted_at)
     VALUES ('r1', 'p1', 'Current budget', NULL, 1, 't', 't', NULL)`
  )
  // A small default-style chart: two roots with children, one empty root, and the default contingency on all roots.
  insertAccount('h1', '1100', null, false)
  insertAccount('l1', '1101', 'h1', true)
  insertAccount('h2', '2100', null, false)
  insertAccount('l2', '2101', 'h2', true)
  insertAccount('h3', '3100', null, false)
  exec(
    `INSERT INTO contingency_rules (id, production_id, budget_revision_id, name, rate, base_kind, scope_mode, is_enabled, created_at, updated_at)
     VALUES ('c1', 'p1', 'r1', 'Contingency', 0.1, 'budget', 'include_subtrees', 1, 't', 't')`
  )
  for (const acc of ['h1', 'h2', 'h3']) {
    exec(`INSERT INTO contingency_rule_scopes (id, rule_id, account_id, include_children) VALUES ($1, 'c1', $2, 1)`, [`cs-${acc}`, acc])
  }
  exec(
    `INSERT INTO cost_report_groups (id, production_id, budget_revision_id, code, name, sort_order, created_at, updated_at, deleted_at)
     VALUES ('g1', 'p1', 'r1', 'G', 'Group', 0, 't', 't', NULL)`
  )
  exec(`INSERT INTO cost_report_group_accounts (id, group_id, account_id) VALUES ('ga1', 'g1', 'h3')`)
  exec(
    `INSERT INTO production_totals (id, production_id, budget_revision_id, name, sort_order, created_at, updated_at, deleted_at)
     VALUES ('pt1', 'p1', 'r1', 'Below the Line', 0, 't', 't', NULL)`
  )
  exec(`INSERT INTO production_total_accounts (id, production_total_id, account_id) VALUES ('pta1', 'pt1', 'h3')`)
  // A posted amount on 2101.
  exec(
    `INSERT INTO expenses (id, production_id, category_id, account_id, amount, date, expense_type, created_at, updated_at)
     VALUES ('e1', 'p1', NULL, 'l2', 50, '2026-03-01', 'other', 't', 't')`
  )
})

describe('deleting accounts', () => {
  it('lets an empty top-level account be deleted even when rules, groups and totals point at it', async () => {
    const eligible = await getHardDeleteEligibleAccountIds('p1')
    expect([...eligible].sort()).toEqual(['h3', 'l1'])

    await hardDeleteAccount('h3')

    expect((await listAccounts('p1')).map((a) => a.code)).not.toContain('3100')
    expect(count(`SELECT COUNT(*) FROM contingency_rule_scopes WHERE account_id = 'h3'`)).toBe(0)
    expect(count(`SELECT COUNT(*) FROM contingency_rule_scopes WHERE rule_id = 'c1'`)).toBe(2)
    expect(count(`SELECT COUNT(*) FROM cost_report_group_accounts WHERE account_id = 'h3'`)).toBe(0)
    expect(count(`SELECT COUNT(*) FROM production_total_accounts WHERE account_id = 'h3'`)).toBe(0)
    expect(count(`SELECT COUNT(*) FROM outbox WHERE entity = 'budget_accounts' AND entity_id = 'h3' AND operation = 'delete'`)).toBe(1)
  })

  it('lets a deleted code be added again', async () => {
    await hardDeleteAccount('h3')
    const again = await createAccount({ production_id: 'p1', code: '3100', name: 'Art', is_postable: false })
    expect(again).toMatchObject({ id: 'h3', code: '3100', name: 'Art', deleted_at: null, is_postable: false })
    expect((await listAccounts('p1')).filter((a) => a.code === '3100')).toHaveLength(1)
  })

  it('still refuses accounts with children or posted amounts', async () => {
    await expect(hardDeleteAccount('h1')).rejects.toThrow(/child accounts/)
    await expect(hardDeleteAccount('l2')).rejects.toThrow(/expenses/)
  })
})

describe('applyChartTemplate', () => {
  it('replace swaps in the BBC chart, keeps posted accounts and wires up NI, totals and contingency', async () => {
    const result = await applyChartTemplate({ productionId: 'p1', revisionId: 'r1', templateId: 'bbc', mode: 'replace' })

    const accounts = await listAccounts('p1')
    const codes = accounts.map((a) => a.code)
    // Posted 2101 and its parent stay; the unused standard accounts go.
    expect(codes).toEqual(expect.arrayContaining(['2100', '2101']))
    expect(codes).not.toContain('1100')
    expect(codes).not.toContain('3100')
    expect(result.removed).toBe(3)
    // BBC's 2101 (Line Producer) clashes with the posted 2101 that stays.
    expect(result.skipped).toBe(1)
    expect(result.added).toBe(BBC_CHART_TEMPLATE.accounts.length - 1)
    const staffNi = (await listFringeRules('p1', 'r1')).find((f) => f.name === 'Production Staff NI')!
    expect(staffNi.scope_account_ids).not.toContain('l2')

    const byCode = new Map(accounts.map((a) => [a.code, a]))
    const tx = accounts.find((a) => a.name === 'BBC TX Deliverables')!
    expect(tx.parent_account_id).toBe(byCode.get('600')!.id)
    expect(accounts.find((a) => a.name === 'BFI Archive Copy')!.parent_account_id).toBe(tx.id)

    const fringes = await listFringeRules('p1', 'r1')
    expect(fringes.map((f) => f.name)).toEqual(expect.arrayContaining(['Producer NI', 'Artists NI', 'Camera Crew NI']))
    const camera = fringes.find((f) => f.name === 'Camera Crew NI')!
    expect(camera.rate).toBe(0.15)
    expect(camera.scope_account_ids).toContain(accounts.find((a) => a.name === 'Director of Photography')!.id)
    expect(camera.scope_account_ids).not.toContain(accounts.find((a) => a.name === 'Camera Package')!.id)

    const [contingency] = await listContingencyRules('p1', 'r1')
    const roots = accounts.filter((a) => !a.parent_account_id).map((a) => a.id)
    expect([...contingency!.scope_account_ids].sort()).toEqual([...roots].sort())

    const totals = await listProductionTotals('p1', 'r1')
    expect(totals.map((t) => t.name).sort()).toEqual(['Above the Line', 'Below the Line', 'Post Production & Delivery'])
    const btl = totals.find((t) => t.name === 'Below the Line')!
    expect(btl.id).toBe('pt1')
    expect(btl.account_ids).toHaveLength(4)
  })

  it('merge adds the BBC chart without touching existing accounts, and re-applying is a no-op', async () => {
    const first = await applyChartTemplate({ productionId: 'p1', revisionId: 'r1', templateId: 'bbc', mode: 'merge' })
    expect(first.removed).toBe(0)
    const codes = (await listAccounts('p1')).map((a) => a.code)
    expect(codes).toEqual(expect.arrayContaining(['1100', '1101', '2100', '2101', '3100', '100', '670']))
    expect(first.skipped).toBeGreaterThan(0)

    const second = await applyChartTemplate({ productionId: 'p1', revisionId: 'r1', templateId: 'bbc', mode: 'merge' })
    expect(second).toMatchObject({ added: 0, removed: 0, renamed: 0, fringeRulesAdded: [], totalsUpdated: [] })
    const fringeCount = count(`SELECT COUNT(*) FROM fringe_rules WHERE production_id = 'p1' AND deleted_at IS NULL`)
    expect(fringeCount).toBe(BBC_CHART_TEMPLATE.fringes.length)
  })
})
