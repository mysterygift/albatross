import { describe, expect, it } from 'vitest'
import {
  buildCostReportPdfData,
  flattenCostReportRows,
  type BuildCostReportPdfDataArgs,
} from '@/lib/budget/costReportPdfData'
import type { AccountTotals, AccountTreeNode } from '@/lib/budget/calculations'
import type { BudgetAccount, BudgetItem } from '@/lib/db/types'

const account = (over: Partial<BudgetAccount>): BudgetAccount => ({
  id: 'a',
  production_id: 'p',
  code: '1000',
  name: 'Account',
  parent_account_id: null,
  sort_order: 0,
  is_postable: true,
  color_hex: null,
  archived_at: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  ...over,
})

const item = (id: string, accountId: string, description: string, cost: number) =>
  ({ id, account_id: accountId, description, estimated_cost: cost }) as BudgetItem

const totals = (budget: number, actual: number): AccountTotals => ({
  budgetTotal: budget,
  actualTotal: actual,
  variance: budget - actual,
  percentSpent: budget > 0 ? actual / budget : null,
})

const header = account({ id: 'h', code: '1000', name: 'Above the line', is_postable: false })
const leaf = account({ id: 'l', code: '1100', name: 'Writers', parent_account_id: 'h' })
const other = account({ id: 'o', code: '1200', name: 'Producers', parent_account_id: 'h' })
const tree: AccountTreeNode[] = [
  {
    account: header,
    children: [
      { account: leaf, children: [] },
      { account: other, children: [] },
    ],
  },
]
const accountTotals = new Map<string, AccountTotals>([
  ['h', totals(300, 100)],
  ['l', totals(200, 100)],
  ['o', totals(100, 0)],
])
const items = [item('i1', 'l', 'Option fee', 150), item('i2', 'l', 'Script fee', 50)]

function args(over: Partial<BuildCostReportPdfDataArgs> = {}): BuildCostReportPdfDataArgs {
  return {
    productionName: 'Prod',
    revisionLabel: 'Revision 1 | Live',
    generatedAt: new Date('2026-10-13T18:40:00Z'),
    layout: 'chart',
    currency: 'GBP',
    openAllowCount: 0,
    accountTree: tree,
    accountTotals,
    items,
    expandedLeafId: null,
    groupTotals: [],
    visibleIdsByGroupId: new Map(),
    totalEstimated: 300,
    totalActual: 100,
    variance: 200,
    uncodedTotal: 0,
    productionTotalAmounts: [],
    productionSubtotalBeforeDerived: { budget: 300, actual: 100, variance: 200 },
    fringesTotal: 0,
    contingencyTotal: 0,
    totalDerived: 0,
    taxCreditsEnabled: false,
    vatTrackingEnabled: false,
    totalVat: 0,
    ...over,
  }
}

describe('flattenCostReportRows', () => {
  it('lists headers and children depth-first with totals and line item counts', () => {
    const rows = flattenCostReportRows(tree[0]!, 0, args())
    expect(rows.map((r) => [r.code, r.depth, r.isRollup])).toEqual([
      ['1000', 0, true],
      ['1100', 1, false],
      ['1200', 1, false],
    ])
    expect(rows[1]).toMatchObject({ budget: 200, actual: 100, detail: '(2 line items)' })
    expect(rows[2]!.detail).toBeNull()
  })

  it('lists line items only under the expanded leaf', () => {
    const rows = flattenCostReportRows(tree[0]!, 0, args({ expandedLeafId: 'l' }))
    expect(rows.map((r) => r.kind)).toEqual(['account', 'account', 'lineItem', 'lineItem', 'account'])
    expect(rows[2]).toMatchObject({ name: 'Option fee', budget: 150, actual: null })
  })

  it('only includes visible accounts, and never lists a root as a child', () => {
    const rows = flattenCostReportRows(tree[0]!, 0, args(), new Set(['h', 'o']))
    expect(rows.map((r) => r.code)).toEqual(['1000', '1200'])
    const strayRoot: AccountTreeNode = { account: account({ id: 'r', code: '9' }), children: [] }
    const nested: AccountTreeNode = { account: header, children: [strayRoot] }
    expect(flattenCostReportRows(nested, 0, args()).map((r) => r.code)).toEqual(['1000'])
  })

  it('flags archived accounts', () => {
    const archived: AccountTreeNode = {
      account: account({ id: 'x', archived_at: '2026-01-01' }),
      children: [],
    }
    expect(flattenCostReportRows(archived, 0, args())[0]!.archived).toBe(true)
  })
})

describe('buildCostReportPdfData', () => {
  it('builds one chart section with the uncoded spend row', () => {
    const data = buildCostReportPdfData(args({ uncodedTotal: 40 }))
    expect(data.sections).toHaveLength(1)
    expect(data.sections[0]!.title).toBe('Chart of accounts')
    expect(data.sections[0]!.rows.at(-1)).toMatchObject({ name: 'Uncoded spend', actual: 40, budget: null })
  })

  it('builds a block per group with its total, then uncoded spend', () => {
    const data = buildCostReportPdfData(
      args({
        layout: 'groups',
        uncodedTotal: 40,
        groupTotals: [
          { groupId: 'g1', groupName: 'Story', groupCode: 'A', budgetTotal: 200, actualTotal: 100, variance: 100, percentSpent: 0.5 },
          { groupId: 'g2', groupName: 'Hidden', groupCode: null, budgetTotal: 0, actualTotal: 0, variance: 0, percentSpent: null },
        ],
        visibleIdsByGroupId: new Map([['g1', new Set(['h', 'l'])]]),
      })
    )
    // g2 has no visible set, so it is skipped, as on screen.
    expect(data.sections.map((s) => s.title)).toEqual(['A - Story', 'Uncoded spend'])
    expect(data.sections[0]!.rows.map((r) => r.code)).toEqual(['1000', '1100', ''])
    expect(data.sections[0]!.rows.at(-1)).toMatchObject({ kind: 'total', name: 'Group total', budget: 200 })
    expect(data.emptyMessage).toContain('Settings')
  })

  it('only offers the pre-derived subtotal alongside configured subtotals', () => {
    expect(buildCostReportPdfData(args()).subtotalBeforeDerived).toBeNull()
    const data = buildCostReportPdfData(
      args({ productionTotalAmounts: [{ name: 'ATL', budgetTotal: 300, actualTotal: 100, variance: 200 }] })
    )
    expect(data.subtotals).toEqual([{ name: 'ATL', budget: 300, actual: 100, variance: 200 }])
    expect(data.subtotalBeforeDerived).toMatchObject({ name: 'Subtotal before derived', budget: 300 })
  })

  it('adds derived amounts to the final budget total', () => {
    const data = buildCostReportPdfData(args({ fringesTotal: 30, contingencyTotal: 20, totalDerived: 50 }))
    expect(data.derived).toEqual({ fringes: 30, contingency: 20 })
    expect(data.totals.budgetInclDerived).toBe(350)
  })

  it('includes tax credits, VAT and the net cost lines only when enabled and non-zero', () => {
    const taxCreditTotals = {
      perScheme: [
        { schemeId: 's1', schemeName: 'AVEC', qualifyingSpend: 100, cappedQualifyingSpend: 100, creditAmount: 25, warnings: ['Cap hit'], ineligible: false },
        { schemeId: 's2', schemeName: 'Unused', qualifyingSpend: 0, cappedQualifyingSpend: 0, creditAmount: 0, warnings: [], ineligible: false },
      ],
      totalQualifyingSpend: 100,
      totalTaxCredits: 25,
      netCostAfterCredits: 75,
    }
    const vatReclaimTotals = {
      perExpense: [],
      totalVatPaid: 20,
      totalVatReclaimable: 15,
      totalVatReclaimed: 5,
      totalVatOutstanding: 10,
    }
    const on = buildCostReportPdfData(
      args({ taxCreditsEnabled: true, taxCreditTotals, vatTrackingEnabled: true, vatReclaimTotals, totalVat: 20 })
    )
    expect(on.taxCredits?.schemes.map((s) => s.name)).toEqual(['AVEC'])
    expect(on.taxCredits?.warnings).toEqual(['AVEC: Cap hit'])
    expect(on.vatReclaim).toEqual({ paid: 20, reclaimable: 15, reclaimed: 5, outstanding: 10 })
    expect(on.totals).toMatchObject({ netCostAfterCredits: 75, totalVat: 20 })

    const off = buildCostReportPdfData(args({ taxCreditTotals, vatReclaimTotals, totalVat: 20 }))
    expect(off.taxCredits).toBeNull()
    expect(off.vatReclaim).toBeNull()
    expect(off.totals).toMatchObject({ netCostAfterCredits: null, totalVat: null })

    const zeroVat = buildCostReportPdfData(
      args({
        vatTrackingEnabled: true,
        vatReclaimTotals: { ...vatReclaimTotals, totalVatPaid: 0, totalVatReclaimable: 0, totalVatReclaimed: 0, totalVatOutstanding: 0 },
      })
    )
    expect(zeroVat.vatReclaim).toBeNull()
  })
})
