/**
 * sql.js database bootstrap: applies the app's real SQLite migrations, then inserts rows with
 * column validation so a typo or schema drift fails loudly instead of silently dropping data.
 */
import { join } from 'node:path'
import initSqlJs, { type Database } from 'sql.js'

import { APF_V1_TABLE_KEYS, type ApfV1TableKey } from '@/lib/importExport/tableKeys'
import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import type { Row } from './util'

export async function openMigratedDb(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => join(process.cwd(), 'node_modules/sql.js/dist', file),
  })
  const db = new SQL.Database()
  db.exec('PRAGMA foreign_keys = ON')
  applyAlbatrossMigrationsSqlJs(db)
  return db
}

/** Rows of the first result set as plain arrays (sql.js typings are loose). */
export function query(db: Database, sql: string): unknown[][] {
  const res = db.exec(sql) as unknown as Array<{ values: unknown[][] }>
  return res[0]?.values ?? []
}

const columnCache = new WeakMap<Database, Map<string, Set<string>>>()

function columnsOf(db: Database, table: string): Set<string> {
  let perDb = columnCache.get(db)
  if (!perDb) {
    perDb = new Map()
    columnCache.set(db, perDb)
  }
  const hit = perDb.get(table)
  if (hit) return hit
  const cols = new Set<string>(query(db, `PRAGMA table_info(${table})`).map((v) => String(v[1])))
  if (cols.size === 0) throw new Error(`Unknown table: ${table}`)
  perDb.set(table, cols)
  return cols
}

export function insertRows(db: Database, table: string, rows: readonly Row[]): void {
  if (rows.length === 0) return
  const valid = columnsOf(db, table)
  for (const row of rows) {
    const keys = Object.keys(row).filter((k) => row[k] !== undefined)
    for (const k of keys) {
      if (!valid.has(k)) throw new Error(`${table}: unknown column "${k}"`)
    }
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    try {
      db.run(sql, keys.map((k) => row[k] as never))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`${table}: ${msg}\n  row: ${JSON.stringify(row).slice(0, 400)}`)
    }
  }
}

/** Every APF table the generator may fill, in the importer's FK-safe order. */
export type TableRows = Partial<Record<ApfV1TableKey, Row[]>>

export function insertAllTables(db: Database, tables: TableRows): void {
  for (const key of Object.keys(tables)) {
    if (!(APF_V1_TABLE_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Table "${key}" is not part of the .apf v1 INCLUDE set; it would be dropped on export.`)
    }
  }
  for (const key of APF_V1_TABLE_KEYS) {
    if (key === 'checklist_items') continue // legacy slice, always empty
    insertRows(db, key, tables[key] ?? [])
  }
}
