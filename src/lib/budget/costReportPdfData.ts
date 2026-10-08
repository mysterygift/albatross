import { getAccountBandColor } from '@/lib/budget/accountBandColor'
import type { AccountTotals, AccountTreeNode } from '@/lib/budget/calculations'
import type { TaxCreditTotalsResult } from '@/lib/budget/taxCredits'
import type { VatReclaimTotalsResult } from '@/lib/budget/vatReclaim'
import type { BudgetItem } from '@/lib/db/types'
import type {
  CostReportData,
  CostReportLayoutKind,
  CostReportRow,
  CostReportSection,
} from '@/lib/pdf/costReport'

export interface CostReportGroupTotal {
  groupId: string
  groupName: string
  groupCode: string | null
  budgetTotal: number
  actualTotal: number
  variance: number
  percentSpent: number | null
}

export interface BuildCostReportPdfDataArgs {
  productionName: string
  revisionLabel: string | null
  generatedAt: Date
  layout: CostReportLayoutKind
  currency: string
  openAllowCount: number
  accountTree: AccountTreeNode[]
  accountTotals: Map<string, AccountTotals>
  items: BudgetItem[]
  /** The leaf whose line items are expanded on screen; they are listed under it in the PDF too. */
  expandedLeafId: string | null
  groupTotals: CostReportGroupTotal[]
  visibleIdsByGroupId: Map<string, Set<string>>
  totalEstimated: number
  totalActual: number
  variance: number
  uncodedTotal: number
  productionTotalAmounts: Array<{ name: string; budgetTotal: number; actualTotal: number; variance: number }>
  productionSubtotalBeforeDerived: { budget: number; actual: number; variance: number }
  fringesTotal: number
  contingencyTotal: number
  totalDerived: number
  taxCreditsEnabled: boolean
  taxCreditTotals?: TaxCreditTotalsResult
  vatTrackingEnabled: boolean
  totalVat: number
  vatReclaimTotals?: VatReclaimTotalsResult
}

/** Chart-of-accounts rows for `node` and its descendants, depth-first, as the Cost Report lists them. */
export function flattenCostReportRows(
  node: AccountTreeNode,
  depth: number,
  ctx: Pick<BuildCostReportPdfDataArgs, 'accountTotals' | 'items' | 'expandedLeafId'>,
  visibleIds?: Set<string>
): CostReportRow[] {
  const { account } = node
  // Roots (no parent) are only listed from the top of the tree, never as children.
  if (depth > 0 && account.parent_account_id === null) return []
  if (visibleIds != null && !visibleIds.has(account.id)) return []

  const totals = ctx.accountTotals.get(account.id)
  const lineItems = account.is_postable ? ctx.items.filter((i) => i.account_id === account.id) : []
  const rows: CostReportRow[] = [
    {
      kind: 'account',
      code: account.code,
      name: account.name,
      depth,
      isRollup: !account.is_postable,
      archived: account.archived_at != null,
      bandHex: getAccountBandColor(account),
      detail:
        account.is_postable && lineItems.length > 0
          ? `(${lineItems.length} line item${lineItems.length === 1 ? '' : 's'})`
          : null,
      budget: totals?.budgetTotal ?? null,
      actual: totals?.actualTotal ?? null,
      variance: totals?.variance ?? null,
      percentSpent: totals?.percentSpent ?? null,
    },
  ]

  if (account.is_postable && ctx.expandedLeafId === account.id) {
    for (const item of lineItems) {
      rows.push({
        kind: 'lineItem',
        code: '',
        name: item.description,
        depth,
        isRollup: false,
        archived: false,
        bandHex: null,
        detail: null,
        budget: item.estimated_cost,
        actual: null,
        variance: null,
        percentSpent: null,
      })
    }
  }

  for (const child of node.children) {
    rows.push(...flattenCostReportRows(child, depth + 1, ctx, visibleIds))
  }
  return rows
}

function uncodedRow(uncodedTotal: number): CostReportRow {
  return {
    kind: 'account',
    code: '-',
    name: 'Uncoded spend',
    depth: 0,
    isRollup: false,
    archived: false,
    bandHex: null,
    detail: null,
    budget: null,
    actual: uncodedTotal,
    variance: null,
    percentSpent: null,
  }
}

/** Turns the Cost Report's computed values into the data the PDF generator lays out. */
export function buildCostReportPdfData(args: BuildCostReportPdfDataArgs): CostReportData {
  const sections: CostReportSection[] = []
  let emptyMessage: string

  if (args.layout === 'chart') {
    emptyMessage = 'No accounts yet.'
    const rows = args.accountTree.flatMap((node) => flattenCostReportRows(node, 0, args))
    if (args.uncodedTotal > 0) rows.push(uncodedRow(args.uncodedTotal))
    if (rows.length > 0) sections.push({ title: 'Chart of accounts', rows })
  } else {
    emptyMessage = 'No cost report groups configured. Add groups in Settings.'
    for (const group of args.groupTotals) {
      const visibleIds = args.visibleIdsByGroupId.get(group.groupId)
      if (!visibleIds) continue
      const rows = args.accountTree.flatMap((node) => flattenCostReportRows(node, 0, args, visibleIds))
      rows.push({
        kind: 'total',
        code: '',
        name: 'Group total',
        depth: 0,
        isRollup: false,
        archived: false,
        bandHex: null,
        detail: null,
        budget: group.budgetTotal,
        actual: group.actualTotal,
        variance: group.variance,
        percentSpent: group.percentSpent,
      })
      sections.push({
        title: group.groupCode ? `${group.groupCode} - ${group.groupName}` : group.groupName,
        rows,
      })
    }
    if (args.uncodedTotal > 0) {
      sections.push({ title: 'Uncoded spend', rows: [uncodedRow(args.uncodedTotal)] })
    }
  }

  const taxCredits =
    args.taxCreditsEnabled && args.taxCreditTotals
      ? {
          schemes: args.taxCreditTotals.perScheme
            .filter((s) => s.creditAmount > 0 || s.qualifyingSpend > 0)
            .map((s) => ({
              name: s.schemeName,
              qualifyingSpend: s.qualifyingSpend,
              creditAmount: s.creditAmount,
            })),
          warnings: args.taxCreditTotals.perScheme.flatMap((s) =>
            s.warnings.map((w) => `${s.schemeName}: ${w}`)
          ),
          totalQualifyingSpend: args.taxCreditTotals.totalQualifyingSpend,
          totalTaxCredits: args.taxCreditTotals.totalTaxCredits,
          netCostAfterCredits: args.taxCreditTotals.netCostAfterCredits,
        }
      : null

  // Nothing to reclaim or report: leave the section out, as the on-screen block does.
  const vat = args.vatReclaimTotals
  const vatReclaim =
    args.vatTrackingEnabled &&
    vat &&
    (vat.totalVatPaid !== 0 || vat.totalVatReclaimable !== 0 || vat.totalVatReclaimed !== 0)
      ? {
          paid: vat.totalVatPaid,
          reclaimable: vat.totalVatReclaimable,
          reclaimed: vat.totalVatReclaimed,
          outstanding: vat.totalVatOutstanding,
        }
      : null

  return {
    productionName: args.productionName,
    revisionLabel: args.revisionLabel,
    generatedAt: args.generatedAt.toISOString(),
    layout: args.layout,
    currency: args.currency,
    openAllowCount: args.openAllowCount,
    totalEstimated: args.totalEstimated,
    totalActual: args.totalActual,
    variance: args.variance,
    uncodedTotal: args.uncodedTotal,
    sections,
    emptyMessage,
    subtotals: args.productionTotalAmounts.map((t) => ({
      name: t.name,
      budget: t.budgetTotal,
      actual: t.actualTotal,
      variance: t.variance,
    })),
    // The on-screen block only offers this line alongside configured subtotals.
    subtotalBeforeDerived:
      args.productionTotalAmounts.length > 0
        ? {
            name: 'Subtotal before derived',
            budget: args.productionSubtotalBeforeDerived.budget,
            actual: args.productionSubtotalBeforeDerived.actual,
            variance: args.productionSubtotalBeforeDerived.variance,
          }
        : null,
    derived: { fringes: args.fringesTotal, contingency: args.contingencyTotal },
    taxCredits,
    vatReclaim,
    totals: {
      budgetInclDerived: args.totalEstimated + args.totalDerived,
      actual: args.totalActual,
      variance: args.variance,
      netCostAfterCredits:
        taxCredits && taxCredits.totalTaxCredits > 0 ? taxCredits.netCostAfterCredits : null,
      totalVat: args.vatTrackingEnabled && args.totalVat > 0 ? args.totalVat : null,
    },
  }
}
