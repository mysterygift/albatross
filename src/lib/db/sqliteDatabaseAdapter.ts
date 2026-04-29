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

export class SQLiteDatabaseAdapter implements DatabaseAdapter {
  readonly dialect = 'sqlite' as const
  private readonly raw: Database

  constructor(raw: Database) {
    this.raw = raw
  }

  static async load(dbUrl: string): Promise<SQLiteDatabaseAdapter> {
    const raw = await Database.load(dbUrl)
    await raw.execute('PRAGMA foreign_keys = ON')
    await raw.execute(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
    await raw.execute('PRAGMA journal_mode = WAL')
    await raw.execute('PRAGMA synchronous = NORMAL')
    return new SQLiteDatabaseAdapter(raw)
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
      withRetry(() => this.raw.execute(query, bindValues), query, 'execute').then((result) => {
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
      const result = await withRetry(() => this.raw.select<T>(query, bindValues), query, 'select')
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

  runInSerializedTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return runInSerializedSqliteTransaction(fn)
  }

  close(dbName?: string): Promise<boolean> {
    return this.raw.close(dbName)
  }
}
