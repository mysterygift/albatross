import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'

import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { ValidatedField } from '@/components/budget/ValidatedField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ExistingProofList, type ExistingProofListProps } from '@/features/budget/vendors/ExistingProofList'
import {
  IncreasePoDialog,
  type IncreasePoTarget,
} from '@/features/budget/vendors/IncreasePoDialog'
import { InvoiceCurrencySelect } from '@/features/budget/vendors/InvoiceCurrencySelect'
import { INVOICE_STATUS_OPTIONS } from '@/features/budget/vendors/invoiceStatusOptions'
import { PoMatchSummary } from '@/features/budget/vendors/PoMatchSummary'
import { PurchaseOrderCombobox } from '@/features/budget/vendors/PurchaseOrderCombobox'
import { VendorFinanceDocumentField } from '@/features/budget/vendors/VendorFinanceDocumentField'
import {
  computePoCommitments,
  toPoCommitmentInput,
  getPoMatchWarnings,
  type PoAllocationInput,
} from '@/lib/budget/vendors/poMatching'
import {
  buildPoMatchSummary,
  buildPoPickerRows,
  commitmentsFromRows,
  suggestSingleOpenPo,
  type PoPickerRow,
} from '@/lib/budget/vendors/poPicker'
import {
  listPoCommitmentLinksByProduction,
  vendorPoCommitmentLinksQueryKey,
} from '@/lib/db/repositories/vendorFinanceLinks'
import {
  listVendorInvoicesByVendorId,
  vendorInvoicesQueryKey,
} from '@/lib/db/repositories/vendorInvoices'
import {
  listVendorPurchaseOrdersByProduction,
  vendorPurchaseOrdersByProductionQueryKey,
} from '@/lib/db/repositories/vendorPurchaseOrders'
import { listVendors } from '@/lib/db/repositories/vendors'
import { formatPoDerivedAmount } from '@/lib/budget/vendors/poCurrency'
import { roundMoney } from '@/lib/money/roundMoney'
import type { VendorInvoiceStatus } from '@/lib/db/types'
import type { ExpenseReceiptDraft, ExpenseVendorFinanceDraft } from '@/lib/db/vendorFinanceDocumentService'

type ProofMode = 'receipt' | 'invoice' | 'none'

export type ExpenseDocumentMatchProps = {
  productionId: string
  /** Vendor on the expense; null = none yet (PO / invoice matching then needs a vendor, receipts do not). */
  vendorId: string | null
  /**
   * Push a vendor back to the host form: picking a PO fills the vendor when it is empty or differs.
   * Required when `allowPoMatching` so a picked PO can set the vendor.
   */
  onVendorChange?: (vendorId: string) => void
  /** Live spend amount; null until the form has a valid amount. */
  expenseAmount: number | null
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
  draft: ExpenseVendorFinanceDraft
  onDraftChange: (draft: ExpenseVendorFinanceDraft) => void
  /**
   * `edit` drives an EXISTING expense: the vendor is fixed, the expense's own links are excluded from
   * committed amounts (needs `expenseId`) and `existingProof` lists the proof already on it. The draft is
   * then the desired end state, applied with `applyFinanceDraftToExpense`.
   */
  mode: 'create' | 'edit'
  expenseId?: string
  /** Edit only: invoices already linked and receipts already attached (changes are staged in the draft). */
  existingProof?: Pick<ExistingProofListProps, 'invoices' | 'receipts'>
  /** False for transaction types with no vendor (labour, allow): only Receipt | None is offered. */
  allowPoMatching?: boolean
}

/**
 * Production-wide PO rows (vendor name, status, amount, committed, remaining) for the combobox.
 * `excludeExpenseId` drops one expense's links so editing it does not double count.
 */
function useProductionPoRows(productionId: string, excludeExpenseId?: string): PoPickerRow[] {
  const enabled = Boolean(productionId)
  const { data: pos = [] } = useQuery({
    queryKey: vendorPurchaseOrdersByProductionQueryKey(productionId),
    queryFn: () => listVendorPurchaseOrdersByProduction(productionId),
    enabled,
  })
  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors', productionId],
    queryFn: () => listVendors(productionId),
    enabled,
  })
  const { data: links = [] } = useQuery({
    queryKey: vendorPoCommitmentLinksQueryKey(productionId),
    queryFn: () => listPoCommitmentLinksByProduction(productionId),
    enabled,
  })

  return useMemo(() => {
    const commitments = computePoCommitments(
      pos.map(toPoCommitmentInput),
      links,
      { excludeExpenseId }
    )
    return buildPoPickerRows(pos, new Map(vendors.map((v) => [v.id, v.company_name])), commitments)
  }, [pos, vendors, links, excludeExpenseId])
}

/**
 * "PO & documents": match a spend to one or more POs and attach proof (receipt or invoice).
 * Fully controlled (`draft` / `onDraftChange`) so Log Spend and the expense edit panel can share it.
 * Mismatch warnings never block saving.
 */
export function ExpenseDocumentMatch({
  productionId,
  vendorId,
  onVendorChange,
  expenseAmount,
  productionCurrency,
  format,
  draft,
  onDraftChange,
  mode,
  expenseId,
  existingProof,
  allowPoMatching = true,
}: ExpenseDocumentMatchProps) {
  const rows = useProductionPoRows(productionId, mode === 'edit' ? expenseId : undefined)
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  const [increaseTarget, setIncreaseTarget] = useState<IncreasePoTarget | null>(null)

  const poVendorId = allowPoMatching ? vendorId : null
  const { data: invoices = [] } = useQuery({
    queryKey: vendorInvoicesQueryKey(productionId, poVendorId ?? ''),
    queryFn: () => listVendorInvoicesByVendorId(productionId, poVendorId!),
    enabled: Boolean(productionId && poVendorId),
  })

  /** A new invoice created from the spend defaults to the production currency and "received". */
  const newUploadInvoice = (): NonNullable<ExpenseVendorFinanceDraft['uploadInvoice']> => ({
    invoice_number: '',
    currency_code: productionCurrency,
    status: 'received',
  })

  const allocations = draft.poAllocations
  const selectedIds = useMemo(() => allocations.map((a) => a.poId), [allocations])
  const multi = allocations.length > 1
  const amount = expenseAmount != null && expenseAmount > 0 ? expenseAmount : null

  // Keep the latest draft / rows for the vendor-change reconciliation below without re-running it.
  const draftRef = useRef(draft)
  const rowsRef = useRef(rows)
  useEffect(() => {
    draftRef.current = draft
    rowsRef.current = rows
  })

  // Vendor changed in the host form: drop POs / invoice that belong to the previous vendor.
  const prevVendorRef = useRef(vendorId)
  useEffect(() => {
    const prev = prevVendorRef.current
    prevVendorRef.current = vendorId
    if (prev === vendorId || !allowPoMatching) return
    const d = draftRef.current
    const vendorOfPo = new Map(rowsRef.current.map((r) => [r.id, r.vendorId]))
    const keep =
      vendorId == null
        ? []
        : d.poAllocations.filter((a) => {
            const v = vendorOfPo.get(a.poId)
            return v == null || v === vendorId
          })
    let next = d
    if (keep.length !== d.poAllocations.length) next = { ...next, poAllocations: keep }
    if (vendorId == null) {
      if (d.invoiceMode !== 'none') {
        next = { ...next, invoiceMode: 'none', existingInvoiceId: null, uploadInvoice: null }
      }
    } else if (prev != null && d.existingInvoiceId) {
      next = { ...next, existingInvoiceId: null }
    }
    if (next !== d) onDraftChange(next)
  }, [vendorId, allowPoMatching, onDraftChange])

  const setAllocations = (poAllocations: PoAllocationInput[], extra?: Partial<ExpenseVendorFinanceDraft>) =>
    onDraftChange({ ...draft, ...extra, poAllocations })

  const removePo = (poId: string) => {
    const remaining = allocations.filter((a) => a.poId !== poId)
    // Back to a single PO: it covers the whole spend again unless the user entered a different amount.
    if (remaining.length === 1 && amount != null && remaining[0]!.allocatedAmount === amount) {
      setAllocations([{ poId: remaining[0]!.poId, allocatedAmount: null }])
    } else {
      setAllocations(remaining)
    }
  }

  const togglePo = (row: PoPickerRow) => {
    if (selectedIds.includes(row.id)) {
      removePo(row.id)
      return
    }
    if (vendorId !== row.vendorId) onVendorChange?.(row.vendorId)
    // POs of a different vendor cannot be matched alongside this one.
    const base = allocations.filter((a) => (rowById.get(a.poId)?.vendorId ?? row.vendorId) === row.vendorId)
    const next: PoAllocationInput[] = [...base, { poId: row.id, allocatedAmount: null }]
    if (next.length === 2 && next[0]!.allocatedAmount == null) {
      // Several POs need explicit allocations: pin the first at the full spend; the user splits it.
      next[0] = { poId: next[0]!.poId, allocatedAmount: amount }
    }
    setAllocations(next)
  }

  const setAllocationAmount = (poId: string, allocatedAmount: number | null) =>
    setAllocations(allocations.map((a) => (a.poId === poId ? { ...a, allocatedAmount } : a)))

  // Invoices that can still be linked: not already linked to this expense (unless being unlinked).
  const existingInvoices = existingProof?.invoices
  const unlinkInvoiceIds = draft.unlinkInvoiceIds
  const linkableInvoices = useMemo(() => {
    const unlinking = new Set(unlinkInvoiceIds ?? [])
    const linked = new Set((existingInvoices ?? []).map((i) => i.id).filter((id) => !unlinking.has(id)))
    return invoices.filter((inv) => !linked.has(inv.id))
  }, [invoices, existingInvoices, unlinkInvoiceIds])

  // Existing invoices that fit the picked POs (unmatched, or already on one of them).
  const selectableInvoices = useMemo(
    () =>
      selectedIds.length === 0
        ? linkableInvoices
        : linkableInvoices.filter((inv) => inv.po_id == null || selectedIds.includes(inv.po_id)),
    [linkableInvoices, selectedIds]
  )

  // ── Proof ────────────────────────────────────────────────────────────────
  const proofMode: ProofMode =
    draft.invoiceMode !== 'none' ? 'invoice' : draft.receipt ? 'receipt' : 'none'

  const handleProofChange = (next: ProofMode) => {
    if (next === proofMode) return
    if (next === 'none') {
      onDraftChange({ ...draft, invoiceMode: 'none', existingInvoiceId: null, uploadInvoice: null, receipt: null })
    } else if (next === 'receipt') {
      onDraftChange({ ...draft, invoiceMode: 'none', existingInvoiceId: null, uploadInvoice: null, receipt: {} })
    } else {
      const invoiceMode = linkableInvoices.length > 0 ? 'existing' : 'upload'
      onDraftChange({
        ...draft,
        receipt: null,
        invoiceMode,
        existingInvoiceId: null,
        uploadInvoice: invoiceMode === 'upload' ? newUploadInvoice() : null,
      })
    }
  }

  const setInvoiceSource = (invoiceMode: 'existing' | 'upload') => {
    if (invoiceMode === draft.invoiceMode) return
    onDraftChange({
      ...draft,
      invoiceMode,
      existingInvoiceId: invoiceMode === 'existing' ? draft.existingInvoiceId : null,
      uploadInvoice: invoiceMode === 'upload' ? draft.uploadInvoice ?? newUploadInvoice() : null,
    })
  }

  const handleExistingInvoice = (invoiceId: string | null) => {
    const inv = invoiceId ? invoices.find((i) => i.id === invoiceId) : null
    // An invoice already on a PO brings that PO along when none is picked yet.
    if (inv?.po_id && allocations.length === 0 && rowById.has(inv.po_id)) {
      onDraftChange({
        ...draft,
        existingInvoiceId: invoiceId,
        poAllocations: [{ poId: inv.po_id, allocatedAmount: null }],
      })
      return
    }
    onDraftChange({ ...draft, existingInvoiceId: invoiceId })
  }

  const setUpload = (patch: Partial<NonNullable<ExpenseVendorFinanceDraft['uploadInvoice']>>) =>
    onDraftChange({
      ...draft,
      uploadInvoice: { ...(draft.uploadInvoice ?? newUploadInvoice()), ...patch },
    })

  const setReceipt = (patch: Partial<ExpenseReceiptDraft>) =>
    onDraftChange({ ...draft, receipt: { ...(draft.receipt ?? {}), ...patch } })

  // ── Live summary + warnings ──────────────────────────────────────────────
  const summaryRows = useMemo(
    () => buildPoMatchSummary({ allocations, rows, expenseAmount: amount ?? 0 }),
    [allocations, rows, amount]
  )
  const allocationByPoId = useMemo(
    () => Object.fromEntries(allocations.map((a) => [a.poId, a.allocatedAmount])),
    [allocations]
  )

  const warnings = useMemo(() => {
    if (!allowPoMatching || amount == null) return []
    const existingInvoice =
      draft.invoiceMode === 'existing' && draft.existingInvoiceId
        ? invoices.find((i) => i.id === draft.existingInvoiceId)
        : null
    const upload = draft.invoiceMode === 'upload' ? draft.uploadInvoice : null
    // The expense amount is in the production currency, so a foreign-currency invoice can't be compared raw.
    const sameCurrency = (code: string | null | undefined) =>
      !code?.trim() || code.trim().toUpperCase() === productionCurrency.toUpperCase()
    const invoice = existingInvoice
      ? {
          id: existingInvoice.id,
          invoiceNumber: existingInvoice.invoice_number,
          amount: sameCurrency(existingInvoice.currency_code) ? existingInvoice.amount : null,
          poId: existingInvoice.po_id,
        }
      : upload?.invoice_number?.trim()
        ? {
            invoiceNumber: upload.invoice_number.trim(),
            amount: sameCurrency(upload.currency_code) ? upload.amount ?? null : null,
            poId: allocations[0]?.poId ?? null,
          }
        : null
    if (allocations.length === 0 && !invoice) return []
    return getPoMatchWarnings({
      expenseAmount: amount,
      allocations,
      commitments: commitmentsFromRows(rows),
      invoice,
    })
  }, [allowPoMatching, amount, allocations, rows, draft, invoices, productionCurrency])

  const handleIncreasePo = (poId: string) => {
    const row = summaryRows.find((r) => r.poId === poId)
    const pickerRow = rowById.get(poId)
    if (!row || !pickerRow || row.poAmount == null) return
    setIncreaseTarget({
      id: poId,
      poNumber: row.poNumber,
      vendorId: pickerRow.vendorId,
      // Amounts here are in the PO's own currency (the increase was converted back via the locked rate).
      amount: row.poAmount,
      suggestedAmount: roundMoney(row.poAmount + row.increaseBy),
      currency_code: row.currency_code,
      exchange_rate: row.exchange_rate,
    })
  }

  const suggestion = allowPoMatching ? suggestSingleOpenPo(rows, vendorId, selectedIds) : null
  const invoiceDisabled = !allowPoMatching || vendorId == null

  const proofOptions: Array<{ value: ProofMode; label: string; disabled?: boolean }> = [
    { value: 'receipt', label: 'Receipt' },
    ...(allowPoMatching
      ? [{ value: 'invoice' as const, label: 'Invoice', disabled: invoiceDisabled && proofMode !== 'invoice' }]
      : []),
    { value: 'none', label: 'None' },
  ]

  return (
    <section
      className="space-y-4 rounded-md border border-border bg-muted/10 px-4 py-3"
      aria-label="PO & documents"
      data-testid="expense-document-match"
    >
      <div>
        <p className="text-sm font-medium">PO &amp; documents</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {mode === 'edit'
            ? 'Change the purchase orders and proof on this spend. Mismatches warn but never block saving.'
            : 'Optional. Match this spend to purchase orders and attach proof. Mismatches warn but never block saving.'}
        </p>
      </div>

      {allowPoMatching && (
        <div className="space-y-2">
          <Label htmlFor="expense-po-combobox">Purchase orders</Label>
          <PurchaseOrderCombobox
            id="expense-po-combobox"
            rows={rows}
            selectedIds={selectedIds}
            onToggle={togglePo}
            vendorId={vendorId}
            vendorLocked={mode === 'edit'}
            productionCurrency={productionCurrency}
            format={format}
          />
          {suggestion && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => togglePo(suggestion)}
            >
              <Sparkles className="size-3.5" />
              Use {suggestion.poNumber}
              {suggestion.remaining != null
                ? ` · ${formatPoDerivedAmount(suggestion, suggestion.remaining, { productionCurrency, format })} left`
                : ''}
            </Button>
          )}
          {vendorId == null && allocations.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Picking a PO fills in the vendor. Or choose a vendor below to narrow the list.
            </p>
          )}
          {multi && (
            <p className="text-xs text-muted-foreground">
              Several POs: enter how much of this spend goes to each.
            </p>
          )}
          <PoMatchSummary
            rows={summaryRows}
            allocationByPoId={allocationByPoId}
            warnings={warnings}
            productionCurrency={productionCurrency}
            format={format}
            multi={multi}
            onAllocationChange={setAllocationAmount}
            onRemove={removePo}
            onIncreasePo={handleIncreasePo}
          />
        </div>
      )}

      {mode === 'edit' && existingProof && (
        <ExistingProofList
          invoices={existingProof.invoices}
          receipts={existingProof.receipts}
          draft={draft}
          onDraftChange={onDraftChange}
          productionCurrency={productionCurrency}
          format={format}
        />
      )}

      <div className="space-y-2">
        <Label>{mode === 'edit' ? 'Add proof' : 'Proof'}</Label>
        <SegmentedControl<ProofMode>
          ariaLabel="Proof of spend"
          size="sm"
          value={proofMode}
          onValueChange={handleProofChange}
          options={proofOptions}
        />
        {allowPoMatching && invoiceDisabled && proofMode !== 'invoice' && (
          <p className="text-xs text-muted-foreground">
            Choose a vendor (or a PO) to attach an invoice. Receipts do not need one.
          </p>
        )}
      </div>

      {proofMode === 'receipt' && (
        <div className="space-y-3" data-testid="receipt-fields">
          <VendorFinanceDocumentField
            label="Receipt file"
            pendingFile={
              draft.receipt?.bytes && draft.receipt.fileName
                ? {
                    fileName: draft.receipt.fileName,
                    bytes: draft.receipt.bytes,
                    mimeType: draft.receipt.mimeType ?? null,
                  }
                : null
            }
            onPendingFileChange={(file) =>
              setReceipt({
                fileName: file?.fileName,
                bytes: file?.bytes,
                mimeType: file?.mimeType ?? null,
              })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="receipt-date">Receipt date</Label>
              <Input
                id="receipt-date"
                type="date"
                value={draft.receipt?.receiptDate ?? ''}
                onChange={(e) => setReceipt({ receiptDate: e.target.value || null })}
              />
            </div>
            <ValidatedField label="Receipt amount" htmlFor="receipt-amount" description="Optional">
              <MoneyAmountInput
                id="receipt-amount"
                mode="positive"
                value={draft.receipt?.receiptAmount ?? null}
                onValueChange={(v) => setReceipt({ receiptAmount: v })}
                placeholder="Optional"
              />
            </ValidatedField>
          </div>
          <div className="space-y-1">
            <Label htmlFor="receipt-reference">Reference</Label>
            <Input
              id="receipt-reference"
              value={draft.receipt?.reference ?? ''}
              onChange={(e) => setReceipt({ reference: e.target.value || null })}
              placeholder="Optional, e.g. till receipt number"
            />
          </div>
        </div>
      )}

      {proofMode === 'invoice' && (
        <div className="space-y-3" data-testid="invoice-fields">
          <SegmentedControl<'existing' | 'upload'>
            ariaLabel="Invoice source"
            size="sm"
            value={draft.invoiceMode === 'upload' ? 'upload' : 'existing'}
            onValueChange={setInvoiceSource}
            options={[
              { value: 'existing', label: 'Existing invoice', disabled: linkableInvoices.length === 0 },
              { value: 'upload', label: 'Upload new' },
            ]}
          />

          {draft.invoiceMode === 'existing' && (
            <div className="space-y-1">
              <Label htmlFor="expense-existing-invoice">Existing invoice</Label>
              <Select
                value={draft.existingInvoiceId ?? 'none'}
                onValueChange={(v) => handleExistingInvoice(v === 'none' ? null : v)}
              >
                <SelectTrigger id="expense-existing-invoice">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select invoice</SelectItem>
                  {selectableInvoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoice_number}
                      {inv.amount != null
                        ? ` · ${format(inv.amount, inv.currency_code ?? productionCurrency).formatted}`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedIds.length > 0 && selectableInvoices.length < linkableInvoices.length && (
                <p className="text-xs text-muted-foreground">
                  Invoices already on a different PO are hidden.
                </p>
              )}
            </div>
          )}

          {draft.invoiceMode === 'upload' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="expense-invoice-number">Invoice number *</Label>
                <Input
                  id="expense-invoice-number"
                  value={draft.uploadInvoice?.invoice_number ?? ''}
                  onChange={(e) => setUpload({ invoice_number: e.target.value })}
                  placeholder="e.g. INV-001"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="expense-invoice-issue">Issue date</Label>
                  <Input
                    id="expense-invoice-issue"
                    type="date"
                    value={draft.uploadInvoice?.issue_date ?? ''}
                    onChange={(e) => setUpload({ issue_date: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="expense-invoice-due">Due date</Label>
                  <Input
                    id="expense-invoice-due"
                    type="date"
                    value={draft.uploadInvoice?.due_date ?? ''}
                    onChange={(e) => setUpload({ due_date: e.target.value || null })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ValidatedField label="Amount" htmlFor="expense-invoice-amount">
                  <MoneyAmountInput
                    id="expense-invoice-amount"
                    mode="positive"
                    placeholder="0"
                    value={draft.uploadInvoice?.amount ?? null}
                    onValueChange={(v) => setUpload({ amount: v })}
                  />
                </ValidatedField>
                <ValidatedField label="Tax (manual)" htmlFor="expense-invoice-tax">
                  <MoneyAmountInput
                    id="expense-invoice-tax"
                    mode="nonNegative"
                    placeholder="0"
                    value={draft.uploadInvoice?.tax ?? null}
                    onValueChange={(v) => setUpload({ tax: v })}
                  />
                </ValidatedField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="expense-invoice-currency">Currency</Label>
                  <InvoiceCurrencySelect
                    id="expense-invoice-currency"
                    value={draft.uploadInvoice?.currency_code}
                    onChange={(code) => setUpload({ currency_code: code })}
                    productionCurrency={productionCurrency}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="expense-invoice-status">Status</Label>
                  <Select
                    value={draft.uploadInvoice?.status ?? 'received'}
                    onValueChange={(v) => setUpload({ status: v as VendorInvoiceStatus })}
                  >
                    <SelectTrigger id="expense-invoice-status" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVOICE_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="expense-invoice-notes">Notes</Label>
                <Input
                  id="expense-invoice-notes"
                  value={draft.uploadInvoice?.notes ?? ''}
                  onChange={(e) => setUpload({ notes: e.target.value || null })}
                  placeholder="Optional"
                />
              </div>
              <VendorFinanceDocumentField
                pendingFile={
                  draft.uploadInvoice?.bytes && draft.uploadInvoice.fileName
                    ? {
                        fileName: draft.uploadInvoice.fileName,
                        bytes: draft.uploadInvoice.bytes,
                        mimeType: draft.uploadInvoice.mimeType ?? null,
                      }
                    : null
                }
                onPendingFileChange={(file) =>
                  setUpload({
                    fileName: file?.fileName,
                    bytes: file?.bytes,
                    mimeType: file?.mimeType ?? null,
                  })
                }
              />
            </div>
          )}
        </div>
      )}

      <IncreasePoDialog
        target={increaseTarget}
        onOpenChange={(open) => !open && setIncreaseTarget(null)}
        productionId={productionId}
        productionCurrency={productionCurrency}
        format={format}
      />
    </section>
  )
}
