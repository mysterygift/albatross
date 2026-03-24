import { describe, expect, it } from 'vitest'
import {
  CREATE_BUDGET_REVISION_VALUE,
  getBudgetRevisionContextLabel,
  getBudgetRevisionOptionLabels,
  getBudgetRevisionTriggerLabel,
  isCreateBudgetRevisionSelection,
} from '@/features/budget/revisionSelectorHelpers'
import type { BudgetRevision } from '@/lib/db/repositories/budgetRevisions'

function makeRevision(overrides: Partial<BudgetRevision>): BudgetRevision {
  return {
    id: 'rev-1',
    production_id: 'prod-1',
    name: 'Current budget',
    created_from_revision_id: null,
    is_live: true,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
    ...overrides,
  }
}

describe('revision selector helper behavior', () => {
  it('renders selected revision name for closed trigger', () => {
    const selected = makeRevision({ name: 'Scenario B', is_live: false })
    const label = getBudgetRevisionTriggerLabel({
      selectedRevision: selected,
      revisions: [selected],
      isLoading: false,
    })
    expect(label).toBe('Scenario B')
  })

  it('renders loading and empty fallback labels', () => {
    const loading = getBudgetRevisionTriggerLabel({
      selectedRevision: null,
      revisions: [],
      isLoading: true,
    })
    const empty = getBudgetRevisionTriggerLabel({
      selectedRevision: null,
      revisions: [],
      isLoading: false,
    })
    expect(loading).toBe('Loading revisions...')
    expect(empty).toBe('No revisions')
  })

  it('marks live and draft statuses clearly', () => {
    expect(getBudgetRevisionContextLabel(makeRevision({ is_live: true }))).toBe('Live revision')
    expect(getBudgetRevisionContextLabel(makeRevision({ is_live: false }))).toBe('Draft revision')
  })

  it('always includes create revision entry in option labels', () => {
    const labels = getBudgetRevisionOptionLabels([
      makeRevision({ id: 'live', name: 'Current budget', is_live: true }),
      makeRevision({ id: 'draft', name: 'Scenario B', is_live: false }),
    ])
    expect(labels).toContain('Current budget · Live')
    expect(labels).toContain('Scenario B · Draft')
    expect(labels.at(-1)).toBe('Create budget revision...')
  })

  it('handles empty revision list safely while keeping create action', () => {
    const labels = getBudgetRevisionOptionLabels([])
    expect(labels).toEqual(['No revisions found', 'Create budget revision...'])
  })

  it('recognizes create-revision selection value from dropdown', () => {
    expect(isCreateBudgetRevisionSelection(CREATE_BUDGET_REVISION_VALUE)).toBe(true)
    expect(isCreateBudgetRevisionSelection('rev-1')).toBe(false)
  })
})
