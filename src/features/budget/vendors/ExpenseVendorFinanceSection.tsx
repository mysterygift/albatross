import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ExternalLink, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ValidatedField } from '@/components/budget/ValidatedField'
import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { entityDocumentsQueryKey } from '@/lib/documents/pickAndPersistProductionDocument'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { listDocumentsByEntity } from '@/lib/db/repositories/document'
import {
  deleteVendorInvoiceExpenseLink,
  deleteVendorPurchaseOrderExpenseLink,
  listInvoiceLinksByExpenseId,
  listPurchaseOrderLinksByExpenseId,
  vendorInvoiceLinksByExpenseQueryKey,
  vendorPurchaseOrderLinksByExpenseQueryKey,
} from '@/lib/db/repositories/vendorFinanceLinks'
import {
  getVendorInvoiceById,
  listVendorInvoicesByVendorId,
  vendorInvoicesQueryKey,
} from '@/lib/db/repositories/vendorInvoices'
import {
  getVendorPurchaseOrderById,
  listVendorPurchaseOrdersByVendorId,
  vendorPurchaseOrdersQueryKey,
} from '@/lib/db/repositories/vendorPurchaseOrders'
import {
  createInvoiceAndLinkExpense,
  linkExistingExpenseToInvoice,
  linkExistingExpenseToPurchaseOrder,
  type ExpenseVendorFinanceDraft,
} from '@/lib/db/vendorFinanceDocumentService'
import type { VendorInvoice, VendorPurchaseOrder } from '@/lib/db/types'
import { VendorFinanceDocumentField } from '@/features/budget/vendors/VendorFinanceDocumentField'

export type ExpenseVendorFinanceSectionProps = {
  productionId: string
  vendorId: string
  vendorCompanyName: string
  productionCurrency: string
  mode: 'create' | 'edit'
  expenseId?: string
  format: (amount: number, currency: string) => { formatted: string }
  /** Controlled draft for create mode (Log Spend). */
  draft?: ExpenseVendorFinanceDraft
  onDraftChange?: (draft: ExpenseVendorFinanceDraft) => void
}

export const emptyExpenseVendorFinanceDraft = (): ExpenseVendorFinanceDraft => ({
  poId: null,
  invoiceMode: 'none',
  existingInvoiceId: null,
  uploadInvoice: null,
})

export function ExpenseVendorFinanceSection({
  productionId,
  vendorId,
  vendorCompanyName,
  productionCurrency,
  mode,
  expenseId,
  format,
  draft: controlledDraft,
  onDraftChange,
}: ExpenseVendorFinanceSectionProps) {
  const queryClient = useQueryClient()
  const [internalDraft, setInternalDraft] = useState<ExpenseVendorFinanceDraft>(
    emptyExpenseVendorFinanceDraft
  )
  const draft = controlledDraft ?? internalDraft
  const setDraft = onDraftChange ?? setInternalDraft

  const [addInvoiceMode, setAddInvoiceMode] = useState<'existing' | 'upload'>('existing')
  const [addExistingInvoiceId, setAddExistingInvoiceId] = useState<string | null>(null)
  const [addPoId, setAddPoId] = useState<string | null>(null)
  const [uploadInvoiceNumber, setUploadInvoiceNumber] = useState('')
  const [uploadIssueDate, setUploadIssueDate] = useState('')
  const [uploadDueDate, setUploadDueDate] = useState('')
  const [uploadAmount, setUploadAmount] = useState('')
  const [uploadFile, setUploadFile] = useState<{
    fileName: string
    bytes: Uint8Array
    mimeType: string | null
  } | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: vendorPurchaseOrdersQueryKey(productionId, vendorId),
    queryFn: () => listVendorPurchaseOrdersByVendorId(productionId, vendorId),
    enabled: Boolean(productionId && vendorId),
  })

  const { data: invoices = [] } = useQuery({
    queryKey: vendorInvoicesQueryKey(productionId, vendorId),
    queryFn: () => listVendorInvoicesByVendorId(productionId, vendorId),
    enabled: Boolean(productionId && vendorId),
  })

  const { data: invoiceLinks = [] } = useQuery({
    queryKey: vendorInvoiceLinksByExpenseQueryKey(expenseId ?? ''),
    queryFn: () => listInvoiceLinksByExpenseId(expenseId!),
    enabled: mode === 'edit' && Boolean(expenseId),
  })

  const { data: poLinks = [] } = useQuery({
    queryKey: vendorPurchaseOrderLinksByExpenseQueryKey(expenseId ?? ''),
    queryFn: () => listPurchaseOrderLinksByExpenseId(expenseId!),
    enabled: mode === 'edit' && Boolean(expenseId),
  })

  const linkedInvoiceIds = useMemo(() => invoiceLinks.map((l) => l.vendor_invoice_id), [invoiceLinks])
  const linkedPoIds = useMemo(() => poLinks.map((l) => l.vendor_purchase_order_id), [poLinks])

  const { data: linkedInvoices = [] } = useQuery({
    queryKey: ['linked-vendor-invoices', linkedInvoiceIds.join(',')],
    queryFn: async () => {
      const results: VendorInvoice[] = []
      for (const id of linkedInvoiceIds) {
        const inv = await getVendorInvoiceById(id)
        if (inv) results.push(inv)
      }
      return results
    },
    enabled: mode === 'edit' && linkedInvoiceIds.length > 0,
  })

  const { data: linkedPos = [] } = useQuery({
    queryKey: ['linked-vendor-pos', linkedPoIds.join(',')],
    queryFn: async () => {
      const results: VendorPurchaseOrder[] = []
      for (const id of linkedPoIds) {
        const po = await getVendorPurchaseOrderById(id)
        if (po) results.push(po)
      }
      return results
    },
    enabled: mode === 'edit' && linkedPoIds.length > 0,
  })

  const filteredInvoices = useMemo(() => {
    if (mode === 'create' && draft.poId) {
      return invoices.filter((inv) => inv.po_id === draft.poId || inv.po_id == null)
    }
    return invoices
  }, [invoices, draft.poId, mode])

  const addFilteredInvoices = useMemo(() => {
    if (addPoId) {
      return invoices.filter(
        (inv) =>
          !linkedInvoiceIds.includes(inv.id) &&
          (inv.po_id === addPoId || inv.po_id == null)
      )
    }
    return invoices.filter((inv) => !linkedInvoiceIds.includes(inv.id))
  }, [invoices, addPoId, linkedInvoiceIds])

  useEffect(() => {
    if (mode === 'create') {
      setDraft(emptyExpenseVendorFinanceDraft())
    }
  }, [vendorId, mode, setDraft])

  useEffect(() => {
    if (mode !== 'create') return
    if (draft.invoiceMode === 'existing' && draft.existingInvoiceId) {
      const inv = invoices.find((i) => i.id === draft.existingInvoiceId)
      if (inv?.po_id && !draft.poId) {
        setDraft({ ...draft, poId: inv.po_id })
      }
    }
  }, [draft, invoices, mode, setDraft])

  const unlinkInvoiceMutation = useMutation({
    mutationFn: ({ invoiceId, expId }: { invoiceId: string; expId: string }) =>
      deleteVendorInvoiceExpenseLink(invoiceId, expId),
    onSuccess: () => {
      if (expenseId) {
        queryClient.invalidateQueries({
          queryKey: vendorInvoiceLinksByExpenseQueryKey(expenseId),
        })
      }
    },
  })

  const unlinkPoMutation = useMutation({
    mutationFn: ({ poId, expId }: { poId: string; expId: string }) =>
      deleteVendorPurchaseOrderExpenseLink(poId, expId),
    onSuccess: () => {
      if (expenseId) {
        queryClient.invalidateQueries({
          queryKey: vendorPurchaseOrderLinksByExpenseQueryKey(expenseId),
        })
      }
    },
  })

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!expenseId) throw new Error('Expense id required')
      setLinkError(null)
      if (addInvoiceMode === 'upload') {
        if (!uploadInvoiceNumber.trim()) throw new Error('Invoice number is required')
        await createInvoiceAndLinkExpense(
          {
            production_id: productionId,
            vendor_id: vendorId,
            invoice_number: uploadInvoiceNumber.trim(),
            issue_date: uploadIssueDate.trim() || null,
            due_date: uploadDueDate.trim() || null,
            amount: uploadAmount.trim() ? Number(uploadAmount) : null,
            currency_code: productionCurrency,
            status: 'received',
            po_id: addPoId,
          },
          vendorCompanyName,
          expenseId,
          uploadFile
            ? {
                fileName: uploadFile.fileName,
                bytes: uploadFile.bytes,
                mimeType: uploadFile.mimeType,
              }
            : null
        )
      } else if (addExistingInvoiceId) {
        await linkExistingExpenseToInvoice(expenseId, addExistingInvoiceId, addPoId)
      } else if (addPoId) {
        await linkExistingExpenseToPurchaseOrder(expenseId, addPoId)
      } else {
        throw new Error('Select an invoice or purchase order to link')
      }
    },
    onSuccess: () => {
      if (expenseId) {
        queryClient.invalidateQueries({
          queryKey: vendorInvoiceLinksByExpenseQueryKey(expenseId),
        })
        queryClient.invalidateQueries({
          queryKey: vendorPurchaseOrderLinksByExpenseQueryKey(expenseId),
        })
      }
      queryClient.invalidateQueries({
        queryKey: vendorInvoicesQueryKey(productionId, vendorId),
      })
      setAddExistingInvoiceId(null)
      setAddPoId(null)
      setUploadInvoiceNumber('')
      setUploadIssueDate('')
      setUploadDueDate('')
      setUploadAmount('')
      setUploadFile(null)
    },
    onError: (err: Error) => setLinkError(err.message),
  })

  const handleInvoiceModeChange = (value: string) => {
    const invoiceMode = value as ExpenseVendorFinanceDraft['invoiceMode']
    setDraft({
      ...draft,
      invoiceMode,
      existingInvoiceId: invoiceMode === 'existing' ? draft.existingInvoiceId : null,
      uploadInvoice:
        invoiceMode === 'upload'
          ? draft.uploadInvoice ?? { invoice_number: '' }
          : null,
    })
  }

  if (mode === 'create') {
    return (
      <section className="space-y-4 rounded-md border border-border bg-muted/10 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Vendor finance</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Optional — cross-check invoices and POs yourself.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="log-spend-po">Purchase order</Label>
          <Select
            value={draft.poId ?? 'none'}
            onValueChange={(v) =>
              setDraft({
                ...draft,
                poId: v === 'none' ? null : v,
                existingInvoiceId:
                  draft.invoiceMode === 'existing' && draft.existingInvoiceId
                    ? (filteredInvoices.some((i) => i.id === draft.existingInvoiceId)
                        ? draft.existingInvoiceId
                        : null)
                    : draft.existingInvoiceId,
              })
            }
          >
            <SelectTrigger id="log-spend-po">
              <SelectValue placeholder="No PO" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No PO</SelectItem>
              {purchaseOrders.map((po) => (
                <SelectItem key={po.id} value={po.id}>
                  {po.po_number}
                  {po.description ? ` — ${po.description.slice(0, 30)}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Invoice</Label>
          <Select value={draft.invoiceMode} onValueChange={handleInvoiceModeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No invoice</SelectItem>
              <SelectItem value="existing">Select existing invoice</SelectItem>
              <SelectItem value="upload">Upload new invoice</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {draft.invoiceMode === 'existing' && (
          <div className="space-y-2">
            <Label htmlFor="log-spend-invoice">Existing invoice</Label>
            <Select
              value={draft.existingInvoiceId ?? 'none'}
              onValueChange={(v) =>
                setDraft({
                  ...draft,
                  existingInvoiceId: v === 'none' ? null : v,
                })
              }
            >
              <SelectTrigger id="log-spend-invoice">
                <SelectValue placeholder="Select invoice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select invoice</SelectItem>
                {filteredInvoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.invoice_number}
                    {inv.amount != null
                      ? ` · ${format(inv.amount, inv.currency_code ?? productionCurrency).formatted}`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {draft.invoiceMode === 'upload' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="log-spend-inv-number">Invoice number</Label>
              <Input
                id="log-spend-inv-number"
                value={draft.uploadInvoice?.invoice_number ?? uploadInvoiceNumber}
                onChange={(e) => {
                  setUploadInvoiceNumber(e.target.value)
                  setDraft({
                    ...draft,
                    uploadInvoice: {
                      ...(draft.uploadInvoice ?? {}),
                      invoice_number: e.target.value,
                    },
                  })
                }}
                placeholder="e.g. INV-001"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="log-spend-inv-issue">Issue date</Label>
                <Input
                  id="log-spend-inv-issue"
                  type="date"
                  value={draft.uploadInvoice?.issue_date ?? uploadIssueDate}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      uploadInvoice: {
                        ...(draft.uploadInvoice ?? { invoice_number: uploadInvoiceNumber }),
                        issue_date: e.target.value || null,
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="log-spend-inv-due">Due date</Label>
                <Input
                  id="log-spend-inv-due"
                  type="date"
                  value={draft.uploadInvoice?.due_date ?? uploadDueDate}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      uploadInvoice: {
                        ...(draft.uploadInvoice ?? { invoice_number: uploadInvoiceNumber }),
                        due_date: e.target.value || null,
                      },
                    })
                  }
                />
              </div>
            </div>
            <ValidatedField
              label="Amount"
              htmlFor="log-spend-inv-amount"
              description="Optional"
            >
              <MoneyAmountInput
                id="log-spend-inv-amount"
                mode="positive"
                value={
                  draft.uploadInvoice?.amount != null
                    ? draft.uploadInvoice.amount
                    : uploadAmount.trim()
                      ? Number(uploadAmount)
                      : null
                }
                onValueChange={(amount) =>
                  setDraft({
                    ...draft,
                    uploadInvoice: {
                      ...(draft.uploadInvoice ?? { invoice_number: uploadInvoiceNumber }),
                      amount,
                      currency_code: productionCurrency,
                    },
                  })
                }
                placeholder="Optional"
              />
            </ValidatedField>
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
                setDraft({
                  ...draft,
                  uploadInvoice: {
                    ...(draft.uploadInvoice ?? { invoice_number: uploadInvoiceNumber }),
                    fileName: file?.fileName,
                    bytes: file?.bytes,
                    mimeType: file?.mimeType ?? null,
                  },
                })
              }
            />
          </div>
        )}
      </section>
    )
  }

  // Edit mode — retroactive linking
  return (
    <section className="space-y-4 rounded-md border border-border bg-muted/10 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Vendor finance</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Link this expense to invoices or POs. Independent of budget line-item matching.
          </p>
        </div>
        <Button variant="link" size="sm" className="h-auto p-0 shrink-0" asChild>
          <Link to={`/budget/vendors/${vendorId}`}>
            Vendor detail
            <ExternalLink className="size-3 ml-1 inline" />
          </Link>
        </Button>
      </div>

      {linkedInvoices.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Linked invoices</p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {linkedInvoices.map((inv) => (
              <LinkedInvoiceRow
                key={inv.id}
                invoice={inv}
                productionCurrency={productionCurrency}
                format={format}
                onUnlink={() =>
                  unlinkInvoiceMutation.mutate({ invoiceId: inv.id, expId: expenseId! })
                }
                isUnlinking={unlinkInvoiceMutation.isPending}
              />
            ))}
          </ul>
        </div>
      )}

      {linkedPos.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Linked purchase orders</p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {linkedPos.map((po) => (
              <li
                key={po.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="font-medium">{po.po_number}</span>
                {po.amount != null && (
                  <span className="text-muted-foreground tabular-nums">
                    {format(po.amount, productionCurrency).formatted}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0"
                  onClick={() =>
                    unlinkPoMutation.mutate({ poId: po.id, expId: expenseId! })
                  }
                  disabled={unlinkPoMutation.isPending}
                  aria-label="Unlink PO"
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3 pt-1 border-t border-border">
        <p className="text-xs font-medium text-muted-foreground">Add link</p>
        <div className="space-y-2">
          <Label>Purchase order</Label>
          <Select
            value={addPoId ?? 'none'}
            onValueChange={(v) => setAddPoId(v === 'none' ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional PO" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No PO</SelectItem>
              {purchaseOrders
                .filter((po) => !linkedPoIds.includes(po.id))
                .map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.po_number}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Invoice</Label>
          <Select
            value={addInvoiceMode}
            onValueChange={(v) => setAddInvoiceMode(v as 'existing' | 'upload')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="existing">Link existing invoice</SelectItem>
              <SelectItem value="upload">Upload new invoice</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {addInvoiceMode === 'existing' ? (
          <div className="space-y-2">
            <Label>Existing invoice</Label>
            <Select
              value={addExistingInvoiceId ?? 'none'}
              onValueChange={(v) => setAddExistingInvoiceId(v === 'none' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select invoice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select invoice</SelectItem>
                {addFilteredInvoices.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.invoice_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Invoice number</Label>
              <Input
                value={uploadInvoiceNumber}
                onChange={(e) => setUploadInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-001"
              />
            </div>
            <VendorFinanceDocumentField
              pendingFile={
                uploadFile
                  ? {
                      fileName: uploadFile.fileName,
                      bytes: uploadFile.bytes,
                      mimeType: uploadFile.mimeType,
                    }
                  : null
              }
              onPendingFileChange={(file) =>
                setUploadFile(
                  file
                    ? {
                        fileName: file.fileName,
                        bytes: file.bytes,
                        mimeType: file.mimeType ?? null,
                      }
                    : null
                )
              }
            />
          </div>
        )}
        {linkError && <p className="text-sm text-destructive">{linkError}</p>}
        <Button
          type="button"
          size="sm"
          onClick={() => linkMutation.mutate()}
          disabled={linkMutation.isPending}
        >
          {linkMutation.isPending ? 'Linking…' : 'Link to expense'}
        </Button>
      </div>
    </section>
  )
}

function LinkedInvoiceRow({
  invoice,
  productionCurrency,
  format,
  onUnlink,
  isUnlinking,
}: {
  invoice: VendorInvoice
  productionCurrency: string
  format: ExpenseVendorFinanceSectionProps['format']
  onUnlink: () => void
  isUnlinking: boolean
}) {
  const { data: documents = [] } = useQuery({
    queryKey: entityDocumentsQueryKey(DOCUMENT_ENTITY_TYPES.vendorInvoice, invoice.id),
    queryFn: () => listDocumentsByEntity(DOCUMENT_ENTITY_TYPES.vendorInvoice, invoice.id),
  })
  const doc = documents[0]

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="font-medium">{invoice.invoice_number}</span>
      {invoice.amount != null && (
        <span className="text-muted-foreground tabular-nums">
          {format(invoice.amount, invoice.currency_code ?? productionCurrency).formatted}
        </span>
      )}
      {doc && <span className="text-xs text-muted-foreground truncate">{doc.file_name}</span>}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0"
        onClick={onUnlink}
        disabled={isUnlinking}
        aria-label="Unlink invoice"
      >
        <X className="size-3.5" />
      </Button>
    </li>
  )
}
