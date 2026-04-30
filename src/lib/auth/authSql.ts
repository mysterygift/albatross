import type { SqlDialect } from '@/lib/db/databaseAdapter'

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
