import { AlbatrossLogo } from '@/components/AlbatrossLogo'
import type { SetupWorkspaceHandoffPhase } from '@/lib/auth/setupWorkspaceHandoff'
import { cn } from '@/lib/utils'

type SetupWorkspaceTransitionOverlayProps = {
  phase: SetupWorkspaceHandoffPhase
  reducedMotion: boolean
  shellVisible: boolean
}

export function SetupWorkspaceTransitionOverlay({
  phase,
  reducedMotion,
  shellVisible,
}: SetupWorkspaceTransitionOverlayProps) {
  const showBrandMoment =
    !reducedMotion && (phase === 'brandWash' || phase === 'revealingApp')
  const brandFadingOut = phase === 'revealingApp'
  const showReveal = phase === 'revealingApp' || (phase === 'complete' && shellVisible)

  return (
    <div
      className="fixed inset-0 z-[100] bg-background"
      data-testid="setup-workspace-transition-overlay"
      data-phase={phase}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      aria-hidden={phase === 'complete'}
    >
      {showBrandMoment && (
        <>
          <div
            className={cn(
              'pointer-events-none absolute inset-0 motion-reduce:animate-none motion-reduce:opacity-100',
              brandFadingOut
                ? 'animate-out fade-out-0 duration-300 fill-mode-forwards'
                : 'animate-in fade-in-0 duration-[400ms] fill-mode-forwards'
            )}
            data-testid="setup-brand-wash"
            style={{
              background:
                'radial-gradient(circle at center, color-mix(in oklch, var(--primary) 45%, transparent) 0%, color-mix(in oklch, var(--accent) 25%, transparent) 35%, transparent 70%)',
            }}
            aria-hidden
          />
          <div
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center justify-center motion-reduce:animate-none motion-reduce:opacity-100',
              brandFadingOut
                ? 'animate-out fade-out-0 duration-300 fill-mode-forwards'
                : 'animate-in fade-in-0 duration-[400ms] fill-mode-forwards'
            )}
            data-testid="setup-brand-logo"
            aria-hidden
          >
            <div className="relative z-10 flex absolute inset-0 flex-col items-center gap-4">
              <AlbatrossLogo
                size="lg"
                className="drop-shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
              />
              <p className="text-xl font-semibold text-foreground">Welcome to Albatross</p>
            </div>
          </div>
        </>
      )}

      {reducedMotion && phase === 'revealingApp' && (
        <div
          className="pointer-events-none absolute inset-0 bg-background/80 animate-in fade-in-0 duration-150"
          aria-hidden
        />
      )}

      {showReveal && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 bg-transparent',
            !reducedMotion &&
              'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 fill-mode-forwards motion-reduce:animate-none motion-reduce:opacity-100'
          )}
          data-testid="setup-app-reveal"
          aria-hidden
        />
      )}
    </div>
  )
}
