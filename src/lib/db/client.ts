/**
 * SQLite client via Tauri plugin. DB path is relative to AppConfig (app data dir).
 * Migrations run automatically when load() is called (registered in Rust).
 *
 * Locking: What caused "database is locked" was concurrent writes (e.g. UI + outbox + cascade
 * verification) and no busy_timeout/retry. We now: (1) set WAL + busy_timeout (8s) + foreign_keys
 * on init; (2) serialize writes with a single promise queue so only one write runs at a time;
 * (3) retry execute/select on SQLITE_BUSY up to 3 times with exponential backoff; (4) log errors
 * and retries in db/perf. Verify: open DB Perf HUD (dev), use the app, click "Log to console"
 * and check for lock errors; cascade verification disables its button while running and reports BUSY.
 *
 * Foreign key enforcement: we run PRAGMA foreign_keys = ON on every connection.
 * In DEV, all execute/select are timed and logged to db/perf (including errors and retries).
 */
import Database from '@tauri-apps/plugin-sql'
import type { QueryResult } from '@tauri-apps/plugin-sql'
import { recordDbOp, recordRetryAttempt, isLockError } from './perf'

const DB_URL = 'sqlite:albatross.db'
const BUSY_TIMEOUT_MS = 8000
const RETRY_DELAYS_MS = [50, 150, 350]
const MAX_RETRIES = 3

let db: Database | null = null
let fkChecked = false

/** Write queue: only one write (execute INSERT/UPDATE/DELETE/REPLACE) at a time. */
let writeQueue = Promise.resolve<void>(undefined)

/**
 * True while a runInSerializedTransaction callback is running. When set, execute() does not
 * enqueue writes (runs them immediately) so we avoid deadlock: the callback would otherwise
 * wait for its own UPDATE to be dequeued while holding the queue slot.
 */
let inSerializedTransaction = false

/** Debug: track logical transaction depth to see if something commits between BEGIN and COMMIT. */
let txnDepth = 0

/**
 * Run a full transaction (BEGIN ... COMMIT/ROLLBACK) as a single queued task. Use this for any
 * code that does BEGIN so we never start a second transaction on the same connection
 * ("cannot start a transaction within a transaction"). Only one such block runs at a time.
 * Writes inside the callback run immediately (no double-queue) to avoid deadlock.
 */
export function runInSerializedTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return enqueueWrite(async () => {
    inSerializedTransaction = true
    try {
      return await fn()
    } finally {
      inSerializedTransaction = false
    }
  })
}

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(
    () => fn(),
    () => fn()
  )
  writeQueue = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

function sanitizeSql(sql: string, maxLen: number = 120): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

function isWriteSql(sql: string): boolean {
  const t = sql.trim().toUpperCase()
  return (
    t.startsWith('INSERT') ||
    t.startsWith('UPDATE') ||
    t.startsWith('DELETE') ||
    t.startsWith('REPLACE')
  )
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Run fn with retry on SQLITE_BUSY / database is locked. */
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

/** Wrap raw Database with timing, error capture, write queue, and retry. */
function wrapWithPerf(raw: Database): Database {
  return {
    ...raw,
    path: raw.path,
    async execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
      const sql = sanitizeSql(query)
      const start = performance.now()
      const upper = query.trim().toUpperCase()
      const isBegin = upper.startsWith('BEGIN')
      const isCommit = upper.startsWith('COMMIT')
      const isRollback = upper.startsWith('ROLLBACK')
      // #region agent log
      if (import.meta.env.DEV && isBegin) {
        txnDepth += 1
        fetch('http://127.0.0.1:7243/ingest/76cef4f5-a1f0-453f-b82a-14d185be1b61', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'client.ts:execute',
            message: 'BEGIN sent',
            data: { inSerializedTransaction, txnDepthAfter: txnDepth },
            timestamp: Date.now(),
            hypothesisId: 'H1',
          }),
        }).catch(() => {})
      }
      if (import.meta.env.DEV && isCommit) {
        const payload = { inSerializedTransaction, txnDepth }
        console.warn('[DB txn] COMMIT about to run', payload)
        fetch('http://127.0.0.1:7243/ingest/76cef4f5-a1f0-453f-b82a-14d185be1b61', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'client.ts:execute',
            message: 'COMMIT about to run',
            data: payload,
            timestamp: Date.now(),
            hypothesisId: 'H2',
          }),
        }).catch(() => {})
      }
      // #endregion
      const run = () =>
        withRetry(() => raw.execute(query, bindValues), query, 'execute').then((result) => {
          const durationMs = performance.now() - start
          if (import.meta.env.DEV) {
            if (isCommit || isRollback) txnDepth = Math.max(0, txnDepth - 1)
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
        // Inside a serialized transaction, run writes immediately to avoid deadlock (callback waiting for its own write).
        if (isWriteSql(query) && !inSerializedTransaction) return await enqueueWrite(run)
        return await run()
      } catch (e) {
        const durationMs = performance.now() - start
        // #region agent log
        if (import.meta.env.DEV && (isCommit || isRollback)) {
          const payload = { txnDepth, error: getErrorMessage(e), inSerializedTransaction }
          console.warn('[DB txn]', isCommit ? 'COMMIT failed' : 'ROLLBACK failed', payload)
          fetch('http://127.0.0.1:7243/ingest/76cef4f5-a1f0-453f-b82a-14d185be1b61', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'client.ts:execute',
              message: isCommit ? 'COMMIT failed' : 'ROLLBACK failed',
              data: payload,
              timestamp: Date.now(),
              hypothesisId: 'H1',
            }),
          }).catch(() => {})
          if (isCommit || isRollback) txnDepth = Math.max(0, txnDepth - 1)
        }
        // #endregion
        if (import.meta.env.DEV) {
          recordDbOp({
            kind: 'execute',
            sql,
            durationMs,
            error: getErrorMessage(e),
          })
        }
        throw e
      }
    },
    async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
      const sql = sanitizeSql(query)
      const start = performance.now()
      try {
        const result = await withRetry(() => raw.select<T>(query, bindValues), query, 'select')
        const durationMs = performance.now() - start
        if (import.meta.env.DEV) {
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
        if (import.meta.env.DEV) {
          recordDbOp({
            kind: 'select',
            sql,
            durationMs,
            error: getErrorMessage(e),
          })
        }
        throw e
      }
    },
    close(dbName?: string) {
      return raw.close(dbName)
    },
  } as Database
}

export async function getDb(): Promise<Database> {
  if (db) return db
  const raw = await Database.load(DB_URL)
  await raw.execute('PRAGMA foreign_keys = ON')
  await raw.execute(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
  await raw.execute('PRAGMA journal_mode = WAL')
  await raw.execute('PRAGMA synchronous = NORMAL')
  db = wrapWithPerf(raw)
  if (import.meta.env.DEV && !fkChecked) {
    try {
      const rows = await db.select<Record<string, unknown>[]>('PRAGMA foreign_keys')
      const first = rows?.[0]
      const value = first && (Object.values(first)[0] as number)
      if (value !== 1) {
        console.warn('[Albatross] PRAGMA foreign_keys is not enabled; FK and cascades may not apply.')
      }
    } catch {
      // ignore
    }
    fkChecked = true
  }
  return db
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.close()
    db = null
  }
}

export function now(): string {
  return new Date().toISOString()
}

export function uuid(): string {
  return crypto.randomUUID()
}

/**
 * Run multiple statements in a single execute() so they run on the same connection.
 * The Tauri plugin uses a connection pool; separate execute() calls can run on different
 * connections, so BEGIN/COMMIT across calls fail with "no transaction is active".
 * Use this for transaction blocks: pass [{ sql: 'BEGIN', bindValues: [] }, ...writes..., { sql: 'COMMIT', bindValues: [] }].
 * Placeholders ($1, $2, ...) are renumbered so the combined bind array matches.
 */
export async function executeBatch(
  db: Database,
  statements: Array<{ sql: string; bindValues: unknown[] }>
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
