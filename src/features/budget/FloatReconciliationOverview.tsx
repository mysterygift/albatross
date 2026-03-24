import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FloatReconciliationStatusBadge } from '@/features/budget/FloatReconciliationStatusBadge'
import {
  groupFloatsByDepartment,
  isActionableFloatStatus,
  type FloatSummaryForProduction,
  type FloatSummaryRow,
} from '@/lib/budget/floatSummary'
import { cn } from '@/lib/utils'
import type { PettyCashFloatReconciliationStatus } from '@/lib/db/types'
import {
  computeFloatReminderSeverity,
  formatIssuedDaysAgo,
  issuedDateToAgeDays,
} from '@/lib/budget/floatReminders'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

function statusRowClass(status: PettyCashFloatReconciliationStatus): string {
  switch (status) {
    case 'matched':
      return 'border-l-4 border-l-green-600/70 dark:border-l-green-500/80 bg-green-500/[0.04]'
    case 'overspent':
      return 'border-l-4 border-l-destructive bg-destructive/[0.06]'
    case 'partial':
      return 'border-l-4 border-l-amber-500 bg-amber-500/[0.06]'
    case 'unmatched':
    default:
      return 'border-l-4 border-l-muted-foreground/40 bg-muted/20'
  }
}

function remainingCellClass(remaining: number, status: PettyCashFloatReconciliationStatus): string {
  if (remaining > 0 && status !== 'overspent') {
    return 'font-semibold text-amber-700 dark:text-amber-400 tabular-nums'
  }
  return 'tabular-nums'
}

function floatReminderTextClass(severity: 'info' | 'warning' | 'critical'): string {
  if (severity === 'critical') return 'text-destructive'
  if (severity === 'warning') return 'text-amber-700 dark:text-amber-400'
  return 'text-muted-foreground'
}

function FloatRowReminderHints({
  row,
  format,
}: {
  row: FloatSummaryRow
  format: (amount: number, currency: string) => { formatted: string }
}) {
  const ageDays = issuedDateToAgeDays(row.issuedDate)
  const severity = computeFloatReminderSeverity({
    status: row.status,
    remaining: row.remaining,
    ageDays,
  })
  const showWarnIcon = severity !== 'info' || row.status === 'overspent'

  return (
    <div className="mt-1 space-y-0.5 text-xs font-normal">
      <p className="text-muted-foreground">{formatIssuedDaysAgo(ageDays)}</p>
      {row.status === 'overspent' && (
        <p className="text-destructive flex items-center gap-1 tabular-nums">
          {showWarnIcon && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
          Overspent vs allocation
        </p>
      )}
      {row.remaining > 0 && row.status !== 'overspent' && (
        <p
          className={cn(
            'tabular-nums flex flex-wrap items-center gap-x-1 gap-y-0.5',
            floatReminderTextClass(severity)
          )}
        >
          {showWarnIcon && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
          <span>{format(row.remaining, row.currency).formatted} remaining</span>
          {ageDays > 7 && (
            <span className="text-muted-foreground">· Outstanding {ageDays} days</span>
          )}
        </p>
      )}
    </div>
  )
}

export type FloatReconciliationOverviewProps = {
  summary: FloatSummaryForProduction
  /** Shown when all floats share one currency; used only for headline totals hint. */
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
  /** Label for the budget line item column (e.g. account code + description). */
  budgetLineLabel: (row: FloatSummaryRow) => string
  onReconcile: (row: FloatSummaryRow) => void
  /** When true (e.g. /budget?floats=outstanding), turn on the unreconciled filter once. */
  activateActionableFilter?: boolean
}

export function FloatReconciliationOverview({
  summary,
  productionCurrency,
  format,
  budgetLineLabel,
  onReconcile,
  activateActionableFilter = false,
}: FloatReconciliationOverviewProps) {
  const [filterActionable, setFilterActionable] = useState(false)
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (activateActionableFilter) setFilterActionable(true)
  }, [activateActionableFilter])

  const displayRows = useMemo(() => {
    if (!filterActionable) return summary.floats
    return summary.floats.filter((r) => isActionableFloatStatus(r.status))
  }, [summary.floats, filterActionable])

  const departmentGroups = useMemo(() => groupFloatsByDepartment(displayRows), [displayRows])
  const departmentNames = useMemo(
    () => Object.keys(departmentGroups).sort((a, b) => a.localeCompare(b)),
    [departmentGroups]
  )

  const totalsCurrency =
    summary.hasMixedCurrencies || summary.floatCount === 0 ? null : summary.floats[0]?.currency ?? productionCurrency

  if (summary.floatCount === 0) {
    return (
      <section className="rounded-lg border border-border p-4 space-y-2">
        <h2 className="text-lg font-semibold">Float reconciliation</h2>
        <p className="text-sm text-muted-foreground">No petty cash floats in this production yet.</p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-border space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Float reconciliation</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Production overview — use Reconcile on each row to match spend to floats.
          </p>
        </div>
        <Button
          type="button"
          variant={filterActionable ? 'secondary' : 'outline'}
          size="sm"
          className="shrink-0"
          onClick={() => setFilterActionable((v) => !v)}
        >
          {filterActionable ? 'Show all floats' : 'Unreconciled floats'}
        </Button>
      </div>

      {summary.hasMixedCurrencies && (
        <p className="text-xs text-amber-700 dark:text-amber-500 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          Floats use multiple currencies. Headline totals sum numeric amounts; use the table for per-float figures.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total allocated</p>
          <p className="text-lg font-semibold tabular-nums mt-1">
            {totalsCurrency
              ? format(summary.totalAllocated, totalsCurrency).formatted
              : format(summary.totalAllocated, productionCurrency).formatted}
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total matched</p>
          <p className="text-lg font-semibold tabular-nums mt-1">
            {totalsCurrency
              ? format(summary.totalMatched, totalsCurrency).formatted
              : format(summary.totalMatched, productionCurrency).formatted}
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total remaining</p>
          <p
            className={cn(
              'text-lg font-semibold tabular-nums mt-1',
              summary.totalRemaining > 0 && 'text-amber-700 dark:text-amber-400'
            )}
          >
            {totalsCurrency
              ? format(summary.totalRemaining, totalsCurrency).formatted
              : format(summary.totalRemaining, productionCurrency).formatted}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Unreturned / unreconciled cash</p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By status</p>
          <ul className="text-sm mt-1.5 space-y-0.5 tabular-nums">
            <li className="text-muted-foreground">
              Unmatched: <span className="text-foreground">{summary.statusCounts.unmatched}</span>
            </li>
            <li className="text-amber-700/90 dark:text-amber-400/90">
              Partial: <span className="text-foreground">{summary.statusCounts.partial}</span>
            </li>
            <li className="text-green-700 dark:text-green-500">
              Matched: <span className="text-foreground">{summary.statusCounts.matched}</span>
            </li>
            <li className="text-destructive">
              Overspent: <span className="text-foreground">{summary.statusCounts.overspent}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Crew member</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Budget line item</TableHead>
              <TableHead className="text-right">Allocated</TableHead>
              <TableHead className="text-right">Matched</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-8">
                  No floats in this view. Clear the filter to see all floats.
                </TableCell>
              </TableRow>
            ) : (
              displayRows.map((row) => (
                <TableRow
                  key={row.floatId}
                  className={cn('hover:bg-muted/40', statusRowClass(row.status))}
                >
                  <TableCell className="font-medium align-top">
                    <span className="block">{row.personName}</span>
                    <FloatRowReminderHints row={row} format={format} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.department}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[220px]">
                    <span className="line-clamp-2">{budgetLineLabel(row)}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {format(row.allocated, row.currency).formatted}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {format(row.matched, row.currency).formatted}
                  </TableCell>
                  <TableCell className={cn('text-right', remainingCellClass(row.remaining, row.status))}>
                    {format(row.remaining, row.currency).formatted}
                  </TableCell>
                  <TableCell>
                    <FloatReconciliationStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onReconcile(row)}>
                      Reconcile
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">By department</h3>
        <div className="space-y-2">
          {departmentNames.map((dept) => {
            const g = departmentGroups[dept]!
            const open = expandedDepts.has(dept)
            return (
              <div key={dept} className="rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm bg-muted/30 hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setExpandedDepts((prev) => {
                      const next = new Set(prev)
                      if (next.has(dept)) next.delete(dept)
                      else next.add(dept)
                      return next
                    })
                  }}
                >
                  {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                  <span className="font-medium">{dept}</span>
                  <span className="text-muted-foreground text-xs ml-auto tabular-nums">
                    {g.floatCount} float{g.floatCount !== 1 ? 's' : ''} · Remaining{' '}
                    {summary.hasMixedCurrencies
                      ? '—'
                      : totalsCurrency
                        ? format(g.totalRemaining, totalsCurrency).formatted
                        : format(g.totalRemaining, productionCurrency).formatted}
                  </span>
                </button>
                {open && (
                  <div className="px-3 py-2 text-sm border-t border-border bg-background/50 space-y-1">
                    <p className="text-muted-foreground tabular-nums">
                      Allocated{' '}
                      {summary.hasMixedCurrencies
                        ? '—'
                        : totalsCurrency
                          ? format(g.totalAllocated, totalsCurrency).formatted
                          : format(g.totalAllocated, productionCurrency).formatted}{' '}
                      · Matched{' '}
                      {summary.hasMixedCurrencies
                        ? '—'
                        : totalsCurrency
                          ? format(g.totalMatched, totalsCurrency).formatted
                          : format(g.totalMatched, productionCurrency).formatted}{' '}
                      · Remaining{' '}
                      {summary.hasMixedCurrencies
                        ? '—'
                        : totalsCurrency
                          ? format(g.totalRemaining, totalsCurrency).formatted
                          : format(g.totalRemaining, productionCurrency).formatted}
                    </p>
                    <ul className="divide-y divide-border rounded border border-border mt-2">
                      {g.floats.map((r) => (
                        <li
                          key={r.floatId}
                          className={cn(
                            'px-2 py-2 text-xs flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between',
                            statusRowClass(r.status)
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium truncate">{r.personName}</span>
                            <p className="text-muted-foreground truncate mt-0.5">{budgetLineLabel(r)}</p>
                            <FloatRowReminderHints row={r} format={format} />
                          </span>
                          <div className="flex shrink-0 flex-col items-stretch sm:items-end gap-1 sm:pt-0.5">
                            <span className="tabular-nums text-right">
                              {format(r.remaining, r.currency).formatted}
                            </span>
                            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onReconcile(r)}>
                              Reconcile
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
