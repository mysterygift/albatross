import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentProduction } from '@/features/productions/context'
import { useWorkingBudgetRevision } from '@/hooks/useWorkingBudgetRevision'
import { completeAndArchiveProduction } from '@/lib/db/repositories/production'
import { useCurrency } from '@/hooks/useCurrency'
import { listBudgetItemsByProduction, listExpensesByProduction } from '@/lib/db/repositories/budget'
import { listAccounts } from '@/lib/db/repositories/budgetAccounts'
import { listBudgetItemExpenseLinksByProduction } from '@/lib/db/repositories/budgetReconciliation'
import {
  getWrapBudgetReadiness,
  getOverspentBudgetItems,
  getUnderspentBudgetItems,
  getUnallocatedExpenses,
  getPotentialReallocationOpportunities,
} from '@/lib/budget/wrapReadiness'
import { getExpenseUnallocatedAmount } from '@/lib/budget/reconciliation'
import {
  getScheduleReadiness,
  getFutureScheduleRows,
  getTodayYyyyMmDd,
  getEndOfFutureYyyyMmDd,
} from '@/lib/wrap-production/scheduleReadiness'
import {
  getDeliverablesReadiness,
  getDeliverableReviewRows,
  type DeliverableWrapStatus,
} from '@/lib/wrap-production/deliverablesReadiness'
import { listShootDaysByProduction } from '@/lib/db/repositories/schedule'
import { listCalendarShootDayEvents } from '@/lib/db/repositories/calendar'
import { listDeliverablesByProduction } from '@/lib/db/repositories/deliverable'
import { listFloatsByProduction } from '@/lib/db/repositories/floats'
import { listFloatExpenseLinksByProduction } from '@/lib/db/repositories/floatReconciliation'
import { listPeopleByProduction } from '@/lib/db/repositories/person'
import { getOutstandingFloatReminders } from '@/lib/budget/floatReminders'
import type { Expense } from '@/lib/db/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ClassificationBadge } from '@/features/budget/ClassificationBadge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle2, AlertTriangle, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

function expenseDescription(expense: Expense): string {
  return (expense.vendor ?? expense.notes ?? 'Expense').trim() || 'Expense'
}

const DELIVERABLE_WRAP_STATUS_LABELS: Record<DeliverableWrapStatus, string> = {
  signed_off: 'Signed off',
  pending: 'Pending',
  unknown: 'Not reviewed',
}

function CollapsibleSection({
  id,
  title,
  description,
  badge,
  expanded,
  onToggle,
  children,
}: {
  id: string
  title: string
  description: string
  badge: React.ReactNode
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`${id}-content`}
        id={`${id}-header`}
        className="flex w-full items-center justify-between gap-3 rounded-t-lg border-0 border-b border-border bg-card px-6 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="min-w-0 flex-1">
            <span className="font-medium">{title}</span>
            <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
          </div>
          {badge}
        </div>
        <ChevronDown
          className={cn('size-5 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div
        id={`${id}-content`}
        role="region"
        aria-labelledby={`${id}-header`}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border px-6 py-6">{children}</div>
        </div>
      </div>
    </Card>
  )
}

function DeliverableWrapStatusBadge({ status }: { status: DeliverableWrapStatus }) {
  const variant =
    status === 'signed_off'
      ? undefined
      : status === 'pending'
        ? 'secondary'
        : 'outline'
  const colorClass =
    status === 'signed_off'
      ? 'bg-green-600 text-white border-green-700 dark:bg-green-700 dark:border-green-800'
      : status === 'pending'
        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
        : ''
  return (
    <Badge variant={variant} className={colorClass ? `text-xs font-normal ${colorClass}` : 'text-xs font-normal'}>
      {DELIVERABLE_WRAP_STATUS_LABELS[status]}
    </Badge>
  )
}

export function WrapProductionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentProduction, currentProductionId, setCurrentProductionId } = useCurrentProduction()
  const { data: workingBudgetRevision } = useWorkingBudgetRevision(currentProductionId)
  const revisionId = workingBudgetRevision?.id
  const { format } = useCurrency()
  const productionCurrency = currentProduction?.currency_code ?? 'GBP'
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    budget: false,
    schedule: false,
    deliverables: false,
    archive: false,
  })
  const toggleSection = (key: keyof typeof expandedSections) =>
    setExpandedSections((s) => ({ ...s, [key]: !s[key] }))

  const { data: budgetItems = [] } = useQuery({
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

  const todayYyyyMmDd = useMemo(() => getTodayYyyyMmDd(), [])
  const futureEndDate = useMemo(() => getEndOfFutureYyyyMmDd(2), [])

  const { data: shootDays = [] } = useQuery({
    queryKey: ['shoot-days', currentProductionId],
    queryFn: () => listShootDaysByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const { data: futureCalendarEvents = [] } = useQuery({
    queryKey: ['calendar-events-wrap', currentProductionId, todayYyyyMmDd, futureEndDate],
    queryFn: () =>
      listCalendarShootDayEvents(currentProductionId!, {
        start: todayYyyyMmDd,
        end: futureEndDate,
      }),
    enabled: !!currentProductionId,
  })

  const { data: deliverables = [] } = useQuery({
    queryKey: ['deliverables', currentProductionId],
    queryFn: () => listDeliverablesByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const { data: wrapFloats = [] } = useQuery({
    queryKey: ['floats', currentProductionId, revisionId],
    queryFn: () => listFloatsByProduction(currentProductionId!, revisionId),
    enabled: !!currentProductionId,
  })

  const { data: wrapFloatExpenseLinks = [] } = useQuery({
    queryKey: ['float-expense-links-by-production', currentProductionId, revisionId],
    queryFn: () => listFloatExpenseLinksByProduction(currentProductionId!, revisionId),
    enabled: !!currentProductionId,
  })

  const { data: wrapPeople = [] } = useQuery({
    queryKey: ['people', currentProductionId],
    queryFn: () => listPeopleByProduction(currentProductionId!),
    enabled: !!currentProductionId,
  })

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const readiness = useMemo(
    () => getWrapBudgetReadiness({ budgetItems, expenses, links }),
    [budgetItems, expenses, links]
  )

  const unallocatedExpenses = useMemo(
    () => getUnallocatedExpenses(expenses, links),
    [expenses, links]
  )

  const overspentRows = useMemo(
    () => getOverspentBudgetItems(budgetItems, links),
    [budgetItems, links]
  )

  const remainingEstimateRows = useMemo(
    () => getUnderspentBudgetItems(budgetItems, links),
    [budgetItems, links]
  )

  const reallocationOpportunities = useMemo(
    () => getPotentialReallocationOpportunities({ budgetItems, links, accounts }),
    [budgetItems, links, accounts]
  )

  const scheduleReadiness = useMemo(
    () =>
      getScheduleReadiness({
        shootDays,
        todayYyyyMmDd,
        futureCalendarEvents,
      }),
    [shootDays, todayYyyyMmDd, futureCalendarEvents]
  )

  const futureScheduleRows = useMemo(
    () =>
      getFutureScheduleRows({
        shootDays,
        todayYyyyMmDd,
        futureCalendarEvents,
      }),
    [shootDays, todayYyyyMmDd, futureCalendarEvents]
  )

  const deliverablesReadiness = useMemo(
    () => getDeliverablesReadiness(deliverables),
    [deliverables]
  )

  const deliverableReviewRows = useMemo(
    () => getDeliverableReviewRows(deliverables),
    [deliverables]
  )

  const wrapFloatReminders = useMemo(
    () =>
      getOutstandingFloatReminders({
        floats: wrapFloats,
        floatExpenseLinks: wrapFloatExpenseLinks,
        people: wrapPeople,
      }),
    [wrapFloats, wrapFloatExpenseLinks, wrapPeople]
  )

  const floatRemindersMultiCurrency =
    new Set(wrapFloatReminders.reminders.map((r) => r.currency)).size > 1
  const floatUnreturnedCurrency =
    wrapFloatReminders.reminders[0]?.currency ?? productionCurrency

  const completeAndArchiveMutation = useMutation({
    mutationFn: (productionId: string) => completeAndArchiveProduction(productionId),
    onSuccess: () => {
      setCurrentProductionId(null)
      queryClient.invalidateQueries({ queryKey: ['productions'] })
      setConfirmOpen(false)
      navigate('/', { state: { wrapSuccess: true } })
    },
  })

  const budgetSectionReady =
    readiness.status === 'ready' && wrapFloatReminders.unresolvedCount === 0

  const hasAnyIssues =
    readiness.status !== 'ready' ||
    wrapFloatReminders.unresolvedCount > 0 ||
    scheduleReadiness.status !== 'ready' ||
    deliverablesReadiness.status !== 'ready'

  if (!currentProductionId || !currentProduction) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Wrap Production</h1>
        <p className="text-muted-foreground">Select a production first.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl rounded-xl bg-stone-100/10 px-8 py-8 dark:bg-stone-950/50">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Wrap Production</h1>
        <p className="text-muted-foreground">
          Review outstanding financial, scheduling, and delivery items before completing and
          archiving this production.
        </p>
      </header>

      <section className="mt-10 space-y-4">
        {/* Budget and Actualisation — real readiness section */}
        <CollapsibleSection
          id="budget"
          title="Budget and Actualisation"
          description="Review budget reconciliation issues before wrapping this production."
          badge={
            budgetSectionReady ? (
              <Badge
                variant="secondary"
                className="shrink-0 gap-1 bg-green-600/15 text-green-800 dark:bg-green-500/20 dark:text-green-200"
              >
                <CheckCircle2 className="size-3.5" />
                Ready
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="shrink-0 gap-1 bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
              >
                <AlertTriangle className="size-3.5" />
                Needs review
              </Badge>
            )
          }
          expanded={expandedSections.budget}
          onToggle={() => toggleSection('budget')}
        >
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Unallocated spend
                </p>
                <p className="mt-0.5 font-medium">
                  {readiness.unallocatedExpenseCount} expense
                  {readiness.unallocatedExpenseCount !== 1 ? 's' : ''} ·{' '}
                  {format(readiness.totalUnallocatedSpend, productionCurrency).formatted}
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Unmatched line items
                </p>
                <p className="mt-0.5 font-medium">{readiness.unmatchedLineItemCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Partially matched line items
                </p>
                <p className="mt-0.5 font-medium">{readiness.partialLineItemCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Overspent line items
                </p>
                <p className="mt-0.5 font-medium">
                  {readiness.overspentLineItemCount}
                  {readiness.totalOverspend > 0 &&
                    ` · ${format(readiness.totalOverspend, productionCurrency).formatted}`}
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 sm:col-span-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Remaining estimate / underspend
                </p>
                <p className="mt-0.5 font-medium">
                  {readiness.remainingEstimateLineItemCount} line item
                  {readiness.remainingEstimateLineItemCount !== 1 ? 's' : ''} ·{' '}
                  {format(readiness.totalRemainingEstimate, productionCurrency).formatted}
                </p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/25 p-4">
              <h4 className="mb-2 text-sm font-medium">Petty cash floats</h4>
              {wrapFloatReminders.unresolvedCount === 0 ? (
                <p className="text-muted-foreground text-sm">
                  All floats are fully reconciled.
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-medium text-foreground">
                      {wrapFloatReminders.unresolvedCount}
                    </span>{' '}
                    float{wrapFloatReminders.unresolvedCount !== 1 ? 's' : ''} still outstanding
                    {floatRemindersMultiCurrency ? (
                      <span className="text-muted-foreground">
                        {' '}
                        — multiple currencies; see Budget for unreturned totals.
                      </span>
                    ) : (
                      <>
                        {' '}
                        —{' '}
                        <span className="font-medium tabular-nums">
                          {format(wrapFloatReminders.totalOutstanding, floatUnreturnedCurrency).formatted}
                        </span>{' '}
                        <span className="text-muted-foreground">unreturned</span>
                      </>
                    )}
                  </p>
                  {wrapFloatReminders.hasCritical && (
                    <p className="text-destructive flex items-start gap-2 text-xs">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />
                      <span>Some floats have been outstanding for over 14 days or are overspent.</span>
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    <Link
                      to="/budget?tab=floats&floats=outstanding"
                      className="underline hover:no-underline font-medium text-foreground"
                    >
                      Review floats in Budget
                    </Link>
                  </p>
                </div>
              )}
            </div>

            {/* Detail lists */}
            {unallocatedExpenses.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium">Unallocated spend</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Unallocated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unallocatedExpenses.map((expense) => {
                      const account = expense.account_id ? accountById.get(expense.account_id) : null
                      const unallocated = getExpenseUnallocatedAmount(expense, links)
                      return (
                        <TableRow key={expense.id}>
                          <TableCell className="font-medium">
                            {expenseDescription(expense)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {account ? `${account.code} — ${account.name}` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <ClassificationBadge type={expense.transaction_type} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {format(expense.amount, productionCurrency).formatted}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {format(unallocated, productionCurrency).formatted}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {overspentRows.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-destructive">Overspent line items</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Type</TableHead>
                      <TableHead className="text-right">Estimated</TableHead>
                      <TableHead className="text-right">Matched</TableHead>
                      <TableHead className="text-right">Overspend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overspentRows.map(({ item, matchedAmount, overspendAmount }) => {
                      const account = item.account_id ? accountById.get(item.account_id) : null
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.description}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {account ? `${account.code} — ${account.name}` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <ClassificationBadge type={item.line_item_type} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {format(item.estimated_cost, productionCurrency).formatted}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {format(matchedAmount, productionCurrency).formatted}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-destructive">
                            {format(overspendAmount, productionCurrency).formatted}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {remainingEstimateRows.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium">
                  Remaining estimate / unmatched line items
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Type</TableHead>
                      <TableHead className="text-right">Estimated</TableHead>
                      <TableHead className="text-right">Matched</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {remainingEstimateRows.map(({ item, matchedAmount, remainingEstimate }) => {
                      const account = item.account_id ? accountById.get(item.account_id) : null
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.description}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {account ? `${account.code} — ${account.name}` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <ClassificationBadge type={item.line_item_type} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {format(item.estimated_cost, productionCurrency).formatted}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {format(matchedAmount, productionCurrency).formatted}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {format(remainingEstimate, productionCurrency).formatted}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {unallocatedExpenses.length === 0 &&
              overspentRows.length === 0 &&
              remainingEstimateRows.length === 0 &&
              wrapFloatReminders.unresolvedCount === 0 && (
              <p className="text-muted-foreground text-sm">
                No outstanding reconciliation issues. Budget and actualisation are in good shape for
                wrap.
              </p>
            )}

            <p className="text-muted-foreground text-sm">
              Fix issues in <Link to="/budget" className="underline hover:no-underline">Budget</Link>
              {' · '}
              <Link to="/budget?tab=actualisation" className="underline hover:no-underline">
                Match Expenses
              </Link>
              {' · '}
              <Link to="/budget?tab=floats&floats=outstanding" className="underline hover:no-underline">
                Petty cash floats
              </Link>
              .
            </p>

            {/* Reallocation opportunities — informational only */}
            {reallocationOpportunities.length > 0 && (
              <div className="rounded-md border border-border bg-muted/20 p-4">
                <h4 className="mb-2 text-sm font-medium">Potential reallocation opportunities</h4>
                <p className="text-muted-foreground mb-3 text-xs">
                  Underspend in the same account may be able to offset overspend. Informational
                  only; no transfers are created. Resolve in Budget / Actualisation if needed.
                </p>
                <ul className="space-y-2">
                  {reallocationOpportunities.map((opp, i) => (
                    <li
                      key={opp.accountId ?? `none-${i}`}
                      className="flex flex-wrap items-baseline gap-2 text-sm"
                    >
                      <span className="font-medium">
                        {opp.accountName ?? opp.accountCode ?? 'Unassigned'}
                        {opp.accountCode ? ` (${opp.accountCode})` : ''}
                      </span>
                      <span className="text-muted-foreground">
                        Overspend: {format(opp.totalOverspend, productionCurrency).formatted}
                      </span>
                      <span className="text-muted-foreground">
                        · Available underspend: {format(opp.totalUnderspend, productionCurrency).formatted}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Schedule and Calendar — real readiness section */}
        <CollapsibleSection
          id="schedule"
          title="Schedule and Calendar"
          description="Check that no future production activity remains before wrapping."
          badge={
            scheduleReadiness.status === 'ready' ? (
              <Badge
                variant="secondary"
                className="shrink-0 gap-1 bg-green-600/15 text-green-800 dark:bg-green-500/20 dark:text-green-200"
              >
                <CheckCircle2 className="size-3.5" />
                Ready
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="shrink-0 gap-1 bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
              >
                <AlertTriangle className="size-3.5" />
                Needs review
              </Badge>
            )
          }
          expanded={expandedSections.schedule}
          onToggle={() => toggleSection('schedule')}
        >
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Future shoot days
                </p>
                <p className="mt-0.5 font-medium">{scheduleReadiness.futureShootDayCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Future scheduled activity
                </p>
                <p className="mt-0.5 font-medium">
                  {scheduleReadiness.futureScheduledActivityCount}
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 sm:col-span-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Latest scheduled production date
                </p>
                <p className="mt-0.5 font-medium">
                  {scheduleReadiness.latestScheduledDate
                    ? new Date(scheduleReadiness.latestScheduledDate + 'T12:00:00').toLocaleDateString(
                        'default',
                        { day: 'numeric', month: 'short', year: 'numeric' }
                      )
                    : '—'}
                </p>
              </div>
            </div>
            {futureScheduleRows.length > 0 ? (
              <div>
                <h4 className="mb-2 text-sm font-medium">Future schedule items</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {futureScheduleRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="tabular-nums">
                          {new Date(row.date + 'T12:00:00').toLocaleDateString('default', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {row.unitName ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No future schedule items. Schedule is clear for wrap.
              </p>
            )}
            <p className="text-muted-foreground text-sm">
              Review in <Link to="/schedule/calendar" className="underline hover:no-underline">Schedule</Link>.
            </p>
          </div>
        </CollapsibleSection>

        {/* Deliverables — real readiness section */}
        <CollapsibleSection
          id="deliverables"
          title="Deliverables"
          description="Review whether post-production deliverables have been signed off before wrapping."
          badge={
            deliverablesReadiness.status === 'ready' ? (
              <Badge
                variant="secondary"
                className="shrink-0 gap-1 bg-green-600/15 text-green-800 dark:bg-green-500/20 dark:text-green-200"
              >
                <CheckCircle2 className="size-3.5" />
                Ready
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="shrink-0 gap-1 bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
              >
                <AlertTriangle className="size-3.5" />
                Needs review
              </Badge>
            )
          }
          expanded={expandedSections.deliverables}
          onToggle={() => toggleSection('deliverables')}
        >
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Signed off
                </p>
                <p className="mt-0.5 font-medium">{deliverablesReadiness.signedOffCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Pending
                </p>
                <p className="mt-0.5 font-medium">{deliverablesReadiness.pendingCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Not reviewed
                </p>
                <p className="mt-0.5 font-medium">{deliverablesReadiness.unknownCount}</p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Total deliverables
                </p>
                <p className="mt-0.5 font-medium">{deliverablesReadiness.totalCount}</p>
              </div>
            </div>
            {deliverables.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No deliverables have been added for this production yet.
              </p>
            ) : (
              <div>
                <h4 className="mb-2 text-sm font-medium">Deliverables review</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliverableReviewRows.map(({ deliverable, wrapStatus }) => (
                      <TableRow key={deliverable.id}>
                        <TableCell className="font-medium">{deliverable.name}</TableCell>
                        <TableCell>
                          <DeliverableWrapStatusBadge status={wrapStatus} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {deliverable.due_date
                            ? new Date(deliverable.due_date + 'T12:00:00').toLocaleDateString(
                                'default',
                                { day: 'numeric', month: 'short', year: 'numeric' }
                              )
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {deliverables.length > 0 && (
              <p className="text-muted-foreground text-sm">
                Review in <Link to="/deliverables" className="underline hover:no-underline">Deliverables</Link>.
              </p>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="archive"
          title="Archive Readiness"
          description="Final completion and archive"
          badge={<span className="text-muted-foreground text-sm">—</span>}
          expanded={expandedSections.archive}
          onToggle={() => toggleSection('archive')}
        >
          <p className="text-muted-foreground text-sm">
            Final completion and archive actions will appear here.
          </p>
        </CollapsibleSection>
      </section>

      <footer className="mt-10 border-t border-border pt-8">
        <div className="space-y-3">
          <Button
            variant="destructive"
            size="lg"
            disabled={!currentProductionId || completeAndArchiveMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {completeAndArchiveMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Completing…
              </>
            ) : (
              'Complete and Archive Production'
            )}
          </Button>
          <p className="text-muted-foreground text-sm">
            Resolve or review outstanding budget, petty cash floats, schedule, and deliverables checks
            before completing this production.
          </p>
        </div>
      </footer>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete and Archive Production</DialogTitle>
            <DialogDescription>
              Review outstanding wrap items before confirming.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Budget and Actualisation</span>
                {readiness.status === 'ready' ? (
                  <Badge variant="secondary" className="bg-green-600/15 text-green-800 dark:text-green-200">
                    Ready
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    Needs review
                  </Badge>
                )}
              </div>
              {readiness.status !== 'ready' && (
                <p className="text-muted-foreground text-xs">
                  Unallocated: {readiness.unallocatedExpenseCount} · Unmatched: {readiness.unmatchedLineItemCount} · Overspent: {readiness.overspentLineItemCount}
                </p>
              )}
            </div>
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Petty cash floats</span>
                {wrapFloatReminders.unresolvedCount === 0 ? (
                  <Badge variant="secondary" className="bg-green-600/15 text-green-800 dark:text-green-200">
                    Ready
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    Needs review
                  </Badge>
                )}
              </div>
              {wrapFloatReminders.unresolvedCount > 0 && (
                <p className="text-muted-foreground text-xs">
                  {wrapFloatReminders.unresolvedCount} float
                  {wrapFloatReminders.unresolvedCount !== 1 ? 's' : ''} still outstanding
                  {floatRemindersMultiCurrency
                    ? ' (multiple currencies — see Budget).'
                    : ` — ${format(wrapFloatReminders.totalOutstanding, floatUnreturnedCurrency).formatted} unreturned.`}
                </p>
              )}
              {wrapFloatReminders.hasCritical && (
                <p className="text-destructive text-xs flex items-start gap-1.5">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />
                  Some floats have been outstanding for over 14 days or are overspent.
                </p>
              )}
            </div>
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Schedule and Calendar</span>
                {scheduleReadiness.status === 'ready' ? (
                  <Badge variant="secondary" className="bg-green-600/15 text-green-800 dark:text-green-200">
                    Ready
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    Needs review
                  </Badge>
                )}
              </div>
              {scheduleReadiness.status !== 'ready' && (
                <p className="text-muted-foreground text-xs">
                  Future shoot days: {scheduleReadiness.futureShootDayCount} · Future activity: {scheduleReadiness.futureScheduledActivityCount}
                </p>
              )}
            </div>
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Deliverables</span>
                {deliverablesReadiness.status === 'ready' ? (
                  <Badge variant="secondary" className="bg-green-600/15 text-green-800 dark:text-green-200">
                    Ready
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    Needs review
                  </Badge>
                )}
              </div>
              {deliverablesReadiness.status !== 'ready' && (
                <p className="text-muted-foreground text-xs">
                  Signed off: {deliverablesReadiness.signedOffCount} · Pending: {deliverablesReadiness.pendingCount} · Not reviewed: {deliverablesReadiness.unknownCount}
                </p>
              )}
            </div>
            {hasAnyIssues ? (
              <p className="text-amber-800 dark:text-amber-200 text-sm">
                There are outstanding items above. You can still complete and archive; resolve issues later in archived production views if needed.
              </p>
            ) : (
              <p className="text-green-800 dark:text-green-200 text-sm">
                All wrap checks are ready. You can complete and archive this production.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={completeAndArchiveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => currentProductionId && completeAndArchiveMutation.mutate(currentProductionId)}
              disabled={!currentProductionId || completeAndArchiveMutation.isPending}
            >
              {completeAndArchiveMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Completing…
                </>
              ) : (
                'Complete and Archive Production'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
