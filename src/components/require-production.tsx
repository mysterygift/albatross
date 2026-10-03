import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProductionSwitcher } from '@/components/production-switcher'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { useCurrentProduction } from '@/features/productions/context'

export type RequireProductionProps = {
  title?: string
  children: ReactNode
}

function EmptyStateAction() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <ProductionSwitcher />
      <Button onClick={() => navigate('/productions?new=1')}>New production</Button>
    </div>
  )
}

export function RequireProduction({ title, children }: RequireProductionProps) {
  const { currentProductionId } = useCurrentProduction()
  if (currentProductionId) return <>{children}</>
  return (
    <div className="space-y-6">
      {title ? <PageHeader title={title} /> : null}
      <EmptyState
        title="No production selected"
        description="Choose a production to continue."
        action={<EmptyStateAction />}
      />
    </div>
  )
}
