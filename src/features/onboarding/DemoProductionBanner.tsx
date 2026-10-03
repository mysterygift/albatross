import { Alert, AlertDescription } from '@/components/ui/alert'
import { DEMO_SLUG } from '@/lib/db/seed/constants'
import type { Production } from '@/lib/db/types'

type DemoProductionBannerProps = {
  isDemo: boolean
  currentProduction: Pick<Production, 'slug'> | null | undefined
}

export function DemoProductionBanner({ isDemo, currentProduction }: DemoProductionBannerProps) {
  if (!isDemo || currentProduction?.slug !== DEMO_SLUG) return null

  return (
    <Alert className="mb-4 border-primary/40 bg-primary/10">
      <div className="col-start-2">
        <AlertDescription className="text-foreground">
          You&apos;re viewing the Demo production - changes here are sample data.
        </AlertDescription>
      </div>
    </Alert>
  )
}
