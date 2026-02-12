/**
 * SQLite client via Tauri plugin. DB path is relative to AppConfig (app data dir).
 * Migrations run automatically when load() is called (registered in Rust).
 *
 * Foreign key enforcement: we run PRAGMA foreign_keys = ON on every connection so that
 * FK constraints and ON DELETE CASCADE/SET NULL are enforced. SQLite does not persist
 * this; it must be set per connection (see migration 0004_fk_cascade_refactor.sql).
 */
import Database from '@tauri-apps/plugin-sql'

const DB_URL = 'sqlite:albatross.db'
let db: Database | null = null
let fkChecked = false

export async function getDb(): Promise<Database> {
  if (db) return db
  db = await Database.load(DB_URL)
  await db.execute('PRAGMA foreign_keys = ON')
  await db.execute('PRAGMA busy_timeout = 10000')
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
