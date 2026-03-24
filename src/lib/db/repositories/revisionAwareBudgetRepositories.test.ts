import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(),
  now: () => '2026-01-01T00:00:00.000Z',
  uuid: () => 'id-1',
  runInSerializedTransaction: (fn: () => Promise<unknown>) => fn(),
  executeBatch: vi.fn(),
}))

vi.mock('@/lib/db/repositories/budgetRevisions', () => ({
  resolveBudgetRevisionId: vi.fn(async ({ revisionId }: { revisionId?: string | null }) => revisionId ?? 'live-revision'),
}))

import { getDb } from '@/lib/db/client'
import { listBudgetItemsByProduction } from '@/lib/db/repositories/budget'
import { listBudgetItemExpenseLinksByProduction } from '@/lib/db/repositories/budgetReconciliation'
import { listFloatsByProduction } from '@/lib/db/repositories/floats'
import { listFloatExpenseLinksByExpense } from '@/lib/db/repositories/floatReconciliation'

describe('revision-aware budget repositories', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  it('filters budget items by resolved revision id', async () => {
    const select = vi.fn().mockResolvedValue([])
    vi.mocked(getDb).mockResolvedValue({ select, execute: vi.fn() } as never)

    await listBudgetItemsByProduction('prod-1')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('budget_revision_id = $2'), [
      'prod-1',
      'live-revision',
    ])
  })

  it('filters budget links by explicit revision id', async () => {
    const select = vi.fn().mockResolvedValue([])
    vi.mocked(getDb).mockResolvedValue({ select, execute: vi.fn() } as never)

    await listBudgetItemExpenseLinksByProduction('prod-1', 'rev-2')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('budget_revision_id = $2'), [
      'prod-1',
      'rev-2',
    ])
  })

  it('filters floats by resolved live revision id when omitted', async () => {
    const select = vi.fn().mockResolvedValue([])
    vi.mocked(getDb).mockResolvedValue({ select, execute: vi.fn() } as never)

    await listFloatsByProduction('prod-1')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('budget_revision_id = $2'), [
      'prod-1',
      'live-revision',
    ])
  })

  it('filters float links by explicit revision id in explicit contexts', async () => {
    const select = vi.fn().mockResolvedValue([])
    vi.mocked(getDb).mockResolvedValue({ select, execute: vi.fn() } as never)

    await listFloatExpenseLinksByExpense('expense-1', 'rev-2')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('budget_revision_id = $2'), [
      'expense-1',
      'rev-2',
    ])
  })
})
