// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GetStartedChecklist } from './GetStartedChecklist'

const mocks = vi.hoisted(() => ({
  listScriptVersionsByProduction: vi.fn(),
  listCast: vi.fn(),
  listShootDaysByProduction: vi.fn(),
  listBudgetItemsByProduction: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))

vi.mock('@/lib/db/repositories/scriptVersions', () => ({
  listScriptVersionsByProduction: mocks.listScriptVersionsByProduction,
}))
vi.mock('@/lib/db/repositories/person', () => ({ listCast: mocks.listCast }))
vi.mock('@/lib/db/repositories/schedule', () => ({
  listShootDaysByProduction: mocks.listShootDaysByProduction,
}))
vi.mock('@/lib/db/repositories/budget', () => ({
  listBudgetItemsByProduction: mocks.listBudgetItemsByProduction,
}))
vi.mock('@/lib/db/repositories/settings', () => ({
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
}))
vi.mock('@/features/productions/context', () => ({
  useCurrentProduction: () => ({ currentProductionId: 'p1' }),
}))
vi.mock('@/hooks/useWorkingBudgetRevision', () => ({
  useWorkingBudgetRevision: () => ({ data: { id: 'r1' } }),
}))

function renderChecklist() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GetStartedChecklist />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('GetStartedChecklist', () => {
  beforeEach(() => {
    mocks.listScriptVersionsByProduction.mockResolvedValue([])
    mocks.listCast.mockResolvedValue([{ id: 'c1' }])
    mocks.listShootDaysByProduction.mockResolvedValue([])
    mocks.listBudgetItemsByProduction.mockResolvedValue([])
    mocks.getSetting.mockResolvedValue(null)
    mocks.setSetting.mockResolvedValue(undefined)
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders progress, links and done state from data', async () => {
    renderChecklist()
    await waitFor(() => expect(screen.getByTestId('checklist-progress').textContent).toBe('2 of 5 done'))
    const link = screen.getByRole('link', { name: /Add cast/ })
    expect(link.getAttribute('href')).toBe('/people/cast-manager')
    expect(link.querySelector('[aria-label="Done"]')).toBeTruthy()
    const script = screen.getByRole('link', { name: /Import a script/ })
    expect(script.querySelector('[aria-label="Not done"]')).toBeTruthy()
    expect(script.getAttribute('href')).toBe('/schedule/script-import')
  })

  it('treats a failing query (locked people data) as not done without crashing', async () => {
    mocks.listCast.mockRejectedValue(new Error('locked'))
    renderChecklist()
    await waitFor(() => expect(screen.getByTestId('checklist-progress').textContent).toBe('1 of 5 done'))
  })

  it('hides and persists the preference', async () => {
    const user = userEvent.setup()
    mocks.setSetting.mockImplementation(async () => {
      mocks.getSetting.mockResolvedValue('true')
    })
    renderChecklist()
    await user.click(await screen.findByRole('button', { name: 'Hide' }))
    await waitFor(() => expect(mocks.setSetting).toHaveBeenCalledWith('onboarding_checklist_hidden', 'true'))
    expect(screen.queryByText('Get started')).toBeNull()
  })

  it('stays hidden when the saved preference is true', async () => {
    mocks.getSetting.mockResolvedValue('true')
    renderChecklist()
    await waitFor(() => expect(mocks.getSetting).toHaveBeenCalled())
    expect(screen.queryByText('Get started')).toBeNull()
  })

  it('shows the set-up line when everything is done', async () => {
    mocks.listScriptVersionsByProduction.mockResolvedValue([{}])
    mocks.listShootDaysByProduction.mockResolvedValue([{}])
    mocks.listBudgetItemsByProduction.mockResolvedValue([{}])
    renderChecklist()
    expect(await screen.findByText(/You're set up/)).toBeTruthy()
    expect(screen.queryByText('Get started')).toBeNull()
  })
})
