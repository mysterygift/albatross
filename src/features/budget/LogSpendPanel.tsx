import { useState, useMemo, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { riskWatchQueryKey } from '@/lib/budget/vendors/riskWatch'
import { typedExpenseRegistry, getTypedExpenseConfig } from '@/lib/budget/transactions/registry'
import { createTypedExpense } from '@/lib/db/repositories/createTypedExpense'
import type { ExpenseTransactionType } from '@/lib/db/types'
import type { BudgetAccount } from '@/lib/db/types'
import type { ExpenseViewContext, FormatAmount, LogSpendEditorHandle } from '@/features/budget/typed-expense-views/types'
import { ExpenseTaxFields, type ExpenseTaxCreditDraft, type ExpenseVatReclaimDraft } from '@/features/budget/ExpenseTaxFields'
import { computeDraftExpenseAmount } from '@/lib/budget/computeDraftExpenseAmount'
import { getProductionBudgetFeatures } from '@/lib/db/repositories/taxCredits'
import { listVatReclaimRates, validateExpenseVatReclaim } from '@/lib/db/repositories/vatReclaim'
import { buildVatReclaimRateMap, computeExpenseVatReclaim } from '@/lib/budget/vatReclaim'
import {
  ExpenseVendorFinanceSection,
  emptyExpenseVendorFinanceDraft,
} from '@/features/budget/vendors/ExpenseVendorFinanceSection'
import { getVendorById } from '@/lib/db/repositories/vendors'
import {
  linkExpenseVendorFinance,
  type ExpenseVendorFinanceDraft,
  isExpenseVendorFinanceDraftEmpty,
} from '@/lib/db/vendorFinanceDocumentService'
import { vendorInvoicesQueryKey } from '@/lib/db/repositories/vendorInvoices'
import { vendorPurchaseOrdersQueryKey } from '@/lib/db/repositories/vendorPurchaseOrders'
import {
  vendorInvoiceLinksByExpenseQueryKey,
  vendorPurchaseOrderLinksByExpenseQueryKey,
} from '@/lib/db/repositories/vendorFinanceLinks'

const emptyVatReclaim = (): ExpenseVatReclaimDraft => ({
  vat_reclaimed_amount: null,
  vat_reclaim_date: null,
  vat_reclaim_reference: null,
})

const TRANSACTION_TYPE_ORDER: ExpenseTransactionType[] = [
  'labour',
  'purchase',
  'rental',
  'allow',
  'deposit',
]

const TRANSACTION_TYPE_HELPER: Record<ExpenseTransactionType, string> = {
  labour: 'Use for crew, cast, or person-based labour costs.',
  purchase: 'Use for buying goods, services, or permits.',
  rental: 'Use for hired kit, services, or packages with a daily, weekly, or flat rate.',
  allow: 'Use for provisional allocations where final cost is not yet known.',
  deposit: 'Use for refundable or non-refundable deposits.',
}

const VENDOR_FINANCE_TRANSACTION_TYPES: ExpenseTransactionType[] = [
  'purchase',
  'rental',
  'deposit',
]

export type LogSpendPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  postableAccounts: BudgetAccount[]
  productionId: string
  revisionId?: string
  productionCurrency: string
  format: FormatAmount
  people: Array<{ id: string; name: string; department: string | null }>
  locations: Array<{ id: string; name: string; booked_status?: string }>
}

export function LogSpendPanel({
  open,
  onOpenChange,
  postableAccounts,
  productionId,
  revisionId,
  productionCurrency,
  format,
  people,
  locations,
}: LogSpendPanelProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedTransactionType, setSelectedTransactionType] =
    useState<ExpenseTransactionType | null>(null)
  const [pendingTypeSwitch, setPendingTypeSwitch] = useState<{
    nextType: ExpenseTransactionType | null
  } | null>(null)
  const [draftByType, setDraftByType] = useState<Partial<Record<ExpenseTransactionType, unknown>>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const saveAndAddAnotherRef = useRef(false)
  const [taxCreditAllocations, setTaxCreditAllocations] = useState<ExpenseTaxCreditDraft[]>([])
  const [vatRatePercent, setVatRatePercent] = useState<number | null>(null)
  const [vatReclaim, setVatReclaim] = useState<ExpenseVatReclaimDraft>(emptyVatReclaim)
  const [vendorFinanceDraft, setVendorFinanceDraft] = useState<ExpenseVendorFinanceDraft>(
    emptyExpenseVendorFinanceDraft()
  )
  const [logSpendVendorId, setLogSpendVendorId] = useState<string | null>(null)

  const editorRef = useRef<LogSpendEditorHandle>(null)
  const queryClient = useQueryClient()

  const { data: budgetFeatures } = useQuery({
    queryKey: ['production-budget-features', productionId],
    queryFn: () => getProductionBudgetFeatures(productionId),
  })

  const { data: reclaimRates = [] } = useQuery({
    queryKey: ['vat-reclaim-rates', productionId],
    queryFn: () => listVatReclaimRates(productionId),
    enabled: budgetFeatures?.vat_tracking_enabled === true,
  })

  const { data: logSpendVendor } = useQuery({
    queryKey: ['vendor', logSpendVendorId],
    queryFn: () => getVendorById(logSpendVendorId!),
    enabled: Boolean(logSpendVendorId),
  })

  useEffect(() => {
    if (budgetFeatures?.vat_tracking_enabled && budgetFeatures.default_vat_rate_percent != null) {
      setVatRatePercent(budgetFeatures.default_vat_rate_percent)
    }
  }, [budgetFeatures?.vat_tracking_enabled, budgetFeatures?.default_vat_rate_percent, open])

  useEffect(() => {
    if (selectedAccountId != null && selectedTransactionType == null) {
      setSelectedTransactionType('allow')
    }
  }, [selectedAccountId, selectedTransactionType])

  const createMutation = useMutation({
    mutationFn: async (variables: {
      productionId: string
      accountId: string
      transactionType: ExpenseTransactionType
      draft: unknown
      date?: string
      vatRatePercent?: number | null
      taxCreditAllocations?: Array<{ tax_credit_scheme_id: string; qualifying_amount: number }>
      vatReclaim?: Parameters<typeof createTypedExpense>[0]['vatReclaim']
      vendorFinanceDraft: ExpenseVendorFinanceDraft
      vendorCompanyName: string
    }) => {
      const expense = await createTypedExpense(variables)
      if (
        !isExpenseVendorFinanceDraftEmpty(variables.vendorFinanceDraft) &&
        expense.vendor_id
      ) {
        await linkExpenseVendorFinance({
          expenseId: expense.id,
          productionId: variables.productionId,
          vendorId: expense.vendor_id,
          vendorCompanyName: variables.vendorCompanyName,
          productionCurrency,
          draft: variables.vendorFinanceDraft,
        })
      }
      return expense
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expenses', variables.productionId] })
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', variables.productionId, revisionId] })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(variables.productionId, revisionId) })
      queryClient.invalidateQueries({ queryKey: ['expense-with-details', data.id] })
      queryClient.invalidateQueries({ queryKey: ['expense-tax-allocations-production', variables.productionId] })
      if (data.vendor_id) {
        queryClient.invalidateQueries({
          queryKey: vendorInvoicesQueryKey(variables.productionId, data.vendor_id),
        })
        queryClient.invalidateQueries({
          queryKey: vendorPurchaseOrdersQueryKey(variables.productionId, data.vendor_id),
        })
        queryClient.invalidateQueries({
          queryKey: vendorInvoiceLinksByExpenseQueryKey(data.id),
        })
        queryClient.invalidateQueries({
          queryKey: vendorPurchaseOrderLinksByExpenseQueryKey(data.id),
        })
      }
      if (variables.transactionType === 'allow') {
        queryClient.invalidateQueries({ queryKey: ['allow-expense-details', variables.productionId] })
      }
      setSaveError(null)
      setVendorFinanceDraft(emptyExpenseVendorFinanceDraft())
      if (saveAndAddAnotherRef.current) {
        setDraftByType((prev) => {
          const next = { ...prev }
          delete next[variables.transactionType]
          return next
        })
        setFormKey((k) => k + 1)
        saveAndAddAnotherRef.current = false
      } else {
        setSelectedAccountId(null)
        setSelectedTransactionType(null)
        setDraftByType({})
        setPendingTypeSwitch(null)
        onOpenChange(false)
      }
    },
    onError: (err: Error) => {
      setSaveError(err.message)
      saveAndAddAnotherRef.current = false
    },
  })

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedAccountId(null)
      setSelectedTransactionType(null)
      setPendingTypeSwitch(null)
      setDraftByType({})
      setPendingTypeSwitch(null)
      setTaxCreditAllocations([])
      setVatRatePercent(null)
      setVatReclaim(emptyVatReclaim())
      setVendorFinanceDraft(emptyExpenseVendorFinanceDraft())
      setLogSpendVendorId(null)
      setSaveError(null)
    }
    onOpenChange(next)
  }

  const transactionTypeOptions = useMemo(
    () =>
      TRANSACTION_TYPE_ORDER.map((type) => ({
        type,
        label: typedExpenseRegistry[type].label,
      })),
    []
  )

  const config = selectedTransactionType
    ? getTypedExpenseConfig(selectedTransactionType)
    : null
  const selectedAccount = selectedAccountId
    ? postableAccounts.find((a) => a.id === selectedAccountId) ?? null
    : null
  const hasEditableType = Boolean(
    config?.editable && config?.EditComponent && selectedTransactionType
  )
  const typeHasForm =
    selectedTransactionType &&
    getTypedExpenseConfig(selectedTransactionType)?.editable &&
    getTypedExpenseConfig(selectedTransactionType)?.EditComponent

  const viewContext: ExpenseViewContext = useMemo(
    () => ({
      productionId,
      productionCurrency,
      format,
      people,
      personById: new Map(people.map((p) => [p.id, { id: p.id, name: p.name, department: p.department }])),
      locations,
      locationById: new Map(
        locations.map((l) => [l.id, { id: l.id, name: l.name, booked_status: l.booked_status }])
      ),
      account: selectedAccount
        ? { id: selectedAccount.id, code: selectedAccount.code, name: selectedAccount.name }
        : null,
      defaultCurrencyCode: null,
    }),
    [
      productionId,
      productionCurrency,
      format,
      people,
      locations,
      selectedAccount?.id,
      selectedAccount?.code,
      selectedAccount?.name,
    ]
  )

  const canSave = Boolean(selectedAccountId && selectedTransactionType && hasEditableType)
  const isSaving = createMutation.isPending

  const handleSave = (addAnother: boolean) => {
    if (!canSave || isSaving) return
    saveAndAddAnotherRef.current = addAnother
    if (hasEditableType) {
      editorRef.current?.submit()
    }
  }

  const handleCancel = () => {
    handleOpenChange(false)
  }

  const handleTransactionTypeChange = (value: string) => {
    const nextType = value ? (value as ExpenseTransactionType) : null
    if (nextType === selectedTransactionType) return
    if (typeHasForm && selectedTransactionType) {
      setPendingTypeSwitch({ nextType })
      return
    }
    setLogSpendVendorId(null)
    setVendorFinanceDraft(emptyExpenseVendorFinanceDraft())
    setSelectedTransactionType(nextType)
  }

  const confirmTypeSwitch = () => {
    if (pendingTypeSwitch == null) return
    setLogSpendVendorId(null)
    setVendorFinanceDraft(emptyExpenseVendorFinanceDraft())
    setSelectedTransactionType(pendingTypeSwitch.nextType)
    setPendingTypeSwitch(null)
  }

  const handleEditorSave = (details: unknown) => {
    if (!selectedTransactionType || !selectedAccountId) return
    setSaveError(null)
    const amount = computeDraftExpenseAmount(selectedTransactionType, details)
    const vatOn = budgetFeatures?.vat_tracking_enabled === true
    if (vatOn && amount != null && vatReclaim.vat_reclaimed_amount != null) {
      try {
        const breakdown = computeExpenseVatReclaim(
          {
            id: 'draft',
            amount,
            vat_rate_percent: vatRatePercent,
            transaction_type: selectedTransactionType,
            vat_reclaimed_amount: vatReclaim.vat_reclaimed_amount,
          },
          buildVatReclaimRateMap(reclaimRates)
        )
        validateExpenseVatReclaim(breakdown.vatReclaimable, vatReclaim)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Invalid VAT reclaim')
        return
      }
    }
    if (!isExpenseVendorFinanceDraftEmpty(vendorFinanceDraft)) {
      if (
        vendorFinanceDraft.invoiceMode === 'upload' &&
        !vendorFinanceDraft.uploadInvoice?.invoice_number?.trim()
      ) {
        setSaveError('Invoice number is required when uploading a new invoice')
        return
      }
      if (
        vendorFinanceDraft.invoiceMode === 'existing' &&
        !vendorFinanceDraft.existingInvoiceId
      ) {
        setSaveError('Select an existing invoice or choose a different invoice option')
        return
      }
    }
    setDraftByType((prev) => ({ ...prev, [selectedTransactionType]: details }))
    createMutation.mutate({
      productionId,
      accountId: selectedAccountId,
      transactionType: selectedTransactionType,
      draft: details,
      date: new Date().toISOString().slice(0, 10),
      vatRatePercent: vatOn ? vatRatePercent : null,
      taxCreditAllocations: budgetFeatures?.tax_credits_enabled ? taxCreditAllocations : [],
      vatReclaim: vatOn ? vatReclaim : undefined,
      vendorFinanceDraft,
      vendorCompanyName: logSpendVendor?.company_name ?? 'Vendor',
    })
  }

  const currentDraft =
    selectedTransactionType && draftByType[selectedTransactionType] != null
      ? draftByType[selectedTransactionType]
      : null
  const previewAmount =
    selectedTransactionType && currentDraft != null
      ? computeDraftExpenseAmount(selectedTransactionType, currentDraft)
      : null

  const detailsJsonForType =
    selectedTransactionType && draftByType[selectedTransactionType] != null
      ? JSON.stringify(draftByType[selectedTransactionType])
      : null

  const pendingTypeLabel =
    pendingTypeSwitch?.nextType != null
      ? typedExpenseRegistry[pendingTypeSwitch.nextType].label
      : null

  const showVendorFinanceSection = Boolean(
    logSpendVendorId &&
      selectedTransactionType &&
      VENDOR_FINANCE_TRANSACTION_TYPES.includes(selectedTransactionType)
  )

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[540px] flex-col gap-0 p-0 sm:max-w-[540px]">
          <DialogHeader className="border-b border-border px-6 py-4 shrink-0">
            <DialogTitle>Log Spend</DialogTitle>
            <DialogDescription>
              Create a typed spend entry for this production
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto flex flex-col">
            {/* Context section */}
            <section className="px-6 pt-5 pb-4 space-y-5 border-b border-border">
              <div className="space-y-2">
                <Label htmlFor="log-spend-account" className="text-muted-foreground text-xs uppercase tracking-wider">
                  Account
                </Label>
                <Select
                  value={selectedAccountId ?? ''}
                  onValueChange={(value) => setSelectedAccountId(value || null)}
                >
                  <SelectTrigger id="log-spend-account" className="h-9">
                    <SelectValue placeholder="Select a postable account" />
                  </SelectTrigger>
                  <SelectContent>
                    {postableAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedAccount && (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 mt-2">
                    <p className="text-sm font-medium">
                      {selectedAccount.code} — {selectedAccount.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Logging spend against this budget line
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="log-spend-type" className="text-muted-foreground text-xs uppercase tracking-wider">
                  Transaction type
                </Label>
                <Select
                  value={selectedTransactionType ?? ''}
                  onValueChange={handleTransactionTypeChange}
                >
                  <SelectTrigger id="log-spend-type" className="h-9">
                    <SelectValue placeholder="Choose a transaction type" />
                  </SelectTrigger>
                  <SelectContent>
                    {transactionTypeOptions.map(({ type, label }) => (
                      <SelectItem key={type} value={type}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTransactionType && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {TRANSACTION_TYPE_HELPER[selectedTransactionType]}
                  </p>
                )}
              </div>
            </section>

            {/* Form section */}
            <section className="px-6 py-5 flex-1 min-h-0">
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Details
              </Label>
              <div className="mt-3">
                {!selectedTransactionType ? (
                  <div className="rounded-md border border-border bg-muted/20 min-h-[140px] flex items-center justify-center p-6">
                    <p className="text-sm text-muted-foreground text-center">
                      Choose a transaction type to continue.
                    </p>
                  </div>
                ) : config?.editable && config?.EditComponent ? (
                  <div key={formKey} className="rounded-md border border-border bg-background p-4">
                    <config.EditComponent
                      expenseId="create"
                      detailsJson={detailsJsonForType}
                      onSave={handleEditorSave}
                      onCancel={handleCancel}
                      isSaving={isSaving}
                      context={viewContext}
                      hideFooter
                      editorRef={editorRef}
                      onVendorIdChange={setLogSpendVendorId}
                    />
                  </div>
                ) : null}
              </div>

              {showVendorFinanceSection && logSpendVendorId && (
                <div className="mt-4">
                  <ExpenseVendorFinanceSection
                    productionId={productionId}
                    vendorId={logSpendVendorId}
                    vendorCompanyName={logSpendVendor?.company_name ?? 'Vendor'}
                    productionCurrency={productionCurrency}
                    mode="create"
                    format={format}
                    draft={vendorFinanceDraft}
                    onDraftChange={setVendorFinanceDraft}
                  />
                </div>
              )}

              {(budgetFeatures?.tax_credits_enabled || budgetFeatures?.vat_tracking_enabled) && (
                <div className="mt-4">
                  <ExpenseTaxFields
                    productionId={productionId}
                    expenseAmount={previewAmount}
                    transactionType={selectedTransactionType}
                    value={taxCreditAllocations}
                    onChange={setTaxCreditAllocations}
                    vatRatePercent={vatRatePercent}
                    onVatRateChange={setVatRatePercent}
                    vatReclaim={vatReclaim}
                    onVatReclaimChange={setVatReclaim}
                  />
                </div>
              )}
            </section>

            {saveError && (
              <div className="px-6 pb-2">
                <p className="text-sm text-destructive" role="alert">
                  {saveError}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4 flex-row gap-2 sm:gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSave(true)}
              disabled={!canSave || isSaving}
            >
              {isSaving ? 'Saving…' : 'Save & Add Another'}
            </Button>
            <Button
              type="button"
              onClick={() => handleSave(false)}
              disabled={!canSave || isSaving}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingTypeSwitch != null}
        onOpenChange={(next) => !next && setPendingTypeSwitch(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change transaction type?</DialogTitle>
            <DialogDescription>
              {pendingTypeLabel != null
                ? `Switching to ${pendingTypeLabel} will discard the current form values. Continue?`
                : 'Switching type will discard the current form values. Continue?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingTypeSwitch(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={confirmTypeSwitch}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
