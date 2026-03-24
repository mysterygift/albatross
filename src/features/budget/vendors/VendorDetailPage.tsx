import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useCurrentProduction } from '@/features/productions/context'
import { useWorkingBudgetRevision } from '@/hooks/useWorkingBudgetRevision'
import { useCurrency } from '@/hooks/useCurrency'
import { getVendorById, updateVendor, softDeleteVendor } from '@/lib/db/repositories/vendors'
import {
  listVendorInvoicesByVendorId,
  vendorInvoicesQueryKey,
} from '@/lib/db/repositories/vendorInvoices'
import {
  listVendorPurchaseOrdersByVendorId,
  createVendorPurchaseOrder,
  updateVendorPurchaseOrder,
  softDeleteVendorPurchaseOrder,
  vendorPurchaseOrdersQueryKey,
} from '@/lib/db/repositories/vendorPurchaseOrders'
import {
  createInvoiceWithReminderTask,
  updateInvoiceWithReminderTask,
  archiveInvoiceWithReminderTask,
} from '@/lib/db/vendorInvoiceReminderService'
import {
  listExpenseLinksByInvoice,
  listExpenseLinksByPurchaseOrder,
  createVendorInvoiceExpenseLink,
  deleteVendorInvoiceExpenseLink,
  createVendorPurchaseOrderExpenseLink,
  deleteVendorPurchaseOrderExpenseLink,
  listExpenseLinkCountsByInvoiceIds,
  listExpenseLinkCountsByPurchaseOrderIds,
  getLinkedExpenseIdsForVendor,
  vendorInvoiceExpenseLinksQueryKey,
  vendorPurchaseOrderExpenseLinksQueryKey,
} from '@/lib/db/repositories/vendorFinanceLinks'
import {
  listRecentVendorActivity,
  vendorRecentActivityQueryKey,
  type VendorActivityItem,
} from '@/lib/db/repositories/vendorActivity'
import { dashboardVendorFinanceQueryKey } from '@/lib/dashboard/vendorFinance'
import { riskWatchQueryKey } from '@/lib/budget/vendors/riskWatch'
import { listExpensesByVendorId } from '@/lib/db/repositories/budget'
import { listAccounts } from '@/lib/db/repositories/budgetAccounts'
import { listBudgetItemExpenseLinksByProduction } from '@/lib/db/repositories/budgetReconciliation'
import {
  getExpenseAllocationStatus,
  getExpenseUnallocatedAmount,
  sumAllocatedAmountForExpense,
} from '@/lib/budget/reconciliation'
import { getLineItemTypeConfig } from '@/lib/budget/line-items/registry'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { ExpenseAllocationStatusBadge } from '@/features/budget/actualisation/ExpenseAllocationStatusBadge'
import { ClassificationBadge } from '@/features/budget/ClassificationBadge'
import { InvoiceStatusBadge } from '@/features/budget/vendors/InvoiceStatusBadge'
import { IngestEquipmentFromInvoiceModal } from '@/features/budget/vendors/IngestEquipmentFromInvoiceModal'
import { PurchaseOrderStatusBadge } from '@/features/budget/vendors/PurchaseOrderStatusBadge'
import type { BudgetItemExpenseLink, Expense, ExpenseReconciliationStatus, VendorInvoice, VendorPurchaseOrder } from '@/lib/db/types'
import { ArrowLeft, Pencil, Eye, Archive, FilePlus, ArchiveIcon, FileText, Link2, X, Receipt, Package } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const editVendorSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  primary_contact_full_name: z.string().optional(),
  primary_contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
})

const invoiceFormSchema = z.object({
  invoice_number: z.string().min(1, 'Invoice number is required'),
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  amount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v): number | null => {
      if (v === '' || v === undefined) return null
      const n = typeof v === 'string' ? Number(v) : v
      return typeof n === 'number' && Number.isNaN(n) ? null : n
    }),
  tax: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v): number | null => {
      if (v === '' || v === undefined) return null
      const n = typeof v === 'string' ? Number(v) : v
      return typeof n === 'number' && Number.isNaN(n) ? null : n
    }),
  currency_code: z.string().optional(),
  status: z.enum(['draft', 'received', 'approved', 'paid', 'overdue']),
  notes: z.string().optional(),
  po_id: z.string().nullable().optional(),
})

const INVOICE_STATUS_OPTIONS: { value: VendorInvoice['status']; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'received', label: 'Received' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
]

const PO_STATUS_OPTIONS: { value: VendorPurchaseOrder['status']; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'approved', label: 'Approved' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const poFormSchema = z.object({
  po_number: z.string().min(1, 'PO number is required'),
  description: z.string().optional(),
  issue_date: z.string().optional(),
  due_date: z.string().optional(),
  amount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v): number | null => {
      if (v === '' || v === undefined) return null
      const n = typeof v === 'string' ? Number(v) : v
      return typeof n === 'number' && Number.isNaN(n) ? null : n
    }),
  status: z.enum(['draft', 'issued', 'approved', 'closed', 'cancelled']),
  approval: z.boolean(),
  notes: z.string().optional(),
})

const EXPENSE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'labour', label: 'Labour' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'rental', label: 'Rental' },
  { value: 'allow', label: 'Allow' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'untyped', label: 'Untyped' },
]

export function VendorDetailPage() {
  const { vendorId } = useParams<{ vendorId: string }>()
  const navigate = useNavigate()
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const { data: workingBudgetRevision } = useWorkingBudgetRevision(currentProductionId)
  const revisionId = workingBudgetRevision?.id
  const { format } = useCurrency()
  const currency = currentProduction?.currency_code ?? 'GBP'
  const queryClient = useQueryClient()

  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [accountFilter, setAccountFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [editOpen, setEditOpen] = useState(false)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<VendorInvoice | null>(null)
  const [archiveInvoiceId, setArchiveInvoiceId] = useState<string | null>(null)
  const [createPOOpen, setCreatePOOpen] = useState(false)
  const [editPO, setEditPO] = useState<VendorPurchaseOrder | null>(null)
  const [archivePOId, setArchivePOId] = useState<string | null>(null)
  const [linkExpensesInvoice, setLinkExpensesInvoice] = useState<VendorInvoice | null>(null)
  const [linkExpensesPO, setLinkExpensesPO] = useState<VendorPurchaseOrder | null>(null)
  const [ingestEquipmentInvoice, setIngestEquipmentInvoice] = useState<VendorInvoice | null>(null)

  const { data: vendor, isLoading: vendorLoading } = useQuery({
    queryKey: ['vendor', vendorId],
    queryFn: () => getVendorById(vendorId!),
    enabled: !!vendorId,
  })

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses-by-vendor', currentProductionId, vendorId],
    queryFn: () => listExpensesByVendorId(currentProductionId!, vendorId!),
    enabled: !!currentProductionId && !!vendorId,
  })

  const { data: accounts = [] } = useQuery({
    queryKey: ['budget-accounts', currentProductionId],
    queryFn: () => listAccounts(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const { data: links = [] } = useQuery({
    queryKey: ['budget-item-expense-links', currentProductionId, revisionId],
    queryFn: () => listBudgetItemExpenseLinksByProduction(currentProductionId!, revisionId),
    enabled: !!currentProductionId,
  })

  const { data: invoices = [] } = useQuery({
    queryKey: vendorInvoicesQueryKey(currentProductionId!, vendorId!),
    queryFn: () => listVendorInvoicesByVendorId(currentProductionId!, vendorId!),
    enabled: !!currentProductionId && !!vendorId,
  })

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: vendorPurchaseOrdersQueryKey(currentProductionId!, vendorId!),
    queryFn: () => listVendorPurchaseOrdersByVendorId(currentProductionId!, vendorId!),
    enabled: !!currentProductionId && !!vendorId,
  })

  const { data: invoiceExpenseCounts = {} } = useQuery({
    queryKey: ['vendor-invoice-expense-link-counts', currentProductionId, vendorId],
    queryFn: async () => {
      const invs = await listVendorInvoicesByVendorId(currentProductionId!, vendorId!)
      return listExpenseLinkCountsByInvoiceIds(invs.map((i) => i.id))
    },
    enabled: !!currentProductionId && !!vendorId,
  })

  const { data: poExpenseCounts = {} } = useQuery({
    queryKey: ['vendor-po-expense-link-counts', currentProductionId, vendorId],
    queryFn: async () => {
      const pos = await listVendorPurchaseOrdersByVendorId(currentProductionId!, vendorId!)
      return listExpenseLinkCountsByPurchaseOrderIds(pos.map((p) => p.id))
    },
    enabled: !!currentProductionId && !!vendorId,
  })

  const { data: linkedExpenseIds = new Set<string>() } = useQuery({
    queryKey: ['vendor-linked-expense-ids', currentProductionId, vendorId],
    queryFn: () => getLinkedExpenseIdsForVendor(currentProductionId!, vendorId!),
    enabled: !!currentProductionId && !!vendorId,
  })

  const { data: recentActivity = [] } = useQuery({
    queryKey: vendorRecentActivityQueryKey(currentProductionId!, vendorId!),
    queryFn: () => listRecentVendorActivity(currentProductionId!, vendorId!, 8),
    enabled: !!currentProductionId && !!vendorId,
  })

  const activePurchaseOrders = useMemo(
    () => purchaseOrders.filter((po) => po.status !== 'closed' && po.status !== 'cancelled'),
    [purchaseOrders]
  )

  const activeLinks = useMemo(() => links.filter((l) => !l.deleted_at), [links])

  const invoiceSummary = useMemo(() => {
    const unpaid = invoices.filter((inv) => inv.status !== 'paid')
    const unpaidTotal = unpaid.reduce((sum, inv) => sum + (inv.amount ?? 0), 0)
    return { outstandingCount: unpaid.length, unpaidTotal }
  }, [invoices])

  const poSummary = useMemo(() => {
    const approved = purchaseOrders.filter((po) => po.approval === 1)
    const open = purchaseOrders.filter((po) => po.status !== 'closed' && po.status !== 'cancelled')
    const openTotal = open.reduce((sum, po) => sum + (po.amount ?? 0), 0)
    return { approvedCount: approved.length, openCount: open.length, openTotal }
  }, [purchaseOrders])

  const liabilitiesSummary = useMemo(() => {
    const invoicesLinkedToPo = invoices.filter((i) => i.po_id != null).length
    const invoicesUnlinked = invoices.filter((i) => i.po_id == null).length
    const expensesUnlinkedCount = expenses.filter((e) => !linkedExpenseIds.has(e.id)).length
    return { invoicesLinkedToPo, invoicesUnlinked, expensesUnlinkedCount }
  }, [invoices, expenses, linkedExpenseIds])
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const overview = useMemo(() => {
    const totalSpend = expenses.reduce((s, e) => s + e.amount, 0)
    const count = expenses.length
    const sortedByDate = [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const lastDate = sortedByDate[0]?.date ?? null
    const largest = expenses.length
      ? expenses.reduce((best, e) => (e.amount > best.amount ? e : best), expenses[0]!)
      : null
    const avg = count > 0 ? totalSpend / count : 0
    const byType: Record<string, number> = {}
    for (const e of expenses) {
      const t = e.transaction_type ?? 'untyped'
      byType[t] = (byType[t] ?? 0) + e.amount
    }
    const byAccount: Record<string, number> = {}
    for (const e of expenses) {
      const acc = e.account_id ?? '__uncoded__'
      byAccount[acc] = (byAccount[acc] ?? 0) + e.amount
    }
    const topAccounts = (Object.entries(byAccount) as [string, number][])
      .filter(([id]) => id !== '__uncoded__')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    const matchedTotal = expenses.reduce(
      (s, e) => s + sumAllocatedAmountForExpense(e.id, activeLinks),
      0
    )
    const unmatchedTotal = expenses.reduce(
      (s, e) => s + getExpenseUnallocatedAmount(e, activeLinks),
      0
    )
    return {
      totalSpend,
      count,
      lastDate,
      largest,
      avg,
      byType,
      byAccount,
      topAccounts,
      matchedTotal,
      unmatchedTotal,
    }
  }, [expenses, activeLinks])

  const filteredExpenses = useMemo(() => {
    let list = expenses
    if (typeFilter !== 'all') {
      if (typeFilter === 'untyped') {
        list = list.filter((e) => e.transaction_type == null)
      } else {
        list = list.filter((e) => e.transaction_type === typeFilter)
      }
    }
    if (accountFilter !== 'all') {
      list = list.filter((e) => e.account_id === accountFilter)
    }
    if (statusFilter !== 'all') {
      list = list.filter((e) => getExpenseAllocationStatus(e, activeLinks) === statusFilter)
    }
    return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [expenses, typeFilter, accountFilter, statusFilter, activeLinks])

  const updateMutation = useMutation({
    mutationFn: (data: z.infer<typeof editVendorSchema>) =>
      updateVendor(vendorId!, {
        company_name: data.company_name,
        primary_contact_full_name: data.primary_contact_full_name?.trim() || null,
        primary_contact_email: data.primary_contact_email?.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId] })
      queryClient.invalidateQueries({ queryKey: ['vendors', currentProductionId] })
      setEditOpen(false)
    },
  })

  if (!vendorId || !currentProductionId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        Missing vendor or production.
      </div>
    )
  }

  const archiveMutation = useMutation({
    mutationFn: () => softDeleteVendor(vendorId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId] })
      queryClient.invalidateQueries({ queryKey: ['expenses-by-vendor', currentProductionId, vendorId] })
      setArchiveConfirmOpen(false)
      navigate('/budget/vendors')
    },
  })

  const invoiceListKey = vendorId && currentProductionId ? vendorInvoicesQueryKey(currentProductionId, vendorId) : []
  const createInvoiceMutation = useMutation({
    mutationFn: (data: Parameters<typeof createInvoiceWithReminderTask>[0]) =>
      createInvoiceWithReminderTask(data, vendor?.company_name ?? 'Vendor'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceListKey })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: vendorRecentActivityQueryKey(currentProductionId!, vendorId!) })
      queryClient.invalidateQueries({ queryKey: dashboardVendorFinanceQueryKey(currentProductionId!) })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId!, revisionId) })
      setCreateInvoiceOpen(false)
    },
  })
  const updateInvoiceMutation = useMutation({
    mutationFn: ({
      id,
      patch,
      invoice,
    }: {
      id: string
      patch: Parameters<typeof updateInvoiceWithReminderTask>[1]
      invoice: VendorInvoice
    }) => updateInvoiceWithReminderTask(id, patch, invoice, vendor?.company_name ?? 'Vendor'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceListKey })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: vendorRecentActivityQueryKey(currentProductionId!, vendorId!) })
      queryClient.invalidateQueries({ queryKey: dashboardVendorFinanceQueryKey(currentProductionId!) })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId!, revisionId) })
      setEditInvoice(null)
    },
  })
  const archiveInvoiceMutation = useMutation({
    mutationFn: (id: string) => archiveInvoiceWithReminderTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceListKey })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: vendorRecentActivityQueryKey(currentProductionId!, vendorId!) })
      queryClient.invalidateQueries({ queryKey: dashboardVendorFinanceQueryKey(currentProductionId!) })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId!, revisionId) })
      setArchiveInvoiceId(null)
    },
  })

  const poListKey = vendorId && currentProductionId ? vendorPurchaseOrdersQueryKey(currentProductionId, vendorId) : []
  const createPOMutation = useMutation({
    mutationFn: (data: Parameters<typeof createVendorPurchaseOrder>[0]) => createVendorPurchaseOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: poListKey })
      queryClient.invalidateQueries({ queryKey: vendorRecentActivityQueryKey(currentProductionId!, vendorId!) })
      queryClient.invalidateQueries({ queryKey: dashboardVendorFinanceQueryKey(currentProductionId!) })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId!, revisionId) })
      setCreatePOOpen(false)
    },
  })
  const updatePOMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateVendorPurchaseOrder>[1] }) =>
      updateVendorPurchaseOrder(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: poListKey })
      queryClient.invalidateQueries({ queryKey: vendorRecentActivityQueryKey(currentProductionId!, vendorId!) })
      queryClient.invalidateQueries({ queryKey: dashboardVendorFinanceQueryKey(currentProductionId!) })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId!, revisionId) })
      setEditPO(null)
    },
  })
  const archivePOMutation = useMutation({
    mutationFn: (id: string) => softDeleteVendorPurchaseOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: poListKey })
      queryClient.invalidateQueries({ queryKey: vendorRecentActivityQueryKey(currentProductionId!, vendorId!) })
      queryClient.invalidateQueries({ queryKey: dashboardVendorFinanceQueryKey(currentProductionId!) })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId!, revisionId) })
      setArchivePOId(null)
    },
  })

  const invalidateVendorFinance = () => {
    if (!currentProductionId || !vendorId) return
    queryClient.invalidateQueries({ queryKey: invoiceListKey })
    queryClient.invalidateQueries({ queryKey: poListKey })
    queryClient.invalidateQueries({ queryKey: ['vendor-invoice-expense-link-counts', currentProductionId, vendorId] })
    queryClient.invalidateQueries({ queryKey: ['vendor-po-expense-link-counts', currentProductionId, vendorId] })
    queryClient.invalidateQueries({ queryKey: ['vendor-linked-expense-ids', currentProductionId, vendorId] })
    queryClient.invalidateQueries({ queryKey: vendorRecentActivityQueryKey(currentProductionId, vendorId) })
    queryClient.invalidateQueries({ queryKey: dashboardVendorFinanceQueryKey(currentProductionId) })
    queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId, revisionId) })
  }

  const linkInvoiceExpenseMutation = useMutation({
    mutationFn: ({ invoiceId, expenseId }: { invoiceId: string; expenseId: string }) =>
      createVendorInvoiceExpenseLink(invoiceId, expenseId),
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: vendorInvoiceExpenseLinksQueryKey(invoiceId) })
      invalidateVendorFinance()
    },
  })
  const unlinkInvoiceExpenseMutation = useMutation({
    mutationFn: ({ invoiceId, expenseId }: { invoiceId: string; expenseId: string }) =>
      deleteVendorInvoiceExpenseLink(invoiceId, expenseId),
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: vendorInvoiceExpenseLinksQueryKey(invoiceId) })
      invalidateVendorFinance()
    },
  })
  const linkPOExpenseMutation = useMutation({
    mutationFn: ({ poId, expenseId }: { poId: string; expenseId: string }) =>
      createVendorPurchaseOrderExpenseLink(poId, expenseId),
    onSuccess: (_, { poId }) => {
      queryClient.invalidateQueries({ queryKey: vendorPurchaseOrderExpenseLinksQueryKey(poId) })
      invalidateVendorFinance()
    },
  })
  const unlinkPOExpenseMutation = useMutation({
    mutationFn: ({ poId, expenseId }: { poId: string; expenseId: string }) =>
      deleteVendorPurchaseOrderExpenseLink(poId, expenseId),
    onSuccess: (_, { poId }) => {
      queryClient.invalidateQueries({ queryKey: vendorPurchaseOrderExpenseLinksQueryKey(poId) })
      invalidateVendorFinance()
    },
  })

  const isArchived = !!vendor?.deleted_at

  if (vendorLoading || vendor == null) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        {vendorLoading ? 'Loading…' : 'Vendor not found.'}
      </div>
    )
  }

  if (vendor.production_id !== currentProductionId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
        Vendor not found for this production.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {isArchived && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          This vendor has been archived. Spend history is preserved; the vendor no longer appears in active lists.
        </div>
      )}

      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link to="/budget/vendors" aria-label="Back to vendors">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground truncate">{vendor.company_name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {vendor.primary_contact_full_name && <span>{vendor.primary_contact_full_name}</span>}
            {vendor.primary_contact_email && <span>{vendor.primary_contact_email}</span>}
          </div>
        </div>
        {!isArchived && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 size-4" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setArchiveConfirmOpen(true)} className="text-muted-foreground">
              <Archive className="mr-2 size-4" />
              Archive
            </Button>
          </>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8 min-w-0">
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Total spend</p>
            <p className="text-lg font-semibold text-foreground truncate" title={format(overview.totalSpend, currency).formatted}>
              {format(overview.totalSpend, currency).formatted}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Expenses</p>
            <p className="text-lg font-semibold text-foreground">{overview.count}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Last transaction</p>
            <p className="text-lg font-semibold text-foreground truncate" title={overview.lastDate ? new Date(overview.lastDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined}>
              {overview.lastDate
                ? new Date(overview.lastDate).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Largest expense</p>
            <p className="text-lg font-semibold text-foreground truncate" title={overview.largest ? format(overview.largest.amount, currency).formatted : undefined}>
              {overview.largest ? format(overview.largest.amount, currency).formatted : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Invoices outstanding</p>
            <p className="text-lg font-semibold text-foreground">{invoiceSummary.outstandingCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Total unpaid</p>
            <p className="text-lg font-semibold text-foreground truncate" title={invoiceSummary.unpaidTotal > 0 ? format(invoiceSummary.unpaidTotal, currency).formatted : undefined}>
              {invoiceSummary.unpaidTotal > 0 ? format(invoiceSummary.unpaidTotal, currency).formatted : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Approved POs</p>
            <p className="text-lg font-semibold text-foreground">{poSummary.approvedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Open POs</p>
            <p className="text-lg font-semibold text-foreground">{poSummary.openCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Liabilities foundations */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 min-w-0">
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Open PO total</p>
            <p className="text-lg font-semibold text-foreground truncate" title={poSummary.openTotal > 0 ? format(poSummary.openTotal, currency).formatted : undefined}>
              {poSummary.openTotal > 0 ? format(poSummary.openTotal, currency).formatted : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Invoices linked to PO</p>
            <p className="text-lg font-semibold text-foreground">{liabilitiesSummary.invoicesLinkedToPo}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Invoices not linked to PO</p>
            <p className="text-lg font-semibold text-foreground">{liabilitiesSummary.invoicesUnlinked}</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card min-w-0 overflow-hidden">
          <CardContent className="px-4 pt-4 pb-4 min-w-0">
            <p className="text-xs text-muted-foreground truncate">Expenses unlinked</p>
            <p className="text-lg font-semibold text-foreground">{liabilitiesSummary.expensesUnlinkedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Overview */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-base">Overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-foreground mb-2">Contact</h3>
            <p className="text-sm text-muted-foreground">
              {vendor.primary_contact_full_name || '—'} · {vendor.primary_contact_email || '—'}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground mb-2">Spend by type</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              {(['labour', 'purchase', 'rental', 'allow', 'deposit', 'untyped'] as const).map((t) => {
                const amt = overview.byType[t] ?? 0
                if (amt === 0 && t !== 'untyped') return null
                const label = t === 'untyped' ? 'Untyped' : (getLineItemTypeConfig(t)?.label ?? t)
                return (
                  <li key={t} className="flex justify-between gap-4">
                    <span>{label}</span>
                    <span className="font-medium text-foreground">{format(amt, currency).formatted}</span>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Average transaction</span>
              <p className="font-medium text-foreground">{format(overview.avg, currency).formatted}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Last activity</span>
              <p className="font-medium text-foreground">
                {overview.lastDate
                  ? new Date(overview.lastDate).toLocaleDateString('en-GB')
                  : '—'}
              </p>
            </div>
          </div>
          {overview.matchedTotal > 0 || overview.unmatchedTotal > 0 ? (
            <div className="flex gap-4 text-sm">
              <span className="text-muted-foreground">
                Matched: <span className="font-medium text-foreground">{format(overview.matchedTotal, currency).formatted}</span>
              </span>
              <span className="text-muted-foreground">
                Unmatched: <span className="font-medium text-foreground">{format(overview.unmatchedTotal, currency).formatted}</span>
              </span>
            </div>
          ) : null}
          {overview.topAccounts.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Top accounts by spend</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                {overview.topAccounts.map(([accountId, amt]) => {
                  const acc = accountById.get(accountId)
                  const label = acc ? `${acc.code} — ${acc.name}` : 'Unknown'
                  return (
                    <li key={accountId} className="flex justify-between gap-4">
                      <span className="truncate">{label}</span>
                      <span className="font-medium text-foreground shrink-0">{format(amt, currency).formatted}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {Object.keys(overview.byAccount).length > 0 && overview.topAccounts.length === 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Spend by account</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                {Object.entries(overview.byAccount).map(([accountId, amt]) => {
                  if (accountId === '__uncoded__') {
                    return (
                      <li key={accountId} className="flex justify-between gap-4">
                        <span>Uncoded</span>
                        <span className="font-medium text-foreground">{format(amt, currency).formatted}</span>
                      </li>
                    )
                  }
                  const acc = accountById.get(accountId)
                  const label = acc ? `${acc.code} — ${acc.name}` : accountId
                  return (
                    <li key={accountId} className="flex justify-between gap-4">
                      <span className="truncate">{label}</span>
                      <span className="font-medium text-foreground shrink-0">{format(amt, currency).formatted}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Invoices</CardTitle>
          {!isArchived && (
            <Button variant="outline" size="sm" onClick={() => setCreateInvoiceOpen(true)}>
              <FilePlus className="mr-2 size-4" />
              New invoice
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground w-[100px]">Invoice #</TableHead>
                  <TableHead className="text-muted-foreground w-[88px]">Issue date</TableHead>
                  <TableHead className="text-muted-foreground w-[88px]">Due date</TableHead>
                  <TableHead className="text-right text-muted-foreground w-[90px]">Amount</TableHead>
                  <TableHead className="text-right text-muted-foreground w-[70px]">Tax</TableHead>
                  <TableHead className="text-muted-foreground w-[56px]">Cur</TableHead>
                  <TableHead className="text-muted-foreground w-[90px]">Status</TableHead>
                  <TableHead className="text-muted-foreground w-[72px]">PO</TableHead>
                  <TableHead className="text-muted-foreground w-[72px]">Expenses</TableHead>
                  {!isArchived && <TableHead className="w-[88px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isArchived ? 9 : 10} className="text-muted-foreground text-center py-8">
                      No invoices yet. Add one to track vendor invoices.
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <VendorInvoiceRow
                      key={inv.id}
                      invoice={inv}
                      linkedPo={inv.po_id ? purchaseOrders.find((p) => p.id === inv.po_id) ?? null : null}
                      expenseLinkCount={invoiceExpenseCounts[inv.id] ?? 0}
                      format={format}
                      currency={currency}
                      onEdit={() => setEditInvoice(inv)}
                      onArchive={() => setArchiveInvoiceId(inv.id)}
                      onLinkExpenses={() => setLinkExpensesInvoice(inv)}
                      onAddEquipment={() => setIngestEquipmentInvoice(inv)}
                      showActions={!isArchived}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Purchase Orders */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Purchase Orders</CardTitle>
          {!isArchived && (
            <Button variant="outline" size="sm" onClick={() => setCreatePOOpen(true)}>
              <FileText className="mr-2 size-4" />
              New PO
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground w-[90px]">PO #</TableHead>
                  <TableHead className="text-muted-foreground min-w-[100px]">Description</TableHead>
                  <TableHead className="text-muted-foreground w-[88px]">Issue date</TableHead>
                  <TableHead className="text-muted-foreground w-[88px]">Due date</TableHead>
                  <TableHead className="text-right text-muted-foreground w-[90px]">Amount</TableHead>
                  <TableHead className="text-muted-foreground w-[82px]">Status</TableHead>
                  <TableHead className="text-muted-foreground w-[80px]">Approval</TableHead>
                  <TableHead className="text-muted-foreground w-[72px]">Invoices</TableHead>
                  <TableHead className="text-muted-foreground w-[72px]">Expenses</TableHead>
                  {!isArchived && <TableHead className="w-[88px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isArchived ? 9 : 10} className="text-muted-foreground text-center py-8">
                      No purchase orders yet. Add one to track vendor POs.
                    </TableCell>
                  </TableRow>
                ) : (
                  purchaseOrders.map((po) => (
                    <VendorPORow
                      key={po.id}
                      po={po}
                      linkedInvoiceCount={invoices.filter((i) => i.po_id === po.id).length}
                      expenseLinkCount={poExpenseCounts[po.id] ?? 0}
                      format={format}
                      currency={currency}
                      onEdit={() => setEditPO(po)}
                      onArchive={() => setArchivePOId(po.id)}
                      onLinkExpenses={() => setLinkExpensesPO(po)}
                      showActions={!isArchived}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border py-3">
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {recentActivity.map((item: VendorActivityItem) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="shrink-0 w-[52px] text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {item.entity_type === 'expense'
                      ? 'Expense'
                      : item.entity_type === 'invoice'
                        ? 'Invoice'
                        : 'PO'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground font-medium">{item.title}</p>
                    {item.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                    )}
                  </div>
                  <span className="text-muted-foreground shrink-0 w-[82px] text-right">
                    {new Date(item.activity_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </span>
                  {item.amount != null && (
                    <span className="font-medium text-foreground shrink-0 w-[72px] text-right tabular-nums">
                      {format(item.amount, currency).formatted}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Expense ledger */}
      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Expenses</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.filter((a) => a.is_postable).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="unallocated">Unallocated</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="allocated">Allocated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground w-[100px]">Date</TableHead>
                  <TableHead className="text-muted-foreground">Description</TableHead>
                  <TableHead className="text-muted-foreground w-[100px]">Account</TableHead>
                  <TableHead className="text-muted-foreground w-[90px]">Type</TableHead>
                  <TableHead className="text-right text-muted-foreground w-[100px]">Amount</TableHead>
                  <TableHead className="text-muted-foreground w-[100px]">Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground text-center py-8">
                      No expenses match the filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExpenses.map((exp) => (
                    <VendorExpenseRow
                      key={exp.id}
                      expense={exp}
                      accountById={accountById}
                      links={activeLinks}
                      format={format}
                      currency={currency}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <EditVendorDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        vendor={vendor}
        onSubmit={(d) => updateMutation.mutate(d)}
        isLoading={updateMutation.isPending}
      />

      <Dialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive vendor?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              This will remove the vendor from active lists. Linked expense history is preserved and will still show this vendor on existing expenses. You can still open this page from a direct link to view history.
            </p>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setArchiveConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? 'Archiving…' : 'Archive'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateInvoiceDialog
        open={createInvoiceOpen}
        onOpenChange={setCreateInvoiceOpen}
        productionId={currentProductionId!}
        vendorId={vendorId!}
        currency={currency}
        activePurchaseOrders={activePurchaseOrders}
        onSubmit={(data) => createInvoiceMutation.mutate(data)}
        isLoading={createInvoiceMutation.isPending}
      />

      {editInvoice && (
        <EditInvoiceDialog
          open={!!editInvoice}
          onOpenChange={(open) => !open && setEditInvoice(null)}
          invoice={editInvoice}
          currency={currency}
          activePurchaseOrders={activePurchaseOrders}
          onSubmit={(patch) => updateInvoiceMutation.mutate({ id: editInvoice.id, patch, invoice: editInvoice })}
          isLoading={updateInvoiceMutation.isPending}
        />
      )}

      {ingestEquipmentInvoice && currentProductionId && (
        <IngestEquipmentFromInvoiceModal
          open={!!ingestEquipmentInvoice}
          onOpenChange={(open) => !open && setIngestEquipmentInvoice(null)}
          invoice={ingestEquipmentInvoice}
          productionId={currentProductionId}
          vendorName={vendor?.company_name ?? ''}
        />
      )}

      <Dialog open={!!archiveInvoiceId} onOpenChange={(open) => !open && setArchiveInvoiceId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive invoice?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              This will remove the invoice from the active list. You can still view archived data from a direct link if needed later.
            </p>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setArchiveInvoiceId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => archiveInvoiceId && archiveInvoiceMutation.mutate(archiveInvoiceId)}
              disabled={archiveInvoiceMutation.isPending || !archiveInvoiceId}
            >
              {archiveInvoiceMutation.isPending ? 'Archiving…' : 'Archive'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreatePODialog
        open={createPOOpen}
        onOpenChange={setCreatePOOpen}
        productionId={currentProductionId!}
        vendorId={vendorId!}
        onSubmit={(data) => createPOMutation.mutate(data)}
        isLoading={createPOMutation.isPending}
      />

      {editPO && (
        <EditPODialog
          open={!!editPO}
          onOpenChange={(open) => !open && setEditPO(null)}
          po={editPO}
          onSubmit={(patch) => updatePOMutation.mutate({ id: editPO.id, patch })}
          isLoading={updatePOMutation.isPending}
        />
      )}

      <Dialog open={!!archivePOId} onOpenChange={(open) => !open && setArchivePOId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive purchase order?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              This will remove the PO from the active list. You can still view archived data from a direct link if needed later.
            </p>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setArchivePOId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => archivePOId && archivePOMutation.mutate(archivePOId)}
              disabled={archivePOMutation.isPending || !archivePOId}
            >
              {archivePOMutation.isPending ? 'Archiving…' : 'Archive'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {linkExpensesInvoice && (
        <LinkExpensesToInvoiceDialog
          open={!!linkExpensesInvoice}
          onOpenChange={(open) => !open && setLinkExpensesInvoice(null)}
          invoice={linkExpensesInvoice}
          expenses={expenses}
          accountById={accountById}
          format={format}
          currency={currency}
          onLink={(expenseId) => linkInvoiceExpenseMutation.mutate({ invoiceId: linkExpensesInvoice.id, expenseId })}
          onUnlink={(expenseId) => unlinkInvoiceExpenseMutation.mutate({ invoiceId: linkExpensesInvoice.id, expenseId })}
          isLinking={linkInvoiceExpenseMutation.isPending}
          isUnlinking={unlinkInvoiceExpenseMutation.isPending}
        />
      )}

      {linkExpensesPO && (
        <LinkExpensesToPODialog
          open={!!linkExpensesPO}
          onOpenChange={(open) => !open && setLinkExpensesPO(null)}
          po={linkExpensesPO}
          expenses={expenses}
          accountById={accountById}
          format={format}
          currency={currency}
          onLink={(expenseId) => linkPOExpenseMutation.mutate({ poId: linkExpensesPO.id, expenseId })}
          onUnlink={(expenseId) => unlinkPOExpenseMutation.mutate({ poId: linkExpensesPO.id, expenseId })}
          isLinking={linkPOExpenseMutation.isPending}
          isUnlinking={unlinkPOExpenseMutation.isPending}
        />
      )}
    </div>
  )
}

function VendorExpenseRow({
  expense,
  accountById,
  links,
  format,
  currency,
}: {
  expense: Expense
  accountById: Map<string, { id: string; code: string; name: string }>
  links: BudgetItemExpenseLink[]
  format: (amount: number, currency: string) => { formatted: string }
  currency: string
}) {
  const account = expense.account_id ? accountById.get(expense.account_id) : null
  const status: ExpenseReconciliationStatus = getExpenseAllocationStatus(expense, links)
  const description = (expense.notes || expense.vendor || 'Expense').trim().slice(0, 60)

  return (
    <TableRow className="border-border">
      <TableCell className="text-muted-foreground text-sm py-2 w-[100px] shrink-0">
        {new Date(expense.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
      </TableCell>
      <TableCell className="text-sm py-2 truncate max-w-[200px]" title={description}>
        {description || '—'}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm py-2 w-[100px]">
        {account ? (
          <span title={account.name}>{account.code}</span>
        ) : (
          <span className="italic">—</span>
        )}
      </TableCell>
      <TableCell className="py-2 w-[90px]">
        <ClassificationBadge type={expense.transaction_type} className="text-xs" />
      </TableCell>
      <TableCell className="text-right font-medium text-foreground py-2 w-[100px] tabular-nums">
        {format(expense.amount, currency).formatted}
      </TableCell>
      <TableCell className="py-2 w-[100px]">
        <ExpenseAllocationStatusBadge status={status} className="text-xs" />
      </TableCell>
      <TableCell className="py-2 w-[80px]">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link
            to="/budget"
            state={{ examineExpenseId: expense.id }}
            aria-label="Examine spend"
          >
            <Eye className="size-4" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  )
}

function VendorInvoiceRow({
  invoice,
  linkedPo,
  expenseLinkCount,
  format,
  currency,
  onEdit,
  onArchive,
  onLinkExpenses,
  onAddEquipment,
  showActions,
}: {
  invoice: VendorInvoice
  linkedPo: VendorPurchaseOrder | null
  expenseLinkCount: number
  format: (amount: number, currency: string) => { formatted: string }
  currency: string
  onEdit: () => void
  onArchive: () => void
  onLinkExpenses: () => void
  onAddEquipment?: () => void
  showActions: boolean
}) {
  const cur = invoice.currency_code ?? currency
  const isOverdue =
    invoice.due_date != null &&
    new Date(invoice.due_date) < new Date() &&
    invoice.status !== 'paid'
  const dateFmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'
  return (
    <TableRow className="border-border">
      <TableCell className="text-sm py-2 w-[100px] font-medium text-foreground">
        {invoice.invoice_number}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm py-2 w-[88px]">{dateFmt(invoice.issue_date)}</TableCell>
      <TableCell className="text-muted-foreground text-sm py-2 w-[88px]">{dateFmt(invoice.due_date)}</TableCell>
      <TableCell className="text-right text-sm py-2 w-[90px] tabular-nums">
        {invoice.amount != null ? format(invoice.amount, cur).formatted : '—'}
      </TableCell>
      <TableCell className="text-right text-sm py-2 w-[70px] tabular-nums text-muted-foreground">
        {invoice.tax != null ? format(invoice.tax, cur).formatted : '—'}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs py-2 w-[56px]">
        {invoice.currency_code ?? '—'}
      </TableCell>
      <TableCell className="py-2 w-[90px]">
        <InvoiceStatusBadge status={invoice.status} isOverdue={isOverdue} className="text-xs" />
      </TableCell>
      <TableCell className="text-muted-foreground text-sm py-2 w-[72px]">
        {linkedPo ? linkedPo.po_number : '—'}
      </TableCell>
      <TableCell className="py-2 w-[72px]">
        <span className="text-sm text-muted-foreground">{expenseLinkCount}</span>
        {showActions && (
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-0.5 align-middle" onClick={onLinkExpenses} aria-label="Link expenses">
            <Link2 className="size-3.5" />
          </Button>
        )}
      </TableCell>
      {showActions && (
        <TableCell className="py-2 w-[88px]">
          <div className="flex items-center gap-1">
            {onAddEquipment && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onAddEquipment} aria-label="Add equipment from invoice">
                    <Package className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add equipment from invoice</TooltipContent>
              </Tooltip>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Edit invoice">
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onArchive} aria-label="Archive invoice">
              <ArchiveIcon className="size-4" />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  )
}

function VendorPORow({
  po,
  linkedInvoiceCount,
  expenseLinkCount,
  format,
  currency,
  onEdit,
  onArchive,
  onLinkExpenses,
  showActions,
}: {
  po: VendorPurchaseOrder
  linkedInvoiceCount: number
  expenseLinkCount: number
  format: (amount: number, currency: string) => { formatted: string }
  currency: string
  onEdit: () => void
  onArchive: () => void
  onLinkExpenses: () => void
  showActions: boolean
}) {
  const dateFmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'
  return (
    <TableRow className="border-border">
      <TableCell className="text-sm py-2 w-[90px] font-medium text-foreground">
        {po.po_number}
      </TableCell>
      <TableCell className="text-sm py-2 min-w-[100px] text-muted-foreground truncate max-w-[180px]" title={po.description ?? ''}>
        {po.description ?? '—'}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm py-2 w-[88px]">{dateFmt(po.issue_date)}</TableCell>
      <TableCell className="text-muted-foreground text-sm py-2 w-[88px]">{dateFmt(po.due_date)}</TableCell>
      <TableCell className="text-right text-sm py-2 w-[90px] tabular-nums">
        {po.amount != null ? format(po.amount, currency).formatted : '—'}
      </TableCell>
      <TableCell className="py-2 w-[82px]">
        <PurchaseOrderStatusBadge status={po.status} className="text-xs" />
      </TableCell>
      <TableCell className="py-2 w-[80px] text-xs text-muted-foreground">
        {po.approval === 1 ? 'Approved' : 'Not approved'}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm py-2 w-[72px]">{linkedInvoiceCount}</TableCell>
      <TableCell className="py-2 w-[72px]">
        <span className="text-sm text-muted-foreground">{expenseLinkCount}</span>
        {showActions && (
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-0.5 align-middle" onClick={onLinkExpenses} aria-label="Link expenses">
            <Link2 className="size-3.5" />
          </Button>
        )}
      </TableCell>
      {showActions && (
        <TableCell className="py-2 w-[88px]">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Edit PO">
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onArchive} aria-label="Archive PO">
              <ArchiveIcon className="size-4" />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  )
}

function LinkExpensesToInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  expenses,
  accountById,
  format,
  currency,
  onLink,
  onUnlink,
  isLinking,
  isUnlinking,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: VendorInvoice
  expenses: Expense[]
  accountById: Map<string, { id: string; code: string; name: string }>
  format: (amount: number, currency: string) => { formatted: string }
  currency: string
  onLink: (expenseId: string) => void
  onUnlink: (expenseId: string) => void
  isLinking: boolean
  isUnlinking: boolean
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { data: links = [] } = useQuery({
    queryKey: vendorInvoiceExpenseLinksQueryKey(invoice.id),
    queryFn: () => listExpenseLinksByInvoice(invoice.id),
    enabled: open,
  })
  const linkedExpenseIds = useMemo(() => new Set(links.map((l) => l.expense_id)), [links])
  const linkedExpenses = useMemo(
    () => expenses.filter((e) => linkedExpenseIds.has(e.id)),
    [expenses, linkedExpenseIds]
  )
  const candidates = useMemo(
    () => expenses.filter((e) => !linkedExpenseIds.has(e.id)),
    [expenses, linkedExpenseIds]
  )

  const navigate = useNavigate()
  const toggleCandidate = (expenseId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(expenseId)) next.delete(expenseId)
      else next.add(expenseId)
      return next
    })
  }
  const handleLinkSelected = () => {
    selectedIds.forEach((id) => onLink(id))
    setSelectedIds(new Set())
  }
  const openInMatchSpend = (expenseId: string) => {
    navigate('/budget', { state: { examineExpenseId: expenseId } })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Link expenses to invoice {invoice.invoice_number}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-hidden min-h-0">
          {linkedExpenses.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Linked expenses</p>
              <ul className="border border-border rounded-md divide-y divide-border max-h-32 overflow-y-auto">
                {linkedExpenses.map((e) => {
                  const acc = e.account_id ? accountById.get(e.account_id) : null
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="text-muted-foreground shrink-0 w-16">
                        {new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="min-w-0 truncate flex-1">{(e.notes || e.vendor || '—').slice(0, 40)}</span>
                      {acc && <span className="text-muted-foreground text-xs shrink-0">{acc.code}</span>}
                      <span className="tabular-nums shrink-0">{format(e.amount, currency).formatted}</span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-muted-foreground"
                              onClick={() => openInMatchSpend(e.id)}
                              aria-label="Open in Match Spend"
                            >
                              <Receipt className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open in Match Spend</TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-muted-foreground shrink-0"
                          onClick={() => onUnlink(e.id)}
                          disabled={isUnlinking}
                          aria-label="Unlink"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {candidates.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Add expenses</p>
              <ul className="border border-border rounded-md divide-y divide-border max-h-48 overflow-y-auto">
                {candidates.map((e) => {
                  const acc = e.account_id ? accountById.get(e.account_id) : null
                  return (
                    <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Checkbox
                        checked={selectedIds.has(e.id)}
                        onCheckedChange={() => toggleCandidate(e.id)}
                        aria-label={`Select ${e.date} ${format(e.amount, currency).formatted}`}
                      />
                      <span className="text-muted-foreground shrink-0 w-16">
                        {new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="min-w-0 truncate flex-1">{(e.notes || e.vendor || '—').slice(0, 40)}</span>
                      {acc && <span className="text-muted-foreground text-xs shrink-0">{acc.code}</span>}
                      <span className="tabular-nums shrink-0">{format(e.amount, currency).formatted}</span>
                    </li>
                  )
                })}
              </ul>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={handleLinkSelected}
                disabled={selectedIds.size === 0 || isLinking}
              >
                Link selected ({selectedIds.size})
              </Button>
            </div>
          )}
          {linkedExpenses.length === 0 && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">No expenses for this vendor to link.</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LinkExpensesToPODialog({
  open,
  onOpenChange,
  po,
  expenses,
  accountById,
  format,
  currency,
  onLink,
  onUnlink,
  isLinking,
  isUnlinking,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: VendorPurchaseOrder
  expenses: Expense[]
  accountById: Map<string, { id: string; code: string; name: string }>
  format: (amount: number, currency: string) => { formatted: string }
  currency: string
  onLink: (expenseId: string) => void
  onUnlink: (expenseId: string) => void
  isLinking: boolean
  isUnlinking: boolean
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { data: links = [] } = useQuery({
    queryKey: vendorPurchaseOrderExpenseLinksQueryKey(po.id),
    queryFn: () => listExpenseLinksByPurchaseOrder(po.id),
    enabled: open,
  })
  const linkedExpenseIds = useMemo(() => new Set(links.map((l) => l.expense_id)), [links])
  const linkedExpenses = useMemo(
    () => expenses.filter((e) => linkedExpenseIds.has(e.id)),
    [expenses, linkedExpenseIds]
  )
  const candidates = useMemo(
    () => expenses.filter((e) => !linkedExpenseIds.has(e.id)),
    [expenses, linkedExpenseIds]
  )

  const navigate = useNavigate()
  const toggleCandidate = (expenseId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(expenseId)) next.delete(expenseId)
      else next.add(expenseId)
      return next
    })
  }
  const handleLinkSelected = () => {
    selectedIds.forEach((id) => onLink(id))
    setSelectedIds(new Set())
  }
  const openInMatchSpend = (expenseId: string) => {
    navigate('/budget', { state: { examineExpenseId: expenseId } })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Link expenses to PO {po.po_number}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-hidden min-h-0">
          {linkedExpenses.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Linked expenses</p>
              <ul className="border border-border rounded-md divide-y divide-border max-h-32 overflow-y-auto">
                {linkedExpenses.map((e) => {
                  const acc = e.account_id ? accountById.get(e.account_id) : null
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="text-muted-foreground shrink-0 w-16">
                        {new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="min-w-0 truncate flex-1">{(e.notes || e.vendor || '—').slice(0, 40)}</span>
                      {acc && <span className="text-muted-foreground text-xs shrink-0">{acc.code}</span>}
                      <span className="tabular-nums shrink-0">{format(e.amount, currency).formatted}</span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-muted-foreground"
                              onClick={() => openInMatchSpend(e.id)}
                              aria-label="Open in Match Spend"
                            >
                              <Receipt className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open in Match Spend</TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-muted-foreground shrink-0"
                          onClick={() => onUnlink(e.id)}
                          disabled={isUnlinking}
                          aria-label="Unlink"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {candidates.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Add expenses</p>
              <ul className="border border-border rounded-md divide-y divide-border max-h-48 overflow-y-auto">
                {candidates.map((e) => {
                  const acc = e.account_id ? accountById.get(e.account_id) : null
                  return (
                    <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Checkbox
                        checked={selectedIds.has(e.id)}
                        onCheckedChange={() => toggleCandidate(e.id)}
                        aria-label={`Select ${e.date} ${format(e.amount, currency).formatted}`}
                      />
                      <span className="text-muted-foreground shrink-0 w-16">
                        {new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="min-w-0 truncate flex-1">{(e.notes || e.vendor || '—').slice(0, 40)}</span>
                      {acc && <span className="text-muted-foreground text-xs shrink-0">{acc.code}</span>}
                      <span className="tabular-nums shrink-0">{format(e.amount, currency).formatted}</span>
                    </li>
                  )
                })}
              </ul>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={handleLinkSelected}
                disabled={selectedIds.size === 0 || isLinking}
              >
                Link selected ({selectedIds.size})
              </Button>
            </div>
          )}
          {linkedExpenses.length === 0 && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">No expenses for this vendor to link.</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditVendorDialog({
  open,
  onOpenChange,
  vendor,
  onSubmit,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendor: { company_name: string; primary_contact_full_name: string | null; primary_contact_email: string | null }
  onSubmit: (data: z.infer<typeof editVendorSchema>) => void
  isLoading: boolean
}) {
  const form = useForm<z.infer<typeof editVendorSchema>>({
    resolver: zodResolver(editVendorSchema),
    defaultValues: {
      company_name: vendor.company_name,
      primary_contact_full_name: vendor.primary_contact_full_name ?? '',
      primary_contact_email: vendor.primary_contact_email ?? '',
    },
  })
  useEffect(() => {
    if (open) {
      form.reset({
        company_name: vendor.company_name,
        primary_contact_full_name: vendor.primary_contact_full_name ?? '',
        primary_contact_email: vendor.primary_contact_email ?? '',
      })
    }
  }, [open, vendor.company_name, vendor.primary_contact_full_name, vendor.primary_contact_email, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit vendor</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="edit-company">Company name</Label>
            <Input id="edit-company" {...form.register('company_name')} className="mt-1" />
            {form.formState.errors.company_name && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.company_name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-contact">Primary contact</Label>
              <Input id="edit-contact" {...form.register('primary_contact_full_name')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" {...form.register('primary_contact_email')} className="mt-1" />
              {form.formState.errors.primary_contact_email && (
                <p className="text-destructive text-sm mt-1">{form.formState.errors.primary_contact_email.message}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>

function CreateInvoiceDialog({
  open,
  onOpenChange,
  productionId,
  vendorId,
  currency,
  activePurchaseOrders,
  onSubmit,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string
  vendorId: string
  currency: string
  activePurchaseOrders: VendorPurchaseOrder[]
  onSubmit: (data: {
    production_id: string
    vendor_id: string
    invoice_number: string
    issue_date?: string | null
    due_date?: string | null
    amount?: number | null
    tax?: number | null
    currency_code?: string | null
    status?: InvoiceFormValues['status']
    notes?: string | null
    po_id?: string | null
  }) => void
  isLoading: boolean
}) {
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema) as Resolver<InvoiceFormValues>,
    defaultValues: {
      invoice_number: '',
      issue_date: '',
      due_date: '',
      amount: undefined,
      tax: undefined,
      currency_code: currency,
      status: 'draft',
      notes: '',
      po_id: null,
    },
  })
  useEffect(() => {
    if (open) {
      form.reset({
        invoice_number: '',
        issue_date: '',
        due_date: '',
        amount: undefined,
        tax: undefined,
        currency_code: currency,
        status: 'draft',
        notes: '',
        po_id: null,
      })
    }
  }, [open, currency, form])

  const handleSubmit = (data: InvoiceFormValues) => {
    onSubmit({
      production_id: productionId,
      vendor_id: vendorId,
      invoice_number: data.invoice_number.trim(),
      issue_date: data.issue_date?.trim() || null,
      due_date: data.due_date?.trim() || null,
      amount: data.amount ?? null,
      tax: data.tax ?? null,
      currency_code: data.currency_code?.trim() || null,
      status: data.status,
      notes: data.notes?.trim() || null,
      po_id: data.po_id ?? null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="inv-number">Invoice number</Label>
            <Input id="inv-number" {...form.register('invoice_number')} className="mt-1" placeholder="e.g. INV-001" />
            {form.formState.errors.invoice_number && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.invoice_number.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inv-issue">Issue date</Label>
              <Input id="inv-issue" type="date" {...form.register('issue_date')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="inv-due">Due date</Label>
              <Input id="inv-due" type="date" {...form.register('due_date')} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inv-amount">Amount</Label>
              <Input
                id="inv-amount"
                type="number"
                step="any"
                placeholder="0"
                {...form.register('amount', { valueAsNumber: true })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="inv-tax">Tax (manual)</Label>
              <Input
                id="inv-tax"
                type="number"
                step="any"
                placeholder="0"
                {...form.register('tax', { valueAsNumber: true })}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inv-currency">Currency</Label>
              <Input id="inv-currency" {...form.register('currency_code')} className="mt-1" placeholder="e.g. GBP" />
            </div>
            <div>
              <Label htmlFor="inv-status">Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) => form.setValue('status', v as InvoiceFormValues['status'])}
              >
                <SelectTrigger id="inv-status" className="mt-1">
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
          <div>
            <Label htmlFor="inv-po">Purchase order</Label>
            <Select
              value={form.watch('po_id') ?? 'none'}
              onValueChange={(v) => form.setValue('po_id', v === 'none' ? null : v)}
            >
              <SelectTrigger id="inv-po" className="mt-1">
                <SelectValue placeholder="No PO" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No PO</SelectItem>
                {activePurchaseOrders.map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.po_number}
                    {po.description ? ` — ${po.description.slice(0, 30)}${po.description.length > 30 ? '…' : ''}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="inv-notes">Notes</Label>
            <Input id="inv-notes" {...form.register('notes')} className="mt-1" placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  currency,
  activePurchaseOrders,
  onSubmit,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: VendorInvoice
  currency: string
  activePurchaseOrders: VendorPurchaseOrder[]
  onSubmit: (patch: Partial<Pick<VendorInvoice, 'invoice_number' | 'issue_date' | 'due_date' | 'amount' | 'tax' | 'currency_code' | 'status' | 'notes' | 'po_id'>>) => void
  isLoading: boolean
}) {
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema) as Resolver<InvoiceFormValues>,
    defaultValues: {
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date ?? '',
      due_date: invoice.due_date ?? '',
      amount: invoice.amount ?? undefined,
      tax: invoice.tax ?? undefined,
      currency_code: invoice.currency_code ?? currency,
      status: invoice.status,
      notes: invoice.notes ?? '',
      po_id: invoice.po_id ?? null,
    },
  })
  useEffect(() => {
    if (open && invoice) {
      form.reset({
        invoice_number: invoice.invoice_number,
        issue_date: invoice.issue_date ?? '',
        due_date: invoice.due_date ?? '',
        amount: invoice.amount ?? undefined,
        tax: invoice.tax ?? undefined,
        currency_code: invoice.currency_code ?? currency,
        status: invoice.status,
        notes: invoice.notes ?? '',
        po_id: invoice.po_id ?? null,
      })
    }
  }, [open, invoice, currency, form])

  const handleSubmit = (data: InvoiceFormValues) => {
    onSubmit({
      invoice_number: data.invoice_number.trim(),
      issue_date: data.issue_date?.trim() || null,
      due_date: data.due_date?.trim() || null,
      amount: data.amount ?? null,
      tax: data.tax ?? null,
      currency_code: data.currency_code?.trim() || null,
      status: data.status,
      notes: data.notes?.trim() || null,
      po_id: data.po_id ?? null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit invoice</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="edit-inv-number">Invoice number</Label>
            <Input id="edit-inv-number" {...form.register('invoice_number')} className="mt-1" />
            {form.formState.errors.invoice_number && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.invoice_number.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-inv-issue">Issue date</Label>
              <Input id="edit-inv-issue" type="date" {...form.register('issue_date')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="edit-inv-due">Due date</Label>
              <Input id="edit-inv-due" type="date" {...form.register('due_date')} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-inv-amount">Amount</Label>
              <Input
                id="edit-inv-amount"
                type="number"
                step="any"
                {...form.register('amount', { valueAsNumber: true })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-inv-tax">Tax (manual)</Label>
              <Input
                id="edit-inv-tax"
                type="number"
                step="any"
                {...form.register('tax', { valueAsNumber: true })}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-inv-currency">Currency</Label>
              <Input id="edit-inv-currency" {...form.register('currency_code')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="edit-inv-status">Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) => form.setValue('status', v as InvoiceFormValues['status'])}
              >
                <SelectTrigger id="edit-inv-status" className="mt-1">
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
          <div>
            <Label htmlFor="edit-inv-po">Purchase order</Label>
            <Select
              value={form.watch('po_id') ?? 'none'}
              onValueChange={(v) => form.setValue('po_id', v === 'none' ? null : v)}
            >
              <SelectTrigger id="edit-inv-po" className="mt-1">
                <SelectValue placeholder="No PO" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No PO</SelectItem>
                {activePurchaseOrders.map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.po_number}
                    {po.description ? ` — ${po.description.slice(0, 30)}${po.description.length > 30 ? '…' : ''}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-inv-notes">Notes</Label>
            <Input id="edit-inv-notes" {...form.register('notes')} className="mt-1" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type POFormValues = z.infer<typeof poFormSchema>

function CreatePODialog({
  open,
  onOpenChange,
  productionId,
  vendorId,
  onSubmit,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string
  vendorId: string
  onSubmit: (data: Parameters<typeof createVendorPurchaseOrder>[0]) => void
  isLoading: boolean
}) {
  const form = useForm<POFormValues>({
    resolver: zodResolver(poFormSchema) as Resolver<POFormValues>,
    defaultValues: {
      po_number: '',
      description: '',
      issue_date: '',
      due_date: '',
      amount: undefined,
      status: 'draft',
      approval: false,
      notes: '',
    },
  })
  useEffect(() => {
    if (open) {
      form.reset({
        po_number: '',
        description: '',
        issue_date: '',
        due_date: '',
        amount: undefined,
        status: 'draft',
        approval: false,
        notes: '',
      })
    }
  }, [open, form])

  const handleSubmit = (data: POFormValues) => {
    onSubmit({
      production_id: productionId,
      vendor_id: vendorId,
      po_number: data.po_number.trim(),
      description: data.description?.trim() || null,
      issue_date: data.issue_date?.trim() || null,
      due_date: data.due_date?.trim() || null,
      amount: data.amount ?? null,
      status: data.status,
      approval: data.approval ? 1 : 0,
      notes: data.notes?.trim() || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="po-number">PO number</Label>
            <Input id="po-number" {...form.register('po_number')} className="mt-1" placeholder="e.g. PO-001" />
            {form.formState.errors.po_number && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.po_number.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="po-desc">Description</Label>
            <Input id="po-desc" {...form.register('description')} className="mt-1" placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="po-issue">Issue date</Label>
              <Input id="po-issue" type="date" {...form.register('issue_date')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="po-due">Due date</Label>
              <Input id="po-due" type="date" {...form.register('due_date')} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="po-amount">Amount</Label>
            <Input
              id="po-amount"
              type="number"
              step="any"
              placeholder="0"
              {...form.register('amount', { valueAsNumber: true })}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="po-status">Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) => form.setValue('status', v as POFormValues['status'])}
              >
                <SelectTrigger id="po-status" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PO_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-8">
              <Checkbox
                id="po-approval"
                checked={form.watch('approval')}
                onCheckedChange={(checked) => form.setValue('approval', checked === true)}
              />
              <Label htmlFor="po-approval" className="text-sm font-normal cursor-pointer">
                Approved
              </Label>
            </div>
          </div>
          <div>
            <Label htmlFor="po-notes">Notes</Label>
            <Input id="po-notes" {...form.register('notes')} className="mt-1" placeholder="Optional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditPODialog({
  open,
  onOpenChange,
  po,
  onSubmit,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: VendorPurchaseOrder
  onSubmit: (patch: Parameters<typeof updateVendorPurchaseOrder>[1]) => void
  isLoading: boolean
}) {
  const form = useForm<POFormValues>({
    resolver: zodResolver(poFormSchema) as Resolver<POFormValues>,
    defaultValues: {
      po_number: po.po_number,
      description: po.description ?? '',
      issue_date: po.issue_date ?? '',
      due_date: po.due_date ?? '',
      amount: po.amount ?? undefined,
      status: po.status,
      approval: po.approval === 1,
      notes: po.notes ?? '',
    },
  })
  useEffect(() => {
    if (open && po) {
      form.reset({
        po_number: po.po_number,
        description: po.description ?? '',
        issue_date: po.issue_date ?? '',
        due_date: po.due_date ?? '',
        amount: po.amount ?? undefined,
        status: po.status,
        approval: po.approval === 1,
        notes: po.notes ?? '',
      })
    }
  }, [open, po, form])

  const handleSubmit = (data: POFormValues) => {
    onSubmit({
      po_number: data.po_number.trim(),
      description: data.description?.trim() || null,
      issue_date: data.issue_date?.trim() || null,
      due_date: data.due_date?.trim() || null,
      amount: data.amount ?? null,
      status: data.status,
      approval: data.approval ? 1 : 0,
      notes: data.notes?.trim() || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit purchase order</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="edit-po-number">PO number</Label>
            <Input id="edit-po-number" {...form.register('po_number')} className="mt-1" />
            {form.formState.errors.po_number && (
              <p className="text-destructive text-sm mt-1">{form.formState.errors.po_number.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="edit-po-desc">Description</Label>
            <Input id="edit-po-desc" {...form.register('description')} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-po-issue">Issue date</Label>
              <Input id="edit-po-issue" type="date" {...form.register('issue_date')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="edit-po-due">Due date</Label>
              <Input id="edit-po-due" type="date" {...form.register('due_date')} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-po-amount">Amount</Label>
            <Input
              id="edit-po-amount"
              type="number"
              step="any"
              {...form.register('amount', { valueAsNumber: true })}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-po-status">Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) => form.setValue('status', v as POFormValues['status'])}
              >
                <SelectTrigger id="edit-po-status" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PO_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-8">
              <Checkbox
                id="edit-po-approval"
                checked={form.watch('approval')}
                onCheckedChange={(checked) => form.setValue('approval', checked === true)}
              />
              <Label htmlFor="edit-po-approval" className="text-sm font-normal cursor-pointer">
                Approved
              </Label>
            </div>
          </div>
          <div>
            <Label htmlFor="edit-po-notes">Notes</Label>
            <Input id="edit-po-notes" {...form.register('notes')} className="mt-1" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
