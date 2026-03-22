import type { Database } from 'sql.js'

export type TauriLikeSqlDb = {
  select<T>(sql: string, bindValues?: unknown[]): Promise<T>
  execute(sql: string, bindValues?: unknown[]): Promise<void>
}

/** Wired in E2E `beforeAll` before calling export/import. */
export const sqlJsApfE2eContext: {
  adapter: TauriLikeSqlDb | null
  rawDb: Database | null
} = {
  adapter: null,
  rawDb: null,
}
