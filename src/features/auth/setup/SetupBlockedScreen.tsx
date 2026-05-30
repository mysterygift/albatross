import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

type SetupBlockedScreenProps = {
  busy: boolean
  lastError?: string | null
  onRetry?: () => void
}

export function SetupBlockedScreen({ busy, lastError, onRetry }: SetupBlockedScreenProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup can&apos;t continue automatically</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your local database looks partially configured. Albatross cannot safely continue first-time
          setup from here without your existing recovery details.
        </p>
        <p className="text-sm text-muted-foreground">
          Review the recovery guidance in{' '}
          <a href="/docs/DATA_ENCRYPTION.md" className="underline underline-offset-2">
            Data encryption
          </a>{' '}
          or contact support if you need help restoring access.
        </p>
        {lastError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {lastError}
          </p>
        )}
      </CardContent>
      {onRetry && (
        <CardFooter>
          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={onRetry}>
            Try again
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
