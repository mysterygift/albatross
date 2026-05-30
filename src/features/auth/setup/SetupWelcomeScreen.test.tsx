// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SetupWelcomeScreen } from '@/features/auth/setup/SetupWelcomeScreen'

describe('SetupWelcomeScreen', () => {
  beforeEach(() => {
    cleanup()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  it('shows setup intent bullets', () => {
    render(<SetupWelcomeScreen busy={false} onBeginSetup={vi.fn()} />)

    expect(screen.getByText(/local-first production workspace/i)).toBeTruthy()
    expect(screen.getByText(/SQLCipher/i)).toBeTruthy()
    expect(screen.getByText(/first admin account/i)).toBeTruthy()
    expect(screen.getByText(/Generate a recovery key that you must save securely/i)).toBeTruthy()
    expect(screen.getByText(/after setup is complete/i)).toBeTruthy()
  })

  it('calls onBeginSetup when Begin setup is clicked', async () => {
    const user = userEvent.setup()
    const onBeginSetup = vi.fn()
    render(<SetupWelcomeScreen busy={false} onBeginSetup={onBeginSetup} />)

    await user.click(screen.getByRole('button', { name: 'Begin setup' }))
    expect(onBeginSetup).toHaveBeenCalledTimes(1)
  })

  it('does not show a skip action', () => {
    render(<SetupWelcomeScreen busy={false} onBeginSetup={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /skip/i })).toBeNull()
  })

  it('links to encryption documentation with no cloud recovery copy', () => {
    render(<SetupWelcomeScreen busy={false} onBeginSetup={vi.fn()} />)

    const docLink = screen.getByRole('link', { name: /Learn about local encryption and recovery/i })
    expect(docLink.getAttribute('href')).toBe('/docs/DATA_ENCRYPTION.md')
    expect(screen.getByText(/no cloud recovery/i)).toBeTruthy()
    expect(screen.getByText(/cannot be restored without your credentials or recovery key/i)).toBeTruthy()
  })
})
