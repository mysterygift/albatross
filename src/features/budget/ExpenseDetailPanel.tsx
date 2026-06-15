import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getTypedExpenseConfig } from '@/lib/budget/transactions/registry'
import type { ExpenseWithDetails } from '@/lib/db/repositories/expenseTransactions'
import type { ExpenseViewContext } from '@/features/budget/typed-expense-views/types'
import {
  ExpenseDetailHeader,
  ExpenseVendorSummary,
  ExpenseDetailMetaGrid,
  ExpenseDetailMetaRow,
  ExpenseTypedSection,
  ExpenseParseErrorCard,
} from '@/features/budget/expense-shared'
import { ExpenseTaxFields, type ExpenseTaxCreditDraft, type ExpenseVatReclaimDraft } from '@/features/budget/ExpenseTaxFields'
import { ExpenseTaxReadSection } from '@/features/budget/ExpenseTaxReadSection'
import {
  getProductionBudgetFeatures,
  listAllocationsByExpense,
  updateExpenseTaxVatAndAllocations,
} from '@/lib/db/repositories/taxCredits'
import { listVatReclaimRates } from '@/lib/db/repositories/vatReclaim'
import { buildVatReclaimRateMap, computeExpenseVatReclaim } from '@/lib/budget/vatReclaim'

export type ExpenseDetailPanelProps = {
  expenseWithDetails: ExpenseWithDetails | null | undefined
  isLoading: boolean
  productionId: string
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
  defaultCurrencyCode: string | null
  people: Array<{ id: string; name: string; department: string | null }>
  locations: Array<{ id: string; name: string; booked_status?: string }>
  onSaved: () => void
  onSaveRequest: (args: { expenseId: string; details: unknown; type: string }) => Promise<void>
  /** Optional: related line items in same account + same type (informational only). */
  relatedLineItemsInAccount?: { count: number; totalEstimated: number; typeLabel: string }
  /** When set, shows Delete Expense and calls this on confirm. */
  onDeleteRequest?: (expenseId: string) => Promise<void>
  /** When true, confirmation dialog shows that allocations linked to this expense will also be removed. */
  hasReconciliationLinks?: boolean
}

export function ExpenseDetailPanel({
  expenseWithDetails,
  isLoading,
  productionId,
  productionCurrency,
  format,
  defaultCurrencyCode,
  people,
  locations,
  onSaved,
  onSaveRequest,
  relatedLineItemsInAccount,
  onDeleteRequest,
  hasReconciliationLinks,
}: ExpenseDetailPanelProps) {
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [taxAllocations, setTaxAllocations] = useState<ExpenseTaxCreditDraft[]>([])
  const [vatRatePercent, setVatRatePercent] = useState<number | null>(null)
  const [vatReclaim, setVatReclaim] = useState<ExpenseVatReclaimDraft>({
    vat_reclaimed_amount: null,
    vat_reclaim_date: null,
    vat_reclaim_reference: null,
  })

  const { data: budgetFeatures } = useQuery({
    queryKey: ['production-budget-features', productionId],
    queryFn: () => getProductionBudgetFeatures(productionId),
  })

  const expenseId = expenseWithDetails?.expense.id
  const { data: expenseAllocations = [] } = useQuery({
    queryKey: ['expense-tax-allocations', expenseId],
    queryFn: () => listAllocationsByExpense(expenseId!),
    enabled: !!expenseId,
  })

  const { data: reclaimRates = [] } = useQuery({
    queryKey: ['vat-reclaim-rates', productionId],
    queryFn: () => listVatReclaimRates(productionId),
    enabled: budgetFeatures?.vat_tracking_enabled === true,
  })

  useEffect(() => {
    if (!expenseWithDetails) return
    const exp = expenseWithDetails.expense
    setVatRatePercent(exp.vat_rate_percent)
    setVatReclaim({
      vat_reclaimed_amount: exp.vat_reclaimed_amount,
      vat_reclaim_date: exp.vat_reclaim_date,
      vat_reclaim_reference: exp.vat_reclaim_reference,
    })
    setTaxAllocations(
      expenseAllocations.map((a) => ({
        tax_credit_scheme_id: a.tax_credit_scheme_id,
        qualifying_amount: a.qualifying_amount,
      }))
    )
  }, [
    expenseWithDetails?.expense.id,
    expenseWithDetails?.expense.vat_rate_percent,
    expenseWithDetails?.expense.vat_reclaimed_amount,
    expenseWithDetails?.expense.vat_reclaim_date,
    expenseWithDetails?.expense.vat_reclaim_reference,
    expenseAllocations,
  ])

  const saveTaxFields = async (expenseAmount: number) => {
    if (!expenseWithDetails) return
    const taxOn = budgetFeatures?.tax_credits_enabled === true
    const vatOn = budgetFeatures?.vat_tracking_enabled === true
    if (!taxOn && !vatOn) return
    const breakdown = vatOn
      ? computeExpenseVatReclaim(
          {
            ...expenseWithDetails.expense,
            amount: expenseAmount,
            vat_rate_percent: vatOn ? vatRatePercent : null,
            vat_reclaimed_amount: vatReclaim.vat_reclaimed_amount,
          },
          buildVatReclaimRateMap(reclaimRates)
        )
      : null
    await updateExpenseTaxVatAndAllocations(
      expenseWithDetails.expense.id,
      expenseAmount,
      vatOn ? vatRatePercent : null,
      taxOn ? taxAllocations : [],
      vatOn ? vatReclaim : undefined,
      breakdown?.vatReclaimable
    )
  }

  const config = expenseWithDetails
    ? getTypedExpenseConfig(expenseWithDetails.expense.transaction_type)
    : null
  const typedEditable = config?.editable === true && config?.EditComponent != null
  const editable = typedEditable
  const transactionTypeLabel =
    config?.label ?? (expenseWithDetails?.expense.transaction_type == null ? 'Allow (legacy)' : '—')

  const viewContext: ExpenseViewContext = useMemo(
    () => ({
      productionId,
      productionCurrency,
      format,
      defaultCurrencyCode,
      people,
      personById: new Map(people.map((p) => [p.id, p])),
      locations,
      locationById: new Map(locations.map((l) => [l.id, { id: l.id, name: l.name, booked_status: l.booked_status }])),
      vendor: expenseWithDetails?.vendor ?? null,
      expense: expenseWithDetails?.expense,
      account: expenseWithDetails?.account ?? null,
    }),
    [
      productionId,
      productionCurrency,
      format,
      defaultCurrencyCode,
      people,
      locations,
      expenseWithDetails?.vendor,
      expenseWithDetails?.expense,
      expenseWithDetails?.account,
    ]
  )

  const accountLabel = expenseWithDetails?.account
    ? `${expenseWithDetails.account.code} — ${expenseWithDetails.account.name}`
    : 'Uncoded spend'

  const handleSave = async (details: unknown) => {
    if (!expenseWithDetails || !config) return
    setSaveError(null)
    setIsSaving(true)
    try {
      await onSaveRequest({
        expenseId: expenseWithDetails.expense.id,
        details,
        type: config.type,
      })
      await saveTaxFields(expenseWithDetails.expense.amount)
      onSaved()
      setMode('read')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteClick = () => {
    setDeleteError(null)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!expenseWithDetails || !onDeleteRequest) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await onDeleteRequest(expenseWithDetails.expense.id)
      setDeleteConfirmOpen(false)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!expenseWithDetails) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Expense not found.</p>
      </div>
    )
  }

  const { expense, transaction_details } = expenseWithDetails

  let typedContent: ReactNode
  if (mode === 'edit' && config?.EditComponent && typedEditable) {
    const EditComponent = config.EditComponent
    typedContent = (
      <EditComponent
        expenseId={expense.id}
        detailsJson={transaction_details?.details_json ?? null}
        onSave={handleSave}
        onCancel={() => setMode('read')}
        isSaving={isSaving}
        context={viewContext}
      />
    )
  } else if (config && transaction_details) {
    const parsed = config.parse(transaction_details.details_json)
    if (!parsed.ok) {
      typedContent = (
        <ExpenseParseErrorCard
          message={`${config.label} details could not be parsed (${parsed.error}). Showing raw JSON.`}
          rawJson={transaction_details.details_json}
        />
      )
    } else {
      const ReadComponent = config.ReadComponent
      typedContent = <ReadComponent parsed={parsed.value} context={viewContext} />
    }
  } else if (transaction_details) {
    typedContent = (
      <ExpenseParseErrorCard
        message="Unknown transaction type. Showing raw JSON."
        rawJson={transaction_details.details_json}
      />
    )
  } else if (expense.transaction_type == null) {
    typedContent = (
      <p className="text-sm text-muted-foreground">
        This spend uses a legacy untyped classification. Open the Budget page and convert untyped
        entries to Allow to edit typed details.
      </p>
    )
  } else {
    typedContent = (
      <p className="text-sm text-muted-foreground">
        This spend does not yet use a typed transaction format.
      </p>
    )
  }

  return (
    <>
      <SheetHeader className="border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <SheetTitle>Expense details</SheetTitle>
          <div className="flex items-center gap-2">
            {onDeleteRequest && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8"
                onClick={handleDeleteClick}
              >
                Delete Expense
              </Button>
            )}
            {editable && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setMode((m) => (m === 'read' ? 'edit' : 'read'))}
                title={
                  !typedEditable
                    ? expense.transaction_type == null
                      ? 'Convert legacy spend to Allow on the Budget page before editing typed details'
                      : 'Editing is not yet available for this transaction type.'
                    : undefined
                }
              >
                {mode === 'edit' ? 'View' : 'Edit'}
              </Button>
            )}
          </div>
        </div>
      </SheetHeader>
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent showCloseButton={!isDeleting}>
          <DialogHeader>
            <DialogTitle>Delete this expense?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <p>This will remove the expense from the budget and update totals.</p>
                {hasReconciliationLinks && (
                  <p>This will also remove any matching allocations linked to this expense.</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive" role="alert">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => {
                if (!isDeleting) {
                  setDeleteConfirmOpen(false)
                  setDeleteError(null)
                }
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="p-4 space-y-4 overflow-auto">
        <ExpenseDetailHeader
          expense={expense}
          accountLabel={accountLabel}
          formatAmount={format}
          productionCurrency={productionCurrency}
          transactionTypeLabel={transactionTypeLabel}
        />
        <ExpenseDetailMetaGrid>
          <ExpenseDetailMetaRow
            label="Transaction type"
            value={transactionTypeLabel}
          />
          <ExpenseDetailMetaRow
            label="Vendor"
            value={
              <ExpenseVendorSummary
                vendor={expenseWithDetails.vendor}
                legacyVendorString={expense.vendor}
              />
            }
          />
          <ExpenseDetailMetaRow label="Expense type" value={expense.expense_type} />
          <ExpenseDetailMetaRow
            label="Notes"
            value={<span className="whitespace-pre-wrap">{expense.notes ? expense.notes : '—'}</span>}
          />
        </ExpenseDetailMetaGrid>
        {relatedLineItemsInAccount && relatedLineItemsInAccount.count > 0 && (
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">Related line items in this account</p>
            <p className="text-sm mt-0.5">
              {relatedLineItemsInAccount.count} {relatedLineItemsInAccount.typeLabel.toLowerCase()} line item
              {relatedLineItemsInAccount.count !== 1 ? 's' : ''} · {format(relatedLineItemsInAccount.totalEstimated, productionCurrency).formatted} estimated
            </p>
          </div>
        )}
        {mode === 'read' && (
          <ExpenseTaxReadSection
            productionId={productionId}
            expense={expense}
            allocations={expenseAllocations}
          />
        )}
        {mode === 'edit' &&
          (budgetFeatures?.tax_credits_enabled || budgetFeatures?.vat_tracking_enabled) && (
            <ExpenseTaxFields
              productionId={productionId}
              expenseAmount={expense.amount}
              transactionType={expense.transaction_type}
              value={taxAllocations}
              onChange={setTaxAllocations}
              vatRatePercent={vatRatePercent}
              onVatRateChange={setVatRatePercent}
              vatReclaim={vatReclaim}
              onVatReclaimChange={setVatReclaim}
            />
          )}
        <ExpenseTypedSection>{typedContent}</ExpenseTypedSection>
        {saveError && (
          <p className="text-sm text-destructive">{saveError}</p>
        )}
      </div>
    </>
  )
}
