// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runMenuCommand } from '@/app/menuSchema'
import { ApfMenuEventBridge } from '@/features/productions/ApfMenuEventBridge'

const handleImportApf = vi.fn(async () => {})
const handleExportApf = vi.fn(async () => {})

vi.mock('@tauri-apps/api/event', () => ({
  // Plain browser / iOS without native menu events: listen is unavailable.
  listen: vi.fn(async () => {
    throw new Error('not running in tauri')
  }),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => {}) }))
vi.mock('@/features/productions/useApfActions', () => ({
  useApfActions: () => ({ apfBusy: null, handleImportApf, handleExportApf }),
}))
vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({ currentProductionId: null, setSelectedBudgetRevisionId: vi.fn() }),
}))
vi.mock('@/lib/db/repositories/budgetRevisions', () => ({ listBudgetRevisionsByProduction: vi.fn(async () => []) }))
vi.mock('@/lib/db/budgetRevisionService', () => ({ duplicateLiveBudgetRevisionAsDraft: vi.fn() }))
vi.mock('@/lib/auth/authService', () => ({ clearPersistedAuthSession: vi.fn() }))
vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }))
vi.mock('@/components/ui/sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>
}

function renderBridge() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/']}>
        <ApfMenuEventBridge />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ApfMenuEventBridge in-app commands', () => {
  it('runs menu commands from the in-app menu without native Tauri events', async () => {
    renderBridge()

    await act(async () => runMenuCommand('app_settings'))
    expect(screen.getByTestId('location').textContent).toBe('/settings')

    await act(async () => runMenuCommand('import_project'))
    expect(handleImportApf).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('location').textContent).toBe('/productions')

    await act(async () => runMenuCommand('schedule_open_shot_list'))
    expect(screen.getByTestId('location').textContent).toBe('/schedule/shots')
  })

  it('dispatches section commands as browser events after navigating', async () => {
    renderBridge()
    const onAddLocation = vi.fn()
    window.addEventListener('albatross-menu-locations-add-location', onAddLocation)
    try {
      await act(async () => runMenuCommand('locations_add_location'))
    } finally {
      window.removeEventListener('albatross-menu-locations-add-location', onAddLocation)
    }
    expect(onAddLocation).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('location').textContent).toBe('/locations')
  })
})
