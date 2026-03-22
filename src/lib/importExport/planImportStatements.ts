import type Database from '@tauri-apps/plugin-sql'

import type { ApfTableRow, ApfV1DataFile } from '@/lib/importExport/payload'
import { APF_V1_TABLE_KEYS, type ApfV1TableKey } from '@/lib/importExport/tableKeys'

export type ImportSqlStatement = { sql: string; bindValues: unknown[] }

type PragmaColumn = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: unknown
  pk: number
}

function coerceCellValue(value: unknown, sqlType: string): unknown {
  if (value === null || value === undefined) return null
  const t = (sqlType ?? '').toUpperCase()
  if (typeof value === 'boolean') {
    if (t.includes('INT') || t === 'BOOLEAN') {
      return value ? 1 : 0
    }
  }
  return value
}

function sortRowsByParentTaskId(rows: ApfTableRow[]): ApfTableRow[] {
  type Row = ApfTableRow & { id?: unknown; parent_task_id?: unknown }
  const taskRows = rows as Row[]
  const taskIds = new Set(taskRows.map((t) => String(t.id)))
  const sorted: Row[] = []
  const seen = new Set<string>()
  while (sorted.length < taskRows.length) {
    let added = false
    for (const t of taskRows) {
      const id = String(t.id)
      if (seen.has(id)) continue
      const parentId = t.parent_task_id != null ? String(t.parent_task_id) : null
      const parentInList = parentId == null || taskIds.has(parentId)
      if (parentInList && (parentId == null || seen.has(parentId))) {
        sorted.push(t)
        seen.add(id)
        added = true
      }
    }
    if (!added) {
      for (const t of taskRows) {
        const id = String(t.id)
        if (!seen.has(id)) {
          sorted.push({ ...t, parent_task_id: null })
          seen.add(id)
        }
      }
      break
    }
  }
  return sorted
}

function sortBudgetAccountsByParent(rows: ApfTableRow[]): ApfTableRow[] {
  type Row = ApfTableRow & { id?: unknown; parent_account_id?: unknown }
  const list = rows as Row[]
  const ids = new Set(list.map((r) => String(r.id)))
  const out: Row[] = []
  const seen = new Set<string>()
  while (out.length < list.length) {
    let added = false
    for (const r of list) {
      const id = String(r.id)
      if (seen.has(id)) continue
      const parent = r.parent_account_id != null ? String(r.parent_account_id) : null
      const parentOk = parent == null || !ids.has(parent) || seen.has(parent)
      if (parentOk) {
        out.push(r)
        seen.add(id)
        added = true
      }
    }
    if (!added) {
      for (const r of list) {
        const id = String(r.id)
        if (!seen.has(id)) {
          out.push({ ...r, parent_account_id: null })
          seen.add(id)
        }
      }
      break
    }
  }
  return out
}

function orderRowsForTable(table: ApfV1TableKey, rows: ApfTableRow[]): ApfTableRow[] {
  if (table === 'production_tasks') {
    return sortRowsByParentTaskId(rows)
  }
  if (table === 'budget_accounts') {
    return sortBudgetAccountsByParent(rows)
  }
  return rows
}

function buildInsertForRow(table: string, colInfos: PragmaColumn[], row: ApfTableRow): ImportSqlStatement {
  const columns: string[] = []
  const bindValues: unknown[] = []
  for (const col of colInfos) {
    if (!Object.prototype.hasOwnProperty.call(row, col.name)) continue
    columns.push(col.name)
    bindValues.push(coerceCellValue(row[col.name], col.type))
  }
  if (columns.length === 0) {
    throw new Error(`import: no insertable columns for ${table} row`)
  }
  const colSql = columns.join(', ')
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
  return {
    sql: `INSERT INTO ${table} (${colSql}) VALUES (${placeholders})`,
    bindValues,
  }
}

const pragmaCache = new Map<string, PragmaColumn[]>()

/** Clears cached `PRAGMA table_info` results (Vitest mocks may swap DB shape between cases). */
export function resetApfImportPragmaCache(): void {
  pragmaCache.clear()
}

async function getTableColumns(db: Database, table: ApfV1TableKey): Promise<PragmaColumn[]> {
  let cached = pragmaCache.get(table)
  if (cached) return cached
  const rows = await db.select<PragmaColumn[]>(`PRAGMA table_info(${table})`)
  cached = rows.sort((a, b) => a.cid - b.cid)
  pragmaCache.set(table, cached)
  return cached
}

/**
 * Builds INSERT statements in FK-safe table order (see audit §3). Caller wraps with BEGIN/COMMIT + executeBatch.
 */
export async function planApfImportStatements(db: Database, data: ApfV1DataFile): Promise<ImportSqlStatement[]> {
  const statements: ImportSqlStatement[] = []

  for (const table of APF_V1_TABLE_KEYS) {
    const colInfos = await getTableColumns(db, table)
    const colNames = new Set(colInfos.map((c) => c.name))
    const rows = orderRowsForTable(table, data.tables[table])

    for (const row of rows) {
      const filtered: ApfTableRow = {}
      for (const k of Object.keys(row)) {
        if (colNames.has(k)) {
          filtered[k] = row[k]
        }
      }
      statements.push(buildInsertForRow(table, colInfos, filtered))
    }
  }

  return statements
}
