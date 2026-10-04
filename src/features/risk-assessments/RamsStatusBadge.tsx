import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RiskAssessmentStatus } from '@/lib/db/types'

const LABELS: Record<RiskAssessmentStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
}

export function RamsStatusBadge({
  status,
  className,
}: {
  status: RiskAssessmentStatus
  className?: string
}) {
  const colorClass =
    status === 'approved'
      ? 'bg-green-600 text-white border-green-700 dark:bg-green-700 dark:border-green-800'
      : undefined // draft: secondary/muted
  return (
    <Badge
      variant={status === 'draft' ? 'secondary' : undefined}
      className={cn('text-xs font-normal', colorClass, className)}
    >
      {LABELS[status]}
    </Badge>
  )
}
