import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

const { getDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn<() => Promise<DatabaseAdapter>>(),
}))

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: getDbMock,
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
  }
})

import { ensureSettingsDefaults } from '@/lib/db/repositories/settings'

function createAdapter(dialect: 'sqlite' | 'postgres'): DatabaseAdapter {
  return {
    dialect,
    execute: vi.fn(async () => ({ rowsAffected: 1, lastInsertId: 0 })),
    select: vi.fn(async () => []),
    executeBatch: vi.fn(async () => undefined),
    runInSerializedTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()) as DatabaseAdapter['runInSerializedTransaction'],
  }
}

describe('ensureSettingsDefaults dialect compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses INSERT OR IGNORE for sqlite adapters', async () => {
    const adapter = createAdapter('sqlite')
    getDbMock.mockResolvedValue(adapter)
    await ensureSettingsDefaults()
    expect(adapter.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO settings'),
      expect.any(Array)
    )
  })

  it('uses ON CONFLICT DO NOTHING for postgres adapters', async () => {
    const adapter = createAdapter('postgres')
    getDbMock.mockResolvedValue(adapter)
    await ensureSettingsDefaults()
    expect(adapter.execute).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (key) DO NOTHING'),
      expect.any(Array)
    )
  })
})
