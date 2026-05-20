import type { DatabaseAdapter, SqlDialect } from '@/lib/db/databaseAdapter'

export async function sqlUsersTableExists(db: DatabaseAdapter): Promise<boolean> {
  try {
    if (db.dialect === 'sqlite') {
      const rows = await db.select<Array<{ name: string }>>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1`,
        []
      )
      return rows.length > 0
    }
    const rows = await db.select<Array<{ exists: string | null }>>(
      `SELECT to_regclass(current_schema() || '.users') AS exists`,
      []
    )
    return rows[0]?.exists != null
  } catch {
    return false
  }
}

/** COUNT(*) cast differs between Postgres and SQLite. */
export function sqlTotalUsersCount(dialect: SqlDialect | undefined): string {
  return dialect === 'postgres'
    ? 'SELECT COUNT(*)::int AS count FROM users'
    : 'SELECT COUNT(*) AS count FROM users'
}

export function sqlAdminUsersCount(dialect: SqlDialect | undefined): string {
  return dialect === 'postgres'
    ? `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'`
    : `SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`
}

export function sqlActiveAdminUsersCount(dialect: SqlDialect | undefined): string {
  return dialect === 'postgres'
    ? `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND disabled_at IS NULL`
    : `SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND disabled_at IS NULL`
}
