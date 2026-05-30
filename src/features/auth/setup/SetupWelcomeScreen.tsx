import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

type SetupWelcomeScreenProps = {
  busy: boolean
  onBeginSetup: () => void
}

const SETUP_INTENT_ITEMS = [
  'Create a local-first production workspace on this device',
  'Encrypt the local database with SQLCipher',
  'Create the first admin account for sign-in',
  'Generate a recovery key that you must save securely',
  'Add productions after setup is complete',
] as const

export function SetupWelcomeScreen({ busy, onBeginSetup }: SetupWelcomeScreenProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to Albatross</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          First-time setup prepares a secure local workspace. Here is what will happen:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {SETUP_INTENT_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex flex-col gap-4">
        <Button type="button" className="w-full" disabled={busy} onClick={onBeginSetup}>
          Begin setup
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <a
            href="/docs/DATA_ENCRYPTION.md"
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn about local encryption and recovery
          </a>
          {' — '}
          there is no cloud recovery; local data cannot be restored without your credentials or
          recovery key.
        </p>
      </CardFooter>
    </Card>
  )
}
