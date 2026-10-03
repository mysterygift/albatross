import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { useCurrentProduction } from '@/features/productions/context'

export type RequireProductionProps = {
  title?: string
  children: ReactNode
}

const emptyStateAction = (
  <Button asChild>
    <Link to="/productions">Manage productions</Link>
  </Button>
)

export function RequireProduction({ title, children }: RequireProductionProps) {
  const { currentProductionId } = useCurrentProduction()
  if (currentProductionId) return <>{children}</>
  return (
    <div className="space-y-6">
      {title ? <PageHeader title={title} /> : null}
      <EmptyState
        title="No production selected"
        description="Choose a production to continue."
        action={emptyStateAction}
      />
    </div>
  )
}
