import { describe, expect, it, vi } from 'vitest'
import {
  runCreateBudgetRevision,
  validateCreateBudgetRevisionInput,
} from '@/features/budget/createBudgetRevisionActions'

describe('create budget revision actions', () => {
  it('requires non-empty revision name', () => {
    const errors = validateCreateBudgetRevisionInput({
      productionId: 'p1',
      name: '   ',
      mode: 'blank',
      sourceRevisionId: null,
    })
    expect(errors.name).toMatch(/required/i)
  })

  it('requires source revision in copy mode', () => {
    const errors = validateCreateBudgetRevisionInput({
      productionId: 'p1',
      name: 'Scenario B',
      mode: 'copy',
      sourceRevisionId: null,
    })
    expect(errors.sourceRevisionId).toMatch(/source revision/i)
  })

  it('creates blank revision and switches selection on success', async () => {
    const createBlank = vi.fn().mockResolvedValue({
      id: 'rev-2',
      name: 'Scenario B',
      production_id: 'p1',
      created_from_revision_id: null,
      is_live: false,
      approval: 'unapproved',
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    })

    const setSelected = vi.fn()
    const invalidate = vi.fn()
    const result = await runCreateBudgetRevision(
      {
        createBlankBudgetRevision: createBlank,
        createBudgetRevisionFromExisting: vi.fn(),
        setSelectedBudgetRevisionId: setSelected,
        invalidateQueries: invalidate,
      },
      {
        productionId: 'p1',
        name: ' Scenario B ',
        mode: 'blank',
        sourceRevisionId: null,
      }
    )

    expect(result.ok).toBe(true)
    expect(createBlank).toHaveBeenCalledWith({ productionId: 'p1', name: 'Scenario B' })
    expect(setSelected).toHaveBeenCalledWith('p1', 'rev-2')
    expect(invalidate).toHaveBeenCalled()
  })

  it('creates copied revision from selected source', async () => {
    const createFromExisting = vi.fn().mockResolvedValue({
      id: 'rev-3',
      name: 'Scenario C',
      production_id: 'p1',
      created_from_revision_id: 'rev-1',
      is_live: false,
      approval: 'unapproved',
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    })
    const result = await runCreateBudgetRevision(
      {
        createBlankBudgetRevision: vi.fn(),
        createBudgetRevisionFromExisting: createFromExisting,
        setSelectedBudgetRevisionId: vi.fn(),
        invalidateQueries: vi.fn(),
      },
      {
        productionId: 'p1',
        name: 'Scenario C',
        mode: 'copy',
        sourceRevisionId: 'rev-1',
      }
    )
    expect(result.ok).toBe(true)
    expect(createFromExisting).toHaveBeenCalledWith({
      productionId: 'p1',
      sourceRevisionId: 'rev-1',
      newRevisionName: 'Scenario C',
    })
  })

  it('leaves selection unchanged when service fails', async () => {
    const setSelected = vi.fn()
    const result = await runCreateBudgetRevision(
      {
        createBlankBudgetRevision: vi.fn().mockRejectedValue(new Error('boom')),
        createBudgetRevisionFromExisting: vi.fn(),
        setSelectedBudgetRevisionId: setSelected,
        invalidateQueries: vi.fn(),
      },
      {
        productionId: 'p1',
        name: 'Scenario fail',
        mode: 'blank',
        sourceRevisionId: null,
      }
    )
    expect(result.ok).toBe(false)
    expect(setSelected).not.toHaveBeenCalled()
  })
})
