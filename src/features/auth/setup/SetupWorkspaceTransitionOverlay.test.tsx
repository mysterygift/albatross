// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { SetupWorkspaceTransitionOverlay } from '@/features/auth/setup/SetupWorkspaceTransitionOverlay'

describe('SetupWorkspaceTransitionOverlay', () => {
  afterEach(() => {
    cleanup()
  })

  it('exposes phase and reduced-motion attributes', () => {
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
    expect(screen.getByTestId('setup-brand-wash')).toBeTruthy()
    expect(screen.getByTestId('setup-brand-logo')).toBeTruthy()
    expect(screen.getByTestId('albatross-logo')).toBeTruthy()
    expect(screen.getByText('Welcome to Albatross')).toBeTruthy()
  })

  it('skips brand wash when reduced motion is enabled', () => {
    render(
      <SetupWorkspaceTransitionOverlay
        phase="brandWash"
        reducedMotion={true}
        shellVisible={false}
      />
    )

    expect(screen.queryByTestId('setup-brand-wash')).toBeNull()
    expect(screen.queryByTestId('setup-brand-logo')).toBeNull()
    expect(screen.getByTestId('setup-workspace-transition-overlay').getAttribute('data-reduced-motion')).toBe(
      'true'
    )
  })

  it('applies reduced-motion classes on app reveal', () => {
    render(
      <SetupWorkspaceTransitionOverlay
        phase="revealingApp"
        reducedMotion={false}
        shellVisible={true}
      />
    )

    const reveal = screen.getByTestId('setup-app-reveal')
    expect(reveal.className).toContain('motion-reduce:animate-none')
  })
})
