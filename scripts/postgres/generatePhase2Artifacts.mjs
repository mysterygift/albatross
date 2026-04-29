import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import initSqlJs from 'sql.js'

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

function rowsFromExec(db, sql) {
  const result = db.exec(sql)[0]
  if (!result) return []
  return result.values.map((valueRow) => Object.fromEntries(result.columns.map((c, i) => [c, valueRow[i]])))
}

function scalarFromFirst(result) {
  const first = result[0]
  const value = first?.values?.[0]?.[0]
  return value == null ? null : String(value)
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function isJsonColumn(columnName) {
  return columnName.endsWith('_json')
}

function isDateColumn(columnName) {
  return (
    (columnName.endsWith('_date') || columnName === 'date' || columnName === 'dob') &&
    !columnName.endsWith('_created_at') &&
    !columnName.endsWith('_updated_at')
  )
}

function isTimestampColumn(columnName) {
  return columnName.endsWith('_at') || columnName === 'created' || columnName === 'updated'
}

function isNumericColumn(columnName) {
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

function isUuidColumn(columnName, sqliteType) {
  const t = String(sqliteType ?? '').toUpperCase()
  if (t !== 'TEXT') return false
  return columnName === 'id' || columnName.endsWith('_id')
}

function isBooleanColumn(columnName, sqliteType, createSql) {
  if (!BOOLEAN_COLUMN_ALLOWLIST.has(columnName)) return false
  if (String(sqliteType ?? '').toUpperCase() !== 'INTEGER') return false
  const checkPattern = new RegExp(`${columnName}\\s+INTEGER[^,]*CHECK\\s*\\(\\s*${columnName}\\s+IN\\s*\\(0,\\s*1\\)\\s*\\)`, 'i')
  return checkPattern.test(createSql) || BOOLEAN_COLUMN_ALLOWLIST.has(columnName)
}

function mapSqliteTypeToPostgres(column, createSql) {
  const name = String(column.name)
  if (isBooleanColumn(name, column.type, createSql)) return 'BOOLEAN'
  if (isUuidColumn(name, column.type)) return 'UUID'
  if (isTimestampColumn(name)) return 'TIMESTAMPTZ'
  if (isDateColumn(name)) return 'DATE'
  if (isJsonColumn(name)) return 'JSONB'
  if (isNumericColumn(name)) return 'NUMERIC'

  const sqliteType = String(column.type ?? '').toUpperCase()
  if (sqliteType.includes('INT')) return 'INTEGER'
  if (sqliteType.includes('REAL') || sqliteType.includes('FLOA') || sqliteType.includes('DOUB')) return 'NUMERIC'
  if (sqliteType.includes('BLOB')) return 'BYTEA'
  return 'TEXT'
}

function convertDefaultValue(defaultValue, pgType, columnName) {
  if (defaultValue == null) {
    if (columnName === 'id' && pgType === 'UUID') return 'gen_random_uuid()'
    return null
  }

  const normalized = String(defaultValue).trim()
  if (pgType === 'BOOLEAN') {
    if (normalized === '1') return 'TRUE'
    if (normalized === '0') return 'FALSE'
  }
  if (pgType === 'TIMESTAMPTZ' && /CURRENT_TIMESTAMP/i.test(normalized)) return 'CURRENT_TIMESTAMP'
  if (/^'.*'$/.test(normalized)) return normalized
  if (/^-?\d+(\.\d+)?$/.test(normalized)) return normalized
  if (/^(CURRENT_TIMESTAMP|NULL|TRUE|FALSE)$/i.test(normalized)) return normalized.toUpperCase()
  return normalized
}

function convertIndexSql(indexSql, table) {
  let out = indexSql.replace(/IF NOT EXISTS\s+/gi, '')
  for (const col of table.columns) {
    if (mapSqliteTypeToPostgres(col, table.createSql) === 'BOOLEAN') {
      out = out.replace(new RegExp(`\\b${col.name}\\b\\s*=\\s*1`, 'gi'), `${col.name} = TRUE`)
      out = out.replace(new RegExp(`\\b${col.name}\\b\\s*=\\s*0`, 'gi'), `${col.name} = FALSE`)
    }
  }
  return out
}

function convertCheckExpression(expr, table) {
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

function extractCheckExpressions(createSql) {
  const out = []
  let i = 0
  while (i < createSql.length) {
    const idx = createSql.toUpperCase().indexOf('CHECK', i)
    if (idx < 0) break
    let j = idx + 5
    while (j < createSql.length && /\s/.test(createSql[j])) j += 1
    if (createSql[j] !== '(') {
      i = j
      continue
    }
    let depth = 0
    let start = j + 1
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

function tableRiskLevel(table) {
  let hasTypeConversion = false
  let hasNoActionFk = false
  for (const col of table.columns) {
    const pgType = mapSqliteTypeToPostgres(col, table.createSql)
    const sqliteType = String(col.type ?? '').toUpperCase()
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

async function loadAudit() {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  const migrationDir = join(process.cwd(), 'src-tauri', 'migrations')
  const migrationFiles = readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of migrationFiles) {
    db.exec(readFileSync(join(migrationDir, file), 'utf8'))
  }

  const tables = rowsFromExec(
    db,
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).map((row) => {
    const tableName = String(row.name)
    const columns = rowsFromExec(db, `PRAGMA table_info(${tableName})`)
    const foreignKeys = rowsFromExec(db, `PRAGMA foreign_key_list(${tableName})`)
    const indexRows = rowsFromExec(db, `PRAGMA index_list(${tableName})`)
    const indexes = indexRows
      .filter((idx) => idx.origin !== 'pk')
      .map((idx) => {
        const indexColumns = rowsFromExec(db, `PRAGMA index_info(${idx.name})`)
          .sort((a, b) => Number(a.seqno) - Number(b.seqno))
          .map((ic) => String(ic.name))
        const indexSql = scalarFromFirst(
          db.exec(`SELECT sql FROM sqlite_master WHERE type='index' AND name=${quoteLiteral(idx.name)}`)
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
      table: tableName,
      createSql: String(row.sql),
      columns,
      foreignKeys,
      indexes,
    }
  })
  return { tables }
}

function renderBaselineSql(audit) {
  const lines = []
  lines.push('-- PostgreSQL baseline schema for Albatross')
  lines.push('-- Strategy: consolidated baseline schema (no replay of SQLite migration chain).')
  lines.push('CREATE EXTENSION IF NOT EXISTS pgcrypto;')
  lines.push('')
  lines.push('-- 0054 budget_revisions semantic handling:')
  lines.push('-- SQLite used randomblob()/hex() during historical backfill.')
  lines.push('-- PostgreSQL baseline models only final state using UUID defaults + partial live-revision uniqueness.')
  lines.push('')

  for (const table of audit.tables) {
    lines.push(`CREATE TABLE ${table.table} (`)
    const columnDefs = table.columns.map((column) => {
      const pgType = mapSqliteTypeToPostgres(column, table.createSql)
      const parts = [`  ${column.name} ${pgType}`]
      if (Number(column.notnull) === 1) parts.push('NOT NULL')
      const defaultSql = convertDefaultValue(column.dflt_value, pgType, column.name)
      if (defaultSql != null) parts.push(`DEFAULT ${defaultSql}`)
      return parts.join(' ')
    })
    const pkColumns = table.columns
      .filter((c) => Number(c.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((c) => c.name)
    const fkDefs = table.foreignKeys
      .sort((a, b) => Number(a.id) - Number(b.id) || Number(a.seq) - Number(b.seq))
      .map((fk, idx) => {
        const name = `fk_${table.table}_${idx + 1}_${fk.from}`
        return (
          `  CONSTRAINT ${name} FOREIGN KEY (${fk.from}) REFERENCES ${fk.table}(${fk.to})` +
          ` ON UPDATE ${fk.on_update} ON DELETE ${fk.on_delete}`
        )
      })
    const constraints = []
    if (pkColumns.length > 0) {
      constraints.push(`  CONSTRAINT pk_${table.table} PRIMARY KEY (${pkColumns.join(', ')})`)
    }
    const checkExpressions = extractCheckExpressions(table.createSql)
      .map((expr) => convertCheckExpression(expr, table))
      .filter(Boolean)
    for (const [idx, expr] of checkExpressions.entries()) {
      constraints.push(`  CONSTRAINT ck_${table.table}_${idx + 1} CHECK (${expr})`)
    }
    constraints.push(...fkDefs)
    lines.push([...columnDefs, ...constraints].join(',\n'))
    lines.push(');')
    lines.push('')
  }

  for (const table of audit.tables) {
    for (const idx of table.indexes) {
      if (idx.sql) {
        lines.push(`${convertIndexSql(idx.sql, table)};`)
        continue
      }
      if (idx.columns.length === 0) continue
      const unique = idx.unique ? 'UNIQUE ' : ''
      lines.push(`CREATE ${unique}INDEX ${idx.name} ON ${table.table}(${idx.columns.join(', ')});`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

function renderAuditMarkdown(audit) {
  const lines = []
  lines.push('# PostgreSQL Schema Audit (Phase 2)')
  lines.push('')
  lines.push('- Audit source: final SQLite schema after all `src-tauri/migrations/*.sql`.')
  lines.push('- Migration strategy: consolidated PostgreSQL baseline schema; do not replay historical SQLite migrations.')
  lines.push('- UUID defaults: `gen_random_uuid()` via `pgcrypto`.')
  lines.push('- Boolean conversions: only audited 0/1 boolean-like columns.')
  lines.push('- Timestamp semantics: `TIMESTAMPTZ` for `*_at` fields.')
  lines.push('- Date semantics: `DATE` for date-only fields.')
  lines.push('- Precision semantics: `NUMERIC` for financial/precision fields.')
  lines.push('- JSON semantics: `JSONB` only for semantic JSON columns (`*_json`).')
  lines.push('')
  lines.push('## 0054 budget_revisions semantic handling')
  lines.push('')
  lines.push('- The SQLite historical migration backfilled UUIDs using `randomblob()/hex()`.')
  lines.push('- PostgreSQL baseline does not replay that DML; it models final semantic state directly.')
  lines.push('- A partial unique index enforces one live revision per production.')
  lines.push('')
  lines.push('## Table mapping matrix')
  lines.push('')

  for (const table of audit.tables) {
    lines.push(`### ${table.table}`)
    lines.push('')
    lines.push(`- Risk level: **${tableRiskLevel(table)}**`)
    lines.push(`- Foreign keys: ${table.foreignKeys.length}`)
    lines.push(`- Indexes: ${table.indexes.length}`)
    lines.push('')
    lines.push('| Column | SQLite type | PostgreSQL type | Default | Constraints |')
    lines.push('|---|---|---|---|---|')
    for (const column of table.columns) {
      const pgType = mapSqliteTypeToPostgres(column, table.createSql)
      const constraints = []
      if (Number(column.pk) > 0) constraints.push('PK')
      if (Number(column.notnull) === 1) constraints.push('NOT NULL')
      if (pgType === 'BOOLEAN') constraints.push('BOOLEAN_CONVERTED')
      lines.push(
        `| ${column.name} | ${column.type || '(none)'} | ${pgType} | ${
          convertDefaultValue(column.dflt_value, pgType, column.name) ?? '(none)'
        } | ${constraints.join(', ') || '(none)'} |`
      )
    }
    lines.push('')
    if (table.indexes.length > 0) {
      lines.push('Indexes:')
      for (const index of table.indexes) {
        lines.push(
          `- ${index.name}: ${index.unique ? 'UNIQUE' : 'NON-UNIQUE'} ${index.partial ? 'PARTIAL' : 'FULL'} on (${index.columns.join(', ')})`
        )
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

const audit = await loadAudit()
const baselineSql = renderBaselineSql(audit)
const auditMarkdown = renderAuditMarkdown(audit)

mkdirSync(join(process.cwd(), 'postgres', 'schema'), { recursive: true })
mkdirSync(join(process.cwd(), 'postgres', 'migrations'), { recursive: true })

writeFileSync(join(process.cwd(), 'postgres', 'schema', 'baseline.sql'), baselineSql)
writeFileSync(join(process.cwd(), 'postgres', 'migrations', '0001_baseline.sql'), baselineSql)
writeFileSync(join(process.cwd(), 'docs', 'POSTGRESQL_SCHEMA_AUDIT.md'), auditMarkdown)

console.log(`Generated baseline + audit for ${audit.tables.length} tables.`)
