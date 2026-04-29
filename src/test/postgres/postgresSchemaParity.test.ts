import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectSqliteTableNames,
  loadSqliteAudit,
  mapSqliteTypeToPostgres,
  parsePostgresBaselineTables,
  sqliteOnlyPatternViolations,
} from '@/test/postgres/schemaAudit'

describe('postgres baseline schema parity', () => {
  it('covers every SQLite table from the full migration chain', async () => {
    const audit = await loadSqliteAudit()
    const sqliteTables = collectSqliteTableNames(audit)
    const baselineSql = readFileSync(join(process.cwd(), 'postgres', 'schema', 'baseline.sql'), 'utf8')
    const pgTables = parsePostgresBaselineTables(baselineSql)

    expect(pgTables.size).toBe(sqliteTables.length)
    for (const sqliteTable of sqliteTables) {
      expect(pgTables.has(sqliteTable), `missing table ${sqliteTable} in postgres baseline`).toBe(true)
    }
  })

  it('contains core semantic choices for PostgreSQL', () => {
    const baselineSql = readFileSync(join(process.cwd(), 'postgres', 'schema', 'baseline.sql'), 'utf8')
    expect(baselineSql).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    expect(baselineSql).toContain('gen_random_uuid()')
    expect(baselineSql).toContain('TIMESTAMPTZ')
    expect(baselineSql).toContain('DATE')
    expect(baselineSql).toContain('NUMERIC')
    expect(baselineSql).toContain('JSONB')
    expect(baselineSql).toMatch(/idx_budget_revisions_one_live_per_production/i)
    expect(baselineSql).toMatch(/WHERE is_live = TRUE AND deleted_at IS NULL/i)
  })

  it('does not include SQLite-only SQL patterns', () => {
    const baselineSql = readFileSync(join(process.cwd(), 'postgres', 'schema', 'baseline.sql'), 'utf8')
    const violations = sqliteOnlyPatternViolations(baselineSql)
    expect(violations).toEqual([])
  })

  it('maps SQLite columns to expected PostgreSQL semantic types', async () => {
    const audit = await loadSqliteAudit()
    const baselineSql = readFileSync(join(process.cwd(), 'postgres', 'schema', 'baseline.sql'), 'utf8')
    for (const table of audit.tables) {
      const escaped = table.table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const m = new RegExp(`CREATE TABLE\\s+${escaped}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(baselineSql)
      expect(m, `missing CREATE TABLE block for ${table.table}`).toBeTruthy()
      const tableBlock = m?.[1] ?? ''
      for (const column of table.columns) {
        const expectedType = mapSqliteTypeToPostgres(column, table.createSql)
        const colPattern = new RegExp(`\\b${column.name}\\b\\s+${expectedType}\\b`, 'i')
        expect(colPattern.test(tableBlock), `expected ${table.table}.${column.name} to be ${expectedType}`).toBe(
          true
        )
      }
    }
  })
})
