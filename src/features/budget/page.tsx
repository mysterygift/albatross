import { useState, useMemo, useEffect, useRef, useCallback, Fragment, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useCurrency } from '@/hooks/useCurrency'
import { useFirstLaunchTutorial } from '@/hooks/useFirstLaunchTutorial'
import { SectionTutorialPanel } from '@/features/tutorial/SectionTutorialPanel'
import { budgetTutorialSteps } from '@/features/tutorial/sections/budgetTutorial'
import {
  listBudgetCategoriesByProduction,
  listBudgetItemsByProduction,
  listExpensesByProduction,
  createBudgetItem,
  deleteExpense,
  updateExpense,
  updateExpenseAccount,
  backfillAccountIdsFromLegacyCategories,
} from '@/lib/db/repositories/budget'
import { listBudgetItemExpenseLinksForExpense } from '@/lib/db/repositories/budgetReconciliation'
import { riskWatchQueryKey } from '@/lib/budget/vendors/riskWatch'
import { listAccounts, listPostableAccounts } from '@/lib/db/repositories/budgetAccounts'
import {
  listProductionTotals,
  createProductionTotal,
  updateProductionTotal,
  deleteProductionTotal,
  type ProductionTotalWithAccountIds,
} from '@/lib/db/repositories/productionTotals'
import {
  listFringeRules,
  listContingencyRules,
  createFringeRule,
  updateFringeRule,
  deleteFringeRule,
  setFringeRuleEnabled,
  createContingencyRule,
  updateContingencyRule,
  deleteContingencyRule,
  setContingencyRuleEnabled,
  type FringeRuleWithScopes,
  type ContingencyRuleWithScopes,
} from '@/lib/db/repositories/budgetDerived'
import {
  buildAccountTree,
  computeAccountTotals,
  uncodedSpendTotal,
  uncodedExpensesList,
  legacyBudgetItemsList,
  computeFringeTotals,
  computeContingencyTotals,
  getDescendantLeafIds,
  type AccountTreeNode,
} from '@/lib/budget/calculations'
import {
  listCostReportGroupsWithAccountIds,
  type CostReportGroupWithAccountIds,
} from '@/lib/db/repositories/costReportGroups'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Download, ChevronRight, ChevronDown, Settings2, Pencil, Trash2, SlidersHorizontal, Eye, Receipt } from 'lucide-react'
import { saveFileWithDialog } from '@/lib/files'
import { getAccountBandColor } from '@/lib/budget/accountBandColor'
import type { BudgetItem, BudgetAccount } from '@/lib/db/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getExpenseWithDetails, listAllowExpenseDetailsByProduction } from '@/lib/db/repositories/expenseTransactions'
import { getTypedExpenseConfig } from '@/lib/budget/transactions/registry'
import type { ExpenseTransactionType } from '@/lib/db/types'
import { listPeopleByProduction } from '@/lib/db/repositories/person'
import { parseAllowDetails } from '@/lib/budget/transactions/allow'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { ActualisationPage } from '@/features/budget/actualisation/page'
import { ExpenseDetailPanel } from '@/features/budget/ExpenseDetailPanel'
import { LineItemDetailPanel } from '@/features/budget/LineItemDetailPanel'
import { LogSpendPanel } from '@/features/budget/LogSpendPanel'
import { ClassificationBadge } from '@/features/budget/ClassificationBadge'
import { getBudgetItemWithDetails } from '@/lib/db/repositories/budgetItemDetails'
import { getLineItemTypeConfig } from '@/lib/budget/line-items/registry'
import {
  type ClassificationFilter,
  filterLineItemsByClassification,
  filterExpensesByClassification,
  getLineItemType,
  getExpenseType,
  getRelatedExpensesForLineItem,
  sumActualForExpenses,
  getRelatedLineItemsForExpense,
  sumEstimatedForLineItems,
} from '@/lib/budget/matching'

const BUDGET_VIEW_MODE_KEY = 'budgetViewMode'
const COST_REPORT_LAYOUT_MODE_KEY = 'costReportLayoutMode'
type BudgetViewMode = 'budget' | 'cost_report' | 'actualisation'
type CostReportLayoutMode = 'chart' | 'groups'

// Actuals are derived from expenses only. budget_item.actual_cost is deprecated/committed and not used for actual calculations.

const itemSchema = z.object({
  account_id: z.string().min(1, 'Select an account'),
  description: z.string().min(1),
  estimated_cost: z.coerce.number().min(0),
  actual_cost: z.coerce.number().min(0),
  vendor: z.string().optional(),
})

const inlineItemSchema = z.object({
  description: z.string().min(1),
  estimated_cost: z.coerce.number().min(0),
})

/** Rate as percentage 0–100; stored as decimal 0–1 in DB. */
const derivedRuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  ratePercent: z.coerce.number().min(0.01, 'Rate must be greater than 0').max(100, 'Rate must be at most 100%'),
  scope_account_ids: z.array(z.string()).min(1, 'Select at least one account'),
})

type DerivedRuleFormValues = z.infer<typeof derivedRuleSchema>

export function BudgetPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const { format, ensureRate, conversionBanner } = useCurrency()
  const { progress, updateProgress } = useFirstLaunchTutorial()
  const productionCurrency = currentProduction?.currency_code ?? 'GBP'
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [logSpendOpen, setLogSpendOpen] = useState(false)
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set())
  const [uncodedExpanded, setUncodedExpanded] = useState(false)
  const [addItemForAccountId, setAddItemForAccountId] = useState<string | null>(null)
  const [recodeToast, setRecodeToast] = useState<string | null>(null)
  const [manageDerivedOpen, setManageDerivedOpen] = useState(false)
  const [examinedExpenseId, setExaminedExpenseId] = useState<string | null>(null)
  const [examinedAccountId, setExaminedAccountId] = useState<string | null>(null)
  const [examinedLineItemId, setExaminedLineItemId] = useState<string | null>(null)
  const [examineAccountFilter, setExamineAccountFilter] = useState<ClassificationFilter>('all')
  const [viewMode, setViewMode] = useState<BudgetViewMode>(() => {
    if (typeof window === 'undefined') return 'budget'
    const stored = localStorage.getItem(BUDGET_VIEW_MODE_KEY)
    if (stored === 'cost_report') return 'cost_report'
    if (stored === 'actualisation') return 'actualisation'
    return 'budget'
  })
  const [costReportExpandedLeafId, setCostReportExpandedLeafId] = useState<string | null>(null)
  const [productionTotalsModalOpen, setProductionTotalsModalOpen] = useState(false)
  const [productionTotalToEdit, setProductionTotalToEdit] = useState<ProductionTotalWithAccountIds | null>(null)
  const [productionTotalCreateOpen, setProductionTotalCreateOpen] = useState(false)
  const [costReportLayoutMode, setCostReportLayoutMode] = useState<CostReportLayoutMode>(() => {
    if (typeof window === 'undefined') return 'chart'
    const stored = localStorage.getItem(COST_REPORT_LAYOUT_MODE_KEY)
    return stored === 'groups' ? 'groups' : 'chart'
  })

  useEffect(() => {
    localStorage.setItem(BUDGET_VIEW_MODE_KEY, viewMode)
  }, [viewMode])
  useEffect(() => {
    localStorage.setItem(COST_REPORT_LAYOUT_MODE_KEY, costReportLayoutMode)
  }, [costReportLayoutMode])

  useEffect(() => {
    if (progress?.currentSection === 'budget') {
      setTutorialOpen(true)
    }
  }, [progress?.currentSection])

  // Open expense panel when navigating from vendor ledger (Examine Spend)
  const state = location.state as { examineExpenseId?: string } | null
  useEffect(() => {
    if (state?.examineExpenseId) {
      setExaminedExpenseId(state.examineExpenseId)
      setViewMode('actualisation')
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [state?.examineExpenseId, location.pathname, navigate])

  const queryClient = useQueryClient()
  const backfillRanForProduction = useRef<Set<string>>(new Set())

  const { data: allowDetailsForProduction } = useQuery({
    queryKey: ['allow-expense-details', currentProductionId],
    enabled: !!currentProductionId,
    queryFn: () => listAllowExpenseDetailsByProduction(currentProductionId!),
  })

  const openAllowCountGlobal =
    allowDetailsForProduction?.reduce((acc, row) => {
      const parsed = parseAllowDetails(row.details_json)
      if (parsed.ok && parsed.value.status === 'open') {
        return acc + 1
      }
      // If details cannot be parsed, treat as open to avoid hiding potentially unresolved allows.
      if (!parsed.ok) {
        return acc + 1
      }
      return acc
    }, 0) ?? 0

  const toggleAccountExpanded = (id: string) => {
    setExpandedAccountIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    if (currentProduction?.currency_code) ensureRate(currentProduction.currency_code)
  }, [currentProduction?.currency_code, ensureRate])

  useEffect(() => {
    if (!currentProductionId || backfillRanForProduction.current.has(currentProductionId)) return
    backfillRanForProduction.current.add(currentProductionId)
    backfillAccountIdsFromLegacyCategories(currentProductionId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['budget-items', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['expenses', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId) })
    })
  }, [currentProductionId, queryClient])

  const { data: categories = [] } = useQuery({
    queryKey: ['budget-categories', currentProductionId],
    queryFn: () => listBudgetCategoriesByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  // When accounts are created/updated/deleted (e.g. Stage 5), invalidate both keys so tree and dropdowns stay in sync.
  const { data: accounts = [] } = useQuery({
    queryKey: ['budget-accounts', currentProductionId],
    queryFn: () => listAccounts(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: postableAccounts = [] } = useQuery({
    queryKey: ['budgetAccounts', currentProductionId, 'postable'],
    queryFn: () => listPostableAccounts(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: items = [] } = useQuery({
    queryKey: ['budget-items', currentProductionId],
    queryFn: () => listBudgetItemsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', currentProductionId],
    queryFn: () => listExpensesByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: examinedExpenseWithDetails, isLoading: examinedExpenseLoading } = useQuery({
    queryKey: ['expense-with-details', examinedExpenseId],
    queryFn: () => getExpenseWithDetails(examinedExpenseId!),
    enabled: examinedExpenseId != null,
  })

  const { data: linksForExaminedExpense = [] } = useQuery({
    queryKey: ['budget-item-expense-links-for-expense', examinedExpenseId],
    queryFn: () => listBudgetItemExpenseLinksForExpense(examinedExpenseId!),
    enabled: examinedExpenseId != null,
  })

  const { data: examinedLineItemWithDetails, isLoading: examinedLineItemLoading } = useQuery({
    queryKey: ['budget-item-with-details', examinedLineItemId],
    queryFn: () => getBudgetItemWithDetails(examinedLineItemId!),
    enabled: examinedLineItemId != null,
  })

  const { data: people = [] } = useQuery({
    queryKey: ['people', currentProductionId],
    queryFn: () => listPeopleByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: locations = [] } = useQuery({
    queryKey: ['locations', currentProductionId],
    queryFn: () => listLocationsByProduction(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: fringeRules = [] } = useQuery({
    queryKey: ['fringe-rules', currentProductionId],
    queryFn: () => listFringeRules(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: contingencyRules = [] } = useQuery({
    queryKey: ['contingency-rules', currentProductionId],
    queryFn: () => listContingencyRules(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: productionTotals = [] } = useQuery({
    queryKey: ['production-totals', currentProductionId],
    queryFn: () => listProductionTotals(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const { data: costReportGroupsWithAccounts = [] } = useQuery({
    queryKey: ['cost-report-groups-with-accounts', currentProductionId],
    queryFn: () => listCostReportGroupsWithAccountIds(currentProductionId ?? ''),
    enabled: !!currentProductionId,
  })

  const createItemMutation = useMutation({
    mutationFn: (data: z.infer<typeof itemSchema>) =>
      createBudgetItem({
        production_id: currentProductionId!,
        account_id: data.account_id,
        category_id: null,
        description: data.description,
        estimated_cost: data.estimated_cost,
        actual_cost: 0,
        vendor: data.vendor ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-items', currentProductionId!] })
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', currentProductionId!] })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId!) })
      setAddItemOpen(false)
    },
  })

  const createInlineItemMutation = useMutation({
    mutationFn: (data: { account_id: string; description: string; estimated_cost: number }) =>
      createBudgetItem({
        production_id: currentProductionId!,
        account_id: data.account_id,
        category_id: null,
        description: data.description,
        estimated_cost: data.estimated_cost,
        actual_cost: 0,
        vendor: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-items', currentProductionId!] })
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', currentProductionId!] })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId!) })
      setAddItemForAccountId(null)
    },
  })

  const recodeExpenseMutation = useMutation({
    mutationFn: ({ expenseId, newAccountId }: { expenseId: string; newAccountId: string }) =>
      updateExpenseAccount(expenseId, newAccountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', currentProductionId!] })
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', currentProductionId!] })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId!) })
      setRecodeToast('Expense recoded.')
      setTimeout(() => setRecodeToast(null), 3000)
    },
  })

  const handleExpenseSaveRequest = useCallback(
    async (args: { expenseId: string; details: unknown; type: string }) => {
      const config = getTypedExpenseConfig(args.type as ExpenseTransactionType)
      if (!config?.save) throw new Error('Unknown transaction type')
      await config.save({
        expenseId: args.expenseId,
        details: args.details,
        ctx: { productionId: currentProductionId! },
      })
    },
    [currentProductionId]
  )

  const handleExpenseSaved = useCallback(() => {
    if (examinedExpenseId)
      queryClient.invalidateQueries({ queryKey: ['expense-with-details', examinedExpenseId] })
    if (currentProductionId) {
      queryClient.invalidateQueries({ queryKey: ['expenses', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', currentProductionId] })
      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId) })
      queryClient.invalidateQueries({ queryKey: ['locations', currentProductionId] })
    }
  }, [examinedExpenseId, currentProductionId, queryClient])

  const handleUpdateExpenseRequest = useCallback(
    async (data: {
      expenseId: string
      amount: number
      date: string
      vendor: string | null
      notes: string | null
    }) => {
      await updateExpense(data.expenseId, {
        amount: data.amount,
        date: data.date,
        vendor: data.vendor,
        notes: data.notes,
      })
    },
    []
  )

  const deleteExpenseMutation = useMutation({
    mutationFn: (expenseId: string) => deleteExpense(expenseId),
    onSuccess: (_, expenseId) => {
      setExaminedExpenseId(null)
      if (currentProductionId) {
        queryClient.invalidateQueries({ queryKey: ['expenses', currentProductionId] })
        queryClient.invalidateQueries({ queryKey: ['expense-with-details', expenseId] })
        queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', currentProductionId] })
        queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links-for-expense', expenseId] })
        queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links-for-item'] })
        queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId) })
      }
    },
  })

  const createProductionTotalMutation = useMutation({
    mutationFn: (data: { name: string; account_ids: string[] }) =>
      createProductionTotal({
        production_id: currentProductionId!,
        name: data.name,
        account_ids: data.account_ids,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-totals', currentProductionId!] })
      setProductionTotalCreateOpen(false)
    },
  })

  const updateProductionTotalMutation = useMutation({
    mutationFn: (data: { id: string; name: string; account_ids: string[] }) =>
      updateProductionTotal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-totals', currentProductionId!] })
      setProductionTotalToEdit(null)
    },
  })

  const deleteProductionTotalMutation = useMutation({
    mutationFn: (id: string) => deleteProductionTotal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production-totals', currentProductionId!] })
    },
  })

  const accountTree = useMemo(() => buildAccountTree(accounts), [accounts])
  const accountTotals = useMemo(
    () => computeAccountTotals(accounts, items, expenses),
    [accounts, items, expenses]
  )
  const uncodedTotal = useMemo(() => uncodedSpendTotal(expenses), [expenses])
  const uncodedList = useMemo(() => uncodedExpensesList(expenses), [expenses])
  const legacyItems = useMemo(() => legacyBudgetItemsList(items), [items])

  const fringeTotals = useMemo(
    () => computeFringeTotals(fringeRules, accountTotals, accountTree),
    [fringeRules, accountTotals, accountTree]
  )
  const contingencyTotals = useMemo(
    () => computeContingencyTotals(contingencyRules, accountTotals, accountTree),
    [contingencyRules, accountTotals, accountTree]
  )

  const totalEstimated = items.reduce((s, i) => s + i.estimated_cost, 0)
  const totalActual = expenses.reduce((s, e) => s + e.amount, 0)
  const variance = totalEstimated - totalActual

  // Production totals: rollups from accountTotals only (reporting); only header accounts.
  const productionTotalAmounts = useMemo(() => {
    return productionTotals.map((t) => {
      let budgetTotal = 0
      let actualTotal = 0
      for (const accountId of t.account_ids) {
        const tot = accountTotals.get(accountId)
        if (tot) {
          budgetTotal += tot.budgetTotal
          actualTotal += tot.actualTotal
        }
      }
      return {
        id: t.id,
        name: t.name,
        sort_order: t.sort_order,
        budgetTotal,
        actualTotal,
        variance: budgetTotal - actualTotal,
      }
    })
  }, [productionTotals, accountTotals])

  // Subtotal before derived: unique LEAFA account ids under all production totals' header accounts (deduped).
  const productionSubtotalBeforeDerived = useMemo(() => {
    const uniqueLeafIds = new Set<string>()
    for (const t of productionTotals) {
      for (const accountId of t.account_ids) {
        getDescendantLeafIds(accountTree, accountId).forEach((id) => uniqueLeafIds.add(id))
      }
    }
    let budget = 0
    let actual = 0
    for (const id of uniqueLeafIds) {
      const tot = accountTotals.get(id)
      if (tot) {
        budget += tot.budgetTotal
        actual += tot.actualTotal
      }
    }
    return { budget, actual, variance: budget - actual }
  }, [productionTotals, accountTree, accountTotals])

  // Group totals and visible ids for Cost Report "By groups" view (leaf-deduped, no double count).
  const { groupTotals, visibleIdsByGroupId } = useMemo(() => {
    const byGroupId = new Map<string, { budgetTotal: number; actualTotal: number; variance: number; percentSpent: number | null }>()
    const visibleByGroupId = new Map<string, Set<string>>()
    const accountById = new Map(accounts.map((a) => [a.id, a]))
    for (const group of costReportGroupsWithAccounts) {
      const leafIds = new Set<string>()
      for (const accountId of group.account_ids) {
        getDescendantLeafIds(accountTree, accountId).forEach((id) => leafIds.add(id))
      }
      let budgetTotal = 0
      let actualTotal = 0
      for (const id of leafIds) {
        const tot = accountTotals.get(id)
        if (tot) {
          budgetTotal += tot.budgetTotal
          actualTotal += tot.actualTotal
        }
      }
      const variance = budgetTotal - actualTotal
      const percentSpent = budgetTotal > 0 ? actualTotal / budgetTotal : null
      byGroupId.set(group.id, { budgetTotal, actualTotal, variance, percentSpent })
      const visibleIds = new Set<string>(group.account_ids)
      for (const accountId of group.account_ids) {
        let cur = accountById.get(accountId)
        while (cur?.parent_account_id) {
          visibleIds.add(cur.parent_account_id)
          cur = accountById.get(cur.parent_account_id)
        }
      }
      visibleByGroupId.set(group.id, visibleIds)
    }
    return {
      groupTotals: costReportGroupsWithAccounts.map((g) => ({
        groupId: g.id,
        groupName: g.name,
        groupCode: g.code,
        ...byGroupId.get(g.id)!,
      })),
      visibleIdsByGroupId: visibleByGroupId,
    }
  }, [costReportGroupsWithAccounts, accountTree, accountTotals, accounts])

  const headerAccounts = useMemo(
    () => accounts.filter((a) => !a.is_postable && !a.archived_at),
    [accounts]
  )

  // Export reflects line item detail; hierarchical rollup export may be added later.
  // Total actual = sum(expenses.amount) only; do not use budget_items.actual_cost.
  // Derived totals (fringes, contingency) are budget-side overlays and are not included in Total actual.
  const exportCsv = async () => {
    const rows: (string | number)[][] = [
      ['Account / Category', 'Description', 'Estimated', 'Actual', 'Variance'],
      ...items.map((i) => {
        const account = i.account_id ? accounts.find((a) => a.id === i.account_id) : null
        const cat = !account && i.category_id ? categories.find((c) => c.id === i.category_id) : null
        const label = account ? `${account.code} — ${account.name}` : (cat?.code ?? '—')
        const itemActual =
          i.account_id != null
            ? expenses.filter((e) => e.account_id === i.account_id).reduce((s, e) => s + e.amount, 0)
            : expenses.filter((e) => e.category_id === i.category_id).reduce((s, e) => s + e.amount, 0)
        return [label, i.description, i.estimated_cost, itemActual, i.estimated_cost - itemActual]
      }),
      ['', 'TOTAL', totalEstimated, totalActual, variance],
    ]
    if (fringeTotals.totalFringesAmount > 0 || contingencyTotals.totalContingencyAmount > 0) {
      rows.push(['', 'FRINGES (derived)', fringeTotals.totalFringesAmount, '', ''])
      rows.push(['', 'CONTINGENCY (derived)', contingencyTotals.totalContingencyAmount, '', ''])
      rows.push([
        '',
        'TOTAL + DERIVED',
        totalEstimated + fringeTotals.totalFringesAmount + contingencyTotals.totalContingencyAmount,
        totalActual,
        totalEstimated +
          fringeTotals.totalFringesAmount +
          contingencyTotals.totalContingencyAmount -
          totalActual,
      ])
    }
    const csv = rows.map((r) => r.join(',')).join('\n')
    await saveFileWithDialog(
      {
        defaultPath: 'budget-report.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        title: 'Save budget report',
      },
      csv,
      true
    )
  }

  if (!currentProductionId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Budget</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {conversionBanner && (
        <p className="text-muted-foreground text-sm rounded-md border border-border bg-muted/30 px-3 py-2">
          {conversionBanner}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Budget</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as BudgetViewMode)}
            className="w-auto"
          >
            <TabsList className="h-9 border border-border bg-muted/30">
              <TabsTrigger value="budget" className="px-3 text-sm data-[state=active]:bg-background">
                Budget
              </TabsTrigger>
              <TabsTrigger value="cost_report" className="px-3 text-sm data-[state=active]:bg-background">
                Cost Report
              </TabsTrigger>
              <TabsTrigger value="actualisation" className="px-3 text-sm data-[state=active]:bg-background">
                Match Expenses
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManageDerivedOpen(true)}
              className="border-border bg-background no-print"
            >
              <Settings2 className="mr-2 size-4" />
              Manage derived costs
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} className="no-print">
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            className="no-print"
            onClick={() => setLogSpendOpen(true)}
          >
            <Receipt className="mr-2 size-4" />
            Log Spend
          </Button>
          <LogSpendPanel
            open={logSpendOpen}
            onOpenChange={setLogSpendOpen}
            postableAccounts={postableAccounts}
            productionId={currentProductionId!}
            productionCurrency={productionCurrency}
            format={format}
            people={people}
            locations={locations}
          />
          <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
            <DialogTrigger asChild>
              <Button className="no-print">
                <Plus className="mr-2 size-4" />
                Add line item
              </Button>
            </DialogTrigger>
            <DialogContent>
              {addItemOpen && (
              <BudgetItemForm
                accounts={postableAccounts}
                onSubmit={createItemMutation.mutate}
                onCancel={() => setAddItemOpen(false)}
                isLoading={createItemMutation.isPending}
              />
              )}
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>

      {viewMode === 'actualisation' ? (
        <ActualisationPage />
      ) : viewMode === 'cost_report' ? (
        <>
          <CostReportView
            productionName={currentProduction?.name ?? ''}
            openAllowCount={openAllowCountGlobal}
            accountTree={accountTree}
            accountTotals={accountTotals}
            items={items}
            format={format}
            productionCurrency={productionCurrency}
            totalEstimated={totalEstimated}
            totalActual={totalActual}
            variance={variance}
            uncodedTotal={uncodedTotal}
            fringeTotals={fringeTotals}
            contingencyTotals={contingencyTotals}
            productionTotalAmounts={productionTotalAmounts}
            productionSubtotalBeforeDerived={productionSubtotalBeforeDerived}
            layoutMode={costReportLayoutMode}
            setLayoutMode={setCostReportLayoutMode}
            costReportGroupsWithAccounts={costReportGroupsWithAccounts}
            groupTotals={groupTotals}
            visibleIdsByGroupId={visibleIdsByGroupId}
            expandedLeafId={costReportExpandedLeafId}
            onToggleLeafDetail={setCostReportExpandedLeafId}
            configureButton={
              <Button variant="outline" size="sm" onClick={() => setProductionTotalsModalOpen(true)} className="no-print">
                <SlidersHorizontal className="mr-2 size-4" />
                Configure production totals
              </Button>
            }
          />
          <ProductionTotalsModal
            open={productionTotalsModalOpen}
            onOpenChange={setProductionTotalsModalOpen}
            productionTotals={productionTotals}
            headerAccounts={headerAccounts}
            editTotal={productionTotalToEdit}
            onEdit={setProductionTotalToEdit}
            createOpen={productionTotalCreateOpen}
            onCreateOpen={setProductionTotalCreateOpen}
            onCreate={createProductionTotalMutation.mutate}
            onUpdate={updateProductionTotalMutation.mutate}
            onDelete={deleteProductionTotalMutation.mutate}
            createPending={createProductionTotalMutation.isPending}
            updatePending={updateProductionTotalMutation.isPending}
            deletePending={deleteProductionTotalMutation.isPending}
          />
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-sm">Total estimated</p>
              <p className="text-2xl font-semibold">{format(totalEstimated, productionCurrency).formatted}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-sm">Total actual</p>
              <p className="text-2xl font-semibold">{format(totalActual, productionCurrency).formatted}</p>
              {uncodedTotal > 0 && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Uncoded spend: {format(uncodedTotal, productionCurrency).formatted}
                </p>
              )}
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-sm">Variance</p>
              <p className={`text-2xl font-semibold ${variance < 0 ? 'text-destructive' : ''}`}>
                {format(variance, productionCurrency).formatted}
              </p>
            </div>
          </div>

          {(fringeTotals.totalFringesAmount > 0 || contingencyTotals.totalContingencyAmount > 0) && (
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <p className="text-muted-foreground text-sm font-medium">Derived (budget overlays)</p>
              <div className="flex flex-wrap gap-6">
                <div>
                  <span className="text-muted-foreground text-sm">Fringes (derived): </span>
                  <span className="font-medium">{format(fringeTotals.totalFringesAmount, productionCurrency).formatted}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-sm">Contingency (derived): </span>
                  <span className="font-medium">{format(contingencyTotals.totalContingencyAmount, productionCurrency).formatted}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-sm">Estimated + derived: </span>
                  <span className="font-medium">
                    {format(
                      totalEstimated + fringeTotals.totalFringesAmount + contingencyTotals.totalContingencyAmount,
                      productionCurrency
                    ).formatted}
                  </span>
                </div>
              </div>
            </div>
          )}

          {recodeToast && (
            <p className="text-muted-foreground rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
              {recodeToast}
            </p>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Code</TableHead>
                  <TableHead>Account / Description</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right w-[70px]">% Spent</TableHead>
                  <TableHead className="w-[96px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountTree.map((node) =>
                  renderAccountRow(node, 0, {
                    accountTotals,
                    expandedAccountIds,
                    toggleAccountExpanded,
                    items,
                    format,
                    productionCurrency,
                    setAddItemForAccountId,
                    addItemForAccountId,
                    createInlineItemMutation,
                    postableAccounts,
                    onExamineAccount: (accountId) => {
                      setExaminedExpenseId(null)
                      setExaminedAccountId(accountId)
                    },
                  })
                )}
                {uncodedTotal > 0 && (
                  <>
                    <TableRow
                      className="bg-muted/30 font-medium cursor-pointer"
                      onClick={() => setUncodedExpanded((e) => !e)}
                    >
                      <TableCell>
                        {uncodedExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </TableCell>
                      <TableCell colSpan={2}>Uncoded spend</TableCell>
                      <TableCell className="text-right font-medium">
                        {format(uncodedTotal, productionCurrency).formatted}
                      </TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                    {uncodedExpanded &&
                      uncodedList.map((exp) => (
                        <TableRow key={exp.id} className="bg-muted/10">
                          <TableCell />
                          <TableCell>
                            <span className="text-muted-foreground text-sm">
                              {exp.date}
                              {exp.vendor ? ` · ${exp.vendor}` : ''}
                              {exp.notes ? ` · ${exp.notes}` : ''}
                            </span>
                          </TableCell>
                          <TableCell />
                          <TableCell className="text-right">{format(exp.amount, productionCurrency).formatted}</TableCell>
                          <TableCell />
                          <TableCell />
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setExaminedAccountId(null)
                                  setExaminedExpenseId(exp.id)
                                }}
                                aria-label="Examine spend"
                              >
                                <Eye className="size-4" />
                              </Button>
                              <Select
                                value=""
                                onValueChange={(value) => {
                                  if (value) recodeExpenseMutation.mutate({ expenseId: exp.id, newAccountId: value })
                                }}
                              >
                                <SelectTrigger className="h-8 w-[180px]">
                                  <SelectValue placeholder="Recode…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {postableAccounts.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                      {a.code} — {a.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </>
                )}
                {legacyItems.length > 0 && (
                  <>
                    <TableRow className="bg-muted/20 font-medium">
                      <TableCell colSpan={7} className="text-muted-foreground py-2">
                        Legacy uncoded budget items
                      </TableCell>
                    </TableRow>
                    {legacyItems.map((i) => {
                      const cat = i.category_id ? categories.find((c) => c.id === i.category_id) : null
                      return (
                        <TableRow key={i.id} className="text-muted-foreground">
                          <TableCell />
                          <TableCell className="pl-8">{i.description}</TableCell>
                          <TableCell className="text-right">{format(i.estimated_cost, productionCurrency).formatted}</TableCell>
                          <TableCell colSpan={4}>{cat ? `${cat.code}` : '—'}</TableCell>
                        </TableRow>
                      )
                    })}
                  </>
                )}
                {accountTree.length === 0 && uncodedList.length === 0 && legacyItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No accounts yet. Add a line item or log spend to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {addItemForAccountId && (
        <Dialog open={!!addItemForAccountId} onOpenChange={(open) => !open && setAddItemForAccountId(null)}>
          <DialogContent>
            <InlineAddItemForm
              accountLabel={
                postableAccounts.find((a) => a.id === addItemForAccountId)?.code +
                ' — ' +
                (postableAccounts.find((a) => a.id === addItemForAccountId)?.name ?? '')
              }
              onSubmit={(data) =>
                createInlineItemMutation.mutate({
                  account_id: addItemForAccountId,
                  description: data.description,
                  estimated_cost: data.estimated_cost,
                })
              }
              onCancel={() => setAddItemForAccountId(null)}
              isLoading={createInlineItemMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={manageDerivedOpen} onOpenChange={setManageDerivedOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <ManageDerivedCostsDialog
            productionId={currentProductionId!}
            accounts={accounts}
            fringeRules={fringeRules}
            contingencyRules={contingencyRules}
            format={format}
            productionCurrency={productionCurrency}
            onClose={() => setManageDerivedOpen(false)}
            invalidateDerived={() => {
              queryClient.invalidateQueries({ queryKey: ['fringe-rules', currentProductionId!] })
              queryClient.invalidateQueries({ queryKey: ['contingency-rules', currentProductionId!] })
            }}
          />
        </DialogContent>
      </Dialog>

      <Sheet
        open={examinedExpenseId != null || examinedAccountId != null || examinedLineItemId != null}
        onOpenChange={(open) => {
          if (!open) {
            setExaminedExpenseId(null)
            setExaminedAccountId(null)
            setExaminedLineItemId(null)
          }
        }}
      >
        <SheetContent side="right" className="w-[520px] sm:max-w-[520px]">
          {examinedExpenseId != null ? (
            (() => {
              const expense = examinedExpenseWithDetails?.expense
              const accountId = expense?.account_id ?? null
              const relatedLineItems =
                expense && accountId
                  ? getRelatedLineItemsForExpense(expense, items, accountId)
                  : []
              const relatedLineItemsInAccount =
                expense && relatedLineItems.length > 0
                  ? {
                      count: relatedLineItems.length,
                      totalEstimated: sumEstimatedForLineItems(relatedLineItems),
                      typeLabel: getLineItemTypeConfig(expense.transaction_type)?.label ?? 'Untyped',
                    }
                  : undefined
              return (
                <ExpenseDetailPanel
                  expenseWithDetails={examinedExpenseWithDetails ?? null}
                  isLoading={examinedExpenseLoading}
                  productionId={currentProductionId!}
                  productionCurrency={productionCurrency}
                  format={format}
                  defaultCurrencyCode={currentProduction?.currency_code ?? null}
                  people={people}
                  locations={locations}
                  onSaved={handleExpenseSaved}
                  onSaveRequest={handleExpenseSaveRequest}
                  onUpdateExpenseRequest={handleUpdateExpenseRequest}
                  relatedLineItemsInAccount={relatedLineItemsInAccount}
                  onDeleteRequest={async (expenseId) => {
                    await deleteExpenseMutation.mutateAsync(expenseId)
                  }}
                  hasReconciliationLinks={linksForExaminedExpense.length > 0}
                />
              )
            })()
          ) : examinedLineItemId != null ? (
            (() => {
              const account = examinedLineItemWithDetails
                ? accounts.find((a) => a.id === examinedLineItemWithDetails.budget_item.account_id) ?? null
                : null
              const accountLabel = account ? `${account.code} — ${account.name}` : '—'
              const lineItem = examinedLineItemWithDetails?.budget_item
              const accountId = lineItem?.account_id ?? null
              const relatedExpenses =
                lineItem && accountId
                  ? getRelatedExpensesForLineItem(lineItem, expenses, accountId)
                  : []
              const relatedSpendInAccount =
                lineItem && relatedExpenses.length > 0
                  ? {
                      count: relatedExpenses.length,
                      totalActual: sumActualForExpenses(relatedExpenses),
                      typeLabel: getLineItemTypeConfig(lineItem.line_item_type)?.label ?? 'Untyped',
                    }
                  : undefined
              return (
                <LineItemDetailPanel
                  lineItemWithDetails={examinedLineItemWithDetails ?? null}
                  isLoading={examinedLineItemLoading}
                  accountLabel={accountLabel}
                  format={format}
                  productionCurrency={productionCurrency}
                  productionId={currentProductionId ?? ''}
                  people={people}
                  locations={locations}
                  onClose={() => setExaminedLineItemId(null)}
                  onSaved={() => {
                    if (currentProductionId) {
                      queryClient.invalidateQueries({ queryKey: ['budget-items', currentProductionId] })
                      queryClient.invalidateQueries({ queryKey: ['budget-item-expense-links', currentProductionId] })
                      queryClient.invalidateQueries({ queryKey: riskWatchQueryKey(currentProductionId) })
                    }
                    if (examinedLineItemId)
                      queryClient.invalidateQueries({
                        queryKey: ['budget-item-with-details', examinedLineItemId],
                      })
                  }}
                  relatedSpendInAccount={relatedSpendInAccount}
                />
              )
            })()
          ) : examinedAccountId != null ? (
            (() => {
              const account = accounts.find((a) => a.id === examinedAccountId) ?? null
              const totals = account ? accountTotals.get(account.id) : undefined
              const lineItemsForAccount = items.filter((i) => i.account_id === examinedAccountId)
              const list = expenses
                .filter((e) => e.account_id === examinedAccountId)
                .slice()
                .sort((a, b) => String(b.date).localeCompare(String(a.date)))
              const filteredLineItems = filterLineItemsByClassification(lineItemsForAccount, examineAccountFilter)
                .slice()
                .sort((a, b) => {
                  const ta = getLineItemType(a) ?? ''
                  const tb = getLineItemType(b) ?? ''
                  const byType = ta.localeCompare(tb)
                  if (byType !== 0) return byType
                  return (a.description ?? '').localeCompare(b.description ?? '')
                })
              const filteredExpenses = filterExpensesByClassification(list, examineAccountFilter)
                .slice()
                .sort((a, b) => {
                  const ta = getExpenseType(a) ?? ''
                  const tb = getExpenseType(b) ?? ''
                  const byType = ta.localeCompare(tb)
                  if (byType !== 0) return byType
                  return String(b.date).localeCompare(String(a.date))
                })
              const openAllowsForAccount =
                allowDetailsForProduction?.reduce((acc, row) => {
                  if (row.account_id !== examinedAccountId) return acc
                  const parsed = parseAllowDetails(row.details_json)
                  if (parsed.ok && parsed.value.status === 'open') {
                    return acc + 1
                  }
                  if (!parsed.ok) {
                    return acc + 1
                  }
                  return acc
                }, 0) ?? 0
              const filterOptions: { value: ClassificationFilter; label: string }[] = [
                { value: 'all', label: 'All' },
                { value: 'labour', label: 'Labour' },
                { value: 'purchase', label: 'Purchase' },
                { value: 'rental', label: 'Rental' },
                { value: 'allow', label: 'Allow' },
                { value: 'deposit', label: 'Deposit' },
                { value: 'untyped', label: 'Untyped' },
              ]
              return (
                <>
                  <SheetHeader className="border-b border-border">
                    <SheetTitle>Examine account</SheetTitle>
                  </SheetHeader>
                  <div className="p-4 space-y-4 overflow-auto">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{account ? `${account.code} — ${account.name}` : 'Account'}</p>
                      {totals && (
                        <p className="text-xs text-muted-foreground">
                          Budget {format(totals.budgetTotal, productionCurrency).formatted} · Actual {format(totals.actualTotal, productionCurrency).formatted}
                        </p>
                      )}
                      {openAllowsForAccount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Open Allows in this account: {openAllowsForAccount}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">Filter by type</Label>
                      <Select
                        value={examineAccountFilter}
                        onValueChange={(v) => setExamineAccountFilter(v as ClassificationFilter)}
                      >
                        <SelectTrigger className="mt-1 h-9 w-full max-w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {filterOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-md border border-border">
                      <div className="border-b border-border px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Line items ({filteredLineItems.length}
                          {examineAccountFilter !== 'all' ? ` of ${lineItemsForAccount.length}` : ''})
                        </p>
                      </div>
                      <div className="divide-y divide-border">
                        {filteredLineItems.length === 0 ? (
                          <p className="px-3 py-3 text-sm text-muted-foreground">
                            {lineItemsForAccount.length === 0
                              ? 'No line items in this account yet.'
                              : 'No line items match the selected filter.'}
                          </p>
                        ) : (
                          filteredLineItems.map((item) => (
                            <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <ClassificationBadge type={getLineItemType(item)} />
                                  <p className="text-sm truncate">{item.description}</p>
                                </div>
                                {item.vendor && (
                                  <p className="text-xs text-muted-foreground truncate mt-0.5">{item.vendor}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <p className="text-sm font-medium">{format(item.estimated_cost, productionCurrency).formatted}</p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => setExaminedLineItemId(item.id)}
                                  aria-label="Examine line item"
                                >
                                  <Eye className="h-4 w-4" />
                                  Examine
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-md border border-border">
                      <div className="border-b border-border px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Expenses ({filteredExpenses.length}
                          {examineAccountFilter !== 'all' ? ` of ${list.length}` : ''})
                        </p>
                      </div>
                      <div className="divide-y divide-border">
                        {filteredExpenses.length === 0 ? (
                          <p className="px-3 py-3 text-sm text-muted-foreground">
                            {list.length === 0
                              ? 'No expenses posted to this account yet.'
                              : 'No expenses match the selected filter.'}
                          </p>
                        ) : (
                          filteredExpenses.map((e) => (
                            <div key={e.id} className="flex items-start justify-between gap-3 px-3 py-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <ClassificationBadge type={getExpenseType(e)} />
                                  <p className="text-sm">{e.date}</p>
                                </div>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  {e.vendor ? e.vendor : '—'}
                                  {e.notes ? ` · ${e.notes}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <p className="text-sm font-medium">{format(e.amount, productionCurrency).formatted}</p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => {
                                    setExaminedAccountId(null)
                                    setExaminedExpenseId(e.id)
                                  }}
                                >
                                  Examine
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )
            })()
          ) : null}
        </SheetContent>
      </Sheet>

      <SectionTutorialPanel
        open={tutorialOpen}
        onOpenChange={(open) => {
          setTutorialOpen(open)
          if (!open) {
            updateProgress((prev) => ({
              ...prev,
              currentSection: prev.currentSection === 'budget' ? null : prev.currentSection,
              sections: {
                ...prev.sections,
                budget: prev.sections.budget === 'not_started' ? 'in_progress' : prev.sections.budget,
              },
            }))
          }
        }}
        sectionId="budget"
        sectionTitle="Budget"
        steps={budgetTutorialSteps}
        progress={progress}
        updateProgress={(updater) => updateProgress((prev) => updater(prev))}
        onCompleteSection={() => {
          setTutorialOpen(false)
          updateProgress((prev) => ({
            ...prev,
            currentSection: prev.currentSection === 'budget' ? null : prev.currentSection,
            sections: {
              ...prev.sections,
              budget: 'complete',
            },
          }))
        }}
      />
    </div>
  )
}

/** Hex to CSS color with alpha (e.g. #9DBBAA -> rgba(..., 0.06)). */
function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/)
  if (!m) return `rgba(0,0,0,${alpha})`
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Hex-only PDF stylesheet for Cost Report export (Albatross theme). Injected in onclone so html2canvas never sees oklch. */
function buildCostReportPdfCss(): string {
  return `
/* 1) Reset / normalization for cloned document */
*, *::before, *::after {
  box-sizing: border-box;
  color: #1a1a1a !important;
  background: transparent !important;
  background-color: transparent !important;
  border-color: #e5e5e7 !important;
  outline-color: #1a1a1a !important;
  fill: #1a1a1a !important;
  stroke: #1a1a1a !important;
  box-shadow: none !important;
  text-shadow: none !important;
}
html, body {
  background: #ffffff !important;
  color: #1a1a1a !important;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 12px;
  line-height: 1.4;
}
.no-print { display: none !important; }
.text-muted-foreground { color: #525252 !important; }
.text-destructive { color: #b91c1c !important; }

/* 2) Albatross PDF theme – typography and spacing */
.cost-report-print {
  background: #ffffff !important;
  color: #1a1a1a !important;
  padding: 0;
}
.cost-report-print .report-header {
  border-bottom: 1px solid #e5e5e7;
  padding-bottom: 12px;
  margin-bottom: 4px;
}
.cost-report-print .report-header h2 {
  font-size: 19px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 2px 0;
}
.cost-report-print .report-header p {
  font-size: 11px;
  font-weight: 500;
  color: #525252;
  margin: 0;
}
.cost-report-print .report-section-header {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #525252;
  margin: 0 0 8px 0;
}
.cost-report-print .cost-report-table {
  table-layout: fixed;
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.cost-report-print .cost-report-table th,
.cost-report-print .cost-report-table td {
  border: 1px solid #e5e5e7;
  padding: 6px 10px;
  vertical-align: top;
}
.cost-report-print .cost-report-table thead th {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #525252;
  border-bottom: 2px solid #d4d4d8;
  padding: 8px 10px;
}
.cost-report-print .cost-report-col-code { width: 90px; }
.cost-report-print .cost-report-col-account { width: auto; }
.cost-report-print .cost-report-col-budget,
.cost-report-print .cost-report-col-actual,
.cost-report-print .cost-report-col-variance {
  width: 120px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.cost-report-print .cost-report-col-pct {
  width: 80px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.cost-report-print .cost-report-col-code,
.cost-report-print .cost-report-code-cell {
  width: 90px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  border-right: 1px solid rgba(0,0,0,0.12);
}
.cost-report-print .cost-report-code-cell {
  text-align: right;
}
.cost-report-print .cost-report-account-cell {
  padding-left: 10px;
  padding-right: 8px;
}
.cost-report-print tr[data-is-rollup="true"] .cost-report-code-cell,
.cost-report-print tr[data-is-rollup="true"] .cost-report-account-cell {
  text-align: left;
  padding-left: 10px;
  padding-right: 8px;
}
.cost-report-print .cost-report-table tbody tr[data-band-hex] {
  box-shadow: inset 1px 0 0 0 rgba(255,255,255,0.4) !important;
}
.cost-report-print .cost-report-table tbody tr[data-is-rollup="true"] {
  background: var(--row-tint, transparent) !important;
}
.cost-report-print .cost-report-table tbody tr:nth-child(even):not([data-is-rollup="true"]) {
  background: rgba(0,0,0,0.02) !important;
}
.cost-report-print .cost-report-group-total {
  border-top: 1px solid #d4d4d8 !important;
  font-weight: 600 !important;
  background: rgba(0,0,0,0.02) !important;
}
.cost-report-print .cost-report-subtotals table {
  font-size: 11px;
}
.cost-report-print .cost-report-subtotals th,
.cost-report-print .cost-report-subtotals td {
  padding: 6px 10px;
  border: 1px solid #e5e5e7;
}
.cost-report-print .cost-report-subtotals .report-section-header {
  border-top: 1px solid #d4d4d8;
  padding-top: 12px;
  margin-top: 8px;
}
.cost-report-print .cost-report-subtotals tr:last-child td {
  font-weight: 600;
  border-top: 1px solid #d4d4d8;
}
.cost-report-print .derived-overlays {
  border: 1px solid #e5e5e7;
  background: rgba(67, 56, 202, 0.04) !important;
  padding: 12px 16px;
}
.cost-report-print .derived-overlays .text-muted-foreground {
  font-style: italic;
  color: #525252 !important;
}
.cost-report-print .final-totals {
  border: 1px solid #e5e5e7;
  border-top: 3px solid #3f3f46;
  padding: 12px 16px;
  font-size: 12px;
}
.cost-report-print .final-totals .report-section-header {
  margin-bottom: 4px;
}
.cost-report-print .final-totals p {
  font-weight: 600;
  margin: 0 0 4px 0;
}
.cost-report-print .final-totals .text-xl {
  font-size: 18px;
}
.cost-report-print .cost-report-table-wrap {
  border: 1px solid #e5e5e7;
  border-radius: 0;
}
.cost-report-print .report-section.rounded-md {
  border: 1px solid #e5e5e7;
}
.cost-report-print .grid > div {
  border: 1px solid #e5e5e7;
  padding: 12px 16px;
  background: #ffffff !important;
}
.cost-report-print .grid > div p:first-child {
  font-size: 11px;
  color: #525252;
  margin: 0 0 4px 0;
}
.cost-report-print .grid > div .text-2xl {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

/* 3) Safety fallbacks */
.cost-report-print,
.cost-report-print *,
.cost-report-print *::before,
.cost-report-print *::after {
  box-shadow: none !important;
  text-shadow: none !important;
}
`
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/)
  if (!m) return `rgba(0,0,0,${alpha})`
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** In cloned document, apply band colours to rows with data-band-hex (left border + optional rollup tint). Archived rows get reduced opacity. */
function applyBandColorsInClone(clonedDoc: Document): void {
  const rows = clonedDoc.querySelectorAll<HTMLElement>('tr[data-band-hex]')
  rows.forEach((row) => {
    const hex = row.getAttribute('data-band-hex')
    if (!hex) return
    const isArchived = row.getAttribute('data-archived') === 'true'
    const borderAlpha = isArchived ? 0.35 : 0.62
    const tintAlpha = isArchived ? 0.02 : 0.04
    const borderColor = hexToRgba(hex, borderAlpha)
    row.style.borderLeft = `4px solid ${borderColor}`
    if (row.getAttribute('data-is-rollup') === 'true') {
      row.style.setProperty('--row-tint', hexToRgba(hex, tintAlpha))
    }
  })
}

type ProductionTotalAmount = {
  id: string
  name: string
  sort_order: number
  budgetTotal: number
  actualTotal: number
  variance: number
}

type GroupTotalRow = {
  groupId: string
  groupName: string
  groupCode: string | null
  budgetTotal: number
  actualTotal: number
  variance: number
  percentSpent: number | null
}

/** Trigger browser print for Cost Report. Kept in code for re-enabling (e.g. via feature flag). */
export function triggerCostReportPrint(): void {
  const p = window.print()
  if (p != null && typeof (p as Promise<void>).catch === 'function') {
    ;(p as Promise<void>).catch(() => {})
  }
}

function CostReportView({
  productionName,
  openAllowCount,
  accountTree,
  accountTotals,
  items,
  format,
  productionCurrency,
  totalEstimated,
  totalActual,
  variance,
  uncodedTotal,
  fringeTotals,
  contingencyTotals,
  productionTotalAmounts,
  productionSubtotalBeforeDerived,
  layoutMode,
  setLayoutMode,
  costReportGroupsWithAccounts,
  groupTotals,
  visibleIdsByGroupId,
  expandedLeafId,
  onToggleLeafDetail,
  configureButton,
}: {
  productionName: string
  openAllowCount: number
  accountTree: AccountTreeNode[]
  accountTotals: Map<string, { budgetTotal: number; actualTotal: number; variance: number; percentSpent: number | null }>
  items: BudgetItem[]
  format: (n: number, currency: string) => { formatted: string }
  productionCurrency: string
  totalEstimated: number
  totalActual: number
  variance: number
  uncodedTotal: number
  fringeTotals: { totalFringesAmount: number }
  contingencyTotals: { totalContingencyAmount: number }
  productionTotalAmounts: ProductionTotalAmount[]
  productionSubtotalBeforeDerived: { budget: number; actual: number; variance: number }
  layoutMode: CostReportLayoutMode
  setLayoutMode: (mode: CostReportLayoutMode) => void
  costReportGroupsWithAccounts: CostReportGroupWithAccountIds[]
  groupTotals: GroupTotalRow[]
  visibleIdsByGroupId: Map<string, Set<string>>
  expandedLeafId: string | null
  onToggleLeafDetail: (id: string | null) => void
  configureButton?: ReactNode
}) {
  const totalDerived = fringeTotals.totalFringesAmount + contingencyTotals.totalContingencyAmount
  const estimatedPlusDerived = totalEstimated + totalDerived
  const hasDerived = totalDerived > 0

  const rowCtx = {
    accountTotals,
    items,
    format,
    productionCurrency,
    expandedLeafId,
    onToggleLeafDetail,
  }

  const generatedDate = new Date().toISOString().slice(0, 10)
  const reportRef = useRef<HTMLDivElement>(null)
  const [isSavingPdf, setIsSavingPdf] = useState(false)

  const handleSaveAsPdf = useCallback(async () => {
    const el = reportRef.current
    if (!el) return
    setIsSavingPdf(true)
    el.classList.add('cost-report-exporting-pdf')
    function setHexStyles(node: Element) {
      if (node instanceof HTMLElement) {
        const isMuted = node.classList.contains('text-muted-foreground')
        const isDestructive = node.classList.contains('text-destructive')
        node.style.setProperty('color', isMuted ? '#525252' : isDestructive ? '#b91c1c' : '#1a1a1a')
        node.style.setProperty('background-color', 'transparent')
        node.style.setProperty('border-color', '#e5e7eb')
      }
      node.childNodes.forEach((child) => {
        if (child instanceof Element) setHexStyles(child)
      })
    }
    function clearHexStyles(node: Element) {
      if (node instanceof HTMLElement) {
        node.style.removeProperty('color')
        node.style.removeProperty('background-color')
        node.style.removeProperty('border-color')
      }
      node.childNodes.forEach((child) => {
        if (child instanceof Element) clearHexStyles(child)
      })
    }
    setHexStyles(el)
      /* Force reflow so computed styles (and CSS variable overrides) are applied before capture */
      void el.offsetHeight
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const pdfCss = buildCostReportPdfCss()
      const opt = {
        margin: 10,
        filename: 'cost-report.pdf',
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          onclone: (clonedDoc: Document) => {
            const style = clonedDoc.createElement('style')
            style.textContent = pdfCss
            clonedDoc.head.appendChild(style)
            applyBandColorsInClone(clonedDoc)
            void clonedDoc.body.offsetHeight
          },
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      }
      const arraybuffer = await html2pdf().set(opt).from(el).toPdf().output('arraybuffer')
      await saveFileWithDialog(
        {
          defaultPath: `cost-report-${generatedDate}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          title: 'Save Cost Report as PDF',
        },
        new Uint8Array(arraybuffer as ArrayBuffer)
      )
    } catch (err) {
      throw err
    } finally {
      clearHexStyles(el)
      el.classList.remove('cost-report-exporting-pdf')
      setIsSavingPdf(false)
    }
  }, [generatedDate])

  return (
    <div ref={reportRef} className="cost-report-print space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2 no-print">
        {costReportGroupsWithAccounts.length > 0 && (
          <Tabs
            value={layoutMode}
            onValueChange={(v) => setLayoutMode(v as CostReportLayoutMode)}
            className="w-auto"
          >
            <TabsList className="h-9 border border-border bg-muted/30">
              <TabsTrigger value="chart" className="px-3 text-sm data-[state=active]:bg-background">
                Chart of accounts
              </TabsTrigger>
              <TabsTrigger value="groups" className="px-3 text-sm data-[state=active]:bg-background">
                By groups
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        {configureButton}
        <Button variant="outline" size="sm" onClick={handleSaveAsPdf} disabled={isSavingPdf}>
          <Download className="mr-2 size-4" />
          {isSavingPdf ? 'Saving…' : 'Save as PDF'}
        </Button>
      </div>

      <header className="report-header border-b border-border pb-3">
        <h2 className="text-xl font-bold print:text-2xl">{productionName ? productionName : 'Cost Report'}</h2>
        {productionName && <p className="text-lg font-semibold text-muted-foreground">Cost Report</p>}
        <p className="text-sm text-muted-foreground mt-1">Generated: {generatedDate}</p>
        {openAllowCount > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Open Allows: {openAllowCount}
          </p>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-3 print:grid-cols-3">
        <div className="rounded-lg border border-border p-4">
          <p className="text-muted-foreground text-sm">Total estimated</p>
          <p className="text-2xl font-semibold">{format(totalEstimated, productionCurrency).formatted}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-muted-foreground text-sm">Total actual</p>
          <p className="text-2xl font-semibold">{format(totalActual, productionCurrency).formatted}</p>
          {uncodedTotal > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">
              Uncoded spend: {format(uncodedTotal, productionCurrency).formatted}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-muted-foreground text-sm">Variance</p>
          <p className={`text-2xl font-semibold ${variance < 0 ? 'text-destructive' : ''}`}>
            {format(variance, productionCurrency).formatted}
          </p>
        </div>
      </div>

      {layoutMode === 'chart' && (
        <div className="report-section rounded-md border border-border overflow-hidden cost-report-table-wrap">
          <Table className="cost-report-table">
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="cost-report-col-code w-[72px] border-border print:w-[90px]">Code</TableHead>
                <TableHead className="cost-report-col-account border-border">Account</TableHead>
                <TableHead className="cost-report-col-budget text-right border-border w-28 print:w-[120px]">Budget</TableHead>
                <TableHead className="cost-report-col-actual text-right border-border w-28 print:w-[120px]">Actual</TableHead>
                <TableHead className="cost-report-col-variance text-right border-border w-28 print:w-[120px]">Variance</TableHead>
                <TableHead className="cost-report-col-pct text-right w-16 border-border print:w-[80px]">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountTree.map((node) => (
                <Fragment key={node.account.id}>{renderCostReportRows(node, 0, rowCtx)}</Fragment>
              ))}
              {uncodedTotal > 0 && (
                <TableRow className="border-border bg-muted/20">
                  <TableCell className="cost-report-code-cell border-border font-medium">—</TableCell>
                  <TableCell className="cost-report-account-cell border-border font-medium">Uncoded spend</TableCell>
                  <TableCell className="border-border text-right">—</TableCell>
                  <TableCell className="border-border text-right">{format(uncodedTotal, productionCurrency).formatted}</TableCell>
                  <TableCell colSpan={2} className="border-border" />
                </TableRow>
              )}
              {accountTree.length === 0 && uncodedTotal === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8 border-border">
                    No accounts yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {layoutMode === 'groups' && (
        <div className="space-y-6">
          {groupTotals.length === 0 ? (
            <p className="text-muted-foreground text-sm">No cost report groups configured. Add groups in Settings.</p>
          ) : (
            groupTotals.map((group) => {
              const visibleIds = visibleIdsByGroupId.get(group.groupId)
              if (!visibleIds) return null
              return (
                <div key={group.groupId} className="report-section rounded-md border border-border overflow-hidden cost-report-table-wrap">
                  <div className="report-section-header border-b border-border bg-muted/10 px-4 py-2 print:bg-transparent">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {group.groupCode ? `${group.groupCode} — ` : ''}{group.groupName}
                    </p>
                  </div>
                  <Table className="cost-report-table">
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="cost-report-col-code w-[72px] border-border print:w-[90px]">Code</TableHead>
                        <TableHead className="cost-report-col-account border-border">Account</TableHead>
                        <TableHead className="cost-report-col-budget text-right border-border w-28 print:w-[120px]">Budget</TableHead>
                        <TableHead className="cost-report-col-actual text-right border-border w-28 print:w-[120px]">Actual</TableHead>
                        <TableHead className="cost-report-col-variance text-right border-border w-28 print:w-[120px]">Variance</TableHead>
                        <TableHead className="cost-report-col-pct text-right w-16 border-border print:w-[80px]">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accountTree.map((node) => (
                        <Fragment key={node.account.id}>{renderCostReportRows(node, 0, rowCtx, visibleIds)}</Fragment>
                      ))}
                      <TableRow className="cost-report-group-total border-t border-border bg-muted/5 font-medium">
                        <TableCell className="cost-report-code-cell border-border" />
                        <TableCell className="cost-report-account-cell border-border">Group total</TableCell>
                        <TableCell className="border-border text-right tabular-nums">{format(group.budgetTotal, productionCurrency).formatted}</TableCell>
                        <TableCell className="border-border text-right tabular-nums">{format(group.actualTotal, productionCurrency).formatted}</TableCell>
                        <TableCell className={`border-border text-right tabular-nums ${group.variance < 0 ? 'text-destructive' : ''}`}>
                          {format(group.variance, productionCurrency).formatted}
                        </TableCell>
                        <TableCell className="border-border text-right w-16 tabular-nums">
                          {group.percentSpent != null ? `${Math.round(group.percentSpent * 100)}%` : '—'}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )
            })
          )}
          {uncodedTotal > 0 && (
            <div className="report-section rounded-md border border-border overflow-hidden">
              <div className="report-section-header border-b border-border bg-muted/10 px-4 py-2 print:bg-transparent">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Uncoded spend</p>
              </div>
              <Table className="cost-report-table">
                <TableBody>
                  <TableRow className="border-border">
                    <TableCell className="cost-report-code-cell border-border font-medium">—</TableCell>
                    <TableCell className="cost-report-account-cell border-border font-medium">Uncoded spend</TableCell>
                    <TableCell className="border-border text-right">—</TableCell>
                    <TableCell className="border-border text-right">{format(uncodedTotal, productionCurrency).formatted}</TableCell>
                    <TableCell colSpan={2} className="border-border" />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Subtotals (production totals + Subtotal before derived), then Derived, then Final */}
      <div className="report-section border-t border-border pt-4 space-y-3">
        {productionTotalAmounts.length > 0 && (
          <>
            <p className="report-section-header text-xs font-medium uppercase tracking-wider text-muted-foreground">Subtotals</p>
          <div className="report-section rounded-md border border-border overflow-hidden cost-report-subtotals">
            <Table>
              <TableBody>
                {productionTotalAmounts.map((t) => (
                  <TableRow key={t.id} className="border-border">
                    <TableCell className="border-border font-medium">{t.name}</TableCell>
                    <TableCell className="border-border text-right tabular-nums">{format(t.budgetTotal, productionCurrency).formatted}</TableCell>
                    <TableCell className="border-border text-right tabular-nums">{format(t.actualTotal, productionCurrency).formatted}</TableCell>
                    <TableCell className={`border-border text-right tabular-nums ${t.variance < 0 ? 'text-destructive' : ''}`}>
                      {format(t.variance, productionCurrency).formatted}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-border bg-muted/10 font-semibold">
                  <TableCell className="border-border">Subtotal before derived</TableCell>
                  <TableCell className="border-border text-right tabular-nums">
                    {format(productionSubtotalBeforeDerived.budget, productionCurrency).formatted}
                  </TableCell>
                  <TableCell className="border-border text-right tabular-nums">
                    {format(productionSubtotalBeforeDerived.actual, productionCurrency).formatted}
                  </TableCell>
                  <TableCell className={`border-border text-right tabular-nums ${productionSubtotalBeforeDerived.variance < 0 ? 'text-destructive' : ''}`}>
                    {format(productionSubtotalBeforeDerived.variance, productionCurrency).formatted}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          </>
        )}

        {/* Derived (budget overlays) */}
        {hasDerived && (
          <div className="report-section derived-overlays rounded-lg border border-border bg-muted/20 p-4 space-y-2 print:bg-transparent">
            <p className="report-section-header text-xs font-medium uppercase tracking-wider text-muted-foreground">Derived (budget overlays)</p>
            <div className="flex flex-wrap gap-6">
              {fringeTotals.totalFringesAmount > 0 && (
                <div>
                  <span className="text-muted-foreground text-sm italic">Fringes (derived): </span>
                  <span className="font-medium">{format(fringeTotals.totalFringesAmount, productionCurrency).formatted}</span>
                </div>
              )}
              {contingencyTotals.totalContingencyAmount > 0 && (
                <div>
                  <span className="text-muted-foreground text-sm italic">Contingency (derived): </span>
                  <span className="font-medium">{format(contingencyTotals.totalContingencyAmount, productionCurrency).formatted}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Final: Total budget incl. derived, Total actual (expenses-only), Variance */}
        <div className="report-section final-totals rounded-lg border border-border p-4 space-y-1">
          <p className="report-section-header text-xs font-medium uppercase tracking-wider text-muted-foreground">Total budget incl. derived</p>
          <p className="text-xl font-semibold">{format(estimatedPlusDerived, productionCurrency).formatted}</p>
          <p className="text-muted-foreground text-sm">Total actual (expenses only): {format(totalActual, productionCurrency).formatted}</p>
          <p className={`text-sm font-medium ${variance < 0 ? 'text-destructive' : ''}`}>
            Variance vs estimated: {format(variance, productionCurrency).formatted}
          </p>
        </div>
      </div>

      <footer className="cost-report-print-footer hidden print:block" aria-hidden="true" />
    </div>
  )
}

function ProductionTotalsModal({
  open,
  onOpenChange,
  productionTotals,
  headerAccounts,
  editTotal,
  onEdit,
  createOpen,
  onCreateOpen,
  onCreate,
  onUpdate,
  onDelete,
  createPending,
  updatePending,
  deletePending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionTotals: ProductionTotalWithAccountIds[]
  headerAccounts: BudgetAccount[]
  editTotal: ProductionTotalWithAccountIds | null
  onEdit: (t: ProductionTotalWithAccountIds | null) => void
  createOpen: boolean
  onCreateOpen: (open: boolean) => void
  onCreate: (data: { name: string; account_ids: string[] }) => void
  onUpdate: (data: { id: string; name: string; account_ids: string[] }) => void
  onDelete: (id: string) => void
  createPending: boolean
  updatePending: boolean
  deletePending: boolean
}) {
  const showForm = createOpen || editTotal != null
  const [formName, setFormName] = useState('')
  const [formAccountIds, setFormAccountIds] = useState<string[]>([])

  useEffect(() => {
    if (editTotal) {
      setFormName(editTotal.name)
      setFormAccountIds([...editTotal.account_ids])
    } else if (createOpen) {
      setFormName('')
      setFormAccountIds([])
    }
  }, [editTotal, createOpen])

  const handleSave = () => {
    const name = formName.trim()
    if (!name) return
    if (editTotal) {
      onUpdate({ id: editTotal.id, name, account_ids: formAccountIds })
    } else {
      onCreate({ name, account_ids: formAccountIds })
    }
  }

  const handleCancel = () => {
    onEdit(null)
    onCreateOpen(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onEdit(null)
      onCreateOpen(false)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Production totals</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productionTotals.length === 0 && !showForm ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground text-sm">
                      No production totals yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  productionTotals.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            onEdit(t)
                            onCreateOpen(false)
                          }}
                          aria-label="Edit"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            if (window.confirm(`Delete "${t.name}"?`)) onDelete(t.id)
                          }}
                          disabled={deletePending}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {!showForm && (
            <Button onClick={() => onCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              Create production total
            </Button>
          )}
          {showForm && (
            <div className="rounded-md border border-border p-4 space-y-4">
              <div>
                <Label htmlFor="pt-name">Name</Label>
                <Input
                  id="pt-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Above the line"
                />
              </div>
              <div>
                <Label>Accounts</Label>
                <p className="text-muted-foreground text-xs mb-2">Select header accounts. Leaf totals are included automatically.</p>
                <div className="max-h-40 overflow-auto space-y-2 rounded border border-border p-2">
                  {headerAccounts.map((acc) => (
                    <label key={acc.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formAccountIds.includes(acc.id)}
                        onCheckedChange={(checked) => {
                          setFormAccountIds((prev) =>
                            checked ? [...prev, acc.id] : prev.filter((id) => id !== acc.id)
                          )
                        }}
                      />
                      <span className="text-sm">
                        {acc.code} — {acc.name}
                      </span>
                    </label>
                  ))}
                  {headerAccounts.length === 0 && (
                    <p className="text-muted-foreground text-sm">No header accounts. Add accounts in Settings.</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={createPending || updatePending || !formName.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function renderCostReportRows(
  node: AccountTreeNode,
  depth: number,
  ctx: {
    accountTotals: Map<string, { budgetTotal: number; actualTotal: number; variance: number; percentSpent: number | null }>
    items: BudgetItem[]
    format: (n: number, currency: string) => { formatted: string }
    productionCurrency: string
    expandedLeafId: string | null
    onToggleLeafDetail: (id: string | null) => void
  },
  visibleIds?: Set<string>
): ReactNode {
  const { account } = node
  // Roots (no parent) must only be rendered from the root accountTree array at depth 0, never as children.
  if (depth > 0 && account.parent_account_id === null) return null
  if (visibleIds != null && !visibleIds.has(account.id)) return null
  const totals = ctx.accountTotals.get(account.id)
  const isRollup = !account.is_postable
  const bandColor = getAccountBandColor(account)
  const tintBg = hexWithAlpha(bandColor, 0.06)
  const lineItems = account.is_postable ? ctx.items.filter((i) => i.account_id === account.id) : []
  const isExpanded = ctx.expandedLeafId === account.id

  const rows: ReactNode[] = []
  rows.push(
    <TableRow
      key={account.id}
      className={`cost-report-band-row ${isRollup ? 'border-border' : 'border-border'}`}
      style={
        isRollup
          ? { backgroundColor: tintBg, borderLeft: `3px solid ${bandColor}` }
          : { borderLeft: `3px solid ${bandColor}` }
      }
      data-band-hex={bandColor}
      data-is-rollup={isRollup ? 'true' : undefined}
      data-archived={account.archived_at ? 'true' : undefined}
    >
      <TableCell
        className={`cost-report-code-cell w-[72px] align-top border-border ${isRollup ? 'font-semibold text-foreground' : 'text-foreground'}`}
      >
        {account.code}
      </TableCell>
      <TableCell
        className={`cost-report-account-cell align-top border-border ${isRollup ? 'font-semibold text-foreground' : ''}`}
        style={depth > 0 ? { paddingLeft: 12 + depth * 14 } : undefined}
      >
        {account.is_postable ? (
          <>
            <button
              type="button"
              className="text-left w-full cursor-pointer hover:opacity-90 print:hidden"
              onClick={() => ctx.onToggleLeafDetail(isExpanded ? null : account.id)}
            >
              {account.name}
              {lineItems.length > 0 && (
                <span className="text-muted-foreground text-sm font-normal block mt-0.5">
                  {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}
                </span>
              )}
            </button>
            <span className="hidden print:inline">
              {account.name}
              {lineItems.length > 0 && ` (${lineItems.length} line items)`}
            </span>
          </>
        ) : (
          <span>{account.name}</span>
        )}
      </TableCell>
      <TableCell className="text-right align-top border-border">
        {totals ? ctx.format(totals.budgetTotal, ctx.productionCurrency).formatted : '—'}
      </TableCell>
      <TableCell className="text-right align-top border-border">
        {totals ? ctx.format(totals.actualTotal, ctx.productionCurrency).formatted : '—'}
      </TableCell>
      <TableCell className="text-right align-top border-border">
        {totals && (
          <span className={totals.variance < 0 ? 'text-destructive' : ''}>
            {ctx.format(totals.variance, ctx.productionCurrency).formatted}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right w-[64px] align-top border-border">
        {totals?.percentSpent != null ? `${Math.round(totals.percentSpent * 100)}%` : '—'}
      </TableCell>
    </TableRow>
  )

  if (account.is_postable && isExpanded) {
    if (lineItems.length > 0) {
      lineItems.forEach((item) => {
        rows.push(
          <TableRow key={item.id} className="border-border bg-muted/10">
            <TableCell className="cost-report-code-cell border-border" />
            <TableCell className="cost-report-account-cell border-border pl-6 text-muted-foreground text-sm" style={{ paddingLeft: 12 + depth * 14 + 24 }}>
              {item.description}
            </TableCell>
            <TableCell className="text-right border-border text-sm">
              {ctx.format(item.estimated_cost, ctx.productionCurrency).formatted}
            </TableCell>
            <TableCell colSpan={3} className="border-border" />
          </TableRow>
        )
      })
    } else {
      rows.push(
        <TableRow key={`${account.id}-empty`} className="border-border bg-muted/10">
          <TableCell colSpan={6} className="border-border text-muted-foreground text-sm italic py-2" style={{ paddingLeft: 12 + depth * 14 + 24 }}>
            No line items yet
          </TableCell>
        </TableRow>
      )
    }
  }

  node.children.forEach((child) => {
    const childRows = renderCostReportRows(child, depth + 1, ctx, visibleIds)
    if (childRows != null) rows.push(childRows)
  })
  return <>{rows}</>
}

function renderAccountRow(
  node: AccountTreeNode,
  depth: number,
  ctx: {
    accountTotals: Map<string, { budgetTotal: number; actualTotal: number; variance: number; percentSpent: number | null }>
    expandedAccountIds: Set<string>
    toggleAccountExpanded: (id: string) => void
    items: BudgetItem[]
    format: (n: number, currency: string) => { formatted: string }
    productionCurrency: string
    setAddItemForAccountId: (id: string | null) => void
    addItemForAccountId: string | null
    createInlineItemMutation: { mutate: (data: { account_id: string; description: string; estimated_cost: number }) => void; isPending: boolean }
    postableAccounts: BudgetAccount[]
    onExamineAccount: (accountId: string) => void
  }
): ReactNode {
  const { account } = node
  const totals = ctx.accountTotals.get(account.id)
  const isExpanded = ctx.expandedAccountIds.has(account.id)
  const isLeaf = account.is_postable
  const lineItems = isLeaf ? ctx.items.filter((i) => i.account_id === account.id) : []
  const hasChildren = node.children.length > 0

  const rows: ReactNode[] = []
  rows.push(
    <TableRow
      key={account.id}
      className={isLeaf ? '' : 'bg-muted/30 font-medium'}
    >
      <TableCell className="w-[80px]">
        <button
          type="button"
          className="flex items-center gap-0.5"
          onClick={() => (hasChildren || isLeaf) && ctx.toggleAccountExpanded(account.id)}
          aria-expanded={isExpanded}
        >
          {hasChildren || isLeaf ? (
            isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />
          ) : (
            <span className="w-4" />
          )}
        </button>
      </TableCell>
      <TableCell style={{ paddingLeft: depth * 16 + 8 }}>
        <span className={isLeaf ? '' : 'font-medium'}>{account.code}</span>
        <span className="ml-2 text-muted-foreground">{account.name}</span>
      </TableCell>
      <TableCell className="text-right">
        {totals ? ctx.format(totals.budgetTotal, ctx.productionCurrency).formatted : '—'}
      </TableCell>
      <TableCell className="text-right">
        {totals ? ctx.format(totals.actualTotal, ctx.productionCurrency).formatted : '—'}
      </TableCell>
      <TableCell className="text-right">
        {totals && (
          <span className={totals.variance < 0 ? 'text-destructive' : ''}>
            {ctx.format(totals.variance, ctx.productionCurrency).formatted}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right w-[70px]">
        {totals?.percentSpent != null
          ? `${Math.round(totals.percentSpent * 100)}%`
          : '—'}
      </TableCell>
      <TableCell className="w-[96px]">
        {isLeaf && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => ctx.onExamineAccount(account.id)}
              aria-label="Examine account"
            >
              <Eye className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => ctx.setAddItemForAccountId(account.id)}
              aria-label="Add line item"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  )
  if (isExpanded && isLeaf) {
    if (lineItems.length > 0) {
      lineItems.forEach((item) => {
        rows.push(
          <TableRow key={item.id} className="bg-muted/10">
            <TableCell />
            <TableCell className="pl-8" style={{ paddingLeft: depth * 16 + 24 }}>
              {item.description}
            </TableCell>
            <TableCell className="text-right">{ctx.format(item.estimated_cost, ctx.productionCurrency).formatted}</TableCell>
            <TableCell colSpan={4} />
          </TableRow>
        )
      })
    } else {
      rows.push(
        <TableRow key={`${account.id}-empty`} className="bg-muted/10">
          <TableCell />
          <TableCell colSpan={6} className="text-muted-foreground text-sm italic" style={{ paddingLeft: depth * 16 + 24 }}>
            No line items yet
          </TableCell>
        </TableRow>
      )
    }
  }
  if (isExpanded && node.children.length > 0) {
    node.children.forEach((child) => {
      rows.push(renderAccountRow(child, depth + 1, ctx))
    })
  }
  return <>{rows}</>
}

function InlineAddItemForm({
  accountLabel,
  onSubmit,
  onCancel,
  isLoading,
}: {
  accountLabel: string
  onSubmit: (data: z.infer<typeof inlineItemSchema>) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<z.infer<typeof inlineItemSchema>>({
    resolver: zodResolver(inlineItemSchema) as never,
    defaultValues: { description: '', estimated_cost: 0 },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add line item</DialogTitle>
        <p className="text-muted-foreground text-sm">{accountLabel}</p>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label>Description</Label>
          <Input {...form.register('description')} />
          {form.formState.errors.description && (
            <p className="text-destructive text-sm">{form.formState.errors.description.message}</p>
          )}
        </div>
        <div>
          <Label>Estimated cost</Label>
          <Input type="number" step={0.01} {...form.register('estimated_cost')} />
          {form.formState.errors.estimated_cost && (
            <p className="text-destructive text-sm">{form.formState.errors.estimated_cost.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            Add
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function BudgetItemForm({
  accounts,
  onSubmit,
  onCancel,
  isLoading,
}: {
  accounts: BudgetAccount[]
  onSubmit: (d: z.infer<typeof itemSchema>) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<z.infer<typeof itemSchema>>({
    resolver: zodResolver(itemSchema) as never,
    defaultValues: {
      account_id: '',
      description: '',
      estimated_cost: 0,
      actual_cost: 0,
      vendor: '',
    },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add budget line item</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label>Account</Label>
          <Controller
            name="account_id"
            control={form.control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.account_id && (
            <p className="text-destructive text-sm">
              {form.formState.errors.account_id.message}
            </p>
          )}
        </div>
        <div>
          <Label>Description</Label>
          <Input {...form.register('description')} />
          {form.formState.errors.description && (
            <p className="text-destructive text-sm">
              {form.formState.errors.description.message}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Estimated cost</Label>
            <Input type="number" step={0.01} {...form.register('estimated_cost')} />
          </div>
          <div>
            <Label>Actual cost</Label>
            <Input type="number" step={0.01} {...form.register('actual_cost')} />
          </div>
        </div>
        <div>
          <Label>Vendor</Label>
          <Input {...form.register('vendor')} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            Add
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

function ManageDerivedCostsDialog({
  productionId,
  accounts,
  fringeRules,
  contingencyRules,
  format: _format,
  productionCurrency: _productionCurrency,
  onClose,
  invalidateDerived,
}: {
  productionId: string
  accounts: BudgetAccount[]
  fringeRules: FringeRuleWithScopes[]
  contingencyRules: ContingencyRuleWithScopes[]
  format: (n: number, currency: string) => { formatted: string }
  productionCurrency: string
  onClose: () => void
  invalidateDerived: () => void
}) {
  const [activeTab, setActiveTab] = useState<'fringes' | 'contingency'>('fringes')
  const [editingFringeId, setEditingFringeId] = useState<string | null>(null)
  const [editingContingencyId, setEditingContingencyId] = useState<string | null>(null)
  const [addingFringe, setAddingFringe] = useState(false)
  const [addingContingency, setAddingContingency] = useState(false)

  const createFringeMutation = useMutation({
    mutationFn: (data: DerivedRuleFormValues) =>
      createFringeRule({
        production_id: productionId,
        name: data.name,
        rate: data.ratePercent / 100,
        base_kind: 'budget',
        scope_mode: 'include_subtrees',
        scope_account_ids: data.scope_account_ids,
      }),
    onSuccess: () => {
      invalidateDerived()
      setAddingFringe(false)
    },
  })

  const updateFringeMutation = useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: DerivedRuleFormValues }) =>
      updateFringeRule(ruleId, {
        name: data.name,
        rate: data.ratePercent / 100,
        scope_account_ids: data.scope_account_ids,
      }),
    onSuccess: () => {
      invalidateDerived()
      setEditingFringeId(null)
    },
  })

  const deleteFringeMutation = useMutation({
    mutationFn: deleteFringeRule,
    onSuccess: () => invalidateDerived(),
  })

  const setFringeEnabledMutation = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      setFringeRuleEnabled(ruleId, enabled),
    onSuccess: () => invalidateDerived(),
  })

  const createContingencyMutation = useMutation({
    mutationFn: (data: DerivedRuleFormValues) =>
      createContingencyRule({
        production_id: productionId,
        name: data.name,
        rate: data.ratePercent / 100,
        base_kind: 'budget',
        scope_mode: 'include_subtrees',
        scope_account_ids: data.scope_account_ids,
      }),
    onSuccess: () => {
      invalidateDerived()
      setAddingContingency(false)
    },
  })

  const updateContingencyMutation = useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: DerivedRuleFormValues }) =>
      updateContingencyRule(ruleId, {
        name: data.name,
        rate: data.ratePercent / 100,
        scope_account_ids: data.scope_account_ids,
      }),
    onSuccess: () => {
      invalidateDerived()
      setEditingContingencyId(null)
    },
  })

  const deleteContingencyMutation = useMutation({
    mutationFn: deleteContingencyRule,
    onSuccess: () => invalidateDerived(),
  })

  const setContingencyEnabledMutation = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      setContingencyRuleEnabled(ruleId, enabled),
    onSuccess: () => invalidateDerived(),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Manage derived costs</DialogTitle>
        <p className="text-muted-foreground text-sm">
          Fringes and contingency are computed from account totals. Derived amounts are budget-side overlays only.
        </p>
      </DialogHeader>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'fringes' | 'contingency')} className="flex flex-col flex-1 min-h-0">
        <TabsList className="bg-muted/50 border border-border w-full grid grid-cols-2">
          <TabsTrigger value="fringes" className="data-[state=active]:bg-mint-600 data-[state=active]:text-white">
            Fringes
          </TabsTrigger>
          <TabsTrigger value="contingency" className="data-[state=active]:bg-mint-600 data-[state=active]:text-white">
            Contingency
          </TabsTrigger>
        </TabsList>
        <TabsContent value="fringes" className="flex flex-col flex-1 min-h-0 mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Rules applied to a scoped base (e.g. payroll).</span>
            {!addingFringe && !editingFringeId && (
              <Button size="sm" onClick={() => setAddingFringe(true)}>
                <Plus className="mr-2 size-4" />
                Add rule
              </Button>
            )}
          </div>
          {(addingFringe || editingFringeId) && (
            <DerivedRuleForm
              accounts={accounts}
              initialValues={
                editingFringeId
                  ? (() => {
                      const r = fringeRules.find((x) => x.id === editingFringeId)
                      return r
                        ? {
                            name: r.name,
                            ratePercent: r.rate * 100,
                            scope_account_ids: r.scope_account_ids,
                          }
                        : undefined
                    })()
                  : undefined
              }
              onSave={(data) => {
                if (editingFringeId) updateFringeMutation.mutate({ ruleId: editingFringeId, data })
                else createFringeMutation.mutate(data)
              }}
              onCancel={() => {
                setAddingFringe(false)
                setEditingFringeId(null)
              }}
              isLoading={createFringeMutation.isPending || updateFringeMutation.isPending}
            />
          )}
          <div className="space-y-2 overflow-auto flex-1 min-h-0">
            {fringeRules.length === 0 && !addingFringe && (
              <p className="text-muted-foreground text-sm">No fringe rules. Add one to derive a percentage of scoped budget.</p>
            )}
            {fringeRules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Checkbox
                    checked={r.is_enabled}
                    onCheckedChange={(checked) =>
                      setFringeEnabledMutation.mutate({ ruleId: r.id, enabled: checked === true })
                    }
                  />
                  <span className="font-medium truncate">{r.name}</span>
                  <span className="text-muted-foreground text-sm shrink-0">{r.rate * 100}%</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingFringeId(r.id)}
                    disabled={!!editingFringeId || addingFringe}
                    aria-label="Edit"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteFringeMutation.mutate(r.id)}
                    disabled={!!editingFringeId || addingFringe}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="contingency" className="flex flex-col flex-1 min-h-0 mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Rules applied to a scoped budget base.</span>
            {!addingContingency && !editingContingencyId && (
              <Button size="sm" onClick={() => setAddingContingency(true)}>
                <Plus className="mr-2 size-4" />
                Add rule
              </Button>
            )}
          </div>
          {(addingContingency || editingContingencyId) && (
            <DerivedRuleForm
              accounts={accounts}
              initialValues={
                editingContingencyId
                  ? (() => {
                      const r = contingencyRules.find((x) => x.id === editingContingencyId)
                      return r
                        ? {
                            name: r.name,
                            ratePercent: r.rate * 100,
                            scope_account_ids: r.scope_account_ids,
                          }
                        : undefined
                    })()
                  : undefined
              }
              onSave={(data) => {
                if (editingContingencyId) updateContingencyMutation.mutate({ ruleId: editingContingencyId, data })
                else createContingencyMutation.mutate(data)
              }}
              onCancel={() => {
                setAddingContingency(false)
                setEditingContingencyId(null)
              }}
              isLoading={createContingencyMutation.isPending || updateContingencyMutation.isPending}
            />
          )}
          <div className="space-y-2 overflow-auto flex-1 min-h-0">
            {contingencyRules.length === 0 && !addingContingency && (
              <p className="text-muted-foreground text-sm">No contingency rules. Add one to derive a percentage of scoped budget.</p>
            )}
            {contingencyRules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Checkbox
                    checked={r.is_enabled}
                    onCheckedChange={(checked) =>
                      setContingencyEnabledMutation.mutate({ ruleId: r.id, enabled: checked === true })
                    }
                  />
                  <span className="font-medium truncate">{r.name}</span>
                  <span className="text-muted-foreground text-sm shrink-0">{r.rate * 100}%</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingContingencyId(r.id)}
                    disabled={!!editingContingencyId || addingContingency}
                    aria-label="Edit"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteContingencyMutation.mutate(r.id)}
                    disabled={!!editingContingencyId || addingContingency}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  )
}

function DerivedRuleForm({
  accounts,
  initialValues,
  onSave,
  onCancel,
  isLoading,
}: {
  accounts: BudgetAccount[]
  initialValues?: DerivedRuleFormValues
  onSave: (data: DerivedRuleFormValues) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<DerivedRuleFormValues>({
    resolver: zodResolver(derivedRuleSchema) as never,
    defaultValues: initialValues ?? {
      name: '',
      ratePercent: 0,
      scope_account_ids: [],
    },
  })
  useEffect(() => {
    if (initialValues) form.reset(initialValues)
  }, [initialValues, form])

  return (
    <form onSubmit={form.handleSubmit(onSave)} className="space-y-4 rounded-md border border-border bg-muted/20 p-4">
      <div>
        <Label>Name</Label>
        <Input {...form.register('name')} placeholder="e.g. Payroll fringes" />
        {form.formState.errors.name && (
          <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <Label>Rate (%)</Label>
        <Input
          type="number"
          step={0.01}
          min={0}
          max={1000}
          {...form.register('ratePercent')}
          placeholder="18"
        />
        {form.formState.errors.ratePercent && (
          <p className="text-destructive text-sm">{form.formState.errors.ratePercent.message}</p>
        )}
        <p className="text-muted-foreground text-xs mt-1">Enter percentage (e.g. 18 for 18%).</p>
      </div>
      <div>
        <Label>Scope accounts</Label>
        <p className="text-muted-foreground text-xs mb-2">Selecting a header account includes all child accounts.</p>
        <div className="max-h-40 overflow-auto space-y-2 rounded border border-border p-2">
          {accounts.map((acc) => (
            <label key={acc.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={form.watch('scope_account_ids').includes(acc.id)}
                onCheckedChange={(checked) => {
                  const current = form.getValues('scope_account_ids')
                  const next = checked
                    ? [...current, acc.id]
                    : current.filter((id: string) => id !== acc.id)
                  form.setValue('scope_account_ids', next)
                }}
              />
              <span className="text-sm">
                {acc.code} — {acc.name}
              </span>
            </label>
          ))}
        </div>
        {form.formState.errors.scope_account_ids && (
          <p className="text-destructive text-sm">{form.formState.errors.scope_account_ids.message}</p>
        )}
      </div>
      <DialogFooter className="gap-2 p-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
