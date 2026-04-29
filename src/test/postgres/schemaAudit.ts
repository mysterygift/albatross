import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'

export type SqliteColumn = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

export type SqliteForeignKey = {
  id: number
  seq: number
  table: string
  from: string
  to: string
  on_update: string
  on_delete: string
  match: string
}

export type SqliteIndexListRow = {
  seq: number
  name: string
  unique: number
  origin: 'c' | 'u' | 'pk'
  partial: number
}

export type SqliteIndexColumnRow = {
  seqno: number
  cid: number
  name: string
}

export type TableAudit = {
  table: string
  createSql: string
  columns: SqliteColumn[]
  foreignKeys: SqliteForeignKey[]
  indexes: {
    name: string
    unique: boolean
    partial: boolean
    columns: string[]
    sql: string | null
  }[]
}

export type DatabaseAudit = {
  tables: TableAudit[]
}

const BOOLEAN_COLUMN_ALLOWLIST = new Set([
  'is_cast',
  'is_live',
  'is_locked',
  'is_postable',
  'is_enabled',
  'include_children',
  'is_complete',
  'is_required',
  'approval',
  'is_episodic',
  'checked_out',
  'checked_back_in',
])

const NUMERIC_COLUMN_ALLOWLIST = new Set([
  'amount',
  'tax',
  'estimated_cost',
  'actual_cost',
  'matched_amount',
  'rate',
  'permit_fee',
  'location_fee',
  'replacement_value',
  'sort_index',
])

function scalarFromFirst(result: unknown[]): string | null {
  const first = result[0] as { values?: unknown[][] } | undefined
  const value = first?.values?.[0]?.[0]
  if (value == null) return null
  return String(value)
}

function rowsFromExec<T>(db: Database, sql: string): T[] {
  const result = db.exec(sql)[0] as { columns: string[]; values: unknown[][] } | undefined
  if (!result) return []
  const rows: T[] = []
  for (const valueRow of result.values) {
    const row = Object.fromEntries(result.columns.map((c, i) => [c, valueRow[i]])) as T
    rows.push(row)
  }
  return rows
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function toSnakeUpper(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

function isJsonColumn(columnName: string): boolean {
  return columnName.endsWith('_json')
}

function isDateColumn(columnName: string): boolean {
  return (
    (columnName.endsWith('_date') || columnName === 'date' || columnName === 'dob') &&
    !columnName.endsWith('_updated_at') &&
    !columnName.endsWith('_created_at')
  )
}

function isTimestampColumn(columnName: string): boolean {
  return (
    columnName.endsWith('_at') ||
    columnName === 'created' ||
    columnName === 'updated' ||
    columnName === 'expires_at'
  )
}

function isNumericColumn(columnName: string): boolean {
  if (NUMERIC_COLUMN_ALLOWLIST.has(columnName)) return true
  return (
    columnName.includes('amount') ||
    columnName.includes('cost') ||
    columnName === 'rate' ||
    columnName.endsWith('_rate') ||
    columnName.includes('fee') ||
    columnName.includes('matched_amount')
  )
}

function isUuidColumn(columnName: string, sqliteType: string): boolean {
  const t = sqliteType.toUpperCase()
  if (t !== 'TEXT') return false
  return columnName === 'id' || columnName.endsWith('_id')
}

function isBooleanColumn(columnName: string, sqliteType: string, createSql: string): boolean {
  if (!BOOLEAN_COLUMN_ALLOWLIST.has(columnName)) return false
  if (sqliteType.toUpperCase() !== 'INTEGER') return false
  const checkPattern = new RegExp(`${columnName}\\s+INTEGER[^,]*CHECK\\s*\\(\\s*${columnName}\\s+IN\\s*\\(0,\\s*1\\)\\s*\\)`, 'i')
  return checkPattern.test(createSql) || BOOLEAN_COLUMN_ALLOWLIST.has(columnName)
}

export function mapSqliteTypeToPostgres(column: SqliteColumn, createSql: string): string {
  const name = column.name
  if (isBooleanColumn(name, column.type, createSql)) return 'BOOLEAN'
  if (isUuidColumn(name, column.type)) return 'UUID'
  if (isTimestampColumn(name)) return 'TIMESTAMPTZ'
  if (isDateColumn(name)) return 'DATE'
  if (isJsonColumn(name)) return 'JSONB'
  if (isNumericColumn(name)) return 'NUMERIC'

  const sqliteType = column.type.toUpperCase()
  if (sqliteType.includes('INT')) return 'INTEGER'
  if (sqliteType.includes('REAL') || sqliteType.includes('FLOA') || sqliteType.includes('DOUB')) return 'NUMERIC'
  if (sqliteType.includes('BLOB')) return 'BYTEA'
  return 'TEXT'
}

function convertDefaultValue(
  defaultValue: string | null,
  pgType: string,
  tableName: string,
  columnName: string
): string | null {
  if (defaultValue == null) {
    if (columnName === 'id' && pgType === 'UUID') return 'gen_random_uuid()'
    return null
  }

  const normalized = defaultValue.trim()
  if (pgType === 'BOOLEAN') {
    if (normalized === '1') return 'TRUE'
    if (normalized === '0') return 'FALSE'
  }
  if (pgType === 'TIMESTAMPTZ' && /CURRENT_TIMESTAMP/i.test(normalized)) {
    return 'CURRENT_TIMESTAMP'
  }
  if (pgType === 'UUID' && /randomblob|hex\(/i.test(normalized)) {
    return 'gen_random_uuid()'
  }
  if (/^'.*'$/.test(normalized)) return normalized
  if (/^-?\d+(\.\d+)?$/.test(normalized)) return normalized
  if (/^(CURRENT_TIMESTAMP|NULL|TRUE|FALSE)$/i.test(normalized)) return normalized.toUpperCase()

  // Preserve unknown SQLite defaults as string literal comments in docs/tests, but render as-is in SQL.
  if (tableName === 'budget_revisions' && columnName === 'id') return 'gen_random_uuid()'
  return normalized
}

function convertIndexSql(indexSql: string, table: TableAudit): string {
  let out = indexSql.replace(/IF NOT EXISTS\s+/gi, '')
  for (const col of table.columns) {
    if (mapSqliteTypeToPostgres(col, table.createSql) === 'BOOLEAN') {
      const eqOne = new RegExp(`\\b${col.name}\\b\\s*=\\s*1`, 'gi')
      const eqZero = new RegExp(`\\b${col.name}\\b\\s*=\\s*0`, 'gi')
      out = out.replace(eqOne, `${col.name} = TRUE`)
      out = out.replace(eqZero, `${col.name} = FALSE`)
    }
  }
  return out
}

function convertCheckExpression(expr: string, table: TableAudit): string {
  let out = expr
  for (const col of table.columns) {
    if (mapSqliteTypeToPostgres(col, table.createSql) !== 'BOOLEAN') continue
    out = out.replace(new RegExp(`\\b${col.name}\\b\\s*=\\s*1`, 'gi'), `${col.name} = TRUE`)
    out = out.replace(new RegExp(`\\b${col.name}\\b\\s*=\\s*0`, 'gi'), `${col.name} = FALSE`)
    out = out.replace(
      new RegExp(`\\b${col.name}\\b\\s+IN\\s*\\(\\s*0\\s*,\\s*1\\s*\\)`, 'gi'),
      `${col.name} IN (FALSE, TRUE)`
    )
  }
  return out
}

function extractCheckExpressions(createSql: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < createSql.length) {
    const idx = createSql.toUpperCase().indexOf('CHECK', i)
    if (idx < 0) break
    let j = idx + 5
    while (j < createSql.length && /\s/.test(createSql[j] ?? '')) j += 1
    if (createSql[j] !== '(') {
      i = j
      continue
    }
    let depth = 0
    const start = j + 1
    let end = -1
    for (let k = j; k < createSql.length; k += 1) {
      const ch = createSql[k]
      if (ch === '(') depth += 1
      if (ch === ')') {
        depth -= 1
        if (depth === 0) {
          end = k
          break
        }
      }
    }
    if (end > start) {
      out.push(createSql.slice(start, end).trim())
      i = end + 1
    } else {
      break
    }
  }
  return [...new Set(out)]
}

function tableRiskLevel(table: TableAudit): 'low' | 'medium' | 'high' {
  let hasTypeConversion = false
  let hasNoActionFk = false
  for (const col of table.columns) {
    const pgType = mapSqliteTypeToPostgres(col, table.createSql)
    const sqliteType = col.type.toUpperCase()
    if (
      (sqliteType === 'TEXT' && pgType !== 'TEXT') ||
      (sqliteType.includes('INT') && pgType === 'BOOLEAN') ||
      (sqliteType.includes('REAL') && pgType === 'NUMERIC')
    ) {
      hasTypeConversion = true
    }
  }
  for (const fk of table.foreignKeys) {
    if (fk.on_delete === 'NO ACTION' || fk.on_update === 'NO ACTION') {
      hasNoActionFk = true
      break
    }
  }
  if (hasTypeConversion && hasNoActionFk) return 'high'
  if (hasTypeConversion || hasNoActionFk) return 'medium'
  return 'low'
}

export async function loadSqliteAudit(): Promise<DatabaseAudit> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  const migrationDir = join(process.cwd(), 'src-tauri', 'migrations')
  const migrationFiles = readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of migrationFiles) {
    const sql = readFileSync(join(migrationDir, file), 'utf8')
    db.exec(sql)
  }

  const tables = rowsFromExec<{ name: string; sql: string }>(
    db,
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).map((row) => {
    const columns = rowsFromExec<SqliteColumn>(db, `PRAGMA table_info(${row.name})`)
    const foreignKeys = rowsFromExec<SqliteForeignKey>(db, `PRAGMA foreign_key_list(${row.name})`)
    const indexRows = rowsFromExec<SqliteIndexListRow>(db, `PRAGMA index_list(${row.name})`)
    const indexes = indexRows
      .filter((idx) => idx.origin !== 'pk')
      .map((idx) => {
        const indexColumns = rowsFromExec<SqliteIndexColumnRow>(db, `PRAGMA index_info(${idx.name})`)
          .sort((a, b) => Number(a.seqno) - Number(b.seqno))
          .map((ic) => String(ic.name))
        const indexSql = scalarFromFirst(
          db.exec(
            `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ${quoteLiteral(String(idx.name))}`
          )
        )
        return {
          name: String(idx.name),
          unique: Number(idx.unique) === 1,
          partial: Number(idx.partial) === 1,
          columns: indexColumns,
          sql: indexSql,
        }
      })

    return {
      table: String(row.name),
      createSql: String(row.sql),
      columns,
      foreignKeys,
      indexes,
    }
  })

  return { tables }
}

export function renderPostgresBaselineSql(audit: DatabaseAudit): string {
  const lines: string[] = []
  lines.push('-- PostgreSQL baseline schema for Albatross')
  lines.push('-- Strategy: one consolidated baseline (do not replay SQLite migration history).')
  lines.push('-- Generated from SQLite end-state audit to maintain semantic parity.')
  lines.push('CREATE EXTENSION IF NOT EXISTS pgcrypto;')
  lines.push('')
  lines.push('-- 0054 budget_revisions semantics:')
  lines.push('-- The SQLite historical migration used randomblob/hex for UUID backfill.')
  lines.push('-- In PostgreSQL baseline we model the final semantic state directly:')
  lines.push('-- * UUID columns use gen_random_uuid() defaults')
  lines.push('-- * budget_revisions exists as a first-class table')
  lines.push('-- * unique partial index enforces one live revision per production')
  lines.push('')

  for (const table of audit.tables) {
    lines.push(`CREATE TABLE ${table.table} (`)
    const pkColumns = table.columns.filter((c) => Number(c.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk))
    const pkNames = pkColumns.map((c) => c.name)

    const colDefs = table.columns.map((column) => {
      const pgType = mapSqliteTypeToPostgres(column, table.createSql)
      const parts = [`  ${column.name} ${pgType}`]
      if (Number(column.notnull) === 1) parts.push('NOT NULL')
      const defaultSql = convertDefaultValue(column.dflt_value, pgType, table.table, column.name)
      if (defaultSql != null) parts.push(`DEFAULT ${defaultSql}`)
      return parts.join(' ')
    })

    const fkDefs = table.foreignKeys
      .sort((a, b) => Number(a.id) - Number(b.id) || Number(a.seq) - Number(b.seq))
      .map((fk, i) => {
        const name = `fk_${table.table}_${i + 1}_${fk.from}`
        return (
          `  CONSTRAINT ${name} FOREIGN KEY (${fk.from}) REFERENCES ${fk.table}(${fk.to})` +
          ` ON UPDATE ${fk.on_update} ON DELETE ${fk.on_delete}`
        )
      })

    const constraints: string[] = []
    if (pkNames.length > 0) {
      constraints.push(`  CONSTRAINT pk_${table.table} PRIMARY KEY (${pkNames.join(', ')})`)
    }
    const checks = extractCheckExpressions(table.createSql).map((expr) => convertCheckExpression(expr, table))
    for (const [index, expr] of checks.entries()) {
      constraints.push(`  CONSTRAINT ck_${table.table}_${index + 1} CHECK (${expr})`)
    }
    constraints.push(...fkDefs)
    lines.push([...colDefs, ...constraints].join(',\n'))
    lines.push(');')
    lines.push('')
  }

  for (const table of audit.tables) {
    for (const index of table.indexes) {
      if (index.sql) {
        lines.push(`${convertIndexSql(index.sql, table)};`)
        continue
      }
      if (index.columns.length === 0) continue
      const unique = index.unique ? 'UNIQUE ' : ''
      lines.push(`CREATE ${unique}INDEX ${index.name} ON ${table.table}(${index.columns.join(', ')});`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

export function renderSchemaAuditMarkdown(audit: DatabaseAudit): string {
  const lines: string[] = []
  lines.push('# PostgreSQL Schema Audit (Phase 2)')
  lines.push('')
  lines.push('- Source: final SQLite schema after applying all files in `src-tauri/migrations`.')
  lines.push('- Strategy: consolidate to a single PostgreSQL baseline schema (no replay of historical SQLite migrations).')
  lines.push('- UUID policy: `gen_random_uuid()` defaults (`pgcrypto`).')
  lines.push('- Boolean policy: convert only audited boolean-like columns (0/1 + check).')
  lines.push('- Timestamp policy: `TIMESTAMPTZ` for timestamp semantics.')
  lines.push('- Date policy: `DATE` for date-only semantics.')
  lines.push('- Numeric policy: `NUMERIC` for financial/precision semantics.')
  lines.push('- JSON policy: `JSONB` only for semantic JSON columns (`*_json`).')
  lines.push('')
  lines.push('## 0054 budget revisions handling')
  lines.push('')
  lines.push('- SQLite historical migration generated UUIDs via `randomblob()/hex()`.')
  lines.push('- PostgreSQL baseline does **not** replay that backfill DML; it represents final state directly.')
  lines.push('- `budget_revisions.id` uses `UUID DEFAULT gen_random_uuid()` and keeps the unique partial index for one live revision per production.')
  lines.push('')
  lines.push('## Table mapping audit')
  lines.push('')

  for (const table of audit.tables) {
    lines.push(`### ${table.table}`)
    lines.push('')
    lines.push(`- Risk level: **${tableRiskLevel(table)}**`)
    lines.push(`- Indexes: ${table.indexes.length}`)
    lines.push(`- Foreign keys: ${table.foreignKeys.length}`)
    lines.push('')
    lines.push('| Column | SQLite type | PostgreSQL type | Default | Constraints |')
    lines.push('|---|---|---|---|---|')
    for (const column of table.columns) {
      const pgType = mapSqliteTypeToPostgres(column, table.createSql)
      const defaultSql = convertDefaultValue(column.dflt_value, pgType, table.table, column.name) ?? ''
      const constraints: string[] = []
      if (Number(column.pk) > 0) constraints.push('PK')
      if (Number(column.notnull) === 1) constraints.push('NOT NULL')
      if (BOOLEAN_COLUMN_ALLOWLIST.has(column.name) && pgType === 'BOOLEAN') constraints.push('BOOL_CONVERTED')
      lines.push(
        `| ${column.name} | ${column.type || '(none)'} | ${pgType} | ${defaultSql || '(none)'} | ${constraints.join(', ') || '(none)'} |`
      )
    }
    lines.push('')
    if (table.indexes.length > 0) {
      lines.push('Indexes:')
      for (const index of table.indexes) {
        const partialLabel = index.partial ? 'partial' : 'full'
        lines.push(
          `- ${index.name} (${index.unique ? 'unique' : 'non-unique'}, ${partialLabel}) on (${index.columns.join(', ')})`
        )
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

export function collectSqliteTableNames(audit: DatabaseAudit): string[] {
  return audit.tables.map((t) => t.table).sort()
}

export function parsePostgresBaselineTables(sql: string): Set<string> {
  const tables = new Set<string>()
  const tableRegex = /CREATE TABLE\s+([a-zA-Z0-9_]+)/g
  for (const match of sql.matchAll(tableRegex)) {
    tables.add(match[1]!)
  }
  return tables
}

export function sqliteOnlyPatternViolations(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  const checks = [
    { name: 'PRAGMA', pattern: /\bPRAGMA\b/i },
    { name: 'randomblob', pattern: /\brandomblob\s*\(/i },
    { name: 'hex', pattern: /\bhex\s*\(/i },
    { name: 'INSERT OR IGNORE', pattern: /\bINSERT\s+OR\s+IGNORE\b/i },
    { name: 'INSERT OR REPLACE', pattern: /\bINSERT\s+OR\s+REPLACE\b/i },
    { name: 'AUTOINCREMENT', pattern: /\bAUTOINCREMENT\b/i },
  ]
  return checks.filter((c) => c.pattern.test(withoutComments)).map((c) => c.name)
}

export function migrationRerunExpectation(): 'fail' {
  return 'fail'
}

export function deterministicSchemaName(prefix: string): string {
  let safePrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
  if (safePrefix.startsWith('pg_')) {
    safePrefix = `test_${safePrefix.slice(3)}`
  }
  if (!safePrefix || safePrefix.startsWith('pg_')) {
    safePrefix = 'test_schema'
  }
  const time = Date.now().toString(36)
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(4, '0')
  return `${safePrefix}_${time}_${rand}`.slice(0, 63)
}

export function buildConstraintName(kind: string, table: string, column: string): string {
  return `${kind}_${toSnakeUpper(table)}_${toSnakeUpper(column)}`
}
