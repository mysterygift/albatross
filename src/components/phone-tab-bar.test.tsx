// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { PhoneTabBar } from '@/components/phone-tab-bar'

const sidebar = vi.hoisted(() => ({ openMobile: false, setOpenMobile: vi.fn() }))
const platform = vi.hoisted(() => ({ mobile: true, phone: true }))

vi.mock('@/components/ui/sidebar', () => ({ useSidebar: () => sidebar }))
vi.mock('@/lib/platform', () => ({ isMobilePlatform: () => platform.mobile }))
vi.mock('@/hooks/use-is-phone', () => ({ useIsPhone: () => platform.phone }))

function CurrentPath() {
  const { pathname } = useLocation()
  return <p data-testid="path">{pathname}</p>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <CurrentPath />
              <PhoneTabBar />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  platform.mobile = true
  platform.phone = true
  sidebar.openMobile = false
  sidebar.setOpenMobile.mockClear()
})

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.phoneTabBar
})

describe('PhoneTabBar', () => {
  it('shows only on a phone-sized mobile screen', () => {
    platform.phone = false
    renderAt('/')
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    cleanup()

    platform.phone = true
    platform.mobile = false
    renderAt('/')
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  it('marks the current section and flags <html> so the page leaves room', () => {
    renderAt('/schedule/stripboard')
    expect(screen.getByRole('button', { name: 'Schedule' }).getAttribute('aria-current')).toBe('page')
    expect(document.documentElement.dataset.phoneTabBar).toBe('')
  })

  it('returns to the last page visited under a tab', () => {
    renderAt('/schedule/stripboard')
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(screen.getByTestId('path').textContent).toBe('/tasks')
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByTestId('path').textContent).toBe('/schedule/stripboard')
    // A second tap on the current tab goes back to its first page.
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByTestId('path').textContent).toBe('/schedule/calendar')
  })

  it('puts More first (bottom left) and toggles the sidebar with it', () => {
    renderAt('/')
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]?.textContent).toBe('More')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(sidebar.setOpenMobile).toHaveBeenLastCalledWith(true)
    cleanup()

    sidebar.openMobile = true
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(sidebar.setOpenMobile).toHaveBeenLastCalledWith(false)
  })

  it('hides while a text field has focus', () => {
    renderAt('/')
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => input.focus())
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    input.remove()
  })
})
