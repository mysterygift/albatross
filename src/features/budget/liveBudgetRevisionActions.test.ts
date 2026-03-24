import { describe, expect, it, vi } from 'vitest'
import { runLiveBudgetRevisionSwitch } from '@/features/budget/liveBudgetRevisionActions'
import type { BudgetRevision } from '@/lib/db/repositories/budgetRevisions'

function makeRevision(overrides: Partial<BudgetRevision>): BudgetRevision {
  return {
    id: 'rev-1',
    production_id: 'prod-1',
    name: 'Current budget',
    created_from_revision_id: null,
    is_live: false,
    approval: 'unapproved',
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
    ...overrides,
  }
}

describe('runLiveBudgetRevisionSwitch', () => {
  it('does nothing when already busy', async () => {
    const result = await runLiveBudgetRevisionSwitch(
      {
        setLiveBudgetRevision: vi.fn(),
      },
      {
        currentProductionId: 'p1',
        targetRevision: makeRevision({ id: 'draft-1' }),
        isBusy: true,
      }
    )
    expect(result.ok).toBe(false)
    expect(result.isNoop).toBe(true)
  })

  it('requires active production', async () => {
    const setLive = vi.fn()
    const result = await runLiveBudgetRevisionSwitch(
      {
        setLiveBudgetRevision: setLive,
      },
      {
        currentProductionId: null,
        targetRevision: makeRevision({ id: 'draft-1' }),
        isBusy: false,
      }
    )
    expect(result.ok).toBe(false)
    expect(setLive).not.toHaveBeenCalled()
  })

  it('does not call mutation for already-live target', async () => {
    const setLive = vi.fn()
    const result = await runLiveBudgetRevisionSwitch(
      {
        setLiveBudgetRevision: setLive,
      },
      {
        currentProductionId: 'p1',
        targetRevision: makeRevision({ id: 'live-1', is_live: true }),
        isBusy: false,
      }
    )
    expect(result.ok).toBe(false)
    expect(result.isNoop).toBe(true)
    expect(setLive).not.toHaveBeenCalled()
  })

  it('calls canonical live switch on success', async () => {
    const setLive = vi.fn().mockResolvedValue(undefined)
    const result = await runLiveBudgetRevisionSwitch(
      {
        setLiveBudgetRevision: setLive,
      },
      {
        currentProductionId: 'p1',
        targetRevision: makeRevision({ id: 'draft-2' }),
        isBusy: false,
      }
    )
    expect(result.ok).toBe(true)
    expect(setLive).toHaveBeenCalledWith({ productionId: 'p1', revisionId: 'draft-2' })
  })

  it('returns error when mutation fails', async () => {
    const result = await runLiveBudgetRevisionSwitch(
      {
        setLiveBudgetRevision: vi.fn().mockRejectedValue(new Error('failed')),
      },
      {
        currentProductionId: 'p1',
        targetRevision: makeRevision({ id: 'draft-3' }),
        isBusy: false,
      }
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('failed')
  })
})
