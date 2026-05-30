// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  SETUP_COMPLETION_ITEMS,
  SetupDoneScreen,
} from '@/features/auth/setup/SetupDoneScreen'

describe('SetupDoneScreen', () => {
  beforeEach(() => {
    cleanup()
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  it('renders title and subtitle', () => {
    render(<SetupDoneScreen busy={false} onEnterWorkspace={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Welcome to Albatross' })).toBeTruthy()
    expect(screen.getByText('Your production workspace is ready.')).toBeTruthy()
  })

  it('renders confirmation rows', () => {
    render(<SetupDoneScreen busy={false} onEnterWorkspace={vi.fn()} />)

    for (const item of SETUP_COMPLETION_ITEMS) {
      expect(screen.getByText(new RegExp(item))).toBeTruthy()
    }
  })

  it('renders Enter Workspace CTA and invokes callback on click', async () => {
    const user = userEvent.setup()
    const onEnterWorkspace = vi.fn()

    render(<SetupDoneScreen busy={false} onEnterWorkspace={onEnterWorkspace} />)

    const button = screen.getByRole('button', { name: 'Enter Workspace' })
    expect(button).toBeTruthy()
    await user.click(button)
    expect(onEnterWorkspace).toHaveBeenCalledTimes(1)
  })

  it('activates Enter Workspace via keyboard', async () => {
    const user = userEvent.setup()
    const onEnterWorkspace = vi.fn()

    render(<SetupDoneScreen busy={false} onEnterWorkspace={onEnterWorkspace} />)

    const button = screen.getByRole('button', { name: 'Enter Workspace' })
    button.focus()
    await user.keyboard('{Enter}')
    expect(onEnterWorkspace).toHaveBeenCalledTimes(1)
  })

  it('uses semantic foreground tokens on gradient background', () => {
    render(<SetupDoneScreen busy={false} onEnterWorkspace={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Welcome to Albatross' }).className).toContain(
      'text-foreground'
    )
    expect(screen.getByText('Your production workspace is ready.').className).toContain(
      'text-muted-foreground'
    )
  })
})
