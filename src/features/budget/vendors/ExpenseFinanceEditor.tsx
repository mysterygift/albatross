import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { ExpenseDocumentMatch } from '@/features/budget/vendors/ExpenseDocumentMatch'
import { isPoMatchableExpense } from '@/lib/budget/expenseFinanceFlags'
import { invalidateExpenseFinanceQueries } from '@/lib/budget/vendors/invalidateVendorFinanceQueries'
import { applyFinanceDraftToExpense } from '@/lib/db/applyFinanceDraftToExpense'
import {
  expenseReceiptsQueryKey,
  listReceiptsByExpense,
} from '@/lib/db/repositories/expenseReceipts'
import {
  listInvoiceLinksByExpenseId,
  listPurchaseOrderLinksByExpenseId,
  vendorInvoiceLinksByExpenseQueryKey,
  vendorPurchaseOrderLinksByExpenseQueryKey,
} from '@/lib/db/repositories/vendorFinanceLinks'
import { getVendorInvoiceById } from '@/lib/db/repositories/vendorInvoices'
import {
  emptyExpenseVendorFinanceDraft,
  hasPendingFinanceChanges,
  isExpenseReceiptDraftEmpty,
  validateExpenseVendorFinanceDraft,
  type ExpenseVendorFinanceDraft,
} from '@/lib/db/vendorFinanceDocumentService'
import type { Expense, VendorInvoice } from '@/lib/db/types'

export type ExpenseFinanceEditorProps = {
  productionId: string
  expense: Pick<Expense, 'id' | 'vendor_id' | 'transaction_type' | 'amount'>
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
}

/**
 * Edit-side host of `ExpenseDocumentMatch`: loads the expense's stored PO links, linked invoices and
 * receipts, lets the user change them with the SAME UI as Log Spend, and applies the whole draft in one
 * transaction (`applyFinanceDraftToExpense`) when they press Save. Render with `key={expense.id}`.
 */
export function ExpenseFinanceEditor({ productionId, expense, productionCurrency, format }: ExpenseFinanceEditorProps) {
  const queryClient = useQueryClient()
  const expenseId = expense.id
  const [edits, setEdits] = useState<ExpenseVendorFinanceDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const poLinksQuery = useQuery({
    queryKey: vendorPurchaseOrderLinksByExpenseQueryKey(expenseId),
    queryFn: () => listPurchaseOrderLinksByExpenseId(expenseId),
  })
  const invoiceLinksQuery = useQuery({
    queryKey: vendorInvoiceLinksByExpenseQueryKey(expenseId),
    queryFn: () => listInvoiceLinksByExpenseId(expenseId),
  })
  const receiptsQuery = useQuery({
    queryKey: expenseReceiptsQueryKey(expenseId),
    queryFn: () => listReceiptsByExpense(expenseId),
  })
  const invoiceIds = useMemo(
    () => (invoiceLinksQuery.data ?? []).map((l) => l.vendor_invoice_id),
    [invoiceLinksQuery.data]
  )
  const linkedInvoicesQuery = useQuery({
    queryKey: ['linked-vendor-invoices', invoiceIds.join(',')],
    queryFn: async () => {
      const found = await Promise.all(invoiceIds.map((id) => getVendorInvoiceById(id)))
      return found.filter((inv): inv is VendorInvoice => inv != null)
    },
    enabled: invoiceIds.length > 0,
  })

  const storedAllocations = useMemo(
    () =>
      (poLinksQuery.data ?? []).map((l) => ({
        poId: l.vendor_purchase_order_id,
        allocatedAmount: l.allocated_amount,
      })),
    [poLinksQuery.data]
  )
  const draft = edits ?? { ...emptyExpenseVendorFinanceDraft(), poAllocations: storedAllocations }
  const loaded = poLinksQuery.isSuccess && invoiceLinksQuery.isSuccess && receiptsQuery.isSuccess
  const dirty = loaded && edits != null && hasPendingFinanceChanges(edits, storedAllocations, expense.amount)

  const existingProof = useMemo(
    () => ({
      invoices: (linkedInvoicesQuery.data ?? []).map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        amount: inv.amount,
        currencyCode: inv.currency_code,
      })),
      receipts: receiptsQuery.data ?? [],
    }),
    [linkedInvoicesQuery.data, receiptsQuery.data]
  )

  const save = useMutation({
    mutationFn: () => {
      const toSave: ExpenseVendorFinanceDraft = {
        ...draft,
        receipt: isExpenseReceiptDraftEmpty(draft.receipt) ? null : draft.receipt,
      }
      const problem = validateExpenseVendorFinanceDraft(toSave)
      if (problem) throw new Error(problem)
      return applyFinanceDraftToExpense({ expenseId, productionCurrency, draft: toSave })
    },
    onSuccess: async (result) => {
      setError(null)
      invalidateExpenseFinanceQueries(queryClient, {
        productionId,
        expenseId,
        vendorId: expense.vendor_id,
        poIds: result.affectedPoIds,
        invoiceIds: result.affectedInvoiceIds,
      })
      await Promise.all([poLinksQuery.refetch(), invoiceLinksQuery.refetch(), receiptsQuery.refetch()])
      setEdits(null)
      if (result.warnings.length > 0) {
        toast.warning('Saved with PO warnings', { description: result.warnings.map((w) => w.message).join(' ') })
      } else if (result.changed) {
        toast.success('PO & documents updated')
      }
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="space-y-2" data-testid="expense-finance-editor">
      <ExpenseDocumentMatch
        productionId={productionId}
        vendorId={expense.vendor_id}
        expenseAmount={expense.amount}
        productionCurrency={productionCurrency}
        format={format}
        draft={draft}
        onDraftChange={(next) => {
          setError(null)
          setEdits(next)
        }}
        mode="edit"
        expenseId={expenseId}
        existingProof={existingProof}
        allowPoMatching={isPoMatchableExpense(expense)}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {dirty && (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={save.isPending}
            onClick={() => {
              setEdits(null)
              setError(null)
            }}
          >
            Discard
          </Button>
          <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save PO & documents'}
          </Button>
        </div>
      )}
    </div>
  )
}
