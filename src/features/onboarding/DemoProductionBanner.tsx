import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { listProductions } from '@/lib/db/repositories/production'
import { DEMO_SLUG } from '@/lib/db/seed/constants'
import type { Production } from '@/lib/db/types'

type DemoProductionBannerProps = {
  isDemo: boolean
  currentProduction: Pick<Production, 'slug'> | null | undefined
  setCurrentProductionId: (id: string) => void
}

export function DemoProductionBanner({
  isDemo,
  currentProduction,
  setCurrentProductionId,
}: DemoProductionBannerProps) {
  const navigate = useNavigate()
  const showing = isDemo && currentProduction?.slug === DEMO_SLUG
  const { data: productions } = useQuery({
    queryKey: ['productions', 'non-demo-for-banner'],
    queryFn: async () => (await listProductions()).filter((p) => p.slug !== DEMO_SLUG && !p.archived_at),
    enabled: showing,
  })
  if (!showing) return null

  const target = productions?.[0]
  return (
    <Alert className="mb-4 border-primary/40 bg-primary/10">
      <div className="col-start-2 flex flex-wrap items-center justify-between gap-3">
        <AlertDescription className="text-foreground">
          You&apos;re viewing the Demo production - changes here are sample data.
        </AlertDescription>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (target) setCurrentProductionId(target.id)
            else navigate('/productions')
          }}
        >
          Switch to my production
        </Button>
      </div>
    </Alert>
  )
}
