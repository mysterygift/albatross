import type { Database } from 'sql.js'

import type { TauriLikeSqlDb } from '@/test/apf/sqlJsApfE2eContext'

/**
 * Tauri passes one bind per `$n` index; the same index may appear multiple times in SQL.
 * sql.js needs one `?` per occurrence, so we expand the bind array (e.g. `$1,$2,$3,$3` → 4 binds).
 */
export function tauriSqlAndBindsForSqlJs(
  sql: string,
  bindValues: unknown[] | undefined
): { sql: string; binds: unknown[] } {
  if (bindValues == null || bindValues.length === 0) {
    return { sql: sql.replace(/\$(\d+)/g, '?'), binds: [] }
  }
  const binds: unknown[] = []
  const out = sql.replace(/\$(\d+)/g, (_, num: string) => {
    const idx = parseInt(num, 10) - 1
    binds.push(bindValues[idx] ?? null)
    return '?'
  })
  return { sql: out, binds }
}

export function createSqlJsTauriAdapter(raw: Database): TauriLikeSqlDb {
  return {
    async select<T>(sql: string, bindValues?: unknown[]): Promise<T> {
      const { sql: ssql, binds } = tauriSqlAndBindsForSqlJs(sql, bindValues)
      const stmt = raw.prepare(ssql)
      try {
        if (binds.length > 0) stmt.bind(binds)
        const out: Record<string, unknown>[] = []
        while (stmt.step()) {
          out.push(stmt.getAsObject() as Record<string, unknown>)
        }
        return out as T
      } finally {
        stmt.free()
      }
    },
    async execute(sql: string, bindValues?: unknown[]): Promise<void> {
      const statements = sql
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
      for (const part of statements) {
        const { sql: ssql, binds } = tauriSqlAndBindsForSqlJs(part, bindValues)
        const stmt = raw.prepare(ssql)
        try {
          if (binds.length > 0) stmt.bind(binds)
          stmt.step()
        } finally {
          stmt.free()
        }
      }
    },
  }
}
