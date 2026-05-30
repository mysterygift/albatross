import {
  advanceSetupWorkspaceHandoffPhase,
  type SetupWorkspaceHandoffPhase,
} from '@/lib/auth/setupWorkspaceHandoff'

export const SETUP_TRANSITION_TIMING = {
  full: {
    fadingWelcome: 275,
    brandWash: 400,
    revealingApp: 300,
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
}

/**
 * Runs the FTW6C phase sequence after {@link startSetupWorkspaceTransition}.
 * Assumes handoff phase is already `fadingWelcome`.
 */
export async function runSetupWorkspaceTransition({
  reducedMotion,
  onPersistSession,
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

  await delay(SETUP_TRANSITION_TIMING.full.fadingWelcome)
  await onPersistSession()
  advanceSetupWorkspaceHandoffPhase('brandWash')
  await delay(SETUP_TRANSITION_TIMING.full.brandWash)
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
