import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PurchaseOrderStatus } from '@/lib/db/types'

const LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  approved: 'Approved',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export function PurchaseOrderStatusBadge({
  status,
  className,
}: {
  status: PurchaseOrderStatus
  className?: string
}) {
  const colorClass =
    status === 'closed'
      ? 'bg-muted text-muted-foreground border-border'
      : status === 'cancelled'
        ? 'bg-destructive/90 text-destructive-foreground border-destructive'
        : status === 'approved'
          ? 'bg-green-600 text-white border-green-700 dark:bg-green-700 dark:border-green-800'
          : status === 'issued'
            ? 'bg-amber-500 text-amber-950 border-amber-600 dark:bg-amber-600 dark:text-amber-100 dark:border-amber-700'
            : undefined // draft: default/muted
  return (
    <Badge
      variant={status === 'draft' ? 'secondary' : undefined}
      className={cn('text-xs font-normal', colorClass, className)}
    >
      {LABELS[status]}
    </Badge>
  )
}
