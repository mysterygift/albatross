import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PettyCashFloatReconciliationStatus } from '@/lib/db/types'

const LABELS: Record<PettyCashFloatReconciliationStatus, string> = {
  matched: 'Matched',
  partial: 'Partial',
  unmatched: 'Unmatched',
  overspent: 'Overspent',
}

export function FloatReconciliationStatusBadge({
  status,
  className,
}: {
  status: PettyCashFloatReconciliationStatus
  className?: string
}) {
  const variant =
    status === 'matched'
      ? undefined
      : status === 'partial'
        ? undefined
        : status === 'overspent'
          ? 'destructive'
          : 'secondary'
  const colorClass =
    status === 'matched'
      ? 'bg-green-600 text-white border-green-700 dark:bg-green-700 dark:border-green-800'
      : status === 'partial'
        ? 'bg-amber-500 text-amber-950 border-amber-600 dark:bg-amber-600 dark:text-amber-100 dark:border-amber-700'
        : undefined
  return (
    <Badge variant={variant} className={cn('text-xs font-normal', colorClass, className)}>
      {LABELS[status]}
    </Badge>
  )
}
