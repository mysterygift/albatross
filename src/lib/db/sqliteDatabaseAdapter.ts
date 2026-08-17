import { invoke } from '@tauri-apps/api/core'
import Database from '@tauri-apps/plugin-sql'
import type { QueryResult } from '@tauri-apps/plugin-sql'

import { recordDbOp, recordRetryAttempt, isLockError, isPerfLoggingEnabled } from './perf'
import type { DatabaseAdapter, SqlStatement } from './databaseAdapter'

const BUSY_TIMEOUT_MS = 8000
const RETRY_DELAYS_MS = [50, 150, 350]
const MAX_RETRIES = 3

let executeNestingDepth = 0
let executeTail = Promise.resolve()

function runSerializedExecute<T>(fn: () => Promise<T>): Promise<T> {
  if (executeNestingDepth > 0) {
    executeNestingDepth++
    return fn().finally(() => {
      executeNestingDepth--
    })
  }
  const job = executeTail.then(async () => {
    executeNestingDepth++
    try {
      return await fn()
    } finally {
      executeNestingDepth--
    }
  })
  executeTail = job.then(
    () => undefined,
    () => undefined
  )
  return job
}

let txnDepth = 0

function sanitizeSql(sql: string, maxLen: number = 120): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(
  fn: () => Promise<T>,
  sql: string,
  kind: 'execute' | 'select'
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const msg = getErrorMessage(e)
      if (attempt === MAX_RETRIES || !isLockError(msg)) throw e
      recordRetryAttempt(sanitizeSql(sql), kind, attempt + 1, msg)
      await sleep(RETRY_DELAYS_MS[attempt] ?? 350)
    }
  }
  throw lastErr
}

export function runInSerializedSqliteTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return runSerializedExecute(fn)
}

export async function executeBatchCompat(
  db: Pick<DatabaseAdapter, 'execute'>,
  statements: SqlStatement[]
): Promise<void> {
  if (statements.length === 0) return
  let offset = 0
  const renumbered = statements.map(({ sql, bindValues }) => {
    const n = bindValues.length
    let renumberedSql = sql
    if (n > 0) {
      renumberedSql = sql.replace(/\$(\d+)/g, (_, num) => '$' + (offset + parseInt(num, 10)))
    }
    offset += n
    return { sql: renumberedSql, bindValues }
  })
  const combinedSql = renumbered.map((s) => s.sql.trim()).join(';\n')
  const combinedBind = renumbered.flatMap((s) => s.bindValues)
  await db.execute(combinedSql, combinedBind)
}

export type SqliteLoadOptions = {
  /** Hex passphrase for SQLCipher. Must be applied before other pragmas. */
  sqlCipherPassphrase?: string
}

function escapeSqlStringLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

async function applySqlCipherKey(raw: Database, passphrase: string): Promise<void> {
  const escaped = escapeSqlStringLiteral(passphrase)
  await raw.execute(`PRAGMA key = '${escaped}'`)
}

export class SQLiteDatabaseAdapter implements DatabaseAdapter {
  readonly dialect = 'sqlite' as const
  private readonly raw: Database
  private readonly sqlCipherPassphrase: string | undefined
  private readonly dbUrl: string | undefined

  constructor(raw: Database, sqlCipherPassphrase?: string, dbUrl?: string) {
    this.raw = raw
    this.sqlCipherPassphrase = sqlCipherPassphrase
    this.dbUrl = dbUrl
  }

  private async ensureSqlCipherKeyOnConnection(): Promise<void> {
    if (this.sqlCipherPassphrase) {
      await applySqlCipherKey(this.raw, this.sqlCipherPassphrase)
    }
  }

  static async load(dbUrl: string, options?: SqliteLoadOptions): Promise<SQLiteDatabaseAdapter> {
    let raw: Database
    if (options?.sqlCipherPassphrase) {
      await invoke('load_sqlite_with_passphrase', {
        db: dbUrl,
        passphrase: options.sqlCipherPassphrase,
      })
      raw = Database.get(dbUrl)
    } else {
      raw = await Database.load(dbUrl)
      await invoke('run_sqlite_migrations', { db: dbUrl })
    }
    const adapter = new SQLiteDatabaseAdapter(raw, options?.sqlCipherPassphrase, dbUrl)
    if (options?.sqlCipherPassphrase) {
      const escaped = escapeSqlStringLiteral(options.sqlCipherPassphrase)
      await raw.execute(
        `PRAGMA key = '${escaped}';
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;`
      )
    } else {
      await raw.execute('PRAGMA foreign_keys = ON')
      await raw.execute(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
      await raw.execute('PRAGMA journal_mode = WAL')
      await raw.execute('PRAGMA synchronous = NORMAL')
    }
    return adapter
  }

  async execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
    const sql = sanitizeSql(query)
    const start = performance.now()
    const upper = query.trim().toUpperCase()
    const isBegin = upper.startsWith('BEGIN')
    const isCommit = upper.startsWith('COMMIT')
    const isRollback = upper.startsWith('ROLLBACK')
    if (isBegin) txnDepth += 1
    const run = () =>
      withRetry(async () => {
        await this.ensureSqlCipherKeyOnConnection()
        return this.raw.execute(query, bindValues)
      }, query, 'execute').then((result) => {
        const durationMs = performance.now() - start
        if (isCommit || isRollback) txnDepth = Math.max(0, txnDepth - 1)
        if (isPerfLoggingEnabled()) {
          recordDbOp({
            kind: 'execute',
            sql,
            durationMs,
            rowsAffected: result.rowsAffected,
          })
        }
        return result
      })
    try {
      if (executeNestingDepth > 0) return await run()
      return await runSerializedExecute(run)
    } catch (e) {
      const durationMs = performance.now() - start
      if (isCommit || isRollback) txnDepth = Math.max(0, txnDepth - 1)
      if (isPerfLoggingEnabled()) {
        recordDbOp({
          kind: 'execute',
          sql,
          durationMs,
          error: getErrorMessage(e),
        })
      }
      throw e
    }
  }

  async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
    const sql = sanitizeSql(query)
    const start = performance.now()
    try {
      const result = await withRetry(async () => {
        await this.ensureSqlCipherKeyOnConnection()
        return this.raw.select<T>(query, bindValues)
      }, query, 'select')
      const durationMs = performance.now() - start
      if (isPerfLoggingEnabled()) {
        recordDbOp({
          kind: 'select',
          sql,
          durationMs,
          rowsReturned: Array.isArray(result) ? result.length : undefined,
        })
      }
      return result
    } catch (e) {
      const durationMs = performance.now() - start
      if (isPerfLoggingEnabled()) {
        recordDbOp({
          kind: 'select',
          sql,
          durationMs,
          error: getErrorMessage(e),
        })
      }
      throw e
    }
  }

  async executeBatch(statements: SqlStatement[]): Promise<void> {
    await executeBatchCompat(this, statements)
  }

  async executeTransaction(statements: SqlStatement[]): Promise<void> {
    if (!this.dbUrl) {
      await this.executeBatch([
        { sql: 'BEGIN', bindValues: [] },
        ...statements,
        { sql: 'COMMIT', bindValues: [] },
      ])
      return
    }
    await invoke('execute_sqlite_transaction', { db: this.dbUrl, statements })
  }

  runInSerializedTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return runInSerializedSqliteTransaction(fn)
  }

  close(dbName?: string): Promise<boolean> {
    return this.raw.close(dbName)
  }
}
