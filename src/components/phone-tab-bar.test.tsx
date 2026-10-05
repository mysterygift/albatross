// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { PhoneTabBar } from '@/components/phone-tab-bar'

const sidebar = vi.hoisted(() => ({ openMobile: false, setOpenMobile: vi.fn() }))
const platform = vi.hoisted(() => ({ mobile: true, phoneWidth: true }))

vi.mock('@/components/ui/sidebar', () => ({ useSidebar: () => sidebar }))
vi.mock('@/lib/platform', () => ({ isMobilePlatform: () => platform.mobile }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => platform.phoneWidth }))

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
  platform.phoneWidth = true
  sidebar.openMobile = false
  sidebar.setOpenMobile.mockClear()
})

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.phoneTabBar
})

describe('PhoneTabBar', () => {
  it('shows only on a phone-width mobile screen', () => {
    platform.phoneWidth = false
    renderAt('/')
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    cleanup()

    platform.phoneWidth = true
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

  it('opens the sidebar from More', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(sidebar.setOpenMobile).toHaveBeenCalledWith(true)
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
