import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(),
  now: () => '2026-01-01T00:00:00.000Z',
  uuid: () => 'new-revision-id',
  runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
  executeBatch: vi.fn(async (db: { execute: (sql: string, bindValues?: unknown[]) => Promise<void> }, statements: Array<{ sql: string; bindValues: unknown[] }>) => {
    for (const s of statements) {
      await db.execute(s.sql, s.bindValues)
    }
  }),
}))

import { getDb } from '@/lib/db/client'
import {
  getBudgetRevisionByIdForProduction,
  getLiveBudgetRevisionForProduction,
  listBudgetRevisionsByProduction,
  getOrCreateLiveBudgetRevisionIdForProduction,
  resolveSelectedBudgetRevision,
  resolveBudgetRevisionId,
  setLiveBudgetRevisionForProduction,
} from '@/lib/db/repositories/budgetRevisions'

describe('budgetRevisions repository', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  it('returns the live revision for a production', async () => {
    const mockDb = {
      select: vi.fn().mockResolvedValue([
        {
          id: 'r1',
          production_id: 'p1',
          name: 'Current budget',
          created_from_revision_id: null,
          is_live: 1,
          created_at: 't',
          updated_at: 't',
          deleted_at: null,
        },
      ]),
      execute: vi.fn(),
    }
    vi.mocked(getDb).mockResolvedValue(mockDb as never)

    const live = await getLiveBudgetRevisionForProduction('p1')
    expect(live?.id).toBe('r1')
    expect(live?.is_live).toBe(true)
  })

  it('creates Current budget live revision when missing', async () => {
    const mockDb = {
      select: vi.fn().mockResolvedValue([]),
      execute: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(getDb).mockResolvedValue(mockDb as never)

    const id = await getOrCreateLiveBudgetRevisionIdForProduction('p2')
    expect(id).toBe('new-revision-id')
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO budget_revisions'),
      ['new-revision-id', 'p2', 'Current budget', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
    )
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE budget_items'),
      ['p2', 'new-revision-id']
    )
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE contingency_rules'),
      ['p2', 'new-revision-id']
    )
  })

  it('returns explicit revision id without lookup', async () => {
    const id = await resolveBudgetRevisionId({ productionId: 'p2', revisionId: 'rev-explicit' })
    expect(id).toBe('rev-explicit')
  })

  it('lists revisions for a production', async () => {
    const mockDb = {
      select: vi.fn().mockResolvedValue([
        {
          id: 'r-live',
          production_id: 'p1',
          name: 'Current budget',
          created_from_revision_id: null,
          is_live: 1,
          created_at: 't',
          updated_at: 't',
          deleted_at: null,
        },
        {
          id: 'r-draft',
          production_id: 'p1',
          name: 'Scenario',
          created_from_revision_id: 'r-live',
          is_live: 0,
          created_at: 't',
          updated_at: 't',
          deleted_at: null,
        },
      ]),
      execute: vi.fn(),
    }
    vi.mocked(getDb).mockResolvedValue(mockDb as never)

    const revisions = await listBudgetRevisionsByProduction('p1')
    expect(revisions.map((r) => r.id)).toEqual(['r-live', 'r-draft'])
  })

  it('auto-creates Current budget revision while listing when legacy budget data exists', async () => {
    const mockDb = {
      select: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ exists_flag: 1 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'new-revision-id',
            production_id: 'p1',
            name: 'Current budget',
            created_from_revision_id: null,
            is_live: 1,
            created_at: 't',
            updated_at: 't',
            deleted_at: null,
          },
        ]),
      execute: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(getDb).mockResolvedValue(mockDb as never)

    const revisions = await listBudgetRevisionsByProduction('p1')
    expect(revisions.map((r) => r.name)).toEqual(['Current budget'])
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO budget_revisions'),
      ['new-revision-id', 'p1', 'Current budget', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']
    )
  })

  it('falls back to live revision when selected revision is not found', async () => {
    const mockDb = {
      select: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'live-1',
            production_id: 'p1',
            name: 'Current budget',
            created_from_revision_id: null,
            is_live: 1,
            created_at: 't',
            updated_at: 't',
            deleted_at: null,
          },
        ]),
      execute: vi.fn(),
    }
    vi.mocked(getDb).mockResolvedValue(mockDb as never)

    const resolved = await resolveSelectedBudgetRevision({
      productionId: 'p1',
      selectedRevisionId: 'missing-rev',
    })
    expect(resolved?.id).toBe('live-1')
  })

  it('returns selected revision when it belongs to production', async () => {
    const mockDb = {
      select: vi.fn().mockResolvedValue([
        {
          id: 'draft-2',
          production_id: 'p1',
          name: 'Draft',
          created_from_revision_id: 'live-1',
          is_live: 0,
          created_at: 't',
          updated_at: 't',
          deleted_at: null,
        },
      ]),
      execute: vi.fn(),
    }
    vi.mocked(getDb).mockResolvedValue(mockDb as never)

    const selected = await getBudgetRevisionByIdForProduction('p1', 'draft-2')
    expect(selected?.id).toBe('draft-2')

    const resolved = await resolveSelectedBudgetRevision({
      productionId: 'p1',
      selectedRevisionId: 'draft-2',
    })
    expect(resolved?.id).toBe('draft-2')
  })

  it('sets new live revision and unsets prior live revision transactionally', async () => {
    const rowsById: Record<string, Array<Record<string, unknown>>> = {
      'rev-next': [
        {
          id: 'rev-next',
          production_id: 'p1',
          name: 'Scenario',
          created_from_revision_id: 'rev-live',
          is_live: 0,
          created_at: 't',
          updated_at: 't',
          deleted_at: null,
        },
      ],
    }
    const execute = vi.fn().mockResolvedValue(undefined)
    const select = vi.fn(async (_sql: string, bindValues?: unknown[]) => {
      if (!bindValues || bindValues.length < 2) return []
      const key = String(bindValues[1])
      return rowsById[key] ?? []
    })
    vi.mocked(getDb).mockResolvedValue({ select, execute } as never)

    await setLiveBudgetRevisionForProduction({ productionId: 'p1', revisionId: 'rev-next' })

    expect(execute).toHaveBeenCalledWith('BEGIN TRANSACTION', [])
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('SET is_live = 0'),
      ['p1', '2026-01-01T00:00:00.000Z']
    )
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('SET is_live = 1'),
      ['p1', 'rev-next', '2026-01-01T00:00:00.000Z']
    )
    expect(execute).toHaveBeenCalledWith('COMMIT', [])
  })

  it('throws when trying to set live revision outside production', async () => {
    const select = vi.fn().mockResolvedValue([])
    vi.mocked(getDb).mockResolvedValue({ select, execute: vi.fn() } as never)
    await expect(
      setLiveBudgetRevisionForProduction({ productionId: 'p1', revisionId: 'missing' })
    ).rejects.toThrow(/Revision not found/)
  })
})
