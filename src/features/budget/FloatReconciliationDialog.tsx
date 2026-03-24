import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ClassificationBadge } from '@/features/budget/ClassificationBadge'
import { FloatReconciliationStatusBadge } from '@/features/budget/FloatReconciliationStatusBadge'
import { listExpensesByProduction } from '@/lib/db/repositories/budget'
import { listAccounts } from '@/lib/db/repositories/budgetAccounts'
import { listBudgetItemExpenseLinksByProduction } from '@/lib/db/repositories/budgetReconciliation'
import {
  createFloatExpenseLinks,
  deleteFloatExpenseLink,
  listFloatExpenseLinksByProduction,
} from '@/lib/db/repositories/floatReconciliation'
import {
  getExpenseUnallocatedForFloatMatching,
  getPettyCashFloatDerived,
} from '@/lib/budget/floatExpenseMatching'
import { formatIssuedDaysAgo, issuedDateToAgeDays } from '@/lib/budget/floatReminders'
import type { Expense, LineItemType, PettyCashFloat } from '@/lib/db/types'
import { AlertTriangle, Trash2 } from 'lucide-react'

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function expenseDescription(expense: Expense): string {
  return (expense.vendor ?? expense.notes ?? 'Expense').trim() || 'Expense'
}

export type FloatReconciliationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  productionId: string
  revisionId?: string
  pettyCashFloat: PettyCashFloat | null
  crewMemberName: string
  format: (amount: number, currency: string) => { formatted: string }
  /** Production base currency (expense amounts). */
  productionCurrency: string
}

export function FloatReconciliationDialog({
  open,
  onOpenChange,
  productionId,
  revisionId,
  pettyCashFloat,
  crewMemberName,
  format,
  productionCurrency,
}: FloatReconciliationDialogProps) {
  const queryClient = useQueryClient()
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [linkIdToConfirmRemove, setLinkIdToConfirmRemove] = useState<string | null>(null)
  const [removeLinkError, setRemoveLinkError] = useState<string | null>(null)

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', productionId],
    queryFn: () => listExpensesByProduction(productionId),
    enabled: open && !!productionId,
  })
  const { data: budgetLinks = [] } = useQuery({
    queryKey: ['budget-item-expense-links', productionId, revisionId],
    queryFn: () => listBudgetItemExpenseLinksByProduction(productionId, revisionId),
    enabled: open && !!productionId,
  })
  const { data: floatLinks = [] } = useQuery({
    queryKey: ['float-expense-links-by-production', productionId, revisionId],
    queryFn: () => listFloatExpenseLinksByProduction(productionId, revisionId),
    enabled: open && !!productionId,
  })
  const { data: accounts = [] } = useQuery({
    queryKey: ['budget-accounts', productionId],
    queryFn: () => listAccounts(productionId),
    enabled: open && !!productionId,
  })

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const expenseById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses])

  const linksForThisFloat = useMemo(() => {
    if (!pettyCashFloat) return []
    return floatLinks.filter((l) => l.float_id === pettyCashFloat.id)
  }, [floatLinks, pettyCashFloat])

  const derived = useMemo(() => {
    if (!pettyCashFloat) {
      return { allocated: 0, matched: 0, remaining: 0, status: 'unmatched' as const }
    }
    return getPettyCashFloatDerived(pettyCashFloat, linksForThisFloat)
  }, [pettyCashFloat, linksForThisFloat])

  const expenseIdsLinkedToAnyFloat = useMemo(
    () => new Set(floatLinks.map((l) => l.expense_id)),
    [floatLinks]
  )

  const candidates = useMemo(() => {
    return expenses
      .filter((e) => {
        if (expenseIdsLinkedToAnyFloat.has(e.id)) return false
        const u = getExpenseUnallocatedForFloatMatching(e, budgetLinks, floatLinks)
        return u > 0
      })
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  }, [expenses, expenseIdsLinkedToAnyFloat, budgetLinks, floatLinks])

  const allocatingNow = useMemo(() => {
    return selectedExpenseIds.reduce((sum, id) => {
      const n = parseFloat(amounts[id] ?? '')
      return sum + (Number.isFinite(n) && n > 0 ? n : 0)
    }, 0)
  }, [selectedExpenseIds, amounts])

  const sameCurrency = Boolean(
    pettyCashFloat && pettyCashFloat.currency === productionCurrency
  )
  const wouldOverspendFloat = Boolean(
    pettyCashFloat && sameCurrency && allocatingNow > derived.remaining + 1e-9
  )

  const validation = (() => {
    if (!pettyCashFloat) return { canSave: false as const, payload: null as null | { allocations: { expenseId: string; matchedAmount: number }[] } }
    if (selectedExpenseIds.length === 0) return { canSave: false as const, payload: null }

    const allocations: { expenseId: string; matchedAmount: number }[] = []
    for (const id of selectedExpenseIds) {
      const n = parseFloat(amounts[id] ?? '')
      if (!Number.isFinite(n) || n <= 0) {
        return { canSave: false as const, payload: null }
      }
      const exp = expenseById.get(id)
      if (!exp) return { canSave: false as const, payload: null }
      const max = getExpenseUnallocatedForFloatMatching(exp, budgetLinks, floatLinks)
      if (n > max + 1e-9) {
        return { canSave: false as const, payload: null }
      }
      allocations.push({ expenseId: id, matchedAmount: n })
    }
    return { canSave: true as const, payload: { allocations } }
  })()

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedExpenseIds([])
      setAmounts({})
      setSaveError(null)
      setLinkIdToConfirmRemove(null)
      setRemoveLinkError(null)
    }
    onOpenChange(next)
  }

  const mutation = useMutation({
    mutationFn: createFloatExpenseLinks,
  })

  const deleteLinkMutation = useMutation({
    mutationFn: deleteFloatExpenseLink,
    onSuccess: (_data, linkId: string) => {
      setLinkIdToConfirmRemove(null)
      setRemoveLinkError(null)
      const removed = floatLinks.find((l) => l.id === linkId)
      queryClient.invalidateQueries({ queryKey: ['float-expense-links-by-production', productionId, revisionId] })
      if (pettyCashFloat) {
        queryClient.invalidateQueries({ queryKey: ['float-expense-links', pettyCashFloat.id] })
      }
      if (removed) {
        queryClient.invalidateQueries({ queryKey: ['float-expense-links-for-expense', removed.expense_id, revisionId] })
      }
    },
    onError: (err: Error) => {
      setRemoveLinkError(err.message)
    },
  })

  const handleSave = () => {
    if (!pettyCashFloat || !validation.canSave || !validation.payload) return
    setSaveError(null)
    const variables = {
      productionId,
      revisionId,
      floatId: pettyCashFloat.id,
      allocations: validation.payload.allocations,
    }
    mutation.mutate(variables, {
      onSuccess: () => {
        const fid = variables.floatId
        queryClient.invalidateQueries({ queryKey: ['float-expense-links', fid] })
        queryClient.invalidateQueries({ queryKey: ['float-expense-links-by-production', variables.productionId, variables.revisionId] })
        for (const a of variables.allocations) {
          queryClient.invalidateQueries({
            queryKey: ['float-expense-links-for-expense', a.expenseId, variables.revisionId],
          })
        }
        setSaveError(null)
        handleOpenChange(false)
      },
      onError: (err: Error) => {
        setSaveError(err.message)
      },
    })
  }

  if (!pettyCashFloat) return null

  const floatAgeDays = issuedDateToAgeDays(pettyCashFloat.issued_date)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col gap-0 p-0" aria-describedby="float-reconcile-desc">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle>Reconcile float</DialogTitle>
          <DialogDescription id="float-reconcile-desc">
            Match expenses to this float allocation ({crewMemberName}). Same idea as Match Spend for budget lines.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 shrink-0">
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{pettyCashFloat.currency} float</span>
              <FloatReconciliationStatusBadge status={derived.status} />
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-muted-foreground">
              <dt>Allocated</dt>
              <dd className="text-foreground tabular-nums">
                {format(derived.allocated, pettyCashFloat.currency).formatted}
              </dd>
              <dt>Matched</dt>
              <dd className="text-foreground tabular-nums">
                {format(derived.matched, pettyCashFloat.currency).formatted}
              </dd>
              <dt>Remaining</dt>
              <dd className="text-foreground tabular-nums">
                {format(derived.remaining, pettyCashFloat.currency).formatted}
              </dd>
              <dt>Issued</dt>
              <dd className="text-foreground">
                {formatIssuedDaysAgo(floatAgeDays)}
                <span className="text-muted-foreground"> ({pettyCashFloat.issued_date})</span>
              </dd>
            </dl>
            {(derived.remaining > 0 || derived.status === 'overspent') && (
              <div className="mt-3 space-y-1 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                {derived.remaining > 0 && (
                  <p className="text-foreground font-medium">
                    {format(derived.remaining, pettyCashFloat.currency).formatted} still to reconcile
                  </p>
                )}
                {derived.status === 'overspent' && (
                  <p className="text-destructive font-medium">This float is overspent against its allocation.</p>
                )}
                {floatAgeDays > 7 && (
                  <p className="text-amber-800 dark:text-amber-200">
                    Float issued {floatAgeDays} days ago — please reconcile soon.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 grid md:grid-cols-2 gap-0 md:divide-x divide-border border-t border-border">
          <div className="overflow-auto p-6 space-y-3 min-h-[200px]">
            <h3 className="text-sm font-medium text-foreground">Available expenses</h3>
            <p className="text-xs text-muted-foreground">
              Expenses with amount left after budget matching, not yet linked to any float.
            </p>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-md border border-dashed border-border bg-muted/20 p-4">
                No eligible expenses. Log spend or free up amount from budget matching first.
              </p>
            ) : (
              <ul className="rounded-md border border-border divide-y divide-border">
                {candidates.map((expense) => {
                  const unallocated = getExpenseUnallocatedForFloatMatching(expense, budgetLinks, floatLinks)
                  const isSelected = selectedExpenseIds.includes(expense.id)
                  const amountStr = amounts[expense.id] ?? ''
                  const account = expense.account_id ? accountById.get(expense.account_id) : null
                  return (
                    <li key={expense.id} className={`px-3 py-3 text-sm ${isSelected ? 'bg-muted/30' : ''}`}>
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id={`fcand-${expense.id}`}
                          checked={isSelected}
                          className="mt-1 shrink-0"
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedExpenseIds((prev) => [...prev, expense.id])
                            } else {
                              setSelectedExpenseIds((prev) => prev.filter((x) => x !== expense.id))
                              setAmounts((prev) => {
                                const next = { ...prev }
                                delete next[expense.id]
                                return next
                              })
                            }
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <label htmlFor={`fcand-${expense.id}`} className="font-medium cursor-pointer">
                            {expenseDescription(expense)}
                          </label>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <ClassificationBadge type={expense.transaction_type as LineItemType | null} />
                            <span className="text-xs text-muted-foreground">{formatDateShort(expense.date)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {account ? `${account.code} · ${account.name}` : '—'} · Amount{' '}
                            {format(expense.amount, productionCurrency).formatted} · Unallocated{' '}
                            {format(unallocated, productionCurrency).formatted}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="flex items-center gap-2 mt-2 pl-7">
                          <Label htmlFor={`famt-${expense.id}`} className="text-muted-foreground shrink-0 w-24">
                            Match:
                          </Label>
                          <Input
                            id={`famt-${expense.id}`}
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="0.00"
                            value={amountStr}
                            onChange={(e) => setAmounts((prev) => ({ ...prev, [expense.id]: e.target.value }))}
                            className="w-32 tabular-nums"
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="overflow-auto p-6 space-y-4 min-h-[200px]">
            <h3 className="text-sm font-medium text-foreground">Selected for this float</h3>
            {selectedExpenseIds.length === 0 ? (
              <p className="text-sm text-muted-foreground border border-dashed rounded-md p-4 bg-muted/20">
                Select expenses on the left and enter match amounts.
              </p>
            ) : (
              <ul className="rounded-md border border-border divide-y divide-border">
                {selectedExpenseIds.map((id) => {
                  const exp = expenseById.get(id)
                  if (!exp) return null
                  const n = parseFloat(amounts[id] ?? '')
                  const val = Number.isFinite(n) && n > 0 ? n : 0
                  return (
                    <li key={id} className="px-3 py-2 text-sm flex justify-between gap-2">
                      <span className="truncate">{expenseDescription(exp)}</span>
                      <span className="tabular-nums shrink-0">{format(val, productionCurrency).formatted}</span>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-sm">
              <p className="font-medium text-foreground">Summary</p>
              <dl className="grid grid-cols-1 gap-1 text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>Allocating to float now</dt>
                  <dd className="text-foreground tabular-nums">
                    {format(allocatingNow, productionCurrency).formatted}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <dt>Float remaining after save</dt>
                  <dd className="text-foreground tabular-nums flex items-center gap-2">
                    {sameCurrency
                      ? format(derived.remaining - allocatingNow, pettyCashFloat.currency).formatted
                      : '—'}
                    {pettyCashFloat && !sameCurrency && (
                      <span className="text-xs text-muted-foreground font-normal">
                        (float {pettyCashFloat.currency} vs production {productionCurrency})
                      </span>
                    )}
                    {wouldOverspendFloat && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex text-amber-600 dark:text-amber-500">
                            <AlertTriangle className="size-4" aria-hidden />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          This exceeds the float allocation. Save is still allowed; the float will show as overspent.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Existing reconciliations</h3>
              {removeLinkError && (
                <p className="text-sm text-destructive mb-2" role="alert">
                  {removeLinkError}
                </p>
              )}
              {linksForThisFloat.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="rounded-md border border-border divide-y divide-border text-sm">
                  {linksForThisFloat.map((link) => {
                    const exp = expenseById.get(link.expense_id)
                    const isConfirm = linkIdToConfirmRemove === link.id
                    const isDeleting = deleteLinkMutation.isPending && linkIdToConfirmRemove === link.id
                    return (
                      <li key={link.id} className="px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        {isConfirm ? (
                          <div className="flex flex-wrap items-center gap-2 w-full">
                            <span className="text-muted-foreground">Remove this match from the float?</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isDeleting}
                              onClick={() => deleteLinkMutation.mutate(link.id)}
                            >
                              {isDeleting ? 'Removing…' : 'Remove'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isDeleting}
                              onClick={() => {
                                setLinkIdToConfirmRemove(null)
                                setRemoveLinkError(null)
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="min-w-0 break-words font-medium text-foreground">
                                {exp ? expenseDescription(exp) : 'Expense'}
                              </span>
                              {exp && (
                                <span className="text-muted-foreground text-xs shrink-0">
                                  {formatDateShort(exp.date)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="tabular-nums font-medium">
                                {format(link.matched_amount, productionCurrency).formatted}
                              </span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                disabled={deleteLinkMutation.isPending}
                                aria-label="Remove match from float"
                                onClick={() => {
                                  setRemoveLinkError(null)
                                  setLinkIdToConfirmRemove(link.id)
                                }}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            </div>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Removing a match frees that amount on the expense for budget or float matching (Actualisation / Match Spend).
              </p>
            </div>
          </div>
        </div>

        {saveError && (
          <p className="text-sm text-destructive px-6 shrink-0" role="alert">
            {saveError}
          </p>
        )}

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!validation.canSave || mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
