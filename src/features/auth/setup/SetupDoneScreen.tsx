import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const SETUP_DONE_SCREEN_TEST_ID = 'setup-done-screen'

export const SETUP_COMPLETION_ITEMS = [
  'Encryption enabled',
  'Recovery protection configured',
  'Administrator account created',
] as const

type SetupDoneScreenProps = {
  busy: boolean
  onEnterWorkspace: () => void | Promise<void>
  /** Phase A: fade and scale down done-screen content. */
  contentFadingOut?: boolean
}

export function SetupDoneScreen({
  busy,
  onEnterWorkspace,
  contentFadingOut = false,
}: SetupDoneScreenProps) {
  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6"
      data-testid={SETUP_DONE_SCREEN_TEST_ID}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-accent/10 via-background to-background"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--background)_75%)]"
        aria-hidden
      />

      <div
        className={cn(
          'relative z-10 flex w-full max-w-md flex-col items-center space-y-8 transition-all duration-[275ms] ease-out motion-reduce:transition-none',
          contentFadingOut && 'scale-[0.97] opacity-0 motion-reduce:scale-100 motion-reduce:opacity-100'
        )}
      >
        <p className="text-2xl font-semibold text-foreground">Albatross</p>

        <div className="w-full space-y-6 rounded-xl border border-border bg-card px-6 py-8 shadow-sm shadow-[0_0_40px_-12px] shadow-accent/20">
          <div className="space-y-2 text-center">
            <h1 className="text-xl font-semibold text-foreground">Welcome to Albatross</h1>
            <p className="text-sm text-muted-foreground">Your production workspace is ready.</p>
          </div>

          <ul className="space-y-2">
            {SETUP_COMPLETION_ITEMS.map((item) => (
              <li key={item} className="text-sm text-foreground">
                ✓ {item}
              </li>
            ))}
          </ul>

          <Button
            type="button"
            className="w-full"
            disabled={busy}
            autoFocus
            onClick={() => void onEnterWorkspace()}
          >
            {busy ? 'Entering workspace…' : 'Enter Workspace'}
          </Button>
        </div>
      </div>
    </main>
  )
}
