import { describe, expect, it, vi } from 'vitest'
import {
  canDuplicateLiveAsDraftFromMenuContext,
  runDuplicateLiveAsDraftFromMenu,
} from '@/features/productions/budgetMenuActions'

describe('runDuplicateLiveAsDraftFromMenu', () => {
  it('guards when no active production exists', async () => {
    const result = await runDuplicateLiveAsDraftFromMenu({
      currentProductionId: null,
      hasLiveRevision: false,
      isBusy: false,
      duplicateLiveBudgetRevisionAsDraft: vi.fn(),
      setSelectedBudgetRevisionId: vi.fn(),
      invalidateQueries: vi.fn(),
    })
    expect(result?.type).toBe('error')
    expect(result?.message).toMatch(/Choose a current production/)
  })

  it('does nothing while already busy', async () => {
    const result = await runDuplicateLiveAsDraftFromMenu({
      currentProductionId: 'p1',
      hasLiveRevision: true,
      isBusy: true,
      duplicateLiveBudgetRevisionAsDraft: vi.fn(),
      setSelectedBudgetRevisionId: vi.fn(),
      invalidateQueries: vi.fn(),
    })
    expect(result).toBeNull()
  })

  it('duplicates live revision and switches selected revision on success', async () => {
    const duplicate = vi.fn().mockResolvedValue({
      id: 'draft-2',
      name: 'Current budget Draft',
      production_id: 'p1',
      created_from_revision_id: 'live-1',
      is_live: false,
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    })
    const setSelected = vi.fn()
    const invalidate = vi.fn()

    const result = await runDuplicateLiveAsDraftFromMenu({
      currentProductionId: 'p1',
      hasLiveRevision: true,
      isBusy: false,
      duplicateLiveBudgetRevisionAsDraft: duplicate,
      setSelectedBudgetRevisionId: setSelected,
      invalidateQueries: invalidate,
    })

    expect(result?.type).toBe('success')
    expect(duplicate).toHaveBeenCalledWith({ productionId: 'p1' })
    expect(setSelected).toHaveBeenCalledWith('p1', 'draft-2')
    expect(invalidate).toHaveBeenCalled()
  })

  it('does not switch selected revision when duplication fails', async () => {
    const setSelected = vi.fn()
    const result = await runDuplicateLiveAsDraftFromMenu({
      currentProductionId: 'p1',
      hasLiveRevision: true,
      isBusy: false,
      duplicateLiveBudgetRevisionAsDraft: vi.fn().mockRejectedValue(new Error('No live budget revision found')),
      setSelectedBudgetRevisionId: setSelected,
      invalidateQueries: vi.fn(),
    })
    expect(result?.type).toBe('error')
    expect(setSelected).not.toHaveBeenCalled()
  })

  it('guards when production has no live revision', async () => {
    const duplicate = vi.fn()
    const result = await runDuplicateLiveAsDraftFromMenu({
      currentProductionId: 'p1',
      hasLiveRevision: false,
      isBusy: false,
      duplicateLiveBudgetRevisionAsDraft: duplicate,
      setSelectedBudgetRevisionId: vi.fn(),
      invalidateQueries: vi.fn(),
    })
    expect(result?.type).toBe('error')
    expect(result?.message).toMatch(/No live budget revision/i)
    expect(duplicate).not.toHaveBeenCalled()
  })
})

describe('canDuplicateLiveAsDraftFromMenuContext', () => {
  it('is true only when production exists, live revision exists, and action is idle', () => {
    expect(
      canDuplicateLiveAsDraftFromMenuContext({
        currentProductionId: 'p1',
        hasLiveRevision: true,
        isBusy: false,
      })
    ).toBe(true)
    expect(
      canDuplicateLiveAsDraftFromMenuContext({
        currentProductionId: null,
        hasLiveRevision: true,
        isBusy: false,
      })
    ).toBe(false)
    expect(
      canDuplicateLiveAsDraftFromMenuContext({
        currentProductionId: 'p1',
        hasLiveRevision: false,
        isBusy: false,
      })
    ).toBe(false)
    expect(
      canDuplicateLiveAsDraftFromMenuContext({
        currentProductionId: 'p1',
        hasLiveRevision: true,
        isBusy: true,
      })
    ).toBe(false)
  })
})
