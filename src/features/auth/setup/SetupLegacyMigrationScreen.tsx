import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

type SetupLegacyMigrationScreenProps = {
  busy: boolean
  onRequireSignIn: () => void
}

export function SetupLegacyMigrationScreen({ busy, onRequireSignIn }: SetupLegacyMigrationScreenProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to continue</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This install uses an older encryption mode. Sign in with your existing account so Albatross
          can migrate your database securely before continuing.
        </p>
      </CardContent>
      <CardFooter>
        <Button type="button" className="w-full" disabled={busy} onClick={onRequireSignIn}>
          Go to sign in
        </Button>
      </CardFooter>
    </Card>
  )
}
