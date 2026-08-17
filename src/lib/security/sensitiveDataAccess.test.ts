import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
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
  }
})

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  dbAdapter = createSqlJsTauriAdapter(db)
  return db
}

import { listClients } from '@/lib/db/repositories/clients'
import {
  canFetchSensitiveClientData,
  EncryptionKeyUnavailableError,
  requireSensitiveDataAccess,
} from '@/lib/security/sensitiveDataAccess'
import {
  clearDataEncryptionKey,
  setTestDataEncryptionKeyForTests,
} from '@/lib/security/dataEncryptionContext'

describe('sensitiveDataAccess', () => {
  beforeEach(async () => {
    await makeDb()
    await dbAdapter.execute(
      `INSERT INTO users (id, username, password_hash, role) VALUES ('user-1', 'admin', 'test-hash', 'admin')`,
      []
    )
    clearDataEncryptionKey()
    setTestDataEncryptionKeyForTests(null)
  })

  it('canFetchSensitiveClientData respects auth flags', () => {
    expect(canFetchSensitiveClientData(false, false)).toBe(true)
    expect(canFetchSensitiveClientData(true, false)).toBe(false)
    expect(canFetchSensitiveClientData(true, true)).toBe(true)
  })

  it('requireSensitiveDataAccess throws when a UAM1 account exists and no DEK is loaded', async () => {
    await expect(requireSensitiveDataAccess()).rejects.toBeInstanceOf(EncryptionKeyUnavailableError)
  })

  it('listClients fails closed without DEK when a user account exists', async () => {
    await expect(listClients()).rejects.toBeInstanceOf(EncryptionKeyUnavailableError)
  })
})
