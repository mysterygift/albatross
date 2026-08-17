import type { QueryResult } from '@tauri-apps/plugin-sql'

export type SqlStatement = { sql: string; bindValues: unknown[] }
export type SqlDialect = 'sqlite' | 'postgres'

export interface DatabaseAdapter {
  readonly dialect?: SqlDialect
  execute(query: string, bindValues?: unknown[]): Promise<QueryResult>
  select<T>(query: string, bindValues?: unknown[]): Promise<T>
  executeBatch(statements: SqlStatement[]): Promise<void>
  /** Optional same-connection transaction primitive; required for crash-atomic sync writes. */
  executeTransaction?(statements: SqlStatement[]): Promise<void>
  runInSerializedTransaction<T>(fn: () => Promise<T>): Promise<T>
}
