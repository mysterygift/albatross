/**
 * SQLite client via Tauri plugin. DB path is relative to AppConfig (app data dir).
 * Migrations run automatically when load() is called (registered in Rust).
 *
 * SQLCipher: when `albatross.db.meta.json` exists, the DB is opened only via
 * `openDbWithFileKey` after sign-in. Plain legacy DBs open without a key until migrated.
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
import { isLocalDbEncryptionEnabled } from '@/lib/security/dbFileEncryption'
import {
  executeBatchCompat,
  runInSerializedSqliteTransaction,
  SQLiteDatabaseAdapter,
} from './sqliteDatabaseAdapter'

const DB_URL = 'sqlite:albatross.db'

let db: SQLiteDatabaseAdapter | null = null
let fkChecked = false
let testDbOverride: DatabaseAdapter | null = null
let dbUnlocked = false
let activeSqlCipherPassphrase: string | null = null

export class DatabaseLockedError extends Error {
  constructor(message = 'Local database is locked. Sign in to unlock.') {
    super(message)
    this.name = 'DatabaseLockedError'
  }
}

/**
 * Test-only adapter override so integration tests can run repositories against non-SQLite adapters.
 * Do not use in app runtime.
 */
export function setDbAdapterForTests(adapter: DatabaseAdapter | null): void {
  testDbOverride = adapter
  if (adapter) dbUnlocked = true
}

export function isDbUnlocked(): boolean {
  return testDbOverride != null || dbUnlocked
}

export function runInSerializedTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (testDbOverride) {
    return testDbOverride.runInSerializedTransaction(fn)
  }
  return runInSerializedSqliteTransaction(fn)
}

export async function openDbWithFileKey(passphrase: string): Promise<DatabaseAdapter> {
  if (testDbOverride) return testDbOverride
  if (db) {
    await db.close()
    db = null
  }
  db = await SQLiteDatabaseAdapter.load(DB_URL, { sqlCipherPassphrase: passphrase })
  dbUnlocked = true
  activeSqlCipherPassphrase = passphrase
  fkChecked = false
  return db
}

/** Open a legacy plain SQLite file (no SQLCipher meta). Used before migration and for admin-count probes. */
export async function openPlainDbIfExists(): Promise<DatabaseAdapter> {
  if (testDbOverride) return testDbOverride
  if (db) return db
  if (await isLocalDbEncryptionEnabled()) {
    throw new DatabaseLockedError()
  }
  db = await SQLiteDatabaseAdapter.load(DB_URL)
  dbUnlocked = true
  activeSqlCipherPassphrase = null
  fkChecked = false
  return db
}

export async function getDb(): Promise<DatabaseAdapter> {
  if (testDbOverride) return testDbOverride
  if (db) return db
  if (await isLocalDbEncryptionEnabled()) {
    throw new DatabaseLockedError()
  }
  return openPlainDbIfExists()
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.close()
    db = null
  }
  dbUnlocked = false
  activeSqlCipherPassphrase = null
  fkChecked = false
}

export function clearDbFileKey(): void {
  activeSqlCipherPassphrase = null
}

export async function ensureForeignKeysChecked(adapter: DatabaseAdapter): Promise<void> {
  if (import.meta.env.DEV && !fkChecked) {
    try {
      const rows = await adapter.select<Record<string, unknown>[]>('PRAGMA foreign_keys')
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
