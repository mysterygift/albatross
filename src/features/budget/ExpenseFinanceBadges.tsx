import { Badge } from '@/components/ui/badge'
import type { ExpenseFinanceFlags } from '@/lib/budget/expenseFinanceFlags'
import { cn } from '@/lib/utils'

const AMBER = 'text-xs font-normal border-amber-500/50 text-amber-800 dark:text-amber-300'

/** "No PO" / "No proof" badges for an expense row or detail header; renders nothing when both are clear. */
export function ExpenseFinanceBadges({
  flags,
  className,
}: {
  flags: ExpenseFinanceFlags | undefined
  className?: string
}) {
  if (!flags || (!flags.noPo && !flags.noProof)) return null
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)} data-testid="expense-finance-badges">
      {flags.noPo && (
        <Badge variant="outline" className={AMBER} title="This vendor spend is not matched to a purchase order">
          No PO
        </Badge>
      )}
      {flags.noProof && (
        <Badge variant="outline" className={AMBER} title="No receipt, and no linked invoice with a file">
          No proof
        </Badge>
      )}
    </span>
  )
}
