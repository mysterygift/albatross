import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getSetupWorkspaceHandoffSnapshot,
  resetSetupWorkspaceHandoffForTests,
  startSetupWorkspaceTransition,
} from '@/lib/auth/setupWorkspaceHandoff'
import {
  getTransitionPhaseSequence,
  runSetupWorkspaceTransition,
  SETUP_TRANSITION_TIMING,
} from '@/features/auth/setup/setupWorkspaceTransitionController'

describe('runSetupWorkspaceTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetSetupWorkspaceHandoffForTests()
    startSetupWorkspaceTransition()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetSetupWorkspaceHandoffForTests()
  })

  it('runs full-motion phase sequence with persist after welcome fade', async () => {
    const onPersistSession = vi.fn(async () => undefined)
    const promise = runSetupWorkspaceTransition({ reducedMotion: false, onPersistSession })

    await vi.advanceTimersByTimeAsync(SETUP_TRANSITION_TIMING.full.fadingWelcome - 1)
    expect(onPersistSession).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()
    await promise

    expect(onPersistSession).toHaveBeenCalledTimes(1)
    expect(getSetupWorkspaceHandoffSnapshot().phase).toBe('complete')
  })

  it('uses shortened reduced-motion sequence without brand wash', async () => {
    resetSetupWorkspaceHandoffForTests()
    startSetupWorkspaceTransition()

    const onPersistSession = vi.fn(async () => undefined)
    const promise = runSetupWorkspaceTransition({ reducedMotion: true, onPersistSession })

    await vi.runAllTimersAsync()
    await promise

    expect(onPersistSession).toHaveBeenCalledTimes(1)
    expect(getTransitionPhaseSequence(true)).toEqual(['fadingWelcome', 'revealingApp', 'complete'])
    expect(getSetupWorkspaceHandoffSnapshot().phase).toBe('complete')
  })
})
