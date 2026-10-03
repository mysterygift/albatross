// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { SetupWorkspaceTransitionOverlay } from '@/features/auth/setup/SetupWorkspaceTransitionOverlay'

describe('SetupWorkspaceTransitionOverlay', () => {
  afterEach(() => {
    cleanup()
  })

  it('plays the workspace intro over an opaque background while the shell loads', () => {
    render(
      <SetupWorkspaceTransitionOverlay
        phase="brandWash"
        reducedMotion={false}
        shellVisible={false}
      />
    )

    const overlay = screen.getByTestId('setup-workspace-transition-overlay')
    expect(overlay.getAttribute('data-phase')).toBe('brandWash')
    expect(overlay.getAttribute('data-reduced-motion')).toBe('false')
    expect(overlay.className).toContain('bg-background')
    expect(screen.getByTestId('workspace-intro').getAttribute('data-exiting')).toBe('false')
    expect(screen.getByTestId('albatross-logo')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Albatross' })).toBeTruthy()
  })

  it('drops its own background on reveal so the iris can open onto the shell', () => {
    render(
      <SetupWorkspaceTransitionOverlay
        phase="revealingApp"
        reducedMotion={false}
        shellVisible={true}
      />
    )

    expect(screen.getByTestId('workspace-intro').getAttribute('data-exiting')).toBe('true')
    expect(screen.getByTestId('setup-workspace-transition-overlay').className).not.toContain(
      'bg-background'
    )
  })

  it('skips the intro when reduced motion is enabled', () => {
    render(
      <SetupWorkspaceTransitionOverlay
        phase="brandWash"
        reducedMotion={true}
        shellVisible={false}
      />
    )

    expect(screen.queryByTestId('workspace-intro')).toBeNull()
    expect(
      screen.getByTestId('setup-workspace-transition-overlay').getAttribute('data-reduced-motion')
    ).toBe('true')
  })

  it('crossfades out on reveal when reduced motion is enabled', () => {
    render(
      <SetupWorkspaceTransitionOverlay
        phase="revealingApp"
        reducedMotion={true}
        shellVisible={true}
      />
    )

    const overlay = screen.getByTestId('setup-workspace-transition-overlay')
    expect(screen.queryByTestId('workspace-intro')).toBeNull()
    expect(overlay.className).toContain('fade-out-0')
    expect(overlay.className).toContain('motion-reduce:animate-none')
  })
})
