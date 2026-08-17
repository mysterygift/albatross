import { describe, expect, it, vi } from 'vitest'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

import {
  sqlActiveAdminUsersCount,
  sqlAdminUsersCount,
  sqlTotalUsersCount,
  sqlUsersTableExists,
} from './authSql'

function dbWithSelect(
  dialect: 'sqlite' | 'postgres',
  select: ReturnType<typeof vi.fn>
): DatabaseAdapter {
  return { dialect, select: select as DatabaseAdapter['select'] } as DatabaseAdapter
}

describe('authSql', () => {
  it('checks sqlite_master for the exact users table', async () => {
    const select = vi.fn(async () => [{ name: 'users' }])

    await expect(sqlUsersTableExists(dbWithSelect('sqlite', select))).resolves.toBe(true)
    expect(select).toHaveBeenCalledWith(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1",
      []
    )
  })

  it('checks only the current Postgres schema for the users table', async () => {
    const select = vi.fn(async () => [{ exists: 'private.users' }])

    await expect(sqlUsersTableExists(dbWithSelect('postgres', select))).resolves.toBe(true)
    expect(select).toHaveBeenCalledWith(
      "SELECT to_regclass(current_schema() || '.users') AS exists",
      []
    )
  })

  it.each([
    ['sqlite', []],
    ['postgres', [{ exists: null }]],
  ] as const)('returns false when %s has no users table', async (dialect, rows) => {
    const db = dbWithSelect(dialect, vi.fn(async () => rows))
    await expect(sqlUsersTableExists(db)).resolves.toBe(false)
  })

  it('fails closed when the schema probe errors', async () => {
    const db = dbWithSelect(
      'postgres',
      vi.fn(async () => {
        throw new Error('schema unavailable')
      })
    )

    await expect(sqlUsersTableExists(db)).resolves.toBe(false)
  })

  it('uses integer count casts only for Postgres', () => {
    expect(sqlTotalUsersCount('postgres')).toContain('COUNT(*)::int')
    expect(sqlAdminUsersCount('postgres')).toContain('COUNT(*)::int')
    expect(sqlActiveAdminUsersCount('postgres')).toContain('COUNT(*)::int')

    expect(sqlTotalUsersCount('sqlite')).toBe('SELECT COUNT(*) AS count FROM users')
    expect(sqlAdminUsersCount(undefined)).toBe(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'"
    )
    expect(sqlActiveAdminUsersCount('sqlite')).toBe(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND disabled_at IS NULL"
    )
  })
})
