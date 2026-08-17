import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

const mocks = vi.hoisted(() => ({
  backfillClientEncryptionIfNeeded: vi.fn(async () => 0),
  backfillSensitiveEntityEncryptionIfNeeded: vi.fn(async () => 0),
  backfillPeopleIsCastIntegerIfNeeded: vi.fn(async () => 0),
  ensureDekEscrowOnLogin: vi.fn(async () => undefined),
  establishDataEncryptionKey: vi.fn(async () => undefined),
  getDb: vi.fn<() => Promise<DatabaseAdapter>>(),
  login: vi.fn(),
  migrateToInstanceKeyModeIfNeeded: vi.fn(async () => false),
  unlockLocalDatabaseWithPassword: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db/client', () => ({ getDb: mocks.getDb }))
vi.mock('@/lib/db/dbUnlock', () => ({
  unlockLocalDatabaseWithPassword: mocks.unlockLocalDatabaseWithPassword,
}))
vi.mock('@/lib/auth/authService', () => ({ login: mocks.login }))
vi.mock('@/lib/db/migrations/backfillClientEncryption', () => ({
  backfillClientEncryptionIfNeeded: mocks.backfillClientEncryptionIfNeeded,
}))
vi.mock('@/lib/db/migrations/backfillSensitiveEntityEncryption', () => ({
  backfillSensitiveEntityEncryptionIfNeeded: mocks.backfillSensitiveEntityEncryptionIfNeeded,
}))
vi.mock('@/lib/db/migrations/backfillPeopleIsCastInteger', () => ({
  backfillPeopleIsCastIntegerIfNeeded: mocks.backfillPeopleIsCastIntegerIfNeeded,
}))
vi.mock('@/lib/security/dekEscrowMigration', () => ({
  ensureDekEscrowOnLogin: mocks.ensureDekEscrowOnLogin,
}))
vi.mock('@/lib/security/dataEncryptionContext', () => ({
  establishDataEncryptionKey: mocks.establishDataEncryptionKey,
}))
vi.mock('@/lib/security/instanceKeyMigration', () => ({
  migrateToInstanceKeyModeIfNeeded: mocks.migrateToInstanceKeyModeIfNeeded,
}))

import {
  completeLoginAfterDatabaseUnlock,
  performFullLoginSequence,
} from './loginOrchestration'

const credentials = { username: 'alice', password: 'correct horse battery staple' }
const authResult = {
  user: { id: 'user-1', username: 'alice', role: 'admin' as const },
  session: {
    id: 'session-1',
    user_id: 'user-1',
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-02-01T00:00:00.000Z',
    revoked_at: null,
  },
  sessionToken: 'session-token',
}

function testDb(): DatabaseAdapter {
  return { dialect: 'sqlite' } as DatabaseAdapter
}

describe('loginOrchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.login.mockResolvedValue(authResult)
    mocks.migrateToInstanceKeyModeIfNeeded.mockResolvedValue(false)
    mocks.backfillPeopleIsCastIntegerIfNeeded.mockResolvedValue(0)
  })

  it('does not establish PII access or run migrations when authentication fails', async () => {
    const db = testDb()
    mocks.login.mockRejectedValue(new Error('Invalid credentials'))

    await expect(completeLoginAfterDatabaseUnlock(db, credentials)).rejects.toThrow(
      'Invalid credentials'
    )

    expect(mocks.migrateToInstanceKeyModeIfNeeded).not.toHaveBeenCalled()
    expect(mocks.establishDataEncryptionKey).not.toHaveBeenCalled()
    expect(mocks.ensureDekEscrowOnLogin).not.toHaveBeenCalled()
    expect(mocks.backfillClientEncryptionIfNeeded).not.toHaveBeenCalled()
  })

  it('establishes encryption and repairs data on the existing database when no migration occurs', async () => {
    const db = testDb()
    mocks.backfillPeopleIsCastIntegerIfNeeded.mockResolvedValue(3)

    const result = await completeLoginAfterDatabaseUnlock(db, credentials)

    expect(mocks.login).toHaveBeenCalledWith(db, credentials)
    expect(mocks.migrateToInstanceKeyModeIfNeeded).toHaveBeenCalledWith(
      db,
      { userId: 'user-1', username: 'alice' },
      credentials.password
    )
    expect(mocks.getDb).not.toHaveBeenCalled()
    expect(mocks.establishDataEncryptionKey).toHaveBeenCalledWith(
      db,
      'user-1',
      credentials.password
    )
    expect(mocks.ensureDekEscrowOnLogin).toHaveBeenCalledWith(
      db,
      'user-1',
      'alice',
      credentials.password
    )
    expect(mocks.backfillClientEncryptionIfNeeded).toHaveBeenCalledWith(db)
    expect(mocks.backfillPeopleIsCastIntegerIfNeeded).toHaveBeenCalledWith(db)
    expect(result).toEqual({ ...authResult, repairedPeople: 3 })
  })

  it('switches all post-migration PII work to the reopened database handle', async () => {
    const originalDb = testDb()
    const reopenedDb = testDb()
    mocks.migrateToInstanceKeyModeIfNeeded.mockResolvedValue(true)
    mocks.getDb.mockResolvedValue(reopenedDb)

    await completeLoginAfterDatabaseUnlock(originalDb, credentials)

    expect(mocks.getDb).toHaveBeenCalledOnce()
    expect(mocks.establishDataEncryptionKey).toHaveBeenCalledWith(
      reopenedDb,
      'user-1',
      credentials.password
    )
    expect(mocks.ensureDekEscrowOnLogin).toHaveBeenCalledWith(
      reopenedDb,
      'user-1',
      'alice',
      credentials.password
    )
    expect(mocks.backfillClientEncryptionIfNeeded).toHaveBeenCalledWith(reopenedDb)
    expect(mocks.backfillPeopleIsCastIntegerIfNeeded).toHaveBeenCalledWith(reopenedDb)
  })

  it('unlocks the database before obtaining a handle for the full login sequence', async () => {
    const db = testDb()
    const calls: string[] = []
    mocks.unlockLocalDatabaseWithPassword.mockImplementation(async () => {
      calls.push('unlock')
    })
    mocks.getDb.mockImplementation(async () => {
      calls.push('getDb')
      return db
    })
    mocks.login.mockImplementation(async () => {
      calls.push('login')
      return authResult
    })

    await performFullLoginSequence(credentials)

    expect(calls.slice(0, 3)).toEqual(['unlock', 'getDb', 'login'])
    expect(mocks.unlockLocalDatabaseWithPassword).toHaveBeenCalledWith(credentials)
  })
})
