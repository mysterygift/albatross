import { Badge } from '@/components/ui/badge'
import { getLineItemTypeConfig } from '@/lib/budget/line-items/registry'
import type { LineItemType } from '@/lib/db/types'

/** Small pill badge for line item or expense classification. Same styling for both. */
export function ClassificationBadge({
  type,
  className,
}: {
  type: LineItemType | null
  className?: string
}) {
  const label = type == null ? 'Untyped' : (getLineItemTypeConfig(type)?.label ?? type)
  return (
    <Badge variant="secondary" className={className ?? 'text-xs font-normal'}>
      {label}
    </Badge>
  )
}
