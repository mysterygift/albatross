import { WorkspaceIntro } from '@/features/auth/intro/WorkspaceIntro'
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
  const showIntro = !reducedMotion && (phase === 'brandWash' || phase === 'revealingApp')
  const revealing = phase === 'revealingApp'

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100]',
        // The intro owns its own (masked) background during the reveal so the iris can open onto the shell.
        !(showIntro && revealing) && 'bg-background',
        reducedMotion &&
          revealing &&
          'animate-out fade-out-0 duration-150 fill-mode-forwards motion-reduce:animate-none'
      )}
      data-testid="setup-workspace-transition-overlay"
      data-phase={phase}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-shell-visible={shellVisible ? 'true' : 'false'}
      aria-hidden={phase === 'complete'}
    >
      {showIntro && <WorkspaceIntro exiting={revealing} />}
    </div>
  )
}
