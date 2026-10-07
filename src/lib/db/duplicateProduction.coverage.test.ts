import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'
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
        for (const s of statements) await db.execute(s.sql, s.bindValues)
      }
    ),
  }
})

vi.mock('@/lib/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/files')>()),
  deleteAttachmentFile: vi.fn(async () => {}),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => {}),
}))

import {
  DUPLICATE_EXCLUDED_COLUMNS,
  DUPLICATE_EXCLUDED_TABLES,
  duplicateProduction,
} from '@/lib/db/duplicateProduction'
import { createProduction } from '@/lib/db/repositories/production'

type Row = Record<string, unknown>

/** Columns every copy renews or owns, so they are never compared nor required in an INSERT. */
const BOOKKEEPING_COLUMNS = new Set(['id', 'production_id', 'created_at', 'updated_at', 'deleted_at'])

async function tableColumns(table: string): Promise<{ name: string; type: string; notnull: number; dflt: unknown }[]> {
  const rows = await dbAdapter.select<Row[]>(`PRAGMA table_info(${table})`)
  return rows.map((r) => ({ name: r.name as string, type: String(r.type).toUpperCase(), notnull: r.notnull as number, dflt: r.dflt_value }))
}

/**
 * Insert one row with EVERY column non-null (TEXT/INTEGER/REAL fillers named after table.column) so a column the
 * copier forgets shows up as a difference. Foreign-key columns stay NULL unless `values` sets them.
 */
async function insertFull(table: string, values: Row): Promise<Row> {
  const cols = await tableColumns(table)
  const row: Row = {}
  for (const c of cols) {
    if (c.name in values) row[c.name] = values[c.name]
    else if (c.name === 'deleted_at') row[c.name] = null
    else if (c.name === 'created_at' || c.name === 'updated_at') row[c.name] = '2026-01-01T00:00:00.000Z'
    else if (c.name.endsWith('_id') && c.name !== 'external_id') row[c.name] = null
    else if (c.type.includes('INT') || c.type.includes('BOOL')) row[c.name] = 1
    else if (c.type.includes('REAL') || c.type.includes('NUM') || c.type.includes('FLOAT')) row[c.name] = 7.5
    else row[c.name] = `${table}.${c.name}`
  }
  const names = Object.keys(row)
  await dbAdapter.execute(
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`,
    names.map((n) => row[n])
  )
  return row
}

/** Rows of `table` reduced to their non-id, non-bookkeeping values, in a stable order. */
function comparable(rows: Row[]): string[] {
  return rows
    .map((r) => {
      const out: Row = {}
      for (const k of Object.keys(r).sort()) {
        if (BOOKKEEPING_COLUMNS.has(k) || k.endsWith('_id')) continue
        out[k] = r[k]
      }
      return JSON.stringify(out)
    })
    .sort()
}

/** `INSERT INTO table (cols)` statements in the copier's source, as table -> column set. */
function insertedColumnsFromSource(): Map<string, Set<string>> {
  const src = readFileSync(join(process.cwd(), 'src/lib/db/duplicateProduction.ts'), 'utf8')
  const out = new Map<string, Set<string>>()
  const re = /INSERT INTO (\$\{TABLE_PRODUCTIONS\}|[a-z_]+)\s*\(([^)]*)\)/g
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const table = m[1] === '${TABLE_PRODUCTIONS}' ? 'productions' : m[1]!
    const cols = out.get(table) ?? new Set<string>()
    for (const c of m[2]!.split(',')) cols.add(c.trim())
    out.set(table, cols)
  }
  return out
}

async function allTables(): Promise<string[]> {
  const rows = await dbAdapter.select<Row[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  )
  return rows.map((r) => r.name as string)
}

beforeEach(async () => {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf8'))
  db.exec('PRAGMA foreign_keys = ON')
  dbAdapter = createSqlJsTauriAdapter(db)
})

describe('duplicateProduction — coverage guard', () => {
  it('every production-scoped table is either copied or on the explicit exclusion list', async () => {
    const copied = insertedColumnsFromSource()
    const tables = await allTables()

    // Production-scoped = has production_id, or has a foreign key to a production-scoped table (transitively).
    const scoped = new Set<string>(['productions'])
    for (const t of tables) {
      if ((await tableColumns(t)).some((c) => c.name === 'production_id')) scoped.add(t)
    }
    for (let changed = true; changed; ) {
      changed = false
      for (const t of tables) {
        if (scoped.has(t)) continue
        const fks = await dbAdapter.select<Row[]>(`PRAGMA foreign_key_list(${t})`)
        if (fks.some((f) => scoped.has(f.table as string))) {
          scoped.add(t)
          changed = true
        }
      }
    }

    const unaccounted = [...scoped].filter((t) => !copied.has(t) && !(t in DUPLICATE_EXCLUDED_TABLES)).sort()
    expect(
      unaccounted,
      'New production-scoped table(s): copy them in duplicateProduction.ts or add them to DUPLICATE_EXCLUDED_TABLES with a reason'
    ).toEqual([])

    // The exclusion list must not rot: no table that is copied, and no table that no longer exists.
    expect(Object.keys(DUPLICATE_EXCLUDED_TABLES).filter((t) => copied.has(t) || !tables.includes(t))).toEqual([])
  })

  it('every column of a copied table is inserted or on the explicit exclusion list', async () => {
    const copied = insertedColumnsFromSource()
    const problems: string[] = []
    for (const [table, inserted] of copied) {
      const excluded = DUPLICATE_EXCLUDED_COLUMNS[table] ?? {}
      const schema = (await tableColumns(table)).map((c) => c.name)
      for (const col of schema) {
        if (BOOKKEEPING_COLUMNS.has(col)) continue
        if (!inserted.has(col) && !(col in excluded)) problems.push(`${table}.${col} is neither copied nor excluded`)
      }
      for (const col of inserted) if (!schema.includes(col)) problems.push(`${table}.${col} is inserted but not in the schema`)
      for (const col of Object.keys(excluded)) {
        if (inserted.has(col)) problems.push(`${table}.${col} is on the exclusion list but also copied`)
        if (!schema.includes(col)) problems.push(`${table}.${col} is on the exclusion list but not in the schema`)
      }
    }
    expect(problems).toEqual([])
  })
})

describe('duplicateProduction — budget coding, schedule, deliverables and music keep every column', () => {
  it('copies the rows with all column values and remaps their foreign keys', async () => {
    const source = await createProduction({ name: 'Source', notes: null })
    const P = source.id
    // Start from a clean chart/revision slate so only the seeded rows are compared.
    await dbAdapter.execute(`DELETE FROM budget_accounts WHERE production_id = $1`, [P])
    await dbAdapter.execute(`DELETE FROM budget_revisions WHERE production_id = $1`, [P])

    // Budget
    await insertFull('budget_accounts', { id: 'acc-parent', production_id: P, code: '9000', archived_at: null })
    await insertFull('budget_accounts', { id: 'acc-child', production_id: P, code: '9001', parent_account_id: 'acc-parent' })
    await insertFull('budget_revisions', { id: 'rev-1', production_id: P, is_live: 0, approval: 'approved' })
    await insertFull('budget_revisions', { id: 'rev-2', production_id: P, is_live: 1, approval: 'pending', created_from_revision_id: 'rev-1' })
    await insertFull('budget_categories', { id: 'cat-1', production_id: P })
    await insertFull('vendors', { id: 'ven-1', production_id: P, is_global: 0 })
    await insertFull('budget_items', { id: 'bi-1', production_id: P, budget_revision_id: 'rev-2', category_id: 'cat-1', account_id: 'acc-child', status: 'draft' })
    await insertFull('budget_item_details', { id: 'bid-1', budget_item_id: 'bi-1' })
    await insertFull('expenses', { id: 'ex-1', production_id: P, category_id: 'cat-1', account_id: 'acc-child', vendor_id: 'ven-1' })
    await insertFull('expense_transaction_details', { id: 'etd-1', expense_id: 'ex-1' })

    // Schedule
    await insertFull('locations', { id: 'loc-a', production_id: P, name: 'Loc A', name_sort_key: 'loc a', booked_status: 'unbooked' })
    await insertFull('locations', { id: 'loc-b', production_id: P, name: 'Loc B', name_sort_key: 'loc b', booked_status: 'unbooked' })
    await insertFull('units', { id: 'unit-1', production_id: P })
    await insertFull('shooting_blocs', { id: 'bloc-1', production_id: P, start_date: '2026-05-01', end_date: '2026-05-09' })
    await insertFull('shoot_days', { id: 'day-1', production_id: P, shooting_bloc_id: 'bloc-1' })
    await insertFull('shoot_day_units', {
      id: 'sdu-1',
      shoot_day_id: 'day-1',
      unit_id: 'unit-1',
      movement_order_json: JSON.stringify({ revisionLabel: 'A', legs: { 'loc-a>loc-b': { departTime: '07:00', arriveTime: '07:30' }, 'loc-a>loc-b#1': { departTime: '09:00', arriveTime: null } } }),
    })
    await insertFull('stripboard_strips', {
      id: 'strip-1',
      production_id: P,
      shoot_day_id: 'day-1',
      shoot_day_unit_id: 'sdu-1',
      strip_type: 'MOVE',
      strip_status: 'SCHEDULED',
      origin_location_id: 'loc-a',
      destination_location_id: 'loc-b',
    })

    // Deliverables, music, clearances
    await insertFull('deliverables', { id: 'del-1', production_id: P, status: 'pending' })
    await insertFull('technical_specs', { id: 'spec-1', deliverable_id: 'del-1' })
    await insertFull('music_tracks', { id: 'mt-1', production_id: P })
    await insertFull('clearances', { id: 'clr-1', production_id: P, type: 'music', item_id: 'mt-1' })

    const copy = await duplicateProduction(P, 'Copy')
    const C = copy.id
    const sel = (sql: string, args: unknown[]) => dbAdapter.select<Row[]>(sql, args)

    // Whole-row equality (ids, foreign keys and bookkeeping aside) for every table seeded above.
    const direct = [
      'budget_accounts', 'budget_revisions', 'budget_categories', 'vendors', 'budget_items', 'expenses',
      'locations', 'units', 'shooting_blocs', 'shoot_days', 'stripboard_strips',
      'deliverables', 'music_tracks', 'clearances',
    ]
    for (const t of direct) {
      const a = await sel(`SELECT * FROM ${t} WHERE production_id = $1 AND deleted_at IS NULL`, [P])
      const b = await sel(`SELECT * FROM ${t} WHERE production_id = $1 AND deleted_at IS NULL`, [C])
      expect(a.length, `seeded ${t}`).toBeGreaterThan(0)
      expect(comparable(b), t).toEqual(comparable(a))
    }
    // Child tables without their own production_id.
    const via: Array<[string, string, string]> = [
      ['budget_item_details', 'budget_items', 'budget_item_id'],
      ['expense_transaction_details', 'expenses', 'expense_id'],
      ['shoot_day_units', 'shoot_days', 'shoot_day_id'],
      ['technical_specs', 'deliverables', 'deliverable_id'],
    ]
    for (const [t, parent, fk] of via) {
      const q = `SELECT c.* FROM ${t} c JOIN ${parent} p ON p.id = c.${fk} WHERE p.production_id = $1`
      const a = await sel(q, [P])
      const b = await sel(q, [C])
      expect(a.length, `seeded ${t}`).toBeGreaterThan(0)
      // movement_order_json keys are remapped below, so compare it separately.
      const strip = (rows: Row[]) => rows.map((r) => ({ ...r, movement_order_json: undefined }))
      expect(comparable(strip(b)), t).toEqual(comparable(strip(a)))
    }

    // Foreign keys point inside the copy.
    const one = async (sql: string) => (await sel(sql, [C]))[0]!
    const copiedAcc = await sel(`SELECT id, code, parent_account_id FROM budget_accounts WHERE production_id = $1`, [C])
    const child = copiedAcc.find((a) => a.code === '9001')!
    const parent = copiedAcc.find((a) => a.code === '9000')!
    expect(child.parent_account_id).toBe(parent.id)
    expect(copiedAcc.every((a) => a.id !== 'acc-child' && a.id !== 'acc-parent')).toBe(true)

    const revs = await sel(`SELECT id, created_from_revision_id, is_live FROM budget_revisions WHERE production_id = $1`, [C])
    const live = revs.find((r) => r.is_live === 1)!
    const base = revs.find((r) => r.is_live === 0)!
    expect(live.created_from_revision_id).toBe(base.id)

    const item = await one(`SELECT * FROM budget_items WHERE production_id = $1`)
    expect(item.account_id).toBe(child.id)
    expect(item.budget_revision_id).toBe(live.id)
    expect(item.line_item_type).toBe('budget_items.line_item_type')
    const cat = await one(`SELECT id FROM budget_categories WHERE production_id = $1 AND code = 'budget_categories.code'`)
    const ven = await one(`SELECT id FROM vendors WHERE production_id = $1 AND is_global = 0`)
    expect(item.category_id).toBe(cat.id)
    expect(await sel(`SELECT id FROM budget_item_details WHERE budget_item_id = $1`, [item.id])).toHaveLength(1)

    const exp = await one(`SELECT * FROM expenses WHERE production_id = $1`)
    expect(exp.account_id).toBe(child.id)
    expect(exp.category_id).toBe(cat.id)
    expect(exp.vendor_id).toBe(ven.id)
    expect(await sel(`SELECT id FROM expense_transaction_details WHERE expense_id = $1`, [exp.id])).toHaveLength(1)

    const locs = await sel(`SELECT id, name FROM locations WHERE production_id = $1`, [C])
    const srcLocs = await sel(`SELECT id, name FROM locations WHERE production_id = $1 ORDER BY name`, [P])
    const locByName = new Map(locs.map((l) => [l.name as string, l.id as string]))
    const strip = await one(`SELECT * FROM stripboard_strips WHERE production_id = $1`)
    expect(strip.origin_location_id).toBe(locByName.get(srcLocs[0]!.name as string))
    expect(strip.destination_location_id).toBe(locByName.get(srcLocs[1]!.name as string))
    expect(strip.origin_location_id).not.toBe(strip.destination_location_id)
    expect([strip.origin_location_id, strip.destination_location_id].every((id) => locs.some((l) => l.id === id))).toBe(true)

    const sdu = await one(`SELECT sdu.* FROM shoot_day_units sdu JOIN shoot_days d ON d.id = sdu.shoot_day_id WHERE d.production_id = $1`)
    const copiedLocA = srcLocs.map((l) => locByName.get(l.name as string)!)
    const legs = (JSON.parse(sdu.movement_order_json as string) as { revisionLabel: string; legs: Record<string, unknown> })
    expect(legs.revisionLabel).toBe('A')
    expect(Object.keys(legs.legs).sort()).toEqual([`${copiedLocA[0]}>${copiedLocA[1]}`, `${copiedLocA[0]}>${copiedLocA[1]}#1`].sort())

    const spec = await one(`SELECT ts.* FROM technical_specs ts JOIN deliverables d ON d.id = ts.deliverable_id WHERE d.production_id = $1`)
    const del = await one(`SELECT id FROM deliverables WHERE production_id = $1`)
    expect(spec.deliverable_id).toBe(del.id)
    const track = await one(`SELECT id FROM music_tracks WHERE production_id = $1`)
    const clr = await one(`SELECT item_id FROM clearances WHERE production_id = $1`)
    expect(clr.item_id).toBe(track.id)
  })

  it('does not seed the default chart when the source has its own accounts, and seeds it when it has none', async () => {
    const withChart = await createProduction({ name: 'With chart', notes: null })
    const sourceCount = (await dbAdapter.select<Row[]>(`SELECT COUNT(*) AS n FROM budget_accounts WHERE production_id = $1 AND deleted_at IS NULL`, [withChart.id]))[0]!.n as number
    const copy = await duplicateProduction(withChart.id, 'Copy A')
    const copyCount = (await dbAdapter.select<Row[]>(`SELECT COUNT(*) AS n FROM budget_accounts WHERE production_id = $1 AND deleted_at IS NULL`, [copy.id]))[0]!.n as number
    expect(copyCount).toBe(sourceCount)

    await dbAdapter.execute(`DELETE FROM budget_accounts WHERE production_id = $1`, [withChart.id])
    const bare = await duplicateProduction(withChart.id, 'Copy B')
    const bareCount = (await dbAdapter.select<Row[]>(`SELECT COUNT(*) AS n FROM budget_accounts WHERE production_id = $1 AND deleted_at IS NULL`, [bare.id]))[0]!.n as number
    expect(bareCount).toBeGreaterThan(0)
  })
})
