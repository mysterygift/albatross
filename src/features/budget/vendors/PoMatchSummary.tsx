import { AlertTriangle, X } from 'lucide-react'

import { MoneyAmountInput } from '@/components/budget/MoneyAmountInput'
import { Button } from '@/components/ui/button'
import { PurchaseOrderStatusBadge } from '@/features/budget/vendors/PurchaseOrderStatusBadge'
import type { PoMatchSummaryRow } from '@/lib/budget/vendors/poPicker'
import { formatPoAmount, formatPoDerivedAmount } from '@/lib/budget/vendors/poCurrency'
import type { PoMatchWarning } from '@/lib/budget/vendors/poMatching'
import { cn } from '@/lib/utils'

export type PoMatchSummaryProps = {
  rows: PoMatchSummaryRow[]
  /** Raw allocation per PO id (null = whole expense when single PO). */
  allocationByPoId: Record<string, number | null>
  warnings: PoMatchWarning[]
  productionCurrency: string
  format: (amount: number, currency: string) => { formatted: string }
  /** More than one PO selected: allocations are required. */
  multi: boolean
  onAllocationChange: (poId: string, amount: number | null) => void
  onRemove: (poId: string) => void
  onIncreasePo: (poId: string) => void
}

/**
 * Live match summary: per selected PO "this spend / PO amount / remaining after", an allocation input,
 * and inline warnings. Warnings never block saving.
 */
export function PoMatchSummary({
  rows,
  allocationByPoId,
  warnings,
  productionCurrency,
  format,
  multi,
  onAllocationChange,
  onRemove,
  onIncreasePo,
}: PoMatchSummaryProps) {
  if (rows.length === 0) return null
  const money = (n: number) => format(n, productionCurrency).formatted
  const fmtOptions = { productionCurrency, format }
  const increaseByPoId = new Map(rows.map((r) => [r.poId, r.increaseBy]))

  return (
    <div className="space-y-2" data-testid="po-match-summary">
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((row) => {
          const over = row.remainingAfter != null && row.remainingAfter < 0
          return (
            <li key={row.poId} className="space-y-1.5 px-3 py-2 text-sm" data-testid={`po-summary-${row.poId}`}>
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{row.poNumber}</span>
                <PurchaseOrderStatusBadge status={row.status} />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {row.vendorName}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 shrink-0 p-0"
                  onClick={() => onRemove(row.poId)}
                  aria-label={`Remove ${row.poNumber}`}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-muted-foreground">This spend</span>
                  {multi ? (
                    <MoneyAmountInput
                      mode="nonNegative"
                      className="h-7 max-w-[8rem] text-xs"
                      aria-label={`Amount allocated to ${row.poNumber}`}
                      placeholder="0.00"
                      value={allocationByPoId[row.poId] ?? null}
                      onValueChange={(v) => onAllocationChange(row.poId, v)}
                    />
                  ) : (
                    <span className="font-medium tabular-nums">{money(row.thisSpend)}</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground">PO </span>
                  <span className="tabular-nums">
                    {row.poAmount != null ? formatPoAmount(row, row.poAmount, fmtOptions) : 'No value'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground">Left after </span>
                  <span
                    className={cn('font-medium tabular-nums', over && 'text-destructive')}
                    data-testid={`po-remaining-after-${row.poId}`}
                  >
                    {row.remainingAfter != null
                      ? formatPoDerivedAmount(row, row.remainingAfter, fmtOptions)
                      : '—'}
                  </span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {warnings.length > 0 && (
        <ul className="space-y-1" role="status" data-testid="po-match-warnings">
          {warnings.map((w, i) => {
            const increaseBy = w.code === 'over_po_remaining' && w.poId ? increaseByPoId.get(w.poId) ?? 0 : 0
            return (
              <li
                key={`${w.code}-${w.poId ?? w.invoiceId ?? i}`}
                className="flex items-start gap-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{w.message}</span>
                {increaseBy > 0 && w.poId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 shrink-0 px-2 text-xs"
                    onClick={() => onIncreasePo(w.poId!)}
                  >
                    Increase PO to cover
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
