import type { Database } from 'sql.js'

export type SqlJsQueryResult = { columns: string[]; values: unknown[][] }

/** sql.js `Database.exec` typings omit `values`; use this for test queries that read result grids. */
export function sqlJsQueryExec(db: Database, sql: string): SqlJsQueryResult[] {
  return db.exec(sql) as SqlJsQueryResult[]
}
