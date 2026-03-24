import { describe, expect, it } from 'vitest'
import {
  buildComparisonRows,
  computeRevisionSummaryMetrics,
  resolveCompareRevisionDefaults,
} from '@/features/budget/compareRevisions'
import type { BudgetRevision } from '@/lib/db/repositories/budgetRevisions'
import type { BudgetAccount, BudgetItem, Expense, FloatExpenseLink, Person, PettyCashFloat } from '@/lib/db/types'

function makeRevision(overrides: Partial<BudgetRevision>): BudgetRevision {
  return {
    id: 'rev-1',
    production_id: 'prod-1',
    name: 'Current budget',
    created_from_revision_id: null,
    is_live: true,
    approval: 'unapproved',
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
    ...overrides,
  }
}

describe('compare revision defaults', () => {
  it('uses live as base and selected as compare when available', () => {
    const revisions = [
      makeRevision({ id: 'live', is_live: true }),
      makeRevision({ id: 'draft-a', is_live: false }),
    ]
    const out = resolveCompareRevisionDefaults({
      revisions,
      liveRevisionId: 'live',
      selectedRevisionId: 'draft-a',
    })
    expect(out).toEqual({ baseRevisionId: 'live', compareRevisionId: 'draft-a' })
  })

  it('falls back cleanly for single revision', () => {
    const revisions = [makeRevision({ id: 'only' })]
    const out = resolveCompareRevisionDefaults({
      revisions,
      liveRevisionId: 'only',
      selectedRevisionId: 'only',
    })
    expect(out).toEqual({ baseRevisionId: 'only', compareRevisionId: 'only' })
  })
})

describe('comparison metrics and deltas', () => {
  const accounts: BudgetAccount[] = [
    {
      id: 'a1',
      production_id: 'prod-1',
      code: '1000',
      name: 'Root',
      parent_account_id: null,
      sort_order: 0,
      is_postable: true,
      color_hex: null,
      archived_at: null,
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    },
  ]
  const people: Person[] = [
    {
      id: 'p1',
      production_id: 'prod-1',
      name: 'Crew',
      is_cast: 0,
      email: null,
      phone: null,
      department: 'Art',
      phases: null,
      notes: null,
      contributor_form_status: 'not_requested',
      cast_number: null,
      agent_name: null,
      agent_email: null,
      agent_phone: null,
      role_name: null,
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    },
  ]

  it('builds required summary rows with compare-minus-base delta', () => {
    const baseItems: BudgetItem[] = [
      {
        id: 'i1',
        production_id: 'prod-1',
        budget_revision_id: 'r1',
        category_id: null,
        account_id: 'a1',
        description: 'Line 1',
        estimated_cost: 100,
        actual_cost: 0,
        vendor: null,
        status: 'draft',
        line_item_type: null,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
    ]
    const compareItems: BudgetItem[] = [{ ...baseItems[0]!, id: 'i2', budget_revision_id: 'r2', estimated_cost: 130 }]
    const expenses: Expense[] = []
    const floats: PettyCashFloat[] = [
      {
        id: 'f1',
        production_id: 'prod-1',
        budget_revision_id: 'r1',
        budget_item_id: 'i1',
        person_id: 'p1',
        amount: 20,
        currency: 'GBP',
        issued_date: '2026-01-01',
        notes: null,
        created_at: 1,
        updated_at: 1,
        deleted_at: null,
      },
    ]
    const floatLinks: FloatExpenseLink[] = []

    const base = computeRevisionSummaryMetrics({
      items: baseItems,
      expenses,
      accounts,
      fringeRules: [],
      contingencyRules: [],
      floats,
      floatExpenseLinks: floatLinks,
      people,
    })
    const compare = computeRevisionSummaryMetrics({
      items: compareItems,
      expenses,
      accounts,
      fringeRules: [],
      contingencyRules: [],
      floats: [{ ...floats[0]!, id: 'f2', budget_revision_id: 'r2', amount: 10 }],
      floatExpenseLinks: floatLinks,
      people,
    })

    const rows = buildComparisonRows(base, compare)
    expect(rows.map((r) => r.label)).toEqual([
      'Estimate',
      'Actuals',
      'Variance',
      'Derived costs',
      'Float exposure',
    ])
    const estimateRow = rows.find((r) => r.key === 'estimate')!
    const floatExposureRow = rows.find((r) => r.key === 'floatExposure')!
    expect(estimateRow.delta).toBe(30)
    expect(floatExposureRow.delta).toBe(-10)
  })

  it('self-comparison produces zero deltas', () => {
    const rows = buildComparisonRows(
      {
        estimate: 100,
        actuals: 40,
        variance: 60,
        derivedCosts: 5,
        floatExposure: 10,
      },
      {
        estimate: 100,
        actuals: 40,
        variance: 60,
        derivedCosts: 5,
        floatExposure: 10,
      }
    )
    expect(rows.every((r) => r.delta === 0)).toBe(true)
  })
})
