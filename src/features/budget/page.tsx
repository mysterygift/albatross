import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useCurrency } from '@/hooks/useCurrency'
import {
  listBudgetCategoriesByProduction,
  listBudgetItemsByProduction,
  listExpensesByProduction,
  createBudgetItem,
  createExpense,
  updateExpenseAccount,
  backfillAccountIdsFromLegacyCategories,
} from '@/lib/db/repositories/budget'
import { listAccounts, listPostableAccounts } from '@/lib/db/repositories/budgetAccounts'
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
  type AccountTreeNode,
} from '@/lib/budget/calculations'
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
import { Plus, Download, ChevronRight, ChevronDown, Settings2, Pencil, Trash2, Printer } from 'lucide-react'
import { saveFileWithDialog } from '@/lib/files'
import { getAccountBandColor } from '@/lib/budget/accountBandColor'
import type { BudgetItem, BudgetAccount } from '@/lib/db/types'

const BUDGET_VIEW_MODE_KEY = 'budgetViewMode'
type BudgetViewMode = 'budget' | 'cost_report'

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

const expenseSchema = z.object({
  account_id: z.string().min(1, 'Select an account'),
  amount: z.coerce.number().min(0),
  date: z.string().min(1),
  vendor: z.string().optional(),
  notes: z.string().optional(),
  expense_type: z.enum(['petty_cash', 'per_diem', 'other']),
})

/** Rate as percentage 0–100; stored as decimal 0–1 in DB. */
const derivedRuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  ratePercent: z.coerce.number().min(0.01, 'Rate must be greater than 0').max(1000, 'Rate must be at most 1000%'),
  scope_account_ids: z.array(z.string()).min(1, 'Select at least one account'),
})

export function BudgetPage() {
  const { currentProductionId, currentProduction } = useCurrentProduction()
  const { format, ensureRate, conversionBanner } = useCurrency()
  const productionCurrency = currentProduction?.currency_code ?? 'GBP'
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set())
  const [uncodedExpanded, setUncodedExpanded] = useState(false)
  const [addItemForAccountId, setAddItemForAccountId] = useState<string | null>(null)
  const [recodeToast, setRecodeToast] = useState<string | null>(null)
  const [manageDerivedOpen, setManageDerivedOpen] = useState(false)
  const [viewMode, setViewMode] = useState<BudgetViewMode>(() => {
    if (typeof window === 'undefined') return 'budget'
    const stored = localStorage.getItem(BUDGET_VIEW_MODE_KEY)
    return (stored === 'cost_report' ? 'cost_report' : 'budget') as BudgetViewMode
  })
  const [costReportExpandedLeafId, setCostReportExpandedLeafId] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(BUDGET_VIEW_MODE_KEY, viewMode)
  }, [viewMode])
  const queryClient = useQueryClient()
  const backfillRanForProduction = useRef<Set<string>>(new Set())

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
      setAddItemForAccountId(null)
    },
  })

  const recodeExpenseMutation = useMutation({
    mutationFn: ({ expenseId, newAccountId }: { expenseId: string; newAccountId: string }) =>
      updateExpenseAccount(expenseId, newAccountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', currentProductionId!] })
      setRecodeToast('Expense recoded.')
      setTimeout(() => setRecodeToast(null), 3000)
    },
  })

  const createExpenseMutation = useMutation({
    mutationFn: (data: z.infer<typeof expenseSchema>) =>
      createExpense({
        production_id: currentProductionId!,
        account_id: data.account_id,
        category_id: null,
        amount: data.amount,
        date: data.date,
        vendor: data.vendor ?? null,
        notes: data.notes ?? null,
        expense_type: data.expense_type,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', currentProductionId!] })
      queryClient.invalidateQueries({ queryKey: ['budget-items', currentProductionId!] })
      setAddExpenseOpen(false)
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
          <Dialog
            open={addExpenseOpen}
            onOpenChange={setAddExpenseOpen}
          >
            <DialogTrigger asChild>
              <Button variant="outline" className="no-print">
                <Plus className="mr-2 size-4" />
                Quick-add spend
              </Button>
            </DialogTrigger>
            <DialogContent>
              {addExpenseOpen && (
              <QuickExpenseForm
                accounts={postableAccounts}
                onSubmit={createExpenseMutation.mutate}
                onCancel={() => setAddExpenseOpen(false)}
                isLoading={createExpenseMutation.isPending}
              />
              )}
            </DialogContent>
          </Dialog>
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

      {viewMode === 'cost_report' ? (
        <CostReportView
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
          expandedLeafId={costReportExpandedLeafId}
          onToggleLeafDetail={setCostReportExpandedLeafId}
        />
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
                  <TableHead className="w-[80px]">Actions</TableHead>
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
                      No accounts yet. Add a line item or quick-add spend to get started.
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

function CostReportView({
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
  expandedLeafId,
  onToggleLeafDetail,
}: {
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
  expandedLeafId: string | null
  onToggleLeafDetail: (id: string | null) => void
}) {
  const totalDerived = fringeTotals.totalFringesAmount + contingencyTotals.totalContingencyAmount
  const estimatedPlusDerived = totalEstimated + totalDerived
  const hasDerived = totalDerived > 0

  return (
    <div className="cost-report-print space-y-6">
      <div className="flex justify-end no-print">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 size-4" />
          Print
        </Button>
      </div>

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

      {hasDerived && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
          <p className="text-muted-foreground text-sm font-medium">Derived (budget overlays)</p>
          <div className="flex flex-wrap gap-6">
            {fringeTotals.totalFringesAmount > 0 && (
              <div>
                <span className="text-muted-foreground text-sm">Fringes (derived): </span>
                <span className="font-medium">{format(fringeTotals.totalFringesAmount, productionCurrency).formatted}</span>
              </div>
            )}
            {contingencyTotals.totalContingencyAmount > 0 && (
              <div>
                <span className="text-muted-foreground text-sm">Contingency (derived): </span>
                <span className="font-medium">{format(contingencyTotals.totalContingencyAmount, productionCurrency).formatted}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground text-sm">Estimated + derived: </span>
              <span className="font-medium">{format(estimatedPlusDerived, productionCurrency).formatted}</span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="w-[72px] border-border">Code</TableHead>
              <TableHead className="border-border">Account</TableHead>
              <TableHead className="text-right border-border">Budget</TableHead>
              <TableHead className="text-right border-border">Actual</TableHead>
              <TableHead className="text-right border-border">Variance</TableHead>
              <TableHead className="text-right w-[64px] border-border">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accountTree.map((node) =>
              renderCostReportRows(node, 0, {
                accountTotals,
                items,
                format,
                productionCurrency,
                expandedLeafId,
                onToggleLeafDetail,
              })
            )}
            {uncodedTotal > 0 && (
              <TableRow className="border-border bg-muted/20">
                <TableCell className="border-border font-medium">—</TableCell>
                <TableCell className="border-border font-medium">Uncoded spend</TableCell>
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
    </div>
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
  }
): ReactNode {
  const { account } = node
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
      className={isRollup ? 'border-border' : 'border-border'}
      style={
        isRollup
          ? { backgroundColor: tintBg, borderLeft: `3px solid ${bandColor}` }
          : { borderLeft: `3px solid ${bandColor}` }
      }
    >
      <TableCell
        className={`w-[72px] align-top border-border ${isRollup ? 'font-semibold text-foreground' : 'text-foreground'}`}
      >
        {account.code}
      </TableCell>
      <TableCell
        className={`align-top border-border ${isRollup ? 'font-semibold text-foreground' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
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
            <TableCell className="border-border" />
            <TableCell className="border-border pl-6 text-muted-foreground text-sm" style={{ paddingLeft: 8 + depth * 14 + 24 }}>
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
          <TableCell colSpan={6} className="border-border text-muted-foreground text-sm italic py-2" style={{ paddingLeft: 8 + depth * 14 + 24 }}>
            No line items yet
          </TableCell>
        </TableRow>
      )
    }
  }

  node.children.forEach((child) => {
    rows.push(renderCostReportRows(child, depth + 1, ctx))
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
      <TableCell className="w-[80px]">
        {isLeaf && (
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

function QuickExpenseForm({
  accounts,
  onSubmit,
  onCancel,
  isLoading,
}: {
  accounts: BudgetAccount[]
  onSubmit: (d: z.infer<typeof expenseSchema>) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema) as never,
    defaultValues: {
      account_id: '',
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      expense_type: 'other',
    },
  })
  return (
    <>
      <DialogHeader>
        <DialogTitle>Quick-add spend</DialogTitle>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Amount</Label>
            <Input type="number" step={0.01} {...form.register('amount')} />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" {...form.register('date')} />
          </div>
        </div>
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
          <Label>Type</Label>
          <Controller
            name="expense_type"
            control={form.control}
            render={({ field }) => (
              <Select
                defaultValue={field.value}
                onValueChange={(v) =>
                  field.onChange(v as 'petty_cash' | 'per_diem' | 'other')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="petty_cash">Petty cash</SelectItem>
                  <SelectItem value="per_diem">Per diem</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div>
          <Label>Vendor</Label>
          <Input {...form.register('vendor')} />
        </div>
        <div>
          <Label>Notes</Label>
          <Input {...form.register('notes')} />
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

type DerivedRuleFormValues = z.infer<typeof derivedRuleSchema>

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
                    : current.filter((id) => id !== acc.id)
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
