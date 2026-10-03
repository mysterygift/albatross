import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type PageHeaderProps = {
  title: string
  description?: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, tabs, className }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
      {tabs ? <div>{tabs}</div> : null}
    </header>
  )
}
