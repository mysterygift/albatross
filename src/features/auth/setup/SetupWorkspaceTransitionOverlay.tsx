import { cn } from '@/lib/utils'
import type { SetupWorkspaceHandoffPhase } from '@/lib/auth/setupWorkspaceHandoff'

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
  const showBrandWash = phase === 'brandWash' && !reducedMotion
  const showReveal = phase === 'revealingApp' || (phase === 'complete' && shellVisible)

  return (
    <div
      className="fixed inset-0 z-[100] bg-background"
      data-testid="setup-workspace-transition-overlay"
      data-phase={phase}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      aria-hidden={phase === 'complete'}
    >
      {showBrandWash && (
        <div
          className="pointer-events-none absolute inset-0 animate-in fade-in-0 duration-[400ms] fill-mode-forwards motion-reduce:animate-none motion-reduce:opacity-100"
          data-testid="setup-brand-wash"
          style={{
            background:
              'radial-gradient(circle at center, color-mix(in oklch, var(--primary) 45%, transparent) 0%, color-mix(in oklch, var(--accent) 25%, transparent) 35%, transparent 70%)',
          }}
          aria-hidden
        />
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
