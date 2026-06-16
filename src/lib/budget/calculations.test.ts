import { describe, expect, it } from 'vitest'
import type { BudgetAccount, BudgetItem } from '@/lib/db/types'
import { sortBudgetItemsForExport } from '@/lib/budget/calculations'

function account(id: string, code: string, sort_order = 0): BudgetAccount {
  return {
    id,
    production_id: 'prod-1',
    code,
    name: `Account ${code}`,
    parent_account_id: null,
    sort_order,
    is_postable: true,
    color_hex: null,
    archived_at: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  }
}

function item(id: string, account_id: string | null, description: string): BudgetItem {
  return {
    id,
    production_id: 'prod-1',
    budget_revision_id: 'rev-1',
    account_id,
    category_id: null,
    description,
    estimated_cost: 100,
    actual_cost: 0,
    vendor: null,
    status: '',
    line_item_type: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  }
}

describe('sortBudgetItemsForExport', () => {
  it('orders rows by numeric account code, not description', () => {
    const accounts = [account('a10', '10'), account('a2', '2'), account('a100', '100')]
    const items = [
      item('i1', 'a10', 'Zebra line'),
      item('i2', 'a2', 'Alpha line'),
      item('i3', 'a100', 'Middle line'),
    ]

    const sorted = sortBudgetItemsForExport(items, accounts, [])
    expect(sorted.map((i) => i.id)).toEqual(['i2', 'i1', 'i3'])
  })

  it('keeps description order within the same account', () => {
    const accounts = [account('a1', '100')]
    const items = [
      item('i1', 'a1', 'Zebra'),
      item('i2', 'a1', 'Alpha'),
      item('i3', 'a1', 'Beta'),
    ]

    const sorted = sortBudgetItemsForExport(items, accounts, [])
    expect(sorted.map((i) => i.description)).toEqual(['Alpha', 'Beta', 'Zebra'])
  })
})
