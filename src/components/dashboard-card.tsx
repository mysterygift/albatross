import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export type DashboardCardProps = {
  title: string
  icon?: LucideIcon
  status: 'loading' | 'error' | 'empty' | 'ready'
  emptyMessage?: string
  errorMessage?: string
  onRetry?: () => void
  action?: ReactNode
  children?: ReactNode
}

export function DashboardCard({
  title,
  icon: Icon,
  status,
  emptyMessage = 'Nothing to show yet.',
  errorMessage = 'Something went wrong.',
  onRetry,
  action,
  children,
}: DashboardCardProps) {
  return (
    <Card data-slot="dashboard-card" data-status={status}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon ? <Icon className="text-muted-foreground size-4" aria-hidden="true" /> : null}
          {title}
        </CardTitle>
        {action ? <div className="text-sm">{action}</div> : null}
      </CardHeader>
      <CardContent>
        {status === 'loading' ? (
          <div className="space-y-2" data-testid="dashboard-card-loading">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : null}
        {status === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-destructive text-sm">{errorMessage}</p>
            {onRetry ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {status === 'empty' ? <p className="text-muted-foreground text-sm">{emptyMessage}</p> : null}
        {status === 'ready' ? children : null}
      </CardContent>
    </Card>
  )
}
