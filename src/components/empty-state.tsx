import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EmptyStateProps = {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      data-slot="empty-state"
      className={cn(
        'border-border bg-card flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center',
        className
      )}
    >
      {Icon ? <Icon className="text-muted-foreground size-8" aria-hidden="true" /> : null}
      <h2 className="text-base font-medium">{title}</h2>
      {description ? <p className="text-muted-foreground max-w-md text-sm">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
