import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
    executeBatch: vi.fn(
      async (
        db: { execute: (sql: string, bindValues?: unknown[]) => Promise<void> },
        statements: Array<{ sql: string; bindValues: unknown[] }>
      ) => {
        for (const s of statements) await db.execute(s.sql, s.bindValues)
      }
    ),
  }
})


vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
}))

import { hashSessionToken } from '@/lib/auth/sessionToken'
import { duplicateProduction } from '@/lib/db/duplicateProduction'
import { createProduction } from '@/lib/db/repositories/production'
import { setSetting } from '@/lib/db/repositories/settings'

async function makeDb(): Promise<void> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
  dbAdapter = createSqlJsTauriAdapter(db)
}

async function signIn(userId: string, role: 'user' | 'admin'): Promise<void> {
  const token = `token-${userId}`
  await dbAdapter.execute(
    `INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, 'x', $3)`,
    [userId, userId, role]
  )
  await dbAdapter.execute(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, '2999-01-01 00:00:00')`,
    [`session-${userId}`, userId, await hashSessionToken(token)]
  )
  await setSetting('auth_session_token', token)
}

const memberships = (productionId: string) =>
  dbAdapter.select<Record<string, unknown>[]>(
    `SELECT user_id, access_level, revoked_at FROM project_memberships WHERE production_id = $1`,
    [productionId]
  )

describe('createProduction membership', () => {
  beforeEach(makeDb)

  it('makes the signed-in user an administrator of a new production', async () => {
    await signIn('user-1', 'user')
    const blank = await createProduction({ name: 'Blank', notes: null })
    const episodic = await createProduction({ name: 'Series', notes: null }, { episodicInitialEpisodeName: 'Ep 1' })
    expect(await memberships(blank.id)).toEqual([{ user_id: 'user-1', access_level: 'administrator', revoked_at: null }])
    expect(await memberships(episodic.id)).toEqual([{ user_id: 'user-1', access_level: 'administrator', revoked_at: null }])
  })

  it('an explicit creatorUserId wins over the signed-in user', async () => {
    await signIn('user-1', 'user')
    await dbAdapter.execute(`INSERT INTO users (id, username, password_hash, role) VALUES ('user-2', 'user-2', 'x', 'user')`, [])
    const p = await createProduction({ name: 'Owned', notes: null }, { creatorUserId: 'user-2' })
    expect(await memberships(p.id)).toEqual([{ user_id: 'user-2', access_level: 'administrator', revoked_at: null }])
  })

  it('adds no membership when nobody is signed in', async () => {
    const p = await createProduction({ name: 'Anon', notes: null })
    expect(await memberships(p.id)).toEqual([])
  })

  it('makes the signed-in user an administrator of a duplicate, without copying other memberships', async () => {
    await signIn('user-1', 'user')
    await dbAdapter.execute(`INSERT INTO users (id, username, password_hash, role) VALUES ('user-2', 'user-2', 'x', 'user')`, [])
    const source = await createProduction({ name: 'Source', notes: null }, { creatorUserId: 'user-2' })
    const copy = await duplicateProduction(source.id, 'Copy')
    expect(await memberships(copy.id)).toEqual([{ user_id: 'user-1', access_level: 'administrator', revoked_at: null }])
  })
})
