import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  useLiveSlateCount,
  useScriptSupervisorSettings,
  useSetSlatingSystem,
} from '@/features/script-supervisor/hooks'
import { useEffectiveDataSourceForProduction } from '@/hooks/useEffectiveDataSourceForProduction'
import type { SlatingSystem } from '@/lib/db/types'

type Props = { productionId: string }

const EXAMPLES: Record<SlatingSystem, string> = {
  uk: 'Every new setup takes the next number for the whole shoot: 211, 212, 213. Second unit uses X1, X2; unsupervised units Y1, Y2.',
  us: 'Each setup is the scene number plus a letter: 23, 23A, 23B. Letters I and O are skipped.',
}

/** Per-production slating system (SS2). UK by default; locked once slates exist. */
export function ScriptSupervisorSettingsSection({ productionId }: Props) {
  const { data: settings, isLoading } = useScriptSupervisorSettings(productionId)
  const { data: slateCount = 0 } = useLiveSlateCount(productionId)
  const { data: dataSource } = useEffectiveDataSourceForProduction(productionId)
  const setSystem = useSetSlatingSystem()

  const system: SlatingSystem = settings?.slating_system ?? 'uk'
  const isRemote = dataSource === 'remote_server'
  const locked = slateCount > 0 || isRemote
  const error = setSystem.error instanceof Error ? setSystem.error.message : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slating</CardTitle>
        <CardDescription>
          How slates are numbered in Script Supervisor for this production. Choose before the first slate is logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 max-w-md">
          <p className="text-sm font-medium">Slating system</p>
          <SegmentedControl<SlatingSystem>
            ariaLabel="Slating system"
            value={system}
            onValueChange={(next) => {
              if (next !== system) setSystem.mutate({ productionId, system: next })
            }}
            options={[
              { value: 'uk', label: 'UK (consecutive)', disabled: locked || isLoading || setSystem.isPending },
              { value: 'us', label: 'US (scene + letter)', disabled: locked || isLoading || setSystem.isPending },
            ]}
          />
        </div>
        <p className="text-sm text-muted-foreground">{EXAMPLES[system]}</p>
        {isRemote ? (
          <p className="text-sm text-muted-foreground">
            Script supervisor logs are stored on this device only, so slating can’t be set for a server-published
            production.
          </p>
        ) : slateCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            Locked: {slateCount} {slateCount === 1 ? 'slate is' : 'slates are'} logged. Slating can only change before
            the first slate.
          </p>
        ) : null}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
