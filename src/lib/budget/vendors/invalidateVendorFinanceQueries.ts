/**
 * One place that knows which cached queries show PO / invoice / proof state, so every writer
 * (Log Spend, expense edit, PO increase / amendment, vendor page) invalidates the same set.
 */
import type { QueryClient } from '@tanstack/react-query'

import { dashboardVendorFinanceQueryKey } from '@/lib/dashboard/vendorFinance'
import { riskWatchBaseQueryKey } from '@/lib/budget/vendors/riskWatch'
import { invalidateExpenseReceiptQueries } from '@/lib/db/repositories/expenseReceipts'
import {
  expensePoLinkCountsBaseQueryKey,
  vendorInvoiceExpenseLinksQueryKey,
  vendorInvoiceLinksByExpenseQueryKey,
  vendorPoCommitmentLinksQueryKey,
  vendorPurchaseOrderExpenseLinksQueryKey,
  vendorPurchaseOrderLinksByExpenseQueryKey,
} from '@/lib/db/repositories/vendorFinanceLinks'
import { vendorInvoicesQueryKey } from '@/lib/db/repositories/vendorInvoices'
import {
  vendorPurchaseOrderQueryKey,
  vendorPurchaseOrdersByProductionQueryKey,
  vendorPurchaseOrdersQueryKey,
} from '@/lib/db/repositories/vendorPurchaseOrders'

function invalidate(queryClient: QueryClient, queryKey: readonly unknown[]): void {
  void queryClient.invalidateQueries({ queryKey })
}

/** After a PO's value / fields changed (amendment, edit): PO lists, commitments, history, dashboards. */
export function invalidatePurchaseOrderQueries(
  queryClient: QueryClient,
  args: { productionId: string; vendorId: string; poId: string }
): void {
  const { productionId, vendorId, poId } = args
  invalidate(queryClient, vendorPurchaseOrdersByProductionQueryKey(productionId))
  invalidate(queryClient, vendorPurchaseOrdersQueryKey(productionId, vendorId))
  invalidate(queryClient, vendorPurchaseOrderQueryKey(poId))
  // Prefix: production-wide AND per-vendor commitment links.
  invalidate(queryClient, vendorPoCommitmentLinksQueryKey(productionId))
  invalidate(queryClient, ['vendor-po-amendments', productionId, vendorId])
  invalidate(queryClient, dashboardVendorFinanceQueryKey(productionId))
  invalidate(queryClient, riskWatchBaseQueryKey(productionId))
}

/**
 * After an expense's PO links / invoice links / receipts changed (create, edit, unlink): the expense's
 * own link queries, committed figures on every PO, vendor page counts, badges, dashboards, Risk Watch.
 */
export function invalidateExpenseFinanceQueries(
  queryClient: QueryClient,
  args: {
    productionId: string
    expenseId: string
    vendorId?: string | null
    poIds?: readonly string[]
    invoiceIds?: readonly string[]
  }
): void {
  const { productionId, expenseId, vendorId } = args
  invalidate(queryClient, vendorInvoiceLinksByExpenseQueryKey(expenseId))
  invalidate(queryClient, vendorPurchaseOrderLinksByExpenseQueryKey(expenseId))
  invalidate(queryClient, vendorPoCommitmentLinksQueryKey(productionId))
  invalidate(queryClient, vendorPurchaseOrdersByProductionQueryKey(productionId))
  invalidate(queryClient, expensePoLinkCountsBaseQueryKey(productionId))
  for (const poId of args.poIds ?? []) invalidate(queryClient, vendorPurchaseOrderExpenseLinksQueryKey(poId))
  for (const invoiceId of args.invoiceIds ?? []) {
    invalidate(queryClient, vendorInvoiceExpenseLinksQueryKey(invoiceId))
  }
  if (vendorId) {
    invalidate(queryClient, vendorPurchaseOrdersQueryKey(productionId, vendorId))
    invalidate(queryClient, vendorInvoicesQueryKey(productionId, vendorId))
    invalidate(queryClient, ['vendor-invoice-expense-link-counts', productionId, vendorId])
    invalidate(queryClient, ['vendor-po-expense-link-counts', productionId, vendorId])
    invalidate(queryClient, ['vendor-linked-expense-ids', productionId, vendorId])
  }
  invalidateExpenseReceiptQueries(queryClient, { productionId, expenseId })
  invalidate(queryClient, dashboardVendorFinanceQueryKey(productionId))
  invalidate(queryClient, riskWatchBaseQueryKey(productionId))
}
