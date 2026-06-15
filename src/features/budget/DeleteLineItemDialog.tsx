import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listBudgetItemExpenseLinksForBudgetItem } from '@/lib/db/repositories/budgetReconciliation'
import { listFloatsByBudgetItem } from '@/lib/db/repositories/floats'
import type { BudgetAccount, BudgetItem, Expense, Person } from '@/lib/db/types'
import type {
  DeleteBudgetLineItemParams,
  ExpenseRelink,
  FloatRelink,
} from '@/lib/db/repositories/budgetLineItemDeletion'

const EMPTY_LINKS: never[] = []
const EMPTY_FLOATS: never[] = []

export function getRelinkTargetCandidates(
  itemToDelete: BudgetItem,
  allItems: BudgetItem[]
): BudgetItem[] {
  const sameAccount = allItems.filter(
    (i) => i.id !== itemToDelete.id && i.account_id === itemToDelete.account_id
  )
  if (sameAccount.length > 0) return sameAccount
  return allItems.filter((i) => i.id !== itemToDelete.id)
}

function budgetItemLabel(item: BudgetItem, accountById: Map<string, BudgetAccount>): string {
  const acc = item.account_id ? accountById.get(item.account_id) : null
  const prefix = acc ? `${acc.code} — ` : ''
  return `${prefix}${item.description}`
}

function expenseLabel(
  expense: Expense | undefined,
  format: (amount: number, currency: string) => { formatted: string },
  productionCurrency: string
): string {
  if (!expense) return 'Unknown expense'
  const amount = format(expense.amount, productionCurrency).formatted
  const vendor = expense.vendor?.trim() ? expense.vendor.trim() : '—'
  return `${expense.date} · ${vendor} · ${amount}`
}

export type DeleteLineItemDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  lineItem: BudgetItem | null
  items: BudgetItem[]
  accounts: BudgetAccount[]
  expenses: Expense[]
  people: Person[]
  productionId: string
  revisionId?: string | null
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
  onConfirm: (params: Omit<DeleteBudgetLineItemParams, 'productionId' | 'revisionId'>) => Promise<void>
  isPending: boolean
  error: string | null
}

export function DeleteLineItemDialog({
  open,
  onOpenChange,
  lineItem,
  items,
  accounts,
  expenses,
  people,
  productionId,
  revisionId,
  productionCurrency,
  format,
  onConfirm,
  isPending,
  error,
}: DeleteLineItemDialogProps) {
  const lineItemId = lineItem?.id ?? null
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const expenseById = useMemo(() => new Map(expenses.map((e) => [e.id, e])), [expenses])
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const targetCandidates = useMemo(
    () => (lineItem ? getRelinkTargetCandidates(lineItem, items) : []),
    [lineItem, items]
  )
  const defaultTargetId = targetCandidates[0]?.id ?? ''

  const { data: linksData, isLoading: linksLoading } = useQuery({
    queryKey: ['budget-item-expense-links-for-item', lineItemId, revisionId],
    queryFn: () => listBudgetItemExpenseLinksForBudgetItem(lineItemId!, revisionId ?? undefined),
    enabled: open && lineItemId != null,
  })
  const links = linksData ?? EMPTY_LINKS

  const { data: floatsData, isLoading: floatsLoading } = useQuery({
    queryKey: ['floats-by-budget-item', lineItemId],
    queryFn: () => listFloatsByBudgetItem(lineItemId!),
    enabled: open && lineItemId != null,
  })
  const floats = floatsData ?? EMPTY_FLOATS

  const [expenseTargets, setExpenseTargets] = useState<Record<string, string>>({})
  const [floatTargets, setFloatTargets] = useState<Record<string, string>>({})
  const [localError, setLocalError] = useState<string | null>(null)

  const associationsLoading = linksLoading || floatsLoading
  const hasAssociations = links.length > 0 || floats.length > 0
  const noTargetsAvailable = hasAssociations && targetCandidates.length === 0

  useEffect(() => {
    if (!open || !lineItemId) return
    setLocalError(null)
    setExpenseTargets(
      Object.fromEntries(links.map((link) => [link.id, defaultTargetId]))
    )
    setFloatTargets(
      Object.fromEntries(floats.map((f) => [f.id, defaultTargetId]))
    )
  }, [open, lineItemId, links, floats, defaultTargetId])

  const allTargetsSelected =
    !hasAssociations ||
    (links.every((l) => Boolean(expenseTargets[l.id])) &&
      floats.every((f) => Boolean(floatTargets[f.id])))

  const canConfirm =
    lineItem != null &&
    !associationsLoading &&
    !noTargetsAvailable &&
    allTargetsSelected &&
    !isPending

  const handleConfirm = async () => {
    if (!lineItem || !canConfirm) return
    setLocalError(null)

    const expenseRelinks: ExpenseRelink[] = links.map((link) => ({
      linkId: link.id,
      targetBudgetItemId: expenseTargets[link.id]!,
    }))
    const floatRelinks: FloatRelink[] = floats.map((f) => ({
      floatId: f.id,
      targetBudgetItemId: floatTargets[f.id]!,
    }))

    try {
      await onConfirm({
        budgetItemId: lineItem.id,
        expenseRelinks,
        floatRelinks,
      })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  const displayError = localError ?? error

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next)
      }}
    >
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            {hasAssociations && !associationsLoading
              ? 'Delete line item and reassign costs'
              : 'Delete this line item?'}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {lineItem && (
                <p>
                  <span className="font-medium text-foreground">{lineItem.description}</span>
                  {' — '}
                  {format(lineItem.estimated_cost, productionCurrency).formatted}
                </p>
              )}
              {associationsLoading && <p>Loading associated costs…</p>}
              {!associationsLoading && hasAssociations && (
                <p>
                  This line item has matched expenses and/or petty-cash floats. Choose where to move
                  each one before deleting.
                </p>
              )}
              {!associationsLoading && !hasAssociations && lineItem && (
                <p>This will remove the line item from the budget. This action cannot be undone.</p>
              )}
              {noTargetsAvailable && (
                <p className="text-destructive">
                  No other line items are available to receive these costs. Add another line item
                  first, then try again.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {!associationsLoading && hasAssociations && targetCandidates.length > 0 && (
          <div className="max-h-[min(50vh,320px)] space-y-4 overflow-y-auto pr-1">
            {links.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Matched expenses
                </p>
                {links.map((link) => {
                  const expense = expenseById.get(link.expense_id)
                  return (
                    <div
                      key={link.id}
                      className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{expenseLabel(expense, format, productionCurrency)}</p>
                        <p className="text-xs text-muted-foreground">
                          Matched: {format(link.matched_amount, productionCurrency).formatted}
                        </p>
                      </div>
                      <Select
                        value={expenseTargets[link.id] ?? ''}
                        onValueChange={(value) =>
                          setExpenseTargets((prev) => ({ ...prev, [link.id]: value }))
                        }
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-full sm:w-[220px]">
                          <SelectValue placeholder="Move to line item" />
                        </SelectTrigger>
                        <SelectContent>
                          {targetCandidates.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {budgetItemLabel(candidate, accountById)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>
            )}

            {floats.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Petty-cash floats
                </p>
                {floats.map((f) => {
                  const person = personById.get(f.person_id)
                  return (
                    <div
                      key={f.id}
                      className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{person?.name ?? 'Unknown crew member'}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(f.amount, f.currency).formatted} · issued {f.issued_date}
                        </p>
                      </div>
                      <Select
                        value={floatTargets[f.id] ?? ''}
                        onValueChange={(value) =>
                          setFloatTargets((prev) => ({ ...prev, [f.id]: value }))
                        }
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-full sm:w-[220px]">
                          <SelectValue placeholder="Move to line item" />
                        </SelectTrigger>
                        <SelectContent>
                          {targetCandidates.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {budgetItemLabel(candidate, accountById)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {displayError && (
          <p className="text-sm text-destructive" role="alert">
            {displayError}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {isPending ? 'Deleting…' : 'Delete line item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
