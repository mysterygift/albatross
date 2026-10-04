import { Trash2, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { VendorFinanceDocumentField } from '@/features/budget/vendors/VendorFinanceDocumentField'
import type { ExpenseReceipt } from '@/lib/db/repositories/expenseReceipts'
import type { ExpenseVendorFinanceDraft, VendorFinanceFileInput } from '@/lib/db/vendorFinanceDocumentService'
import { cn } from '@/lib/utils'

export type ExistingInvoiceView = {
  id: string
  invoiceNumber: string
  amount: number | null
  currencyCode: string | null
}

export type ExistingProofListProps = {
  /** Invoices already linked to the expense. */
  invoices: ExistingInvoiceView[]
  /** Receipts already attached to the expense. */
  receipts: ExpenseReceipt[]
  draft: ExpenseVendorFinanceDraft
  onDraftChange: (draft: ExpenseVendorFinanceDraft) => void
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
}

function toggle(list: readonly string[] | undefined, id: string): string[] {
  const current = list ?? []
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
}

/**
 * Proof that is already on the expense (edit mode). Unlinking an invoice, removing a receipt and
 * replacing a receipt file are STAGED in the draft and applied together by `applyFinanceDraftToExpense`.
 * Unlinking only removes the link; the invoice record itself is left untouched.
 */
export function ExistingProofList({
  invoices,
  receipts,
  draft,
  onDraftChange,
  productionCurrency,
  format,
}: ExistingProofListProps) {
  if (invoices.length === 0 && receipts.length === 0) return null
  const unlinking = new Set(draft.unlinkInvoiceIds ?? [])
  const removing = new Set(draft.removeReceiptIds ?? [])

  const setReplacement = (receiptId: string, file: VendorFinanceFileInput | null) => {
    const next = { ...(draft.replaceReceiptFiles ?? {}) }
    if (file) next[receiptId] = file
    else delete next[receiptId]
    onDraftChange({ ...draft, replaceReceiptFiles: next })
  }

  return (
    <div className="space-y-3" data-testid="existing-proof">
      {invoices.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Linked invoices</p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {invoices.map((inv) => {
              const pending = unlinking.has(inv.id)
              return (
                <li key={inv.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid={`linked-invoice-${inv.id}`}>
                  <span className={cn('font-medium', pending && 'text-muted-foreground line-through')}>
                    {inv.invoiceNumber}
                  </span>
                  {inv.amount != null && (
                    <span className="tabular-nums text-muted-foreground">
                      {format(inv.amount, inv.currencyCode ?? productionCurrency).formatted}
                    </span>
                  )}
                  {pending && <span className="text-xs text-amber-700 dark:text-amber-400">Will be unlinked</span>}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 shrink-0 gap-1 px-2 text-xs"
                    onClick={() => onDraftChange({ ...draft, unlinkInvoiceIds: toggle(draft.unlinkInvoiceIds, inv.id) })}
                    aria-label={pending ? `Keep invoice ${inv.invoiceNumber}` : `Unlink invoice ${inv.invoiceNumber}`}
                  >
                    {pending ? <Undo2 className="size-3.5" /> : <Trash2 className="size-3.5" />}
                    {pending ? 'Keep' : 'Unlink'}
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {receipts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Receipts</p>
          {receipts.map((receipt) => {
            const pending = removing.has(receipt.id)
            const details = [
              receipt.receipt_date,
              receipt.amount != null ? format(receipt.amount, productionCurrency).formatted : null,
              receipt.reference,
            ].filter((p): p is string => Boolean(p))
            return (
              <div key={receipt.id} className="space-y-1" data-testid={`existing-receipt-${receipt.id}`}>
                <div className="flex items-start gap-2">
                  <div className={cn('min-w-0 flex-1', pending && 'opacity-50')}>
                    <VendorFinanceDocumentField
                      label="Receipt"
                      existingDocument={receipt.document}
                      pendingFile={draft.replaceReceiptFiles?.[receipt.id] ?? null}
                      onPendingFileChange={(file) => setReplacement(receipt.id, file)}
                      disabled={pending}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-6 h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                    onClick={() =>
                      onDraftChange({ ...draft, removeReceiptIds: toggle(draft.removeReceiptIds, receipt.id) })
                    }
                    aria-label={pending ? 'Keep receipt' : 'Remove receipt'}
                  >
                    {pending ? <Undo2 className="size-3.5" /> : <Trash2 className="size-3.5" />}
                    {pending ? 'Keep' : 'Remove'}
                  </Button>
                </div>
                {pending && <p className="text-xs text-amber-700 dark:text-amber-400">Will be removed</p>}
                {details.length > 0 && <p className="text-xs text-muted-foreground">{details.join(' · ')}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
