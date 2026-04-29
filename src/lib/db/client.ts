/**
 * SQLite client via Tauri plugin. DB path is relative to AppConfig (app data dir).
 * Migrations run automatically when load() is called (registered in Rust).
 *
 * Locking: What caused "database is locked" was concurrent writes (e.g. UI + outbox + cascade
 * verification) and no busy_timeout/retry. We now: (1) set WAL + busy_timeout (8s) + foreign_keys
 * on init; (2) serialize **every** wrapped `execute()` through a re-entrant global tail queue so the
 * Tauri SQL pool never runs two `execute()` calls at once (nested RST used to bypass the old queue).
 * (3) retry execute/select on SQLITE_BUSY up to 3 times with exponential backoff; (4) log errors
 * and retries in db/perf. Verify: open DB Perf HUD (dev), use the app, click "Log to console"
 * and check for lock errors; cascade verification disables its button while running and reports BUSY.
 * **Nested runInSerializedTransaction:** Same serializer as `execute` — nested calls run inline
 * (re-entrant) so we never deadlock waiting on ourselves.
 * See docs/DATABASE_LAYER.md for how to write transaction-safe code and avoid open transactions.
 *
 * Foreign key enforcement: we run PRAGMA foreign_keys = ON on every connection.
 * In DEV, all execute/select are timed and logged to db/perf (including errors and retries).
 */
import type { DatabaseAdapter, SqlStatement } from './databaseAdapter'
import {
  executeBatchCompat,
  runInSerializedSqliteTransaction,
  SQLiteDatabaseAdapter,
} from './sqliteDatabaseAdapter'

const DB_URL = 'sqlite:albatross.db'

let db: SQLiteDatabaseAdapter | null = null
let fkChecked = false
let testDbOverride: DatabaseAdapter | null = null

/**
 * Test-only adapter override so integration tests can run repositories against non-SQLite adapters.
 * Do not use in app runtime.
 */
export function setDbAdapterForTests(adapter: DatabaseAdapter | null): void {
  testDbOverride = adapter
}

export function runInSerializedTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (testDbOverride) {
    return testDbOverride.runInSerializedTransaction(fn)
  }
  return runInSerializedSqliteTransaction(fn)
}

export async function getDb(): Promise<DatabaseAdapter> {
  if (testDbOverride) return testDbOverride
  if (db) return db
  db = await SQLiteDatabaseAdapter.load(DB_URL)
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
  db: Pick<DatabaseAdapter, 'execute' | 'executeBatch'>,
  statements: SqlStatement[]
): Promise<void> {
  if (typeof db.executeBatch === 'function') {
    await db.executeBatch(statements)
    return
  }
  await executeBatchCompat(db, statements)
}
