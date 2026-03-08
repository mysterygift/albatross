import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { VendorInvoiceStatus } from '@/lib/db/types'

const LABELS: Record<VendorInvoiceStatus, string> = {
  draft: 'Draft',
  received: 'Received',
  approved: 'Approved',
  paid: 'Paid',
  overdue: 'Overdue',
}

export function InvoiceStatusBadge({
  status,
  isOverdue,
  className,
}: {
  status: VendorInvoiceStatus
  /** When true, due_date is in the past and status is not paid; show overdue treatment. */
  isOverdue?: boolean
  className?: string
}) {
  const effective = isOverdue ? 'overdue' : status
  const colorClass =
    effective === 'paid'
      ? 'bg-green-600 text-white border-green-700 dark:bg-green-700 dark:border-green-800'
      : effective === 'overdue'
        ? 'bg-destructive/90 text-destructive-foreground border-destructive'
        : effective === 'approved'
          ? 'bg-amber-500 text-amber-950 border-amber-600 dark:bg-amber-600 dark:text-amber-100 dark:border-amber-700'
          : effective === 'received'
            ? 'bg-secondary text-secondary-foreground border-border'
            : undefined // draft: default/muted
  return (
    <Badge
      variant={effective === 'draft' ? 'secondary' : undefined}
      className={cn('text-xs font-normal', colorClass, className)}
    >
      {isOverdue && status !== 'overdue' ? 'Overdue' : LABELS[status]}
    </Badge>
  )
}
