import { beforeEach, describe, expect, it } from 'vitest'

import {
  advanceSetupWorkspaceHandoffPhase,
  armSetupWorkspaceHandoff,
  disarmSetupWorkspaceHandoff,
  getSetupWorkspaceHandoffSnapshot,
  isSetupWorkspaceHandoffArmed,
  isSetupWorkspaceTransitionActive,
  resetSetupWorkspaceHandoffForTests,
  startSetupWorkspaceTransition,
} from '@/lib/auth/setupWorkspaceHandoff'

describe('setupWorkspaceHandoff', () => {
  beforeEach(() => {
    resetSetupWorkspaceHandoffForTests()
  })

  it('arms and starts transition only when armed', () => {
    expect(startSetupWorkspaceTransition()).toBe(false)

    armSetupWorkspaceHandoff()
    expect(isSetupWorkspaceHandoffArmed()).toBe(true)
    expect(getSetupWorkspaceHandoffSnapshot().phase).toBe('idle')

    expect(startSetupWorkspaceTransition()).toBe(true)
    expect(getSetupWorkspaceHandoffSnapshot().phase).toBe('fadingWelcome')
    expect(isSetupWorkspaceTransitionActive()).toBe(true)

    expect(startSetupWorkspaceTransition()).toBe(false)
  })

  it('advances phases and disarms', () => {
    armSetupWorkspaceHandoff()
    startSetupWorkspaceTransition()

    advanceSetupWorkspaceHandoffPhase('brandWash')
    expect(getSetupWorkspaceHandoffSnapshot().phase).toBe('brandWash')

    advanceSetupWorkspaceHandoffPhase('complete')
    disarmSetupWorkspaceHandoff()

    expect(isSetupWorkspaceHandoffArmed()).toBe(false)
    expect(getSetupWorkspaceHandoffSnapshot().phase).toBe('idle')
    expect(isSetupWorkspaceTransitionActive()).toBe(false)
  })

  it('does not arm from a fresh runtime state', () => {
    expect(isSetupWorkspaceHandoffArmed()).toBe(false)
    expect(startSetupWorkspaceTransition()).toBe(false)
  })

  it('clears armed state on disarm so transition cannot replay', () => {
    armSetupWorkspaceHandoff()
    startSetupWorkspaceTransition()
    advanceSetupWorkspaceHandoffPhase('complete')
    disarmSetupWorkspaceHandoff()

    expect(startSetupWorkspaceTransition()).toBe(false)
    expect(isSetupWorkspaceHandoffArmed()).toBe(false)
  })

  it('defaults to a setup handoff and can be armed as a login handoff', () => {
    armSetupWorkspaceHandoff()
    expect(getSetupWorkspaceHandoffSnapshot().kind).toBe('setup')

    armSetupWorkspaceHandoff('login')
    expect(getSetupWorkspaceHandoffSnapshot()).toEqual({
      armed: true,
      phase: 'idle',
      kind: 'login',
    })

    disarmSetupWorkspaceHandoff()
    expect(getSetupWorkspaceHandoffSnapshot().kind).toBe('setup')
  })
})
