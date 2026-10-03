import { WORKSPACE_INTRO_TIMING } from '@/features/auth/intro/WorkspaceIntro'
import {
  advanceSetupWorkspaceHandoffPhase,
  type SetupWorkspaceHandoffPhase,
} from '@/lib/auth/setupWorkspaceHandoff'

const WORKSPACE_FADING_WELCOME_MS = 275

export const SETUP_TRANSITION_TIMING = {
  full: {
    fadingWelcome: WORKSPACE_FADING_WELCOME_MS,
    /** Intro playing over the (hidden) app shell. */
    intro: WORKSPACE_INTRO_TIMING.playMs,
    /** Iris opening onto the app shell. */
    revealingApp: WORKSPACE_INTRO_TIMING.exitMs,
  },
  reduced: {
    crossfade: 150,
  },
} as const

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type RunSetupWorkspaceTransitionOptions = {
  reducedMotion: boolean
  onPersistSession: () => Promise<void>
  /**
   * Wait before persisting the session, to let the outgoing screen fade. Defaults to the setup
   * "done" card fade; sign-in has nothing to fade and passes 0.
   */
  leadInMs?: number
}

/**
 * Runs the FTW6C phase sequence (setup and sign-in) after {@link startSetupWorkspaceTransition}.
 * Assumes handoff phase is already `fadingWelcome`.
 */
export async function runSetupWorkspaceTransition({
  reducedMotion,
  onPersistSession,
  leadInMs = SETUP_TRANSITION_TIMING.full.fadingWelcome,
}: RunSetupWorkspaceTransitionOptions): Promise<void> {
  if (reducedMotion) {
    const half = SETUP_TRANSITION_TIMING.reduced.crossfade / 2
    await delay(half)
    await onPersistSession()
    advanceSetupWorkspaceHandoffPhase('revealingApp')
    await delay(half)
    advanceSetupWorkspaceHandoffPhase('complete')
    return
  }

  if (leadInMs > 0) {
    await delay(leadInMs)
  }
  await onPersistSession()
  advanceSetupWorkspaceHandoffPhase('brandWash')
  await delay(SETUP_TRANSITION_TIMING.full.intro)
  advanceSetupWorkspaceHandoffPhase('revealingApp')
  await delay(SETUP_TRANSITION_TIMING.full.revealingApp)
  advanceSetupWorkspaceHandoffPhase('complete')
}

export function getTransitionPhaseSequence(reducedMotion: boolean): SetupWorkspaceHandoffPhase[] {
  if (reducedMotion) {
    return ['fadingWelcome', 'revealingApp', 'complete']
  }
  return ['fadingWelcome', 'brandWash', 'revealingApp', 'complete']
}
