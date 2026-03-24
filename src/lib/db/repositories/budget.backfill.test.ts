import { describe, expect, it, vi, beforeEach } from 'vitest'

const selectMock = vi.fn()
const executeMock = vi.fn()

vi.mock('../client', () => ({
  getDb: vi.fn(async () => ({
    select: selectMock,
    execute: executeMock,
  })),
  runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
  executeBatch: vi.fn(),
  now: () => '2026-01-01T00:00:00.000Z',
  uuid: () => '00000000-0000-4000-8000-000000000001',
}))

vi.mock('../outbox', () => ({
  outboxPush: vi.fn(),
}))

const ensureLegacyFallbackAccounts = vi.fn()

vi.mock('./budgetAccounts', () => ({
  ensureLegacyFallbackAccounts: (...args: unknown[]) => ensureLegacyFallbackAccounts(...args),
  getAccountById: vi.fn(),
}))

import { backfillAccountIdsFromLegacyCategories } from './budget'

describe('backfillAccountIdsFromLegacyCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectMock.mockReset()
    executeMock.mockReset()
  })

  it('does not call ensureLegacyFallbackAccounts when there are no legacy category codes', async () => {
    selectMock.mockResolvedValueOnce([])
    await backfillAccountIdsFromLegacyCategories('prod-1')
    expect(ensureLegacyFallbackAccounts).not.toHaveBeenCalled()
  })
})
