// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RUN_MENU_COMMAND_EVENT } from '@/app/menuSchema'
import { AppActionsMenu } from '@/components/app-actions-menu'

const production = vi.hoisted(() => ({ current: null as { id: string } | null }))

vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({ currentProduction: production.current }),
}))
vi.mock('@/hooks/useServerPublishEnabled', () => ({
  useLegacyServerPublishEnabled: () => ({ data: false }),
}))

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  production.current = null
})

function openMenu(path: string, onOpenShortcuts?: () => void) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppActionsMenu onOpenShortcuts={onOpenShortcuts} />
    </MemoryRouter>,
  )
  fireEvent.keyDown(screen.getByRole('button', { name: 'App menu' }), { key: 'Enter' })
}

describe('AppActionsMenu', () => {
  it('is hidden when the native desktop menu bar exists', () => {
    vi.stubGlobal('isTauri', true)
    render(
      <MemoryRouter>
        <AppActionsMenu />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'App menu' })).toBeNull()
  })

  it('offers the menu-bar-only actions plus the current section commands', () => {
    production.current = { id: 'p1' }
    openMenu('/budget')
    for (const name of ['New production', 'Import production', 'Export production', 'Settings', 'Log out']) {
      expect(screen.getByRole('menuitem', { name })).toBeTruthy()
    }
    expect(screen.getByRole('menuitem', { name: 'Duplicate live budget as draft' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Manage budget revisions' })).toBeTruthy()
    // Publish is behind the server-publish setting.
    expect(screen.queryByRole('menuitem', { name: 'Publish to server' })).toBeNull()
  })

  it('omits commands the native menu shows disabled, and disables production-only items without one', () => {
    openMenu('/documents')
    expect(screen.getByRole('menuitem', { name: 'Upload document' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByRole('menuitem', { name: 'Export document bundle' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Export production' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'Import production' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('runs the native menu command when an item is chosen', () => {
    const received: string[] = []
    const onRun = (e: Event) => received.push((e as CustomEvent).detail.eventName)
    window.addEventListener(RUN_MENU_COMMAND_EVENT, onRun)
    try {
      openMenu('/')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))
    } finally {
      window.removeEventListener(RUN_MENU_COMMAND_EVENT, onRun)
    }
    expect(received).toEqual(['albatross-menu-logout'])
  })
})
