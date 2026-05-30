import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type SetupEncryptingScreenProps = {
  lastError?: string | null
}

export function SetupEncryptingScreen({ lastError }: SetupEncryptingScreenProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{lastError ? 'Database setup failed' : 'Securing database…'}</CardTitle>
      </CardHeader>
      <CardContent>
        {lastError ? (
          <p className="text-sm text-destructive" role="alert">
            {lastError}
          </p>
        ) : (
          <p
            className="text-sm text-muted-foreground"
            aria-live="polite"
            aria-busy="true"
            role="status"
          >
            Encrypting local database and preparing setup.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
