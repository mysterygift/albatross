import { BREAKDOWN_STATUS_LABEL, type BreakdownStatus } from '@/lib/breakdown/matching'
import { breakdownCategory } from '@/lib/breakdown/categories'
import type { BreakdownCategory } from '@/lib/db/types'
import { cn } from '@/lib/utils'

const BREAKDOWN_STATUS_DOT_CLASS: Record<BreakdownStatus, string> = {
  sourced: 'bg-emerald-500 border-emerald-500',
  partial: 'bg-amber-500 border-amber-500',
  needed: 'border-muted-foreground bg-transparent',
}

const STATUS_BADGE_CLASS: Record<BreakdownStatus, string> = {
  sourced: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  partial: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  needed: 'border-border bg-secondary text-muted-foreground',
}

export function BreakdownStatusDot({ status, className }: { status: BreakdownStatus; className?: string }) {
  return (
    <span
      aria-hidden
      title={BREAKDOWN_STATUS_LABEL[status]}
      className={cn('inline-block size-2 shrink-0 rounded-full border-[1.5px]', BREAKDOWN_STATUS_DOT_CLASS[status], className)}
    />
  )
}

export function BreakdownStatusBadge({ status }: { status: BreakdownStatus }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        STATUS_BADGE_CLASS[status]
      )}
    >
      <BreakdownStatusDot status={status} />
      {BREAKDOWN_STATUS_LABEL[status]}
    </span>
  )
}

/** Category name on its highlight colour, as on the paper breakdown sheet. */
export function CategoryLabel({ category, className }: { category: BreakdownCategory; className?: string }) {
  const info = breakdownCategory(category)
  return (
    <span
      className={cn('inline-block rounded-sm px-1 text-xs font-bold uppercase tracking-wide text-black', className)}
      style={{ background: info.colour }}
    >
      {info.label}
    </span>
  )
}
