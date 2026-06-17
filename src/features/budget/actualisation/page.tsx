import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useCurrency } from '@/hooks/useCurrency'
import { listBudgetItemsByProduction, listExpensesByProduction } from '@/lib/db/repositories/budget'
import { listAccounts } from '@/lib/db/repositories/budgetAccounts'
import {
  listBudgetItemExpenseLinksByProduction,
  listBudgetItemExpenseLinksForBudgetItem,
  listBudgetItemExpenseLinksForExpense,
  createBudgetItemExpenseLinks,
  updateBudgetItemExpenseLink,
  deleteBudgetItemExpenseLink,
} from '@/lib/db/repositories/budgetReconciliation'
import { riskWatchQueryKey } from '@/lib/budget/vendors/riskWatch'
import {
  getReconciliationSummary,
  getBudgetItemMatchStatus,
  getBudgetItemRemainingEstimate,
  sumAllocatedAmountForExpense,
  sumMatchedAmountForBudgetItem,
} from '@/lib/budget/reconciliation'
import { getExpenseUnallocatedForFloatMatching, sumFloatMatchedForExpense } from '@/lib/budget/floatExpenseMatching'
import { moneyExceeds, roundMoney } from '@/lib/money/roundMoney'
import { listFloatExpenseLinksByExpense, listFloatExpenseLinksByProduction } from '@/lib/db/repositories/floatReconciliation'
import { listFloatsByProduction } from '@/lib/db/repositories/floats'
import { listPeopleByProduction } from '@/lib/db/repositories/person'
import { useWorkingBudgetRevision } from '@/hooks/useWorkingBudgetRevision'
import {
  filterLineItemsByClassification,
  filterExpensesByClassification,
  type ClassificationFilter,
} from '@/lib/budget/matching'
import type {
  BudgetItemExpenseLink,
  BudgetItemReconciliationStatus,
  Expense,
  ExpenseReconciliationStatus,
  FloatExpenseLink,
  Person,
  PettyCashFloat,
} from '@/lib/db/types'
import type { LineItemType } from '@/lib/db/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ClassificationBadge } from '@/features/budget/ClassificationBadge'
import { LineItemMatchStatusBadge } from '@/features/budget/actualisation/LineItemMatchStatusBadge'
import { ExpenseAllocationStatusBadge } from '@/features/budget/actualisation/ExpenseAllocationStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { parseMoneyInput } from '@/lib/budget/fieldValidation'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Receipt, AlertTriangle } from 'lucide-react'

const LINE_ITEM_STATUS_ORDER: BudgetItemReconciliationStatus[] = ['unmatched', 'partial', 'matched', 'overspent']
const EXPENSE_STATUS_ORDER: ExpenseReconciliationStatus[] = ['unallocated', 'partial', 'allocated']

const TYPE_FILTER_OPTIONS: { value: ClassificationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'labour', label: 'Labour' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'rental', label: 'Rental' },
  { value: 'allow', label: 'Allow' },
  { value: 'deposit', label: 'Deposit' },
]

const LINE_ITEM_STATUS_FILTER_OPTIONS: { value: 'all' | BudgetItemReconciliationStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'partial', label: 'Partially matched' },
  { value: 'matched', label: 'Matched' },
  { value: 'overspent', label: 'Overspent' },
]

const EXPENSE_STATUS_FILTER_OPTIONS: { value: 'all' | ExpenseReconciliationStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unallocated', label: 'Unallocated' },
  { value: 'partial', label: 'Partially allocated' },
  { value: 'allocated', label: 'Allocated' },
]

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function expenseDescription(expense: Expense): string {
  return (expense.vendor ?? expense.notes ?? 'Expense').trim() || 'Expense'
}

function getExpenseAllocationStatusIncludingFloats(
  expense: Expense,
  budgetLinks: BudgetItemExpenseLink[],
  floatLinksForExpense: FloatExpenseLink[]
): ExpenseReconciliationStatus {
  const budget = sumAllocatedAmountForExpense(expense.id, budgetLinks)
  const floatPart = sumFloatMatchedForExpense(expense.id, floatLinksForExpense)
  const total = budget + floatPart
  if (total === 0) return 'unallocated'
  if (total < expense.amount) return 'partial'
  return 'allocated'
}

function buildFloatAllocationLabel(
  floatId: string,
  floatById: Map<string, PettyCashFloat>,
  personById: Map<string, Person>
): string {
  const fl = floatById.get(floatId)
  const person = fl ? personById.get(fl.person_id) : null
  const name = person?.name?.trim() ? person.name.trim() : 'Unknown'
  const dept = person?.department?.trim() ? person.department.trim() : ''
  const deptPart = dept && dept !== 'Unassigned' ? ` (${dept})` : ''
  return `${name}${deptPart}`
}

export function ActualisationPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const { format } = useCurrency()
  const productionCurrency = currentProduction?.currency_code ?? 'GBP'
  const queryClient = useQueryClient()
  const { data: workingBudgetRevision } = useWorkingBudgetRevision(currentProductionId)
  const revisionId = workingBudgetRevision?.id

  const [typeFilter, setTypeFilter] = useState<ClassificationFilter>('all')
  const [lineItemStatusFilter, setLineItemStatusFilter] = useState<'all' | BudgetItemReconciliationStatus>('all')
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<'all' | ExpenseReconciliationStatus>('all')
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null)
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null)
  const [matchSpendModalOpen, setMatchSpendModalOpen] = useState(false)
  const [selectedAllocationItemIds, setSelectedAllocationItemIds] = useState<string[]>([])
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({})
  const [matchSpendSaveError, setMatchSpendSaveError] = useState<string | null>(null)
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [editingLinkAmount, setEditingLinkAmount] = useState('')
  const [editingLinkError, setEditingLinkError] = useState<string | null>(null)
  const [linkIdToConfirmRemove, setLinkIdToConfirmRemove] = useState<string | null>(null)
  const [deleteLinkError, setDeleteLinkError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const { data: items = [] } = useQuery({
    queryKey: ['budget-items', currentProductionId, revisionId],
    queryFn: () => listBudgetItemsByProduction(currentProductionId!, { revisionId }),
    enabled: !!currentProductionId,
  })
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', currentProductionId],
    queryFn: () => listExpensesByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })
  const { data: links = [] } = useQuery({
    queryKey: ['budget-item-expense-links', currentProductionId, revisionId],
    queryFn: () => listBudgetItemExpenseLinksByProduction(currentProductionId!, revisionId),
    enabled: !!currentProductionId,
  })
  const { data: accounts = [] } = useQuery({
    queryKey: ['budget-accounts', currentProductionId],
    queryFn: () => listAccounts(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const { data: linksForSelectedItem = [] } = useQuery({
    queryKey: ['budget-item-expense-links-for-item', selectedLineItemId, revisionId],
    queryFn: () =>
      listBudgetItemExpenseLinksForBudgetItem(selectedLineItemId!, currentProductionId!, revisionId),
    enabled: !!selectedLineItemId,
  })
  const { data: linksForSelectedExpense = [] } = useQuery({
    queryKey: ['budget-item-expense-links-for-expense', selectedExpenseId, revisionId],
    queryFn: () => listBudgetItemExpenseLinksForExpense(selectedExpenseId!, revisionId),
    enabled: !!selectedExpenseId,
  })

  const { data: floatLinksForSelectedExpense = [] } = useQuery({
    queryKey: ['float-expense-links-for-expense', selectedExpenseId, revisionId],
    queryFn: () => listFloatExpenseLinksByExpense(selectedExpenseId!, revisionId),
    enabled: !!selectedExpenseId,
  })

  const { data: productionFloatExpenseLinks = [] } = useQuery({
    queryKey: ['float-expense-links-by-production', currentProductionId, revisionId],
    queryFn: () => listFloatExpenseLinksByProduction(currentProductionId!, revisionId),
    enabled: !!currentProductionId,
  })

  const { data: productionFloats = [] } = useQuery({
    queryKey: ['floats', currentProductionId, revisionId],
    queryFn: () => listFloatsByProduction(currentProductionId!, revisionId),
    enabled: !!currentProductionId,
  })

  const { data: people = [] } = useQuery({
    queryKey: ['people', currentProductionId],
    queryFn: () => listPeopleByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const accountById = useMemo(() => {
    const m = new Map(accounts.map((a) => [a.id, a]))
    return m
  }, [accounts])

  const summary = useMemo(
    () => getReconciliationSummary({ budgetItems: items, expenses, links }),
    [items, expenses, links]
  )

  const floatLinksByExpenseId = useMemo(() => {
    const m = new Map<string, FloatExpenseLink[]>()
    for (const l of productionFloatExpenseLinks) {
      const arr = m.get(l.expense_id) ?? []
      arr.push(l)
      m.set(l.expense_id, arr)
    }
    return m
  }, [productionFloatExpenseLinks])

  const floatById = useMemo(() => new Map(productionFloats.map((f) => [f.id, f])), [productionFloats])
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const filteredItems = useMemo(() => {
    let list = filterLineItemsByClassification(items, typeFilter)
    if (lineItemStatusFilter !== 'all') {
      list = list.filter((item) => getBudgetItemMatchStatus(item, links) === lineItemStatusFilter)
    }
    list = [...list].sort((a, b) => {
      const statusA = getBudgetItemMatchStatus(a, links)
      const statusB = getBudgetItemMatchStatus(b, links)
      const orderA = LINE_ITEM_STATUS_ORDER.indexOf(statusA)
      const orderB = LINE_ITEM_STATUS_ORDER.indexOf(statusB)
      if (orderA !== orderB) return orderA - orderB
      const codeA = accountById.get(a.account_id ?? '')?.code ?? ''
      const codeB = accountById.get(b.account_id ?? '')?.code ?? ''
      return codeA.localeCompare(codeB)
    })
    return list
  }, [items, typeFilter, lineItemStatusFilter, links, accountById])

  const filteredExpenses = useMemo(() => {
    let list = filterExpensesByClassification(expenses, typeFilter)
    if (expenseStatusFilter !== 'all') {
      list = list.filter(
        (e) =>
          getExpenseAllocationStatusIncludingFloats(e, links, floatLinksByExpenseId.get(e.id) ?? []) ===
          expenseStatusFilter
      )
    }
    list = [...list].sort((a, b) => {
      const statusA = getExpenseAllocationStatusIncludingFloats(a, links, floatLinksByExpenseId.get(a.id) ?? [])
      const statusB = getExpenseAllocationStatusIncludingFloats(b, links, floatLinksByExpenseId.get(b.id) ?? [])
      const orderA = EXPENSE_STATUS_ORDER.indexOf(statusA)
      const orderB = EXPENSE_STATUS_ORDER.indexOf(statusB)
      if (orderA !== orderB) return orderA - orderB
      return b.date.localeCompare(a.date)
    })
    return list
  }, [expenses, typeFilter, expenseStatusFilter, links, floatLinksByExpenseId])

  const expenseById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses])
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  useEffect(() => {
    if (!matchSpendModalOpen) {
      queueMicrotask(() => {
        setSelectedAllocationItemIds([])
        setAllocationAmounts({})
        setMatchSpendSaveError(null)
        setEditingLinkId(null)
        setEditingLinkAmount('')
        setEditingLinkError(null)
        setLinkIdToConfirmRemove(null)
        setDeleteLinkError(null)
      })
    }
  }, [matchSpendModalOpen])

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedAllocationItemIds([])
      setAllocationAmounts({})
      setEditingLinkId(null)
      setEditingLinkAmount('')
      setEditingLinkError(null)
      setLinkIdToConfirmRemove(null)
      setDeleteLinkError(null)
    })
  }, [selectedExpenseId])

  const candidateLineItems = useMemo(() => {
    if (!selectedExpenseId) return []
    const expense = expenseById.get(selectedExpenseId)
    if (!expense?.account_id) return []
    const sameAccount = items.filter((i) => i.account_id === expense.account_id)
    return [...sameAccount].sort((a, b) => {
      const aSameType = a.line_item_type === expense.transaction_type ? 0 : 1
      const bSameType = b.line_item_type === expense.transaction_type ? 0 : 1
      if (aSameType !== bSameType) return aSameType - bSameType
      const statusA = getBudgetItemMatchStatus(a, links)
      const statusB = getBudgetItemMatchStatus(b, links)
      const orderA = LINE_ITEM_STATUS_ORDER.indexOf(statusA)
      const orderB = LINE_ITEM_STATUS_ORDER.indexOf(statusB)
      if (orderA !== orderB) return orderA - orderB
      return a.description.localeCompare(b.description)
    })
  }, [selectedExpenseId, expenseById, items, links])

  const selectedExpenseForModal = selectedExpenseId ? expenseById.get(selectedExpenseId) ?? null : null
  const allocationValidation = useMemo(() => {
    if (!selectedExpenseForModal) return { canSave: false, payload: null }
    const unallocated = getExpenseUnallocatedForFloatMatching(
      selectedExpenseForModal,
      links,
      floatLinksForSelectedExpense
    )
    const allocatingNow = roundMoney(
      selectedAllocationItemIds.reduce(
        (sum, id) =>
          sum +
          (Number.isFinite(parseFloat(allocationAmounts[id] ?? '')) ? parseFloat(allocationAmounts[id]!) : 0),
        0
      )
    )
    const allValid =
      selectedAllocationItemIds.length >= 1 &&
      selectedAllocationItemIds.every((id) => {
        const n = parseFloat(allocationAmounts[id] ?? '')
        return Number.isFinite(n) && n > 0
      })
    const canSave = allValid && !moneyExceeds(allocatingNow, unallocated)
    const payload =
      selectedAllocationItemIds.length >= 1
        ? {
            expenseId: selectedExpenseForModal.id,
            allocations: selectedAllocationItemIds.map((id) => ({
              budgetItemId: id,
              matchedAmount: roundMoney(parseFloat(allocationAmounts[id] ?? '0') || 0),
            })),
          }
        : null
    return { canSave, payload }
  }, [selectedExpenseForModal, links, floatLinksForSelectedExpense, selectedAllocationItemIds, allocationAmounts])

  function invalidateLinksForExpenseAndItem(productionId: string, budgetRevisionId: string | undefined, expenseId: string, budgetItemId: string) {
    queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', productionId, budgetRevisionId] })
    queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links-for-expense', expenseId, budgetRevisionId] })
    queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links-for-item', budgetItemId, budgetRevisionId] })
    queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(productionId, budgetRevisionId) })
  }

  useEffect(() => {
    if (!successMessage) return
    const t = setTimeout(() => setSuccessMessage(null), 3000)
    return () => clearTimeout(t)
  }, [successMessage])

  const hasActiveFilters =
    typeFilter !== 'all' ||
    lineItemStatusFilter !== 'all' ||
    expenseStatusFilter !== 'all'
  const clearFilters = () => {
    setTypeFilter('all')
    setLineItemStatusFilter('all')
    setExpenseStatusFilter('all')
  }

  const createLinksMutation = useMutation({
    mutationFn: createBudgetItemExpenseLinks,
    onSuccess: (_data, variables) => {
      setMatchSpendModalOpen(false)
      setMatchSpendSaveError(null)
      setSuccessMessage('Spend matched.')
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', variables.productionId, revisionId] })
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links-for-expense', variables.expenseId, revisionId] })
      variables.allocations.forEach((a) => {
        queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links-for-item', a.budgetItemId, revisionId] })
      })
    },
    onError: (err: Error) => {
      setMatchSpendSaveError(err.message)
    },
  })

  const updateLinkMutation = useMutation({
    mutationFn: ({
      id,
      matchedAmount,
    }: {
      id: string
      matchedAmount: number
      expenseId?: string
      budgetItemId?: string
    }) => updateBudgetItemExpenseLink({ id, matchedAmount }),
    onSuccess: (_data, variables) => {
      setEditingLinkId(null)
      setEditingLinkAmount('')
      setEditingLinkError(null)
      setSuccessMessage('Allocation updated.')
      if (currentProductionId && variables.expenseId && variables.budgetItemId) {
        invalidateLinksForExpenseAndItem(currentProductionId, revisionId, variables.expenseId, variables.budgetItemId)
      }
    },
    onError: (err: Error) => {
      setEditingLinkError(err.message)
    },
  })

  const deleteLinkMutation = useMutation({
    mutationFn: ({ id }: { id: string; expenseId: string; budgetItemId: string }) => deleteBudgetItemExpenseLink(id),
    onSuccess: (_data, variables) => {
      setLinkIdToConfirmRemove(null)
      setDeleteLinkError(null)
      setSuccessMessage('Match removed.')
      if (currentProductionId) {
        invalidateLinksForExpenseAndItem(currentProductionId, revisionId, variables.expenseId, variables.budgetItemId)
      }
    },
    onError: (err: Error) => {
      setLinkIdToConfirmRemove(null)
      setDeleteLinkError(err.message)
    },
  })

  const handleMatchSpendSave = () => {
    if (!allocationValidation.payload || !currentProductionId) return
    setMatchSpendSaveError(null)
    createLinksMutation.mutate({
      productionId: currentProductionId,
      revisionId,
      expenseId: allocationValidation.payload.expenseId,
      allocations: allocationValidation.payload.allocations,
    })
  }

  if (!currentProductionId) {
    return (
      <div>
        <h2 className="text-lg font-semibold">Match Expenses</h2>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Line items</p>
            <ul className="flex flex-wrap gap-4 text-sm">
              <li className="flex items-center gap-1.5">
                <span className="text-green-600 dark:text-green-500">✔</span> {summary.lineItems.matched} matched
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-amber-500">⚠</span> {summary.lineItems.partial} partially matched
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-muted-foreground">✖</span> {summary.lineItems.unmatched} unmatched
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-destructive">▲</span> {summary.lineItems.overspent} overspent
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Expenses</p>
            <ul className="flex flex-wrap gap-4 text-sm">
              <li className="flex items-center gap-1.5">
                <span className="text-green-600 dark:text-green-500">✔</span> {summary.expenses.allocated} allocated
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-amber-500">⚠</span> {summary.expenses.partial} partially allocated
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-muted-foreground">✖</span> {summary.expenses.unallocated} unallocated
              </li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-6 pt-2 border-t text-sm text-muted-foreground">
            <span>Total remaining estimate: {format(summary.totalRemainingEstimate, productionCurrency).formatted}</span>
            <span>Total unallocated spend: {format(summary.totalUnallocatedSpend, productionCurrency).formatted}</span>
          </div>
        </CardContent>
      </Card>

      {successMessage && (
        <p className="text-sm text-mint-700 dark:text-mint-400 bg-mint-500/10 border border-mint-500/20 rounded-md px-4 py-2" role="status">
          {successMessage}
        </p>
      )}

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <Label className="text-xs text-muted-foreground">Type</Label>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ClassificationFilter)}>
            <SelectTrigger className="mt-1 w-[140px]" aria-label="Filter by type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Line status</Label>
          <Select
            value={lineItemStatusFilter}
            onValueChange={(v) => setLineItemStatusFilter(v as 'all' | BudgetItemReconciliationStatus)}
          >
            <SelectTrigger className="mt-1 w-[180px]" aria-label="Filter by line item status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINE_ITEM_STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Expense status</Label>
          <Select
            value={expenseStatusFilter}
            onValueChange={(v) => setExpenseStatusFilter(v as 'all' | ExpenseReconciliationStatus)}
          >
            <SelectTrigger className="mt-1 w-[180px]" aria-label="Filter by expense status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {hasActiveFilters && filteredItems.length === 0 && filteredExpenses.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border bg-muted/20 p-4">
          No line items or expenses match the current filters.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        <div className="rounded-md border flex flex-col min-h-0">
          <div className="px-4 py-2 border-b bg-muted/30 font-medium">Budget line items</div>
          <div className="overflow-auto flex-1 min-h-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[72px]">Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right w-[90px]">Estimated</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="text-right w-[90px]">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  const status = getBudgetItemMatchStatus(item, links)
                  const account = item.account_id ? accountById.get(item.account_id) : null
                  const isSelected = selectedLineItemId === item.id
                  const remaining = getBudgetItemRemainingEstimate(item, links)
                  const isOverspent = remaining < 0
                  return (
                    <TableRow
                      key={item.id}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-mint-500/10 border-l-4 border-l-mint-500' : 'hover:bg-muted/30'}`}
                      onClick={() => {
                        setSelectedLineItemId(item.id)
                        setSelectedExpenseId(null)
                      }}
                      aria-selected={isSelected}
                    >
                      <TableCell className="font-mono text-xs">{account?.code ?? '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{format(item.estimated_cost, productionCurrency).formatted}</TableCell>
                      <TableCell>
                        <ClassificationBadge type={item.line_item_type as LineItemType | null} />
                      </TableCell>
                      <TableCell>
                        <LineItemMatchStatusBadge status={status} />
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${isOverspent ? 'text-destructive' : 'text-foreground'}`}
                      >
                        {format(remaining, productionCurrency).formatted}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-md border flex flex-col min-h-0">
          <div className="px-4 py-2 border-b bg-muted/30 font-medium flex items-center justify-between">
            <span>Expenses</span>
            {selectedExpenseId && (
              <Button size="sm" onClick={() => setMatchSpendModalOpen(true)}>
                <Receipt className="mr-2 size-4" />
                Match Spend
              </Button>
            )}
          </div>
          <div className="overflow-auto flex-1 min-h-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[72px]">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right w-[90px]">Amount</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="text-right w-[90px]">Unallocated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((expense) => {
                  const status = getExpenseAllocationStatusIncludingFloats(
                    expense,
                    links,
                    floatLinksByExpenseId.get(expense.id) ?? []
                  )
                  const isSelected = selectedExpenseId === expense.id
                  const unallocated = getExpenseUnallocatedForFloatMatching(
                    expense,
                    links,
                    floatLinksByExpenseId.get(expense.id) ?? []
                  )
                  const isPartial = status === 'partial'
                  return (
                    <TableRow
                      key={expense.id}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-mint-500/10 border-l-4 border-l-mint-500' : 'hover:bg-muted/30'}`}
                      onClick={() => {
                        setSelectedExpenseId(expense.id)
                        setSelectedLineItemId(null)
                      }}
                      aria-selected={isSelected}
                    >
                      <TableCell className="text-muted-foreground text-sm">{formatDateShort(expense.date)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{expenseDescription(expense)}</TableCell>
                      <TableCell className="text-right tabular-nums">{format(expense.amount, productionCurrency).formatted}</TableCell>
                      <TableCell>
                        <ClassificationBadge type={expense.transaction_type} />
                      </TableCell>
                      <TableCell>
                        <ExpenseAllocationStatusBadge status={status} />
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${isPartial ? 'text-amber-600 dark:text-amber-500' : 'text-foreground'}`}
                      >
                        {format(unallocated, productionCurrency).formatted}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {selectedLineItemId && (
        <Card>
          <CardHeader>
            <CardTitle>Linked expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {linksForSelectedItem.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No linked expenses yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {linksForSelectedItem.map((link) => {
                  const exp = expenseById.get(link.expense_id)
                  const expAccount = exp?.account_id ? accountById.get(exp.account_id) : null
                  return (
                    <li key={link.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      <span className="font-medium text-foreground">{exp ? expenseDescription(exp) : '—'}</span>
                      {exp && <ClassificationBadge type={exp.transaction_type} className="shrink-0" />}
                      {expAccount && (
                        <span className="text-muted-foreground font-mono text-xs">{expAccount.code}</span>
                      )}
                      <span className="ml-auto tabular-nums text-foreground shrink-0">
                        {format(link.matched_amount, productionCurrency).formatted}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      {selectedExpenseId && (
        <Card>
          <CardHeader>
            <CardTitle>Linked line items</CardTitle>
          </CardHeader>
          <CardContent>
            {linksForSelectedExpense.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No linked line items yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {linksForSelectedExpense.map((link) => {
                  const it = itemById.get(link.budget_item_id)
                  const itAccount = it?.account_id ? accountById.get(it.account_id) : null
                  return (
                    <li key={link.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      <span className="font-medium text-foreground">{it?.description ?? '—'}</span>
                      {it && <ClassificationBadge type={it.line_item_type as LineItemType | null} className="shrink-0" />}
                      {itAccount && (
                        <span className="text-muted-foreground font-mono text-xs">{itAccount.code}</span>
                      )}
                      <span className="ml-auto tabular-nums text-foreground shrink-0">
                        {format(link.matched_amount, productionCurrency).formatted}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={matchSpendModalOpen} onOpenChange={setMatchSpendModalOpen}>
        {matchSpendModalOpen ? (
        <DialogContent
          className="max-w-2xl max-h-[85vh] flex flex-col gap-0"
          aria-labelledby="match-spend-dialog-title"
          aria-describedby="match-spend-dialog-description"
        >
          <DialogHeader className="border-b border-border pb-4 shrink-0">
            <DialogTitle id="match-spend-dialog-title">Match Spend</DialogTitle>
            <DialogDescription id="match-spend-dialog-description">
              Allocate this expense to one or more budget line items.
            </DialogDescription>
          </DialogHeader>
          {selectedExpenseId ? (() => {
            const expense = expenseById.get(selectedExpenseId)
            if (!expense) {
              return (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Select an expense to match spend.
                </div>
              )
            }
            const allocationStatus = getExpenseAllocationStatusIncludingFloats(expense, links, floatLinksForSelectedExpense)
            const budgetAllocatedTotal = sumAllocatedAmountForExpense(expense.id, links)
            const floatAllocatedTotal = sumFloatMatchedForExpense(expense.id, floatLinksForSelectedExpense)
            const allocatedTotal = budgetAllocatedTotal + floatAllocatedTotal
            const unallocatedAmount = getExpenseUnallocatedForFloatMatching(
              expense,
              links,
              floatLinksForSelectedExpense
            )
            const account = expense.account_id ? accountById.get(expense.account_id) : null
            return (
              <>
                <div className="py-4 shrink-0">
                  <div className="rounded-lg border border-border bg-muted/30 border-mint-500/20 bg-mint-500/5 p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{expenseDescription(expense)}</span>
                      <ClassificationBadge type={expense.transaction_type} />
                      <ExpenseAllocationStatusBadge status={allocationStatus} />
                    </div>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                      <dt>Date</dt>
                      <dd className="text-foreground m-0">{formatDateShort(expense.date)}</dd>
                      <dt>Account</dt>
                      <dd className="text-foreground m-0">
                        {account ? `${account.code} · ${account.name}` : '—'}
                      </dd>
                      <dt>Amount</dt>
                      <dd className="text-foreground m-0 font-medium">
                        {format(expense.amount, productionCurrency).formatted}
                      </dd>
                      <dt>Allocated (budget)</dt>
                      <dd className="text-foreground m-0 tabular-nums">
                        {format(budgetAllocatedTotal, productionCurrency).formatted}
                      </dd>
                      <dt>Allocated (float)</dt>
                      <dd className="text-foreground m-0 tabular-nums">
                        {format(floatAllocatedTotal, productionCurrency).formatted}
                      </dd>
                      <dt>Allocated (total)</dt>
                      <dd className="text-foreground m-0 tabular-nums font-medium">
                        {format(allocatedTotal, productionCurrency).formatted}
                      </dd>
                      <dt>Unallocated</dt>
                      <dd className="text-foreground m-0 tabular-nums">
                        {format(unallocatedAmount, productionCurrency).formatted}
                      </dd>
                    </dl>
                  </div>
                </div>
                <div className="flex-1 overflow-auto space-y-6 py-2">
                  <section>
                    <h3 className="text-sm font-medium text-foreground mb-2">Candidate line items</h3>
                    {candidateLineItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground rounded-md border border-dashed border-border bg-muted/20 p-4 space-y-1">
                        <p>No budget line items are available under this account yet.</p>
                        <p className="text-xs">Create or classify line items in the Budget page to match this spend.</p>
                      </div>
                    ) : (
                      <ul className="rounded-md border border-border divide-y divide-border">
                        {candidateLineItems.map((item) => {
                          const matchedTotal = sumMatchedAmountForBudgetItem(item.id, links)
                          const remainingEstimate = getBudgetItemRemainingEstimate(item, links)
                          const matchStatus = getBudgetItemMatchStatus(item, links)
                          const isSelected = selectedAllocationItemIds.includes(item.id)
                          const amountStr = allocationAmounts[item.id] ?? ''
                          const amountNum = amountStr === '' ? NaN : parseFloat(amountStr)
                          const allocationValue = Number.isFinite(amountNum) ? amountNum : 0
                          const wouldOverspend = allocationValue > 0 && matchedTotal + allocationValue > item.estimated_cost
                          const overspendBy = wouldOverspend
                            ? matchedTotal + allocationValue - item.estimated_cost
                            : 0
                          const sameTypeAsExpense = selectedExpenseForModal && item.line_item_type === selectedExpenseForModal.transaction_type
                          const hintPartial = matchStatus === 'partial'
                          const hintOverspent = matchStatus === 'overspent'
                          return (
                            <li
                              key={item.id}
                              className={`flex flex-col gap-2 px-4 py-3 text-sm ${isSelected ? 'bg-muted/30 border-mint-500/10' : ''}`}
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  id={`candidate-${item.id}`}
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedAllocationItemIds((prev) => [...prev, item.id].filter(Boolean))
                                    } else {
                                      setSelectedAllocationItemIds((prev) => prev.filter((id) => id !== item.id))
                                      setAllocationAmounts((prev) => {
                                        const next = { ...prev }
                                        delete next[item.id]
                                        return next
                                      })
                                    }
                                  }}
                                  className="mt-0.5 shrink-0"
                                  aria-describedby={sameTypeAsExpense || hintPartial || hintOverspent ? `candidate-hint-${item.id}` : undefined}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label htmlFor={`candidate-${item.id}`} className="font-medium text-foreground cursor-pointer">
                                      {item.description}
                                    </label>
                                    <ClassificationBadge type={item.line_item_type as LineItemType | null} />
                                    {wouldOverspend && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                                            <AlertTriangle className="size-4 shrink-0" aria-hidden />
                                            <span className="sr-only">Overspend warning</span>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[240px]">
                                          This expense will overspend &quot;{item.description}&quot; by {format(overspendBy, productionCurrency).formatted}
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                  <p className="text-muted-foreground text-xs mt-1">
                                    Estimated: {format(item.estimated_cost, productionCurrency).formatted}
                                    {' · '}
                                    Matched: {format(matchedTotal, productionCurrency).formatted}
                                    {' · '}
                                    Remaining: {format(remainingEstimate, productionCurrency).formatted}
                                    {' · '}
                                    <LineItemMatchStatusBadge status={matchStatus} className="inline-flex" />
                                  </p>
                                  {(sameTypeAsExpense || hintPartial || hintOverspent) && (
                                    <p id={`candidate-hint-${item.id}`} className="text-muted-foreground/80 text-xs mt-0.5 italic">
                                      {[sameTypeAsExpense && 'Same type as this expense', hintPartial && 'Already partially matched', hintOverspent && 'Overspent'].filter(Boolean).join(' · ')}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <div className="flex items-center gap-2 pl-7">
                                  <Label htmlFor={`allocate-${item.id}`} className="text-muted-foreground shrink-0 w-24">
                                    Allocate:
                                  </Label>
                                  <MoneyAmountInput
                                    id={`allocate-${item.id}`}
                                    mode="positive"
                                    placeholder="0.00"
                                    className="w-32 tabular-nums"
                                    value={parseMoneyInput(amountStr)}
                                    onValueChange={(v) => {
                                      setAllocationAmounts((prev) => ({
                                        ...prev,
                                        [item.id]: v == null ? '' : String(v),
                                      }))
                                    }}
                                  />
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                  {(() => {
                    const allocatingNow = selectedAllocationItemIds.reduce(
                      (sum, id) => sum + (Number.isFinite(parseFloat(allocationAmounts[id] ?? '')) ? parseFloat(allocationAmounts[id]!) : 0),
                      0
                    )
                    const remainingAfter = expense.amount - allocatedTotal - allocatingNow
                    return (
                      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
                        <h3 className="font-medium text-foreground">Allocation summary</h3>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                          <dt>Expense amount</dt>
                          <dd className="text-foreground tabular-nums m-0">{format(expense.amount, productionCurrency).formatted}</dd>
                          <dt>Previously allocated (budget)</dt>
                          <dd className="text-foreground tabular-nums m-0">{format(budgetAllocatedTotal, productionCurrency).formatted}</dd>
                          <dt>Previously allocated (float)</dt>
                          <dd className="text-foreground tabular-nums m-0">{format(floatAllocatedTotal, productionCurrency).formatted}</dd>
                          <dt>Previously allocated (total)</dt>
                          <dd className="text-foreground tabular-nums m-0">{format(allocatedTotal, productionCurrency).formatted}</dd>
                          <dt>Allocating now (budget)</dt>
                          <dd className="text-foreground tabular-nums m-0">{format(allocatingNow, productionCurrency).formatted}</dd>
                          <dt>Remaining unallocated after save</dt>
                          <dd className="text-foreground tabular-nums m-0">{format(remainingAfter, productionCurrency).formatted}</dd>
                        </dl>
                      </div>
                    )
                  })()}
                  <section>
                    <h3 className="text-sm font-medium text-foreground mb-2">Existing allocations</h3>
                    {deleteLinkError && (
                      <p className="text-sm text-destructive mb-2" role="alert">
                        {deleteLinkError}
                      </p>
                    )}
                    {linksForSelectedExpense.length === 0 && floatLinksForSelectedExpense.length === 0 ? (
                      <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border bg-muted/20 p-4">
                        This expense has no budget or float allocations yet.
                      </p>
                    ) : (
                      <ul className="rounded-md border border-border divide-y divide-border">
                        {floatLinksForSelectedExpense.map((flink) => (
                          <li key={flink.id} className="px-4 py-3 text-sm bg-violet-500/[0.04] dark:bg-violet-500/[0.08]">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex flex-wrap items-center gap-2">
                                <Badge variant="secondary" className="shrink-0 font-normal text-xs">
                                  Float
                                </Badge>
                                <span className="font-medium text-foreground">
                                  {buildFloatAllocationLabel(flink.float_id, floatById, personById)}
                                </span>
                              </div>
                              <span className="tabular-nums font-medium shrink-0">
                                {format(flink.matched_amount, productionCurrency).formatted}
                              </span>
                            </div>
                            <p className="text-muted-foreground text-xs mt-1.5">
                              Edit or remove on the Budget → Floats tab (reconcile float).
                            </p>
                          </li>
                        ))}
                        {linksForSelectedExpense.map((link) => {
                          const it = itemById.get(link.budget_item_id)
                          if (!it) return null
                          const itAccount = it.account_id ? accountById.get(it.account_id) : null
                          const budgetAllocationLabel = `${itAccount?.code ?? '—'} / ${it.description}`
                          const matchedTotal = sumMatchedAmountForBudgetItem(it.id, links)
                          const remainingEstimate = getBudgetItemRemainingEstimate(it, links)
                          const isEditing = editingLinkId === link.id
                          const editAmountStr = isEditing ? editingLinkAmount : ''
                          const editAmountNum = editAmountStr === '' ? NaN : parseFloat(editAmountStr)
                          const maxAllowedForLink = unallocatedAmount + link.matched_amount
                          const wouldOverspendEdit =
                            Number.isFinite(editAmountNum) &&
                            editAmountNum > 0 &&
                            matchedTotal - link.matched_amount + editAmountNum > it.estimated_cost
                          const overspendByEdit = wouldOverspendEdit
                            ? matchedTotal - link.matched_amount + editAmountNum - it.estimated_cost
                            : 0
                          const remainingIfEdited = Number.isFinite(editAmountNum)
                            ? it.estimated_cost - (matchedTotal - link.matched_amount + editAmountNum)
                            : null
                          const isRemoveConfirm = linkIdToConfirmRemove === link.id
                          const isUpdating = updateLinkMutation.isPending && editingLinkId === link.id
                          const isDeleting = deleteLinkMutation.isPending && linkIdToConfirmRemove === link.id
                          return (
                            <li
                              key={link.id}
                              className={`px-4 py-3 text-sm ${isEditing ? 'bg-muted/30 border-mint-500/10' : ''}`}
                            >
                              {isRemoveConfirm ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-muted-foreground">Remove this match?</span>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={isDeleting}
                                    onClick={() => {
                                      deleteLinkMutation.mutate({
                                        id: link.id,
                                        expenseId: link.expense_id,
                                        budgetItemId: link.budget_item_id,
                                      })
                                    }}
                                  >
                                    {isDeleting ? 'Removing…' : 'Remove'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={isDeleting}
                                    onClick={() => {
                                      setLinkIdToConfirmRemove(null)
                                      setDeleteLinkError(null)
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : isEditing ? (
                                <>
                                  <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <Badge variant="outline" className="font-normal text-xs shrink-0">
                                      Budget
                                    </Badge>
                                    <span className="font-medium text-foreground">{budgetAllocationLabel}</span>
                                    <ClassificationBadge type={it.line_item_type as LineItemType | null} />
                                    {wouldOverspendEdit && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                                            <AlertTriangle className="size-4 shrink-0" aria-hidden />
                                            <span className="sr-only">Overspend warning</span>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[240px]">
                                          This expense will overspend &quot;{it.description}&quot; by{' '}
                                          {format(overspendByEdit, productionCurrency).formatted}
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <Label htmlFor={`edit-link-${link.id}`} className="text-muted-foreground shrink-0">
                                      Matched amount:
                                    </Label>
                                    <MoneyAmountInput
                                      id={`edit-link-${link.id}`}
                                      mode="positive"
                                      className="w-32 tabular-nums"
                                      value={parseMoneyInput(editAmountStr)}
                                      onValueChange={(v) =>
                                        setEditingLinkAmount(v == null ? '' : String(v))
                                      }
                                    />
                                    {remainingIfEdited !== null && (
                                      <span className="text-muted-foreground text-xs">
                                        Line item remaining: {format(remainingIfEdited, productionCurrency).formatted}
                                      </span>
                                    )}
                                    <span className="text-muted-foreground text-xs">
                                      Max for this link: {format(maxAllowedForLink, productionCurrency).formatted}
                                    </span>
                                  </div>
                                  {editingLinkError && (
                                    <p className="text-destructive text-xs mt-1" role="alert">
                                      {editingLinkError}
                                    </p>
                                  )}
                                  <div className="flex gap-2 mt-2">
                                    <Button
                                      size="sm"
                                      disabled={
                                        isUpdating ||
                                        !Number.isFinite(editAmountNum) ||
                                        editAmountNum <= 0 ||
                                        editAmountNum > maxAllowedForLink
                                      }
                                      onClick={() => {
                                        if (!Number.isFinite(editAmountNum) || editAmountNum <= 0) return
                                        updateLinkMutation.mutate({
                                          id: link.id,
                                          matchedAmount: editAmountNum,
                                          expenseId: link.expense_id,
                                          budgetItemId: link.budget_item_id,
                                        })
                                      }}
                                    >
                                      {isUpdating ? 'Saving…' : 'Save'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={isUpdating}
                                      onClick={() => {
                                        setEditingLinkId(null)
                                        setEditingLinkAmount('')
                                        setEditingLinkError(null)
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="font-normal text-xs shrink-0">
                                      Budget
                                    </Badge>
                                    <span className="font-medium text-foreground">{budgetAllocationLabel}</span>
                                    <ClassificationBadge type={it.line_item_type as LineItemType | null} />
                                  </div>
                                  <p className="text-muted-foreground text-xs mt-1">
                                    Matched: {format(link.matched_amount, productionCurrency).formatted}
                                    {' · '}
                                    Estimated: {format(it.estimated_cost, productionCurrency).formatted}
                                    {' · '}
                                    Remaining: {format(remainingEstimate, productionCurrency).formatted}
                                  </p>
                                  <div className="flex gap-2 mt-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingLinkId(link.id)
                                        setEditingLinkAmount(String(link.matched_amount))
                                        setEditingLinkError(null)
                                      }}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setLinkIdToConfirmRemove(link.id)}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                </>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                </div>
              </>
            )
          })() : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Select an expense to match spend.
            </div>
          )}
          {matchSpendSaveError && (
            <p className="text-sm text-destructive shrink-0" role="alert">
              {matchSpendSaveError}
            </p>
          )}
          <DialogFooter className="border-t border-border pt-4 shrink-0 flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setMatchSpendModalOpen(false)}
              disabled={createLinksMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={!allocationValidation.canSave || createLinksMutation.isPending}
              onClick={handleMatchSpendSave}
            >
              {createLinksMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
