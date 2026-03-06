import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ExpenseReconciliationStatus } from '@/lib/db/types'

const LABELS: Record<ExpenseReconciliationStatus, string> = {
  allocated: 'Allocated',
  partial: 'Partially allocated',
  unallocated: 'Unallocated',
}

export function ExpenseAllocationStatusBadge({
  status,
  className,
}: {
  status: ExpenseReconciliationStatus
  className?: string
}) {
  const variant = status === 'unallocated' ? 'secondary' : undefined
  const colorClass =
    status === 'allocated'
      ? 'bg-green-600 text-white border-green-700 dark:bg-green-700 dark:border-green-800'
      : status === 'partial'
        ? 'bg-amber-500 text-amber-950 border-amber-600 dark:bg-amber-600 dark:text-amber-100 dark:border-amber-700'
        : undefined
  return (
    <Badge
      variant={variant}
      className={cn('text-xs font-normal', colorClass, className)}
    >
      {LABELS[status]}
    </Badge>
  )
}
